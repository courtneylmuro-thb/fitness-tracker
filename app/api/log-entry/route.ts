import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { estimateLogEntry } from "@/lib/anthropic";

// Allow up to 60s: the AI classify/estimate (sometimes two calls with a retry)
// can exceed the default 10s and time out the HTTP response WHILE the insert
// still succeeds -- which made the app say "not logged", the user retry, and
// duplicate the entry (e.g. gabapentin logged 3x). More time = no false failure.
export const maxDuration = 60;

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

    // Pull her recent foods (last 14 days, de-duped by name) so the classifier
    // can honor "same as yesterday / same as last time" references -- reusing
    // the exact calories/macros of a food she already logged instead of
    // re-estimating a different number.
    let recentFoods: any[] = [];
    try {
      const sb = getSupabaseAdmin();
      const since = new Date(Date.now() - 14 * 86400000).toISOString();
      const { data: recent } = await sb
        .from("food_logs")
        .select("description, estimated_calories, protein_g, carbs_g, fat_g")
        .gte("logged_at", since)
        .order("logged_at", { ascending: false })
        .limit(80);
      const seen = new Set<string>();
      for (const r of recent || []) {
        const key = (r.description || "").toLowerCase().trim();
        if (key && !seen.has(key)) {
          seen.add(key);
          recentFoods.push(r);
        }
      }
    } catch {
      // recent-foods context is a nice-to-have; ignore failures
    }

    const entry = await estimateLogEntry({ text, imageBase64, mediaType, referenceDate, recentFoods });
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

    if (entry.type === "treatment") {
      const { data, error } = await supabase
        .from("treatments")
        .insert({
          name: entry.treatment_name || entry.description || "Treatment",
          detail: entry.treatment_detail ?? entry.description ?? null,
          amount: entry.treatment_amount ?? null,
          category: entry.treatment_category ?? "treatment",
          date: entryDate,
          source: "manual",
        })
        .select()
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ type: "treatment", ...data });
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

    // FOOD (default): insert one row PER ITEM so each food/drink can be edited
    // or deleted on its own, instead of one combined lump.
    const items =
      Array.isArray(entry.food_items) && entry.food_items.length > 0
        ? entry.food_items
        : [
            {
              description: entry.description || text || "Food entry",
              calories: entry.calories,
              protein_g: entry.protein_g,
              carbs_g: entry.carbs_g,
              fat_g: entry.fat_g,
              nutrition_detail: entry.nutrition_detail,
            },
          ];

    const rows = items.map((it: any) => {
      const row: Record<string, any> = {
        description: it.description || entry.description || text || "Food entry",
        estimated_calories: it.calories ?? null,
        protein_g: it.protein_g ?? null,
        carbs_g: it.carbs_g ?? null,
        fat_g: it.fat_g ?? null,
        alcohol_drinks: it.alcohol_drinks ?? 0,
        quantity: it.quantity ?? 1,
        nutrition_detail: it.nutrition_detail ?? null,
        source: imageBase64 ? "photo" : "text",
      };
      // Per-item date: in a multi-day recap each item can name its own day
      // (item_date). Prefer a valid, non-future item_date; else the entry-level
      // explicit date (UI picker or a single day the text named); else leave the
      // default "now" timestamp.
      const itemDate =
        typeof it.item_date === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(it.item_date) &&
        it.item_date <= referenceDate
          ? it.item_date
          : explicitDate;
      if (itemDate) row.logged_at = `${itemDate}T12:00:00`;
      return row;
    });

    const { data, error } = await supabase.from("food_logs").insert(rows).select();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ type: "food", items: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Unknown error" }, { status: 500 });
  }
}
