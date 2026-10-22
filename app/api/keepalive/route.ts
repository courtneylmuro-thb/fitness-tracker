import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// Daily heartbeat, hit by a Vercel Cron (see vercel.json). Makes one trivial
// database query so the free-tier Supabase project always registers activity
// and never pauses from inactivity -- even if Courtney doesn't open the app for
// a week or two. Keeps the whole thing alive hands-off.
export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from("settings").select("key").limit(1);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, at: new Date().toISOString() });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message ?? "Unknown error" }, { status: 500 });
  }
}
