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

// Courtney's baseline resting-calorie burn (BMR), derived from the average of
// her own Apple Health resting_calories on fully-synced days (~1,180-1,250 in
// Oct 2026). Used as a floor whenever Apple Health hasn't reported a resting
// value for a day, so a day never shows zero calories burned. Refine if her
// weight changes meaningfully.
const BASELINE_BMR = 1214;

// Cross-reference the three workout sources (Apple Watch `apple_health`, voice
// `manual`, Google Calendar `calendar`) so one real session isn't counted
// multiple times. Rows whose time windows OVERLAP are treated as the same
// session; an untimed voice log attaches to a same-day session that shares a
// word in its type. One representative row is kept per session (prefer the most
// descriptive title; de-emphasize generic Apple Watch labels like "Pilates").
// Non-destructive: this only affects what the dashboard shows/counts, not the DB.
function dedupeWorkouts(raw: any[]): any[] {
  const ms = (t: any) => (t ? Date.parse(t) : null);
  const timed = raw
    .filter((w) => w.start_time)
    .map((w) => ({ ...w, _s: ms(w.start_time) as number, _e: (ms(w.end_time) ?? (ms(w.start_time) as number) + 3600000) as number }))
    .sort((a, b) => a._s - b._s);
  const untimed = raw.filter((w) => !w.start_time);

  const sessions: any[][] = [];
  for (const w of timed) {
    const sess = sessions.find((s) => s.some((m) => w._s < m._e && m._s < w._e));
    if (sess) sess.push(w);
    else sessions.push([w]);
  }

  const toks = (s: string) =>
    (s || "").toLowerCase().replace(/[^a-z ]/g, " ").split(/\s+/).filter((x) => x.length > 3);
  for (const u of untimed) {
    const ut = toks(u.workout_type);
    const sess = sessions.find(
      (s) => s[0].date === u.date && s.some((m) => toks(m.workout_type).some((t) => ut.includes(t)))
    );
    if (sess) sess.push(u);
    else sessions.push([u]);
  }

  const genericAH = /^(functional strength training|traditional strength training|strength training|core training|high intensity interval training|pilates|yoga|outdoor walk|indoor walk|walk|run|outdoor run|cooldown|workout)$/i;
  const score = (w: any) => {
    let s = (w.workout_type || "").length;
    if (w.source === "apple_health" && genericAH.test((w.workout_type || "").trim())) s -= 20;
    if (w.source === "calendar") s += 3;
    return s;
  };

  const reps = sessions.map((s) => {
    const rep: any = { ...s.slice().sort((a, b) => score(b) - score(a))[0] };
    rep.sources = Array.from(new Set(s.map((m) => m.source)));
    if (rep.duration_min == null) {
      const d = s.map((m) => m.duration_min).find((x) => x != null);
      if (d != null) rep.duration_min = d;
    }
    delete rep._s;
    delete rep._e;
    return rep;
  });

  reps.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return reps;
}

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

  const [metricsRes, foodTodayRes, bodyRes, workoutsRes, settingsRes, vacationRes, treatmentsRes, alcoholRes, vacationsRes] =
    await Promise.all([
      supabase.from("daily_metrics").select("*").gte("date", yearAgo).order("date"),
      supabase.from("food_logs").select("*").gte("logged_at", dayStart).lte("logged_at", dayEnd).order("logged_at"),
      supabase.from("body_composition").select("*").gte("date", yearAgo).order("date", { ascending: true }),
      supabase.from("workouts").select("*").gte("date", yearAgo).order("date", { ascending: false }),
      supabase.from("settings").select("*").eq("key", "daily_calorie_budget").single(),
      supabase.from("vacation_days").select("*").eq("date", today).maybeSingle(),
      supabase.from("treatments").select("*").order("date", { ascending: false }).limit(20),
      supabase.from("food_logs").select("logged_at, alcohol_drinks").gte("logged_at", `${yearAgo}T00:00:00`),
      supabase.from("vacation_days").select("date").gte("date", yearAgo),
    ]);

  const foodToday = foodTodayRes.data || [];
  const caloriesToday = foodToday.reduce((sum, f) => sum + (Number(f.estimated_calories) || 0), 0);
  const proteinToday = foodToday.reduce((sum, f) => sum + (Number(f.protein_g) || 0), 0);
  const carbsToday = foodToday.reduce((sum, f) => sum + (Number(f.carbs_g) || 0), 0);
  const fatToday = foodToday.reduce((sum, f) => sum + (Number(f.fat_g) || 0), 0);
  // Fill any day missing a total_calories_burned (Apple Health didn't sync that
  // day) with baseline BMR + whatever active calories exist, so the Calories
  // Burned chart never shows a false zero bar.
  const metrics = (metricsRes.data || []).map((m: any) => ({
    ...m,
    total_calories_burned:
      m.total_calories_burned != null
        ? m.total_calories_burned
        : Number(m.resting_calories ?? BASELINE_BMR) + (Number(m.active_calories) || 0),
  }));
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

  if (restingResolved === null || restingResolved === undefined) {
    // No resting/BMR from Apple Health for this day yet (its batch runs the next
    // morning, and some days never sync). Use the average of the last 7 days
    // that DO have a real value; if there are none, fall back to the baseline
    // BMR -- so a day never shows zero calories burned. Flagged as an estimate.
    const recentResting = metrics
      .filter((m) => m.date !== today && m.resting_calories !== null && m.resting_calories !== undefined)
      .slice(-7)
      .map((m) => Number(m.resting_calories));
    restingResolved =
      recentResting.length > 0
        ? recentResting.reduce((s, v) => s + v, 0) / recentResting.length
        : BASELINE_BMR;
    burnedIsEstimate = true;
  }

  const burnedToday = restingResolved + activeResolved;

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
    workouts: dedupeWorkouts(workoutsRes.data || []),
    treatments: treatmentsRes.data || [],
    alcoholByDay: (() => {
      const by: Record<string, number> = {};
      for (const r of (alcoholRes.data || []) as any[]) {
        const d = String(r.logged_at).slice(0, 10);
        by[d] = (by[d] || 0) + (Number(r.alcohol_drinks) || 0);
      }
      return Object.entries(by).map(([date, drinks]) => ({ date, drinks }));
    })(),
    vacationDays: ((vacationsRes.data || []) as any[]).map((v) => String(v.date).slice(0, 10)),
  });
}
