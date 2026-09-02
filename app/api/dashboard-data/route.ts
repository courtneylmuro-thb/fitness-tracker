import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const { searchParams } = new URL(req.url);
  const fallbackToday = new Date().toISOString().slice(0, 10);
  const today = searchParams.get("date") || fallbackToday;
  const dayStart = searchParams.get("dayStart") || `${today}T00:00:00.000Z`;
  const dayEnd = searchParams.get("dayEnd") || `${today}T23:59:59.999Z`;
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

  const [metricsRes, foodTodayRes, bodyRes, workoutsRes, settingsRes, vacationRes] =
    await Promise.all([
      supabase.from("daily_metrics").select("*").gte("date", thirtyDaysAgo).order("date"),
      supabase.from("food_logs").select("*").gte("logged_at", dayStart).lte("logged_at", dayEnd).order("logged_at"),
      supabase.from("body_composition").select("*").order("date", { ascending: false }).limit(12),
      supabase.from("workouts").select("*").gte("date", thirtyDaysAgo).order("date", { ascending: false }),
      supabase.from("settings").select("*").eq("key", "daily_calorie_budget").single(),
      supabase.from("vacation_days").select("*").eq("date", today).maybeSingle(),
    ]);

  const foodToday = foodTodayRes.data || [];
  const caloriesToday = foodToday.reduce((sum, f) => sum + (Number(f.estimated_calories) || 0), 0);
  const proteinToday = foodToday.reduce((sum, f) => sum + (Number(f.protein_g) || 0), 0);
  const carbsToday = foodToday.reduce((sum, f) => sum + (Number(f.carbs_g) || 0), 0);
  const fatToday = foodToday.reduce((sum, f) => sum + (Number(f.fat_g) || 0), 0);
  const todayMetrics = (metricsRes.data || []).find((m) => m.date === today);

  return NextResponse.json({
    budget: settingsRes.data?.value ?? 2000,
    caloriesToday,
    proteinToday,
    carbsToday,
    fatToday,
    burnedToday: todayMetrics?.total_calories_burned ?? null,
    isVacationToday: !!vacationRes.data,
    metrics: metricsRes.data || [],
    foodToday,
    body: (bodyRes.data || []).slice().reverse(),
    workouts: workoutsRes.data || [],
  });
}
