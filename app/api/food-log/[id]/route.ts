import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

// Edit a food entry (portion size / description) or delete it entirely.
// Used by the "Today's Food" list on the dashboard.

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json();
    const updates: Record<string, unknown> = {};
    if (typeof body.description === "string") updates.description = body.description;
    if (body.estimated_calories != null && body.estimated_calories !== "")
      updates.estimated_calories = Number(body.estimated_calories);
    if (body.protein_g != null && body.protein_g !== "") updates.protein_g = Number(body.protein_g);
    if (body.carbs_g != null && body.carbs_g !== "") updates.carbs_g = Number(body.carbs_g);
    if (body.fat_g != null && body.fat_g !== "") updates.fat_g = Number(body.fat_g);

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "Nothing to change" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("food_logs")
      .update(updates)
      .eq("id", params.id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Unknown error" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from("food_logs").delete().eq("id", params.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Unknown error" }, { status: 500 });
  }
}
