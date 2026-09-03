"use client";

import { useEffect, useState } from "react";

type DayRow = {
  date: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  count: number;
  entries: { id: string; description: string; estimated_calories: number | null }[];
};

function formatFullDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function HistoryPage() {
  const [range, setRange] = useState<"week" | "month" | "year">("week");
  const [days, setDays] = useState<DayRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/food-history?range=${range}`)
      .then((r) => r.json())
      .then((data) => setDays(data.days || []))
      .finally(() => setLoading(false));
  }, [range]);

  const totalCal = days.reduce((s, d) => s + d.calories, 0);
  const avgCal = days.length ? Math.round(totalCal / days.length) : 0;

  return (
    <div className="container">
      <div className="greeting">Food History</div>
      <div className="subtle" style={{ marginBottom: 16 }}>
        Look back at what you've logged.
      </div>

      <div className="card">
        <div className="row" style={{ gap: 6 }}>
          {(["week", "month", "year"] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              style={{
                padding: "5px 14px",
                borderRadius: 20,
                border: "1px solid #3c6364",
                background: range === r ? "#3c6364" : "transparent",
                color: range === r ? "#fff" : "#3c6364",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {r === "week" ? "Week" : r === "month" ? "Month" : "Year"}
            </button>
          ))}
        </div>
        <div className="subtle" style={{ marginTop: 12 }}>
          {days.length} day{days.length === 1 ? "" : "s"} logged · avg {avgCal.toLocaleString("en-US")} cal/day
        </div>
      </div>

      {loading && <div className="card">Loading…</div>}

      {!loading && days.length === 0 && (
        <div className="card">
          <div className="empty">Nothing logged in this range yet.</div>
        </div>
      )}

      {!loading &&
        days.map((d) => (
          <div key={d.date} className="card">
            <div
              className="row"
              style={{ justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
              onClick={() => setExpanded(expanded === d.date ? null : d.date)}
            >
              <div style={{ fontWeight: 700 }}>{formatFullDate(d.date)}</div>
              <div className="subtle">{Math.round(d.calories).toLocaleString("en-US")} cal</div>
            </div>
            <div className="subtle" style={{ marginTop: 4 }}>
              {Math.round(d.protein)}g protein · {Math.round(d.carbs)}g carbs · {Math.round(d.fat)}g fat ·{" "}
              {d.count} entr{d.count === 1 ? "y" : "ies"}
            </div>
            {expanded === d.date && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #f2f2f7" }}>
                {d.entries.map((e) => (
                  <div key={e.id} className="food-entry">
                    <span>{e.description}</span>
                    <span>{e.estimated_calories ? `${Math.round(e.estimated_calories)} cal` : "—"}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
    </div>
  );
}
