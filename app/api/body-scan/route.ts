import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { estimateBodyScan } from "@/lib/anthropic";

export async function POST(req: NextRequest) {
  try {
    const { imageBase64, mediaType, date } = await req.json();
    if (!imageBase64) {
      return NextResponse.json({ error: "Provide a photo of the InBody sheet" }, { status: 400 });
    }

    const reading = await estimateBodyScan({ imageBase64, mediaType });
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("body_composition")
      .insert({
        date: date || new Date().toISOString().slice(0, 10),
        weight_lbs: reading.weight_lbs ?? null,
        body_fat_pct: reading.body_fat_pct ?? null,
        skeletal_muscle_mass_lbs: reading.skeletal_muscle_mass_lbs ?? null,
        visceral_fat_level: reading.visceral_fat_level ?? null,
        source: "inbody_screenshot",
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Unknown error" }, { status: 500 });
  }
}
