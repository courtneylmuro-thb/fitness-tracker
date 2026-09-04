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

// Brand palette (see thb-brand-kit) -- teal is the primary/"good" color,
// coral is the accent. Used throughout instead of system red/green so the
// dashboard actually looks like Courtney's app instead of a generic iOS UI.
const TEAL = "#3c6364";
const CORAL = "#e16fa9";

type DashboardData = {
  budget: number;
  caloriesToday: number;
  proteinToday: number;
  carbsToday: number;
  fatToday: number;
  burnedToday: number | null;
  burnedIsEstimate?: boolean;
  bmrToday: number | null;
  activeToday: number;
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

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

// Spells out the full date exactly the way Courtney wants it read:
// "September 03, 2026" -- month spelled out, two-digit day, comma, four-digit
// year. Parses the y-m-d pieces manually and builds a local Date rather than
// `new Date(isoString)` so this can't drift a day off due to UTC parsing.
function formatFullDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${MONTHS[(m || 1) - 1]} ${pad2(d || 1)}, ${y}`;
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

// The ring's fill tracks intake against budget (how full is your plate
// today); the big number in the center is Net (intake minus what you
// burned) -- the number Courtney actually wants to see at a glance.
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
          stroke={over ? CORAL : TEAL}
          strokeWidth="14"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 90 90)"
        />
        <text x="90" y="84" textAnchor="middle" fontSize="28" fontWeight="700" fill="#1d1d1f">
          {formatCal(net)}
        </text>
        <text x="90" y="106" textAnchor="middle" fontSize="13" fill="#86868b">
          net of {formatCal(budget)} cal
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
// formats both stacked segments (BMR baseline vs active/workout) with
// comma-grouped whole numbers, and adds the total so the two colors are easy
// to compare against each other.
function BurnedTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null;
  // Recharts hands this component the XAxis's own dataKey value as `label`
  // (the short "08-31" tick text), not the full ISO date -- pulling the real
  // date off `payload[0].payload.fullDate` (the original data row) instead
  // is what actually produces "September 02, 2026" rather than garbage from
  // trying to parse "08-31" as a y-m-d.
  const fullDate = payload[0]?.payload?.fullDate;
  const resting = payload.find((p: any) => p.dataKey === "resting")?.value ?? 0;
  const activeVal = payload.find((p: any) => p.dataKey === "active")?.value ?? 0;
  const total = resting + activeVal;
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
      <div style={{ color: TEAL }}>BMR: {formatCal(resting)} cal</div>
      <div style={{ color: CORAL }}>Active: {formatCal(activeVal)} cal</div>
      <div style={{ marginTop: 4, paddingTop: 4, borderTop: "1px solid #f2f2f7", fontWeight: 700 }}>
        Total: {formatCal(total)} cal
      </div>
    </div>
  );
}

function WeightTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null;
  const fullDate = payload[0]?.payload?.fullDate;
  const w = payload[0]?.value;
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
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{fullDate ? formatFullDate(fullDate) : ""}</div>
      <div style={{ color: TEAL }}>{w} lb</div>
    </div>
  );
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

  const dateStr = formatFullDate(localDateKey(selectedDate));
  const hour = now.getHours();
  const greeting = hour < 12 ? "Good morning." : hour < 18 ? "Good afternoon." : "Good evening.";

  const rangeDays = chartRange === "week" ? 7 : 30;
  const todayKey = localDateKey(now);
  // Split into resting (BMR baseline) and active (workout burn) so the chart
  // can stack them in two colors -- Courtney wants to see how much of her
  // daily burn is just existing (BMR) vs. actually working out. On today's
  // own bar, if resting hasn't synced yet, fall back to the same estimate
  // the stat card uses instead of showing a bar that's collapsed to zero.
  const inVsBurned = (data?.metrics || []).slice(-rangeDays).map((m) => {
    const isTodayRow = m.date === todayKey;
    const resting =
      m.resting_calories ?? (isTodayRow && data?.bmrToday != null ? data.bmrToday : 0);
    return {
      date: m.date.slice(5),
      fullDate: m.date,
      resting,
      active: m.active_calories ?? 0,
    };
  });

  const bodyTrend = (data?.body || []).map((b) => ({
    date: b.date.slice(5),
    fullDate: b.date,
    bodyFat: b.body_fat_pct,
    muscle: b.skeletal_muscle_mass_lbs,
  }));

  const weightTrend = (data?.body || [])
    .filter((b) => b.weight_lbs != null)
    .map((b) => ({
      date: b.date.slice(5),
      fullDate: b.date,
      weight: b.weight_lbs,
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
            color: TEAL,
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
            color: isToday ? "#c8c5be" : TEAL,
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
            <div style={{ fontWeight: 700, color: TEAL }}>{formatCal(data?.caloriesToday ?? 0)}</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div className="subtle">Burned{data?.burnedIsEstimate ? " (est.)" : ""}</div>
            <div style={{ fontWeight: 700, color: CORAL }}>
              {data?.burnedToday ? `${data.burnedIsEstimate ? "~" : ""}${formatCal(data.burnedToday)}` : "—"}
            </div>
          </div>
        </div>
        {data?.bmrToday != null && (
          <div className="subtle" style={{ textAlign: "center", marginTop: 6, fontSize: 12 }}>
            BMR {data.burnedIsEstimate ? "~" : ""}
            {formatCal(data.bmrToday)} cal · Active {formatCal(data.activeToday ?? 0)} cal
            {data?.burnedIsEstimate ? " · watch data syncs overnight" : ""}
          </div>
        )}
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
              <span>{f.estimated_calories ? `${formatCal(f.estimated_calories)} cal` : "—"}</span>
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
                border: `1px solid ${TEAL}`,
                background: chartRange === "week" ? TEAL : "transparent",
                color: chartRange === "week" ? "#fff" : TEAL,
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
                border: `1px solid ${TEAL}`,
                background: chartRange === "month" ? TEAL : "transparent",
                color: chartRange === "month" ? "#fff" : TEAL,
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
              formatter={(value) => (value === "resting" ? "BMR" : "Active")}
            />
            <Bar dataKey="resting" stackId="burn" fill={TEAL} name="resting" />
            <Bar dataKey="active" stackId="burn" fill={CORAL} name="active" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="card">
        <h2>Weight Trend</h2>
        {weightTrend.length === 0 ? (
          <div className="empty">Log a weight entry to see your trend.</div>
        ) : (
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={weightTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f2f2f7" />
              <XAxis dataKey="date" fontSize={11} stroke="#86868b" />
              <YAxis fontSize={11} stroke="#86868b" domain={["dataMin - 2", "dataMax + 2"]} />
              <Tooltip content={<WeightTooltip />} />
              <Line type="monotone" dataKey="weight" stroke={TEAL} strokeWidth={2} dot={{ r: 3, fill: TEAL }} />
            </LineChart>
          </ResponsiveContainer>
        )}
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
              <Line type="monotone" dataKey="bodyFat" name="Body fat %" stroke={CORAL} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="muscle" name="Skeletal muscle (lb)" stroke={TEAL} strokeWidth={2} dot={false} />
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
