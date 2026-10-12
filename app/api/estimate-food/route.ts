import { NextRequest, NextResponse } from "next/server";
import { estimateFood } from "@/lib/anthropic";

// Re-estimate calories/macros from a description WITHOUT logging anything.
// Used by the edit form's "Recalculate" button, so correcting the words of an
// entry (e.g. the app misheard "lettuce" as "pizza") can refresh the numbers
// to match what was actually eaten. Returns per the described amount (quantity 1).
export async function POST(req: NextRequest) {
  try {
    const { description } = await req.json();
    if (!description || !String(description).trim()) {
      return NextResponse.json({ error: "Describe the food first" }, { status: 400 });
    }
    const r = await estimateFood({ description: String(description) });
    return NextResponse.json({
      calories: r.calories ?? null,
      protein_g: r.protein_g ?? null,
      carbs_g: r.carbs_g ?? null,
      fat_g: r.fat_g ?? null,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Unknown error" }, { status: 500 });
  }
}
