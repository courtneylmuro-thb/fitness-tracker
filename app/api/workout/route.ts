import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const { workout_type, duration_min, date } = await req.json();
    if (!workout_type || !String(workout_type).trim()) {
      return NextResponse.json({ error: "Workout type is required" }, { status: 400 });
    }
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("workouts")
      .insert({
        workout_type: String(workout_type).trim(),
        duration_min: duration_min ?? null,
        date: date || new Date().toISOString().slice(0, 10),
        source: "manual",
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Unknown error" }, { status: 500 });
  }
}
