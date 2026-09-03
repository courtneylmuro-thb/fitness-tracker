import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { generateWorkout } from "@/lib/anthropic";

export async function POST(req: NextRequest) {
  try {
    const { equipment, location, durationMin, focus } = await req.json();
    if (!durationMin) {
      return NextResponse.json({ error: "How many minutes do you have?" }, { status: 400 });
    }
    const workout = await generateWorkout({ equipment, location, durationMin: Number(durationMin), focus });
    return NextResponse.json(workout);
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Unknown error" }, { status: 500 });
  }
}

// Logs a generated workout as actually completed, once Courtney has done it.
export async function PUT(req: NextRequest) {
  try {
    const { title, estimated_duration_min, date } = await req.json();
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("workouts")
      .insert({
        workout_type: title || "AI-generated workout",
        duration_min: estimated_duration_min ?? null,
        date: date || new Date().toISOString().slice(0, 10),
        source: "ai_generated",
      })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Unknown error" }, { status: 500 });
  }
}
