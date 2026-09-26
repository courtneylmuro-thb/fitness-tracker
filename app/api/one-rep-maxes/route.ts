import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET returns every logged set, newest first -- the page groups them by lift
// client-side so it can show "current best" per lift plus full history.
export async function GET() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("one_rep_maxes")
    .select("*")
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ entries: data || [] });
}

export async function POST(req: NextRequest) {
  try {
    const { lift, weight_lbs, reps, date, notes } = await req.json();
    if (!lift || !weight_lbs) {
      return NextResponse.json({ error: "Need a lift and a weight" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("one_rep_maxes")
      .insert({
        lift,
        weight_lbs: Number(weight_lbs),
        reps: reps ? Number(reps) : 1,
        date: date || new Date().toISOString().slice(0, 10),
        notes: notes || null,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Unknown error" }, { status: 500 });
  }
}
