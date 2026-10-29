import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { chatWorkout } from "@/lib/anthropic";

// Vision + generation can take a while; avoid the 10s timeout that would make
// the request fail even though it's still working.
export const maxDuration = 60;

// Conversational workout generation. The client sends the full message
// history so far (she talks, we ask a clarifying question or two, she
// answers, we generate -- and she can keep talking afterward to adjust it).
// Returns either {type:"question", question} or a full {type:"workout", ...}.
export async function POST(req: NextRequest) {
  try {
    const { messages, images } = await req.json();
    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { type: "question", question: "Where are you working out today, and how long do you have? (You can also just snap photos of the space.)" },
        { status: 200 }
      );
    }
    // Load her saved places so she can just say "my home gym" without photos.
    let places: any[] = [];
    try {
      const sb = getSupabaseAdmin();
      const { data } = await sb
        .from("workout_places")
        .select("name, equipment")
        .order("created_at", { ascending: false });
      places = data || [];
    } catch {
      /* places are a nice-to-have */
    }
    const result = await chatWorkout(messages, Array.isArray(images) ? images : undefined, places);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Unknown error" }, { status: 500 });
  }
}

// Logs a generated workout as actually completed, once Courtney has done it.
// Accepts an optional actual_duration_min (from her post-workout voice
// feedback, e.g. "took 45 min instead of 30") which overrides the original
// estimate, and optional feedback_notes free text, both stored straight into
// the existing workouts.duration_min / workouts.notes columns.
export async function PUT(req: NextRequest) {
  try {
    const { title, estimated_duration_min, actual_duration_min, feedback_notes, date } = await req.json();
    const supabase = getSupabaseAdmin();
    const durationMin =
      actual_duration_min !== undefined && actual_duration_min !== null && actual_duration_min !== ""
        ? Number(actual_duration_min)
        : estimated_duration_min ?? null;

    const { data, error } = await supabase
      .from("workouts")
      .insert({
        workout_type: title || "AI-generated workout",
        duration_min: durationMin,
        date: date || new Date().toISOString().slice(0, 10),
        source: "ai_generated",
        notes: feedback_notes || null,
      })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Unknown error" }, { status: 500 });
  }
}
