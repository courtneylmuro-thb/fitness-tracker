import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const RANGE_DAYS: Record<string, number> = { week: 7, month: 30, year: 365 };

// Historical food-log browsing -- day/week/month/year views, per Courtney's
// ask for a way to look back at logged food beyond just "today" on the
// dashboard. Groups food_logs by local date and sums calories/macros per day.
export async function GET(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const { searchParams } = new URL(req.url);
  const range = searchParams.get("range") || "week";
  const days = RANGE_DAYS[range] ?? 7;
  const since = new Date(Date.now() - days * 86400000).toISOString();

  const { data, error } = await supabase
    .from("food_logs")
    .select("*")
    .gte("logged_at", since)
    .order("logged_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const byDate: Record<string, { calories: number; protein: number; carbs: number; fat: number; count: number; entries: any[] }> = {};
  for (const row of data || []) {
    const date = (row.logged_at || "").slice(0, 10);
    if (!byDate[date]) byDate[date] = { calories: 0, protein: 0, carbs: 0, fat: 0, count: 0, entries: [] };
    byDate[date].calories += Number(row.estimated_calories) || 0;
    byDate[date].protein += Number(row.protein_g) || 0;
    byDate[date].carbs += Number(row.carbs_g) || 0;
    byDate[date].fat += Number(row.fat_g) || 0;
    byDate[date].count += 1;
    byDate[date].entries.push(row);
  }

  const days_out = Object.entries(byDate)
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([date, v]) => ({ date, ...v }));

  return NextResponse.json({ range, days: days_out });
}
