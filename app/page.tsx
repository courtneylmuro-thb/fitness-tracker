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
  burnedToday: number | null;
  isVacationToday: boolean;
  metrics: Array<{ date: string; total_calories_burned: number | null; weight_lbs: number | null; steps: number | null }>;
  foodToday: Array<{ id: string; description: string; estimated_calories: number | null }>;
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

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    const localDate = `${y}-${m}-${d}`;
    const dayStart = new Date(y, now.getMonth(), now.getDate(), 0, 0, 0, 0).toISOString();
    const dayEnd = new Date(y, now.getMonth(), now.getDate(), 23, 59, 59, 999).toISOString();
    fetch(
      `/api/dashboard-data?date=${localDate}&dayStart=${encodeURIComponent(dayStart)}&dayEnd=${encodeURIComponent(dayEnd)}`
    )
      .then((r) => r.json())
      .then(setData)
      .catch((e) => setError(String(e)));
  }, []);

  const today = new Date();
  const dateStr = today.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const hour = today.getHours();
  const greeting = hour < 12 ? "Good morning." : hour < 18 ? "Good afternoon." : "Good evening.";

  const inVsBurned = (data?.metrics || []).slice(-14).map((m) => ({
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
      <div className="greeting">{greeting}</div>
      <div className="subtle">{dateStr}</div>

      {data?.isVacationToday && (
        <div className="card" style={{ background: "#eaf6ec" }}>
          <span className="pill pill-green">On vacation</span> — no pressure today.
        </div>
      )}

      {error && <div className="card">Couldn't load data yet: {error}</div>}

      <div className="card">
        <h2>Today's Calories</h2>
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
      </div>

      <div className="card">
        <h2>Today's Food</h2>
        {(data?.foodToday?.length ?? 0) === 0 && <div className="empty">Nothing logged yet today.</div>}
        {data?.foodToday.map((f) => (
          <div key={f.id} className="food-entry">
            <span>{f.description}</span>
            <span>{f.estimated_calories ? `${Math.round(f.estimated_calories)} cal` : "—"}</span>
          </div>
        ))}
      </div>

      <div className="card">
        <h2>Calories Burned — Last 14 Days</h2>
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
