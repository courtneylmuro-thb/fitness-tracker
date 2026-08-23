import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { estimateFood } from "@/lib/anthropic";

export async function POST(req: NextRequest) {
  try {
    const { description, imageBase64 } = await req.json();
    if (!description && !imageBase64) {
      return NextResponse.json(
        { error: "Provide a description or a photo" },
        { status: 400 }
      );
    }

    const estimate = await estimateFood({ description, imageBase64 });
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("food_logs")
      .insert({
        description: estimate.description || description || "Food entry",
        estimated_calories: estimate.calories ?? null,
        protein_g: estimate.protein_g ?? null,
        carbs_g: estimate.carbs_g ?? null,
        fat_g: estimate.fat_g ?? null,
        source: imageBase64 ? "photo" : "text",
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Unknown error" }, { status: 500 });
  }
}
