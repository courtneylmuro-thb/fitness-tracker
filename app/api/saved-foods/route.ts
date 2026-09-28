import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

// Saved foods / recipes. GET lists them (with fuzzy ?q= search), POST creates one.
// Fuzzy search: split the query into words and rank rows by how many words appear
// anywhere in the name/description -- so "brown rice salad" still finds a food
// saved as "Brown Rice Ginger Salad".

export async function GET(req: NextRequest) {
  try {
    const q = (req.nextUrl.searchParams.get("q") || "").trim().toLowerCase();
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("saved_foods").select("*").order("name");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    let rows = data || [];
    if (q) {
      const tokens = q.split(/\s+/).filter(Boolean);
      rows = rows
        .map((r: any) => {
          const hay = `${r.name || ""} ${r.description || ""}`.toLowerCase();
          const matches = tokens.filter((t) => hay.includes(t)).length;
          return { r, matches };
        })
        .filter((x) => x.matches > 0)
        .sort((a, b) => b.matches - a.matches || String(a.r.name).length - String(b.r.name).length)
        .map((x) => x.r);
    }
    return NextResponse.json(rows);
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Unknown error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const b = await req.json();
    if (!b.name || !String(b.name).trim()) {
      return NextResponse.json({ error: "Give it a name" }, { status: 400 });
    }
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("saved_foods")
      .insert({
        name: String(b.name).trim(),
        description: b.description ? String(b.description) : String(b.name).trim(),
        calories: b.calories ?? null,
        protein_g: b.protein_g ?? null,
        carbs_g: b.carbs_g ?? null,
        fat_g: b.fat_g ?? null,
      })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Unknown error" }, { status: 500 });
  }
}
