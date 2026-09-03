import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

// Stores a 1-10 "how I feel" score (+ optional note) against the same
// per-day row the dashboard/health-import already read/write. Only these two
// columns are in the upsert payload, so this can never clobber the health
// sync's own columns on the same date (Supabase upsert only touches the
// columns you actually pass).
export async function POST(req: NextRequest) {
  try {
    const { date, feelingScore, feelingNotes } = await req.json();
    if (!feelingScore || feelingScore < 1 || feelingScore > 10) {
      return NextResponse.json({ error: "feelingScore must be 1-10" }, { status: 400 });
    }
    const supabase = getSupabaseAdmin();
    const entryDate = date || new Date().toISOString().slice(0, 10);

    const { data, error } = await supabase
      .from("daily_metrics")
      .upsert(
        {
          date: entryDate,
          feeling_score: feelingScore,
          feeling_notes: feelingNotes || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "date" }
      )
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Unknown error" }, { status: 500 });
  }
}
