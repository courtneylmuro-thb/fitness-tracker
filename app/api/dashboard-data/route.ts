import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Vercel's serverless functions run in UTC. When no date param is supplied
// (defensive fallback only -- the dashboard always sends one, computed from
// the browser's own local clock), compute "today" from the Pacific calendar
// date rather than new Date().toISOString(), which rolls over hours before
// Courtney's actual day is over.
const TIMEZONE = "America/Los_Angeles";

function pacificDateString(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export async function GET(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const { searchParams } = new URL(req.url);
  const pacificToday = pacificDateString(new Date());
  const today = searchParams.get("date") || pacificToday;
  const dayStart = searchParams.get("dayStart") || `${today}T00:00:00.000Z`;
  const dayEnd = searchParams.get("dayEnd") || `${today}T23:59:59.999Z`;

  // The dashboard's Calories Burned / Weight Trend / Body Composition Trend
  // charts all have Week/Month/Year toggles now, so the backing queries need
  // up to a year of history, not just 30 days -- a year-back cutoff covers
  // every range those toggles can select, and the frontend still slices down
  // to the selected window from there. (In practice Courtney's Health Auto
  // Export sync only just started, so there isn't a year of real data yet --
  // this just means the charts stop being artificially capped at 30 days as
  // more days accumulate, rather than actually backfilling anything.)
  const yearAgo = new Date(Date.now() - 400 * 86400000).toISOString().slice(0, 10);

  const [metricsRes, foodTodayRes, bodyRes, workoutsRes, settingsRes, vacationRes] =
    await Promise.all([
      supabase.from("daily_metrics").select("*").gte("date", yearAgo).order("date"),
      supabase.from("food_logs").select("*").gte("logged_at", dayStart).lte("logged_at", dayEnd).order("logged_at"),
      supabase.from("body_composition").select("*").gte("date", yearAgo).order("date", { ascending: true }),
      supabase.from("workouts").select("*").gte("date", yearAgo).order("date", { ascending: false }),
      supabase.from("settings").select("*").eq("key", "daily_calorie_budget").single(),
      supabase.from("vacation_days").select("*").eq("date", today).maybeSingle(),
    ]);

  const foodToday = foodTodayRes.data || [];
  const caloriesToday = foodToday.reduce((sum, f) => sum + (Number(f.estimated_calories) || 0), 0);
  const proteinToday = foodToday.reduce((sum, f) => sum + (Number(f.protein_g) || 0), 0);
  const carbsToday = foodToday.reduce((sum, f) => sum + (Number(f.carbs_g) || 0), 0);
  const fatToday = foodToday.reduce((sum, f) => sum + (Number(f.fat_g) || 0), 0);
  const metrics = metricsRes.data || [];
  const todayMetrics = metrics.find((m) => m.date === today);

  // The health sync only fills in resting_calories (BMR) via an overnight batch
  // job -- a day's row gets its resting_calories written the *next* morning,
  // not live. So on the actual current day, before that batch has run,
  // resting_calories is still null and the raw total_calories_burned is just
  // the tiny passive active-calorie ping so far, which reads as "basically
  // nothing" and looks broken. While viewing today specifically (not a past
  // day, which is fully synced and shouldn't be guessed at), estimate resting
  // calories from the average of the last 7 days that do have a real value,
  // and add today's actual active_calories on top -- flagged as an estimate.
  let restingResolved: number | null = todayMetrics?.resting_calories ?? null;
  let activeResolved: number = Number(todayMetrics?.active_calories) || 0;
  let burnedIsEstimate = false;

  if (today === pacificToday && todayMetrics && (todayMetrics.resting_calories === null || todayMetrics.resting_calories === undefined)) {
    const recentResting = metrics
      .filter((m) => m.date !== today && m.resting_calories !== null && m.resting_calories !== undefined)
      .slice(-7)
      .map((m) => Number(m.resting_calories));

    if (recentResting.length > 0) {
      restingResolved = recentResting.reduce((s, v) => s + v, 0) / recentResting.length;
      burnedIsEstimate = true;
    }
  }

  const burnedToday = restingResolved !== null ? restingResolved + activeResolved : (todayMetrics?.total_calories_burned ?? null);

  return NextResponse.json({
    budget: settingsRes.data?.value ?? 2000,
    caloriesToday,
    proteinToday,
    carbsToday,
    fatToday,
    burnedToday,
    burnedIsEstimate,
    bmrToday: restingResolved,
    activeToday: activeResolved,
    isVacationToday: !!vacationRes.data,
    metrics,
    foodToday,
    body: bodyRes.data || [],
    workouts: workoutsRes.data || [],
  });
}
