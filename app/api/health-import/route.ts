import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

// Receives POSTs from the "Health Auto Export" iOS app (REST API automation).
// Configure that app to POST here with header: Authorization: Bearer <HEALTH_EXPORT_SECRET>

const METRIC_KEY_MAP: Record<string, string> = {
  step_count: "steps",
  active_energy: "active_calories",
  basal_energy_burned: "resting_calories",
  weight_body_mass: "weight_lbs",
  sleep_analysis: "sleep_hours",
};

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.HEALTH_EXPORT_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const supabase = getSupabaseAdmin();

  const metrics = body?.data?.metrics ?? [];
  const workouts = body?.data?.workouts ?? [];

  const byDate: Record<string, Record<string, number>> = {};

  for (const metric of metrics) {
    const key = METRIC_KEY_MAP[metric.name];
    if (!key) continue;
    for (const point of metric.data ?? []) {
      const date = (point.date || "").slice(0, 10);
      if (!date) continue;
      byDate[date] = byDate[date] || {};
      // Health Auto Export sends qty/value as a STRING, not a number -- coerce
      // it or `(byDate[date][key] ?? 0) + qty` does string concatenation.
      const raw = point.qty ?? point.value ?? 0;
      const qty = Number(raw);
      const safeQty = Number.isFinite(qty) ? qty : 0;
      if (key === "weight_lbs" || key === "sleep_hours") {
        byDate[date][key] = safeQty;
      } else {
        byDate[date][key] = (byDate[date][key] ?? 0) + safeQty;
      }
    }
  }

  let daysWritten = 0;
  for (const [date, values] of Object.entries(byDate)) {
    const totalBurned =
      (values.active_calories ?? 0) + (values.resting_calories ?? 0) || null;
    const stepsValue =
      values.steps != null ? Math.round(values.steps) : null;
    const { error } = await supabase.from("daily_metrics").upsert(
      {
        date,
        steps: stepsValue,
        active_calories: values.active_calories ?? null,
        resting_calories: values.resting_calories ?? null,
        total_calories_burned: totalBurned,
        sleep_hours: values.sleep_hours ?? null,
        weight_lbs: values.weight_lbs ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "date" }
    );
    if (!error) daysWritten++;
  }

  let workoutsWritten = 0;
  for (const w of workouts) {
    const date = (w.start || "").slice(0, 10);
    if (!date) continue;
    const rawCal = w.activeEnergyBurned?.qty;
    const cal = rawCal != null ? Number(rawCal) : null;
    const rawDuration = w.duration;
    const durationMin =
      rawDuration != null ? Math.round(Number(rawDuration) / 60) : null;

    // The Health Auto Export "Workouts" automation re-sends the same session
    // every time it runs (every 5 min), and this was a plain insert with no
    // dedupe check -- so the same workout kept getting re-inserted on every
    // automation run, producing duplicate rows (confirmed: Aug 31 and Sep 2
    // each ended up with 2-3 identical rows). A given real workout session
    // has a unique start_time, so skip the insert if a row with that same
    // start_time + source already exists.
    const { data: existing } = await supabase
      .from("workouts")
      .select("id")
      .eq("start_time", w.start)
      .eq("source", "apple_health")
      .limit(1);
    if (existing && existing.length > 0) continue;

    const { error } = await supabase.from("workouts").insert({
      date,
      start_time: w.start,
      end_time: w.end,
      workout_type: w.name || "Workout",
      duration_min: Number.isFinite(durationMin as number) ? durationMin : null,
      calories: cal != null && Number.isFinite(cal) ? cal : null,
      source: "apple_health",
    });
    if (!error) workoutsWritten++;
  }

  return NextResponse.json({ ok: true, daysWritten, workoutsWritten });
}
