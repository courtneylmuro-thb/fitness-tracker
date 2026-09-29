import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { estimateLogEntry } from "@/lib/anthropic";

export async function POST(req: NextRequest) {
  try {
    const { text, imageBase64, mediaType, date, saved } = await req.json();

    // Logging a previously saved food/recipe: skip the AI estimate entirely and
    // insert its stored macros directly. This is checked before the
    // text/imageBase64 requirement below since a saved-food log needs neither.
    if (saved) {
      const supabase = getSupabaseAdmin();
      const insertRow: Record<string, any> = {
        description: saved.description || saved.name || "Saved food",
        estimated_calories: saved.calories ?? null,
        protein_g: saved.protein_g ?? null,
        carbs_g: saved.carbs_g ?? null,
        fat_g: saved.fat_g ?? null,
        source: "saved",
      };
      if (date) insertRow.logged_at = `${date}T12:00:00`;
      const { data, error } = await supabase.from("food_logs").insert(insertRow).select().single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ type: "food", ...data });
    }

    if (!text && !imageBase64) {
      return NextResponse.json({ error: "Say it, type it, or snap a photo" }, { status: 400 });
    }

    // `referenceDate` is what the classifier treats as "today" for resolving
    // any day-of-week or relative-date mention in the text (e.g. "Sunday: ...",
    // "yesterday I had..."). Same fallback as entryDate below, so the two stay
    // in sync.
    const referenceDate = date || new Date().toISOString().slice(0, 10);
    const entry = await estimateLogEntry({ text, imageBase64, mediaType, referenceDate });
    const supabase = getSupabaseAdmin();

    // If the entry text itself named a specific day (e.g. logged today but
    // talking about Sunday), that's a stronger signal of intent than the
    // ambient default-to-today date, so it wins. Falls back to the explicit
    // `date` param (from the UI's date picker) and then today, same as before.
    const mentionedDate: string | null =
      typeof entry.mentioned_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(entry.mentioned_date)
        ? entry.mentioned_date
        : null;
    const explicitDate: string | null = mentionedDate || date || null;
    const entryDate = explicitDate || referenceDate;

    if (entry.type === "workout") {
      const { data, error } = await supabase
        .from("workouts")
        .insert({
          workout_type: entry.workout_type || entry.description || "Workout",
          duration_min: entry.duration_min ?? null,
          date: entryDate,
          source: "manual",
        })
        .select()
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ type: "workout", ...data });
    }

    if (entry.type === "weight") {
      const { data, error } = await supabase
        .from("body_composition")
        .insert({
          date: entryDate,
          weight_lbs: entry.weight_lbs ?? null,
          source: "manual_weigh_in",
          scan_type: "manual",
        })
        .select()
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ type: "weight", ...data });
    }

    if (entry.type === "period") {
      const { data, error } = await supabase
        .from("cycle_logs")
        .insert({
          date: entryDate,
          flow: entry.flow ?? null,
          notes: entry.period_notes ?? entry.description ?? null,
        })
        .select()
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ type: "period", ...data });
    }

    const insertRow: Record<string, any> = {
      description: entry.description || text || "Food entry",
      estimated_calories: entry.calories ?? null,
      protein_g: entry.protein_g ?? null,
      carbs_g: entry.carbs_g ?? null,
      fat_g: entry.fat_g ?? null,
      nutrition_detail: entry.nutrition_detail ?? null,
      source: imageBase64 ? "photo" : "text",
    };
    // Only override the default "now" timestamp when we actually have an
    // explicit date to use -- either the UI's date picker or a day the text
    // itself named (e.g. "Sunday: ..."). If neither is present, leave
    // logged_at unset so it keeps its real time-of-day via Supabase's default.
    if (explicitDate) insertRow.logged_at = `${explicitDate}T12:00:00`;

    const { data, error } = await supabase.from("food_logs").insert(insertRow).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ type: "food", ...data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Unknown error" }, { status: 500 });
  }
}
