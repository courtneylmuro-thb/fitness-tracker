import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { estimateLogEntry } from "@/lib/anthropic";

export async function POST(req: NextRequest) {
  try {
    const { text, imageBase64, mediaType, date } = await req.json();
    if (!text && !imageBase64) {
      return NextResponse.json({ error: "Say it, type it, or snap a photo" }, { status: 400 });
    }

    const entry = await estimateLogEntry({ text, imageBase64, mediaType });
    const supabase = getSupabaseAdmin();

    if (entry.type === "workout") {
      const { data, error } = await supabase
        .from("workouts")
        .insert({
          workout_type: entry.workout_type || entry.description || "Workout",
          duration_min: entry.duration_min ?? null,
          date: date || new Date().toISOString().slice(0, 10),
          source: "manual",
        })
        .select()
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ type: "workout", ...data });
    }

    const insertRow: Record<string, any> = {
      description: entry.description || text || "Food entry",
      estimated_calories: entry.calories ?? null,
      protein_g: entry.protein_g ?? null,
      carbs_g: entry.carbs_g ?? null,
      fat_g: entry.fat_g ?? null,
      source: imageBase64 ? "photo" : "text",
    };
    if (date) insertRow.logged_at = `${date}T12:00:00`;

    const { data, error } = await supabase.from("food_logs").insert(insertRow).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ type: "food", ...data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Unknown error" }, { status: 500 });
  }
}
