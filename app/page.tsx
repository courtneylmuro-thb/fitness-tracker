"use client";

import { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
  Legend,
} from "recharts";

type DashboardData = {
  budget: number;
  caloriesToday: number;
  proteinToday: number;
  carbsToday: number;
  fatToday: number;
  burnedToday: number | null;
  isVacationToday: boolean;
  metrics: Array<{ date: string; total_calories_burned: number | null; weight_lbs: number | null; steps: number | null }>;
  foodToday: Array<{
    id: string;
    description: string;
    estimated_calories: number | null;
    protein_g: number | null;
    carbs_g: number | null;
    fat_g: number | null;
  }>;
  body: Array<{ date: string; body_fat_pct: number | null; skeletal_muscle_mass_lbs: number | null; weight_lbs: number | null }>;
  workouts: Array<{ id: string; date: string; workout_type: string; duration_min: number | null; source: string }>;
};

function CalorieRing({ eaten, budget }: { eaten: number; budget: number }) {
  const pct = Math.min(eaten / (budget || 1), 1);
  const radius = 70;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - pct);
  const over = eaten > budget;

  return (
    <div style={{ display: "flex", justifyContent: "center", padding: "8px 0" }}>
      <svg width="180" height="180" viewBox="0 0 180 180">
        <circle cx="90" cy="90" r={radius} fill="none" stroke="#f2f2f7" strokeWidth="14" />
        <circle
          cx="90"
          cy="90"
          r={radius}
          fill="none"
          stroke={over ? "#FF3B30" : "#34C759"}
          strokeWidth="14"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 90 90)"
        />
        <text x="90" y="84" textAnchor="middle" fontSize="28" fontWeight="700" fill="#1d1d1f">
          {Math.round(eaten)}
        </text>
        <text x="90" y="106" textAnchor="middle" fontSize="13" fill="#86868b">
          of {budget} cal
        </text>
      </svg>
    </div>
  );
}

function MacroStat({ label, grams }: { label: string; grams: number }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div className="subtle">{label}</div>
      <div style={{ fontWeight: 700 }}>{Math.round(grams)}g</div>
    </div>
  );
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function dayParams(d: Date) {
  const localDate = localDateKey(d);
  const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).toISOString();
  const dayEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).toISOString();
  return { localDate, dayStart, dayEnd };
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [chartRange, setChartRange] = useState<"week" | "month">("week");

  const now = new Date();
  const isToday = localDateKey(selectedDate) === localDateKey(now);

  useEffect(() => {
    const { localDate, dayStart, dayEnd } = dayParams(selectedDate);
    fetch(
      `/api/dashboard-data?date=${localDate}&dayStart=${encodeURIComponent(dayStart)}&dayEnd=${encodeURIComponent(dayEnd)}`
    )
      .then((r) => r.json())
      .then(setData)
      .catch((e) => setError(String(e)));
  }, [selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate()]);

  function goPrevDay() {
    setSelectedDate((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1));
  }

  function goNextDay() {
    setSelectedDate((d) => {
      const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
      const todayOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return next > todayOnly ? d : next;
    });
  }

  function jumpToDate(value: string) {
    if (!value) return;
    const [y, m, d] = value.split("-").map(Number);
    setSelectedDate(new Date(y, m - 1, d));
  }

  const dateStr = selectedDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const hour = now.getHours();
  const greeting = hour < 12 ? "Good morning." : hour < 18 ? "Good afternoon." : "Good evening.";

  const rangeDays = chartRange === "week" ? 7 : 30;
  const inVsBurned = (data?.metrics || []).slice(-rangeDays).map((m) => ({
    date: m.date.slice(5),
    burned: m.total_calories_burned ?? 0,
  }));

  const bodyTrend = (data?.body || []).map((b) => ({
    date: b.date.slice(5),
    bodyFat: b.body_fat_pct,
    muscle: b.skeletal_muscle_mass_lbs,
  }));

  return (
    <div className="container">
      <div className="row" style={{ justifyContent: "center", alignItems: "center", gap: 14, marginBottom: 4 }}>
        <button
          aria-label="Previous day"
          onClick={goPrevDay}
          style={{
            border: "none",
            background: "transparent",
            fontSize: 22,
            color: "#3c6364",
            cursor: "pointer",
            padding: "4px 8px",
          }}
        >
          ‹
        </button>
        <div style={{ textAlign: "center" }}>
          <div className="greeting">{isToday ? greeting : "Looking back."}</div>
          <label style={{ display: "inline-block", cursor: "pointer", position: "relative" }}>
            <span className="subtle">{isToday ? `Today, ${dateStr}` : dateStr}</span>
            <input
              type="date"
              value={localDateKey(selectedDate)}
              max={localDateKey(now)}
              onChange={(e) => jumpToDate(e.target.value)}
              style={{
                position: "absolute",
                inset: 0,
                opacity: 0,
                width: "100%",
                height: "100%",
                cursor: "pointer",
              }}
            />
          </label>
        </div>
        <button
          aria-label="Next day"
          onClick={goNextDay}
          disabled={isToday}
          style={{
            border: "none",
            background: "transparent",
            fontSize: 22,
            color: isToday ? "#c8c5be" : "#3c6364",
            cursor: isToday ? "default" : "pointer",
            padding: "4px 8px",
          }}
        >
          ›
        </button>
      </div>

      {data?.isVacationToday && (
        <div className="card" style={{ background: "#eaf6ec" }}>
          <span className="pill pill-green">On vacation</span> — no pressure today.
        </div>
      )}

      {error && <div className="card">Couldn't load data yet: {error}</div>}

      <div className="card">
        <h2>{isToday ? "Today's Calories" : "Calories"}</h2>
        <CalorieRing eaten={data?.caloriesToday ?? 0} budget={data?.budget ?? 2000} />
        <div className="row" style={{ justifyContent: "center", gap: 24, marginTop: 8 }}>
          <div style={{ textAlign: "center" }}>
            <div className="subtle">Burned</div>
            <div style={{ fontWeight: 700 }}>{data?.burnedToday ? Math.round(data.burnedToday) : "—"}</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div className="subtle">Net</div>
            <div style={{ fontWeight: 700 }}>
              {data?.burnedToday ? Math.round((data.caloriesToday ?? 0) - data.burnedToday) : "—"}
            </div>
          </div>
        </div>
        <div className="row" style={{ justifyContent: "center", gap: 24, marginTop: 14, paddingTop: 14, borderTop: "1px solid #f2f2f7" }}>
          <MacroStat label="Protein" grams={data?.proteinToday ?? 0} />
          <MacroStat label="Carbs" grams={data?.carbsToday ?? 0} />
          <MacroStat label="Fat" grams={data?.fatToday ?? 0} />
        </div>
      </div>

      <div className="card">
        <h2>{isToday ? "Today's Food" : "Food logged"}</h2>
        {(data?.foodToday?.length ?? 0) === 0 && <div className="empty">Nothing logged {isToday ? "yet today" : "that day"}.</div>}
        {data?.foodToday.map((f) => (
          <div key={f.id} className="food-entry">
            <span>{f.description}</span>
            <span style={{ textAlign: "right" }}>
              <span>{f.estimated_calories ? `${Math.round(f.estimated_calories)} cal` : "—"}</span>
              {(f.protein_g || f.carbs_g || f.fat_g) && (
                <div className="subtle" style={{ fontSize: 11 }}>
                  {Math.round(f.protein_g ?? 0)}p · {Math.round(f.carbs_g ?? 0)}c · {Math.round(f.fat_g ?? 0)}f
                </div>
              )}
            </span>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <h2 style={{ margin: 0 }}>Calories Burned</h2>
          <div className="row" style={{ gap: 6 }}>
            <button
              onClick={() => setChartRange("week")}
              style={{
                padding: "5px 12px",
                borderRadius: 20,
                border: "1px solid #3c6364",
                background: chartRange === "week" ? "#3c6364" : "transparent",
                color: chartRange === "week" ? "#fff" : "#3c6364",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Week
            </button>
            <button
              onClick={() => setChartRange("month")}
              style={{
                padding: "5px 12px",
                borderRadius: 20,
                border: "1px solid #3c6364",
                background: chartRange === "month" ? "#3c6364" : "transparent",
                color: chartRange === "month" ? "#fff" : "#3c6364",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Month
            </button>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={inVsBurned}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f2f2f7" />
            <XAxis dataKey="date" fontSize={11} stroke="#86868b" />
            <YAxis fontSize={11} stroke="#86868b" />
            <Tooltip />
            <Bar dataKey="burned" fill="#007AFF" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="card">
        <h2>Body Composition Trend</h2>
        {bodyTrend.length === 0 ? (
          <div className="empty">Add an InBody scan to see trends.</div>
        ) : (
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={bodyTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f2f2f7" />
              <XAxis dataKey="date" fontSize={11} stroke="#86868b" />
              <YAxis fontSize={11} stroke="#86868b" />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="bodyFat" name="Body fat %" stroke="#FF9500" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="muscle" name="Skeletal muscle (lb)" stroke="#34C759" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="card">
        <h2>Recent Workouts</h2>
        {(data?.workouts?.length ?? 0) === 0 && <div className="empty">No workouts logged yet.</div>}
        {data?.workouts.slice(0, 8).map((w) => (
          <div key={w.id} className="food-entry">
            <span>
              {w.workout_type} <span className="subtle">· {w.date.slice(5)}</span>
            </span>
            <span className={`pill ${w.source === "calendar" ? "pill-blue" : "pill-green"}`}>
              {w.duration_min ? `${w.duration_min} min` : w.source}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
