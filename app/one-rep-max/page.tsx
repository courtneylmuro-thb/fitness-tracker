"use client";

import { useEffect, useState } from "react";

// The 10 lifts people most commonly track a 1RM (or working max) for --
// pre-populated per Courtney's request so she just picks one and logs a
// number as she goes, rather than typing the lift name out every time.
const COMMON_LIFTS = [
  "Back Squat",
  "Bench Press",
  "Deadlift",
  "Overhead Press",
  "Barbell Row",
  "Front Squat",
  "Incline Bench Press",
  "Romanian Deadlift",
  "Hip Thrust",
  "Weighted Pull-up",
];

type Entry = {
  id: string;
  date: string;
  lift: string;
  weight_lbs: number;
  reps: number;
  notes: string | null;
};

function localDateStr(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

// Epley formula estimate -- only shown when reps > 1, since a genuine 1-rep
// set needs no estimation. Rounded to the nearest pound.
function estimate1RM(weight: number, reps: number): number {
  if (reps <= 1) return weight;
  return Math.round(weight * (1 + reps / 30));
}

export default function OneRepMaxPage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [lift, setLift] = useState(COMMON_LIFTS[0]);
  const [customLift, setCustomLift] = useState("");
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("1");
  const [date, setDate] = useState(() => localDateStr());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedLift, setExpandedLift] = useState<string | null>(null);

  function loadEntries() {
    setLoading(true);
    fetch("/api/one-rep-maxes")
      .then((r) => r.json())
      .then((data) => setEntries(data.entries || []))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadEntries();
  }, []);

  async function submitLift() {
    const liftName = lift === "__custom__" ? customLift.trim() : lift;
    if (!liftName || !weight) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/one-rep-maxes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lift: liftName, weight_lbs: weight, reps, date, notes: null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't save that");
      setWeight("");
      setReps("1");
      if (lift === "__custom__") setCustomLift("");
      loadEntries();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  // Group by lift, each with its full history sorted newest-first (entries
  // already come back that way from the API) and a "current best" -- the
  // highest estimated 1RM ever logged for that lift, not just the most
  // recent entry, since a heavier lift from three weeks ago is still the
  // number that matters for percentages.
  const byLift = new Map<string, Entry[]>();
  for (const e of entries) {
    const list = byLift.get(e.lift) || [];
    list.push(e);
    byLift.set(e.lift, list);
  }
  const liftNames = Array.from(byLift.keys()).sort((a, b) => {
    const aIdx = COMMON_LIFTS.indexOf(a);
    const bIdx = COMMON_LIFTS.indexOf(b);
    if (aIdx === -1 && bIdx === -1) return a.localeCompare(b);
    if (aIdx === -1) return 1;
    if (bIdx === -1) return -1;
    return aIdx - bIdx;
  });

  return (
    <div className="container">
      <div className="greeting">1-Rep Max</div>
      <div className="subtle" style={{ marginBottom: 16 }}>
        Log your lifts here over time -- once you've got a few logged we can start computing training percentages off them.
      </div>

      <div className="card">
        <select
          value={lift}
          onChange={(e) => setLift(e.target.value)}
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: 8,
            border: "1px solid #e0ddd6",
            marginBottom: 10,
            fontSize: 14,
          }}
        >
          {COMMON_LIFTS.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
          <option value="__custom__">Other lift…</option>
        </select>

        {lift === "__custom__" && (
          <input
            type="text"
            placeholder="Lift name"
            value={customLift}
            onChange={(e) => setCustomLift(e.target.value)}
            style={{ marginBottom: 10 }}
          />
        )}

        <div className="row" style={{ gap: 8, marginBottom: 10 }}>
          <input
            type="number"
            inputMode="decimal"
            placeholder="Weight (lbs)"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            style={{ flex: 2 }}
          />
          <input
            type="number"
            inputMode="numeric"
            placeholder="Reps"
            value={reps}
            onChange={(e) => setReps(e.target.value)}
            style={{ flex: 1 }}
          />
        </div>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ marginBottom: 12 }} />
        <button
          className="btn"
          disabled={saving || !weight || (lift === "__custom__" && !customLift.trim())}
          onClick={submitLift}
        >
          {saving ? "Saving…" : "Log it"}
        </button>
      </div>

      {error && (
        <div className="card" style={{ color: "#c0392b" }}>
          {error}
        </div>
      )}

      {loading && <div className="card">Loading…</div>}

      {!loading && liftNames.length === 0 && (
        <div className="card">
          <div className="empty">Nothing logged yet -- pick a lift above and log your first number.</div>
        </div>
      )}

      {!loading &&
        liftNames.map((name) => {
          const history = byLift.get(name)!;
          const best = history.reduce((max, e) => {
            const est = estimate1RM(Number(e.weight_lbs), Number(e.reps));
            return est > max ? est : max;
          }, 0);
          const isExpanded = expandedLift === name;
          return (
            <div key={name} className="card">
              <div
                className="row"
                style={{ justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
                onClick={() => setExpandedLift(isExpanded ? null : name)}
              >
                <div style={{ fontWeight: 700 }}>{name}</div>
                <div className="subtle">
                  best est. 1RM: <strong style={{ color: "#3c6364" }}>{best} lb</strong>
                </div>
              </div>
              {isExpanded && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #f2f2f7" }}>
                  {history.map((e) => (
                    <div key={e.id} className="food-entry">
                      <span>
                        {e.weight_lbs} lb × {e.reps} {Number(e.reps) === 1 ? "rep" : "reps"}
                        <span className="subtle"> · {e.date.slice(5)}</span>
                      </span>
                      <span className="subtle">
                        {Number(e.reps) > 1 ? `est. ${estimate1RM(Number(e.weight_lbs), Number(e.reps))} lb` : "actual"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
    </div>
  );
}
