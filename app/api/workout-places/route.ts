import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

// Courtney's saved workout places (e.g. "home gym", "Channel Mission Bay gym").
// Once a place is saved with its equipment, she can just say "my home gym" and
// the workout generator uses that equipment -- no photos needed next time.

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("workout_places")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data || []);
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Unknown error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { name, equipment, notes } = await req.json();
    if (!name || !String(name).trim()) {
      return NextResponse.json({ error: "Give the place a name" }, { status: 400 });
    }
    const equipText = Array.isArray(equipment) ? equipment.join(", ") : equipment ? String(equipment) : null;
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("workout_places")
      .insert({ name: String(name).trim(), equipment: equipText, notes: notes ?? null })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Unknown error" }, { status: 500 });
  }
}
