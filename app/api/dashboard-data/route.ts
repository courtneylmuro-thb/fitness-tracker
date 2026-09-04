import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Vercel's serverless functions run in UTC. Using new Date().toISOString() for
// "today" rolls over at 5-6pm Pacific (whenever UTC hits midnight), hours before
// Courtney's actual day is over -- so late in the evening the dashboard would
// silently start querying for a date that hasn't happened yet, and today's real
// food/metrics rows (correctly dated by Pacific calendar day) would come up
// empty. Compute "today" from the Pacific calendar date instead.
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

export async function GET() {
  const supabase = getSupabaseAdmin();
  const today = pacificDateString(new Date());
  const thirtyDaysAgo = pacificDateString(new Date(Date.now() - 30 * 86400000));
  // food_logs is filtered by Pacific calendar day below (not a UTC timestamp
  // boundary), so pull a generous window here and let the filter narrow it.
  const threeDaysAgoUtc = new Date(Date.now() - 3 * 86400000).toISOString();

  const [metricsRes, foodWindowRes, bodyRes, workoutsRes, settingsRes, vacationRes] =
    await Promise.all([
      supabase.from("daily_metrics").select("*").gte("date", thirtyDaysAgo).order("date"),
      supabase.from("food_logs").select("*").gte("logged_at", threeDaysAgoUtc).order("logged_at"),
      supabase.from("body_composition").select("*").order("date", { ascending: false }).limit(12),
      supabase.from("workouts").select("*").gte("date", thirtyDaysAgo).order("date", { ascending: false }),
      supabase.from("settings").select("*").eq("key", "daily_calorie_budget").single(),
      supabase.from("vacation_days").select("*").eq("date", today).maybeSingle(),
    ]);

  const foodToday = (foodWindowRes.data || []).filter(
    (f) => pacificDateString(new Date(f.logged_at)) === today
  );
  const caloriesToday = foodToday.reduce((sum, f) => sum + (Number(f.estimated_calories) || 0), 0);
  const metrics = metricsRes.data || [];
  const todayMetrics = metrics.find((m) => m.date === today);

  // The health sync only fills in resting_calories via an overnight batch job --
  // a day's row gets its resting_calories written the *next* morning, not live.
  // So on a fresh "today" row, resting_calories is still null and
  // total_calories_burned is just the tiny passive active-calorie ping so far
  // (e.g. 0.66), which rounded to "1" on the dashboard and looked broken.
  // Fix: while today's resting_calories hasn't synced yet, estimate it from the
  // average of the last 7 days that do have a real resting_calories value, and
  // add today's actual active_calories on top -- so "Burned" shows a realistic
  // number instead of near-zero, and flag it as an estimate.
  let burnedToday: number | null = todayMetrics?.total_calories_burned ?? null;
  let burnedTodayIsEstimate = false;

  if (todayMetrics && (todayMetrics.resting_calories === null || todayMetrics.resting_calories === undefined)) {
    const recentResting = metrics
      .filter((m) => m.date !== today && m.resting_calories !== null && m.resting_calories !== undefined)
      .slice(-7)
      .map((m) => Number(m.resting_calories));

    if (recentResting.length > 0) {
      const avgResting = recentResting.reduce((s, v) => s + v, 0) / recentResting.length;
      burnedToday = avgResting + (Number(todayMetrics.active_calories) || 0);
      burnedTodayIsEstimate = true;
    }
  }

  return NextResponse.json({
    budget: settingsRes.data?.value ?? 2000,
    caloriesToday,
    burnedToday,
    burnedTodayIsEstimate,
    isVacationToday: !!vacationRes.data,
    metrics,
    foodToday,
    body: (bodyRes.data || []).slice().reverse(),
    workouts: workoutsRes.data || [],
  });
}
