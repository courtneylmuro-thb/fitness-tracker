import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { coachAnswer } from "@/lib/anthropic";

// The "Ask" coach. Answers nutrition/fitness questions conversationally and
// NEVER logs anything. This is deliberately separate from /api/log-entry so a
// question ("brown rice or white rice?") is answered, not recorded as food.
export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json();
    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: "Ask me something first." }, { status: 400 });
    }

    // Pull a little context so answers consider her actual day. Best-effort only.
    let context = "";
    try {
      const supabase = getSupabaseAdmin();
      const today = new Date().toISOString().slice(0, 10);
      const [foodRes, settingsRes, bodyRes] = await Promise.all([
        supabase.from("food_logs").select("estimated_calories").gte("logged_at", `${today}T00:00:00`),
        supabase.from("settings").select("value").eq("key", "daily_calorie_budget").single(),
        supabase.from("body_composition").select("*").order("date", { ascending: false }).limit(1),
      ]);
      const eaten = (foodRes.data || []).reduce((s, f) => s + (Number(f.estimated_calories) || 0), 0);
      const budget = settingsRes.data?.value ?? 2000;
      const body = bodyRes.data?.[0];
      context =
        `So far today she's eaten roughly ${Math.round(eaten)} of a ${budget} calorie budget.` +
        (body
          ? ` Most recent InBody -- weight ${body.weight_lbs} lb, body fat ${body.body_fat_pct}%, skeletal muscle ${body.skeletal_muscle_mass_lbs} lb.`
          : "");
    } catch {
      // context is a nice-to-have; ignore failures
    }

    const answer = await coachAnswer({ messages, context });
    return NextResponse.json({ answer });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Unknown error" }, { status: 500 });
  }
}
