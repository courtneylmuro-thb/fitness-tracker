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
      const qty = point.qty ?? point.value ?? 0;
      if (key === "weight_lbs" || key === "sleep_hours") {
        byDate[date][key] = qty; // latest/only value wins for these
      } else {
        byDate[date][key] = (byDate[date][key] ?? 0) + qty;
      }
    }
  }

  let daysWritten = 0;
  for (const [date, values] of Object.entries(byDate)) {
    const totalBurned =
      (values.active_calories ?? 0) + (values.resting_calories ?? 0) || null;
    const { error } = await supabase.from("daily_metrics").upsert(
      {
        date,
        steps: values.steps ?? null,
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
    const { error } = await supabase.from("workouts").insert({
      date,
      start_time: w.start,
      end_time: w.end,
      workout_type: w.name || "Workout",
      duration_min: w.duration ? Math.round(Number(w.duration) / 60) : null,
      calories: w.activeEnergyBurned?.qty ?? null,
      source: "apple_health",
    });
    if (!error) workoutsWritten++;
  }

  // --- TEMPORARY DIAGNOSTICS -------------------------------------------
  // daysWritten/workoutsWritten came back 0 on a real export even though
  // Courtney's phone clearly has step/calorie/workout data for the range
  // sent. That means either metric.name values from Health Auto Export
  // don't match METRIC_KEY_MAP's keys, or metric.data points aren't shaped
  // the way this code expects (point.date / point.qty). Surfacing what was
  // actually received so the mapping can be corrected, then this whole
  // block gets deleted once the real fix lands.
  const receivedMetricNames = Array.from(new Set(metrics.map((m: any) => m.name)));
  const sampleMetric = metrics[0]
    ? {
        name: metrics[0].name,
        dataPointCount: metrics[0].data?.length ?? 0,
        firstDataPoint: metrics[0].data?.[0] ?? null,
      }
    : null;
  const sampleWorkout = workouts[0] ?? null;
  // --- END TEMPORARY DIAGNOSTICS ----------------------------------------

  return NextResponse.json({
    ok: true,
    daysWritten,
    workoutsWritten,
    debug: {
      metricsReceived: metrics.length,
      workoutsReceived: workouts.length,
      receivedMetricNames,
      sampleMetric,
      sampleWorkout,
    },
  });
}
