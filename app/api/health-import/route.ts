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

  // --- TEMPORARY DIAGNOSTICS (round 2) -----------------------------------
  // The string->number fix landed and works on a synthetic payload, but
  // Courtney's real export from the phone still comes back daysWritten=0.
  // That means the upsert itself is erroring on her real data for a reason
  // that isn't the qty-string bug -- capturing the actual Postgres error
  // (message/code/details/hint) plus the exact row we tried to insert, for
  // the first failing date, so the real cause is visible instead of guessed.
  const errors: any[] = [];
  // --- END TEMPORARY DIAGNOSTICS (setup) ----------------------------------

  let daysWritten = 0;
  for (const [date, values] of Object.entries(byDate)) {
    const totalBurned =
      (values.active_calories ?? 0) + (values.resting_calories ?? 0) || null;
    const row = {
      date,
      steps: values.steps ?? null,
      active_calories: values.active_calories ?? null,
      resting_calories: values.resting_calories ?? null,
      total_calories_burned: totalBurned,
      sleep_hours: values.sleep_hours ?? null,
      weight_lbs: values.weight_lbs ?? null,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase
      .from("daily_metrics")
      .upsert(row, { onConflict: "date" });
    if (!error) {
      daysWritten++;
    } else if (errors.length < 3) {
      errors.push({ date, row, error: { message: error.message, code: (error as any).code, details: (error as any).details, hint: (error as any).hint } });
    }
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
    const workoutRow = {
      date,
      start_time: w.start,
      end_time: w.end,
      workout_type: w.name || "Workout",
      duration_min: Number.isFinite(durationMin as number) ? durationMin : null,
      calories: cal != null && Number.isFinite(cal) ? cal : null,
      source: "apple_health",
    };
    const { error } = await supabase.from("workouts").insert(workoutRow);
    if (!error) {
      workoutsWritten++;
    } else if (errors.length < 3) {
      errors.push({ date, row: workoutRow, error: { message: error.message, code: (error as any).code, details: (error as any).details, hint: (error as any).hint } });
    }
  }

  return NextResponse.json({
    ok: true,
    daysWritten,
    workoutsWritten,
    debug: { daysAttempted: Object.keys(byDate).length, workoutsAttempted: workouts.length, errors },
  });
}
