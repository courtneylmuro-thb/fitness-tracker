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
  metrics: Array<{
    date: string;
    total_calories_burned: number | null;
    active_calories: number | null;
    resting_calories: number | null;
    weight_lbs: number | null;
    steps: number | null;
  }>;
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

// Formats a count of calories the way Courtney wants it read at a glance:
// comma-grouped thousands, no decimal places (the raw synced values come
// back from Health Auto Export with long float tails like 1653.2500895...,
// which is unreadable in a chart tooltip or stat).
function formatCal(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

// Spells out the full date -- "September 2, 2026" -- for chart tooltips.
// Parses the y-m-d pieces manually and builds a local Date rather than
// `new Date(isoString)` so this can't drift a day off due to UTC parsing.
function formatFullDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  return dt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

// The ring's fill still tracks intake against budget (how full is your plate
// today), but the big number in the center is now Net (intake minus what you
// burned) rather than raw intake -- that's the number Courtney actually
// wants to see at a glance.
function CalorieRing({ intake, burned, budget }: { intake: number; burned: number; budget: number }) {
  const net = intake - burned;
  const pct = Math.min(intake / (budget || 1), 1);
  const radius = 70;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - pct);
  const over = net > budget;

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
          {Math.round(net)}
        </text>
        <text x="90" y="106" textAnchor="middle" fontSize="13" fill="#86868b">
          net of {budget} cal
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

// Custom tooltip for the Calories Burned chart -- spells out the full date,
// formats both stacked segments (baseline vs workout) with comma-grouped
// whole numbers, and adds the total so the two colors are easy to read
// against each other.
function BurnedTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null;
  // Recharts hands this component the XAxis's own dataKey value as `label`
  // (the short "08-31" tick text), not the full ISO date -- pulling the
  // real date off `payload[0].payload.fullDate` (the original data row)
  // instead is what actually produces "September 2, 2026" rather than
  // garbage like "July 1, 1910" from trying to parse "08-31" as a y-m-d.
  const fullDate = payload[0]?.payload?.fullDate;
  const resting = payload.find((p: any) => p.dataKey === "resting")?.value ?? 0;
  const active_ = payload.find((p: any) => p.dataKey === "active")?.value ?? 0;
  const total = resting + active_;
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #f2f2f7",
        borderRadius: 8,
        padding: "10px 12px",
        fontSize: 13,
        boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 6 }}>{fullDate ? formatFullDate(fullDate) : ""}</div>
      <div style={{ color: "#3c6364" }}>Baseline: {formatCal(resting)} cal</div>
      <div style={{ color: "#e16fa9" }}>Workout: {formatCal(active_)} cal</div>
      <div style={{ marginTop: 4, paddingTop: 4, borderTop: "1px solid #f2f2f7", fontWeight: 700 }}>
        Total: {formatCal(total)} cal
      </div>
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
  // Split into resting (baseline/basal burn) and active (workout burn) so the
  // chart can stack them in two colors -- Courtney wants to see how much of
  // her daily burn is just existing vs. actually working out.
  const inVsBurned = (data?.metrics || []).slice(-rangeDays).map((m) => ({
    date: m.date.slice(5),
    fullDate: m.date,
    resting: m.resting_calories ?? 0,
    active: m.active_calories ?? 0,
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
        <CalorieRing
          intake={data?.caloriesToday ?? 0}
          burned={data?.burnedToday ?? 0}
          budget={data?.budget ?? 2000}
        />
        <div className="row" style={{ justifyContent: "center", gap: 24, marginTop: 8 }}>
          <div style={{ textAlign: "center" }}>
            <div className="subtle">Intake</div>
            <div style={{ fontWeight: 700, color: "#34C759" }}>{Math.round(data?.caloriesToday ?? 0)}</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div className="subtle">Burned</div>
            <div style={{ fontWeight: 700, color: "#FF3B30" }}>
              {data?.burnedToday ? Math.round(data.burnedToday) : "—"}
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
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={inVsBurned}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f2f2f7" />
            <XAxis dataKey="date" fontSize={11} stroke="#86868b" />
            <YAxis fontSize={11} stroke="#86868b" tickFormatter={(v) => formatCal(v)} />
            <Tooltip content={<BurnedTooltip />} />
            <Legend
              wrapperStyle={{ fontSize: 12 }}
              formatter={(value) => (value === "resting" ? "Baseline" : "Workout")}
            />
            <Bar dataKey="resting" stackId="burn" fill="#3c6364" name="resting" />
            <Bar dataKey="active" stackId="burn" fill="#e16fa9" name="active" radius={[4, 4, 0, 0]} />
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
