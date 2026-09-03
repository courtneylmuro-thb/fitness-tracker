"use client";

import { useState } from "react";

type Workout = {
  title: string;
  estimated_duration_min: number;
  warmup: string[];
  main: string[];
  cooldown: string[];
  notes: string;
};

function localDateStr(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export default function GenerateWorkoutPage() {
  const [location, setLocation] = useState("");
  const [equipment, setEquipment] = useState("");
  const [duration, setDuration] = useState(30);
  const [focus, setFocus] = useState("");
  const [loading, setLoading] = useState(false);
  const [workout, setWorkout] = useState<Workout | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logging, setLogging] = useState(false);
  const [logged, setLogged] = useState(false);

  async function generate() {
    setLoading(true);
    setError(null);
    setWorkout(null);
    setLogged(false);
    try {
      const res = await fetch("/api/generate-workout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ location, equipment, durationMin: duration, focus }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't generate a workout");
      setWorkout(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function logIt() {
    if (!workout) return;
    setLogging(true);
    try {
      const res = await fetch("/api/generate-workout", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: workout.title,
          estimated_duration_min: workout.estimated_duration_min,
          date: localDateStr(),
        }),
      });
      if (res.ok) setLogged(true);
    } finally {
      setLogging(false);
    }
  }

  return (
    <div className="container">
      <div className="greeting">Generate a Workout</div>
      <div className="subtle" style={{ marginBottom: 16 }}>
        Tell me what you've got and how long you have -- I'll build something around it.
      </div>

      <div className="card">
        <input
          type="text"
          placeholder="Where are you? (e.g. hotel gym, living room, full gym)"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
        />
        <input
          type="text"
          placeholder="Equipment available? (e.g. dumbbells up to 30lb, resistance bands, none)"
          value={equipment}
          onChange={(e) => setEquipment(e.target.value)}
        />
        <input
          type="text"
          placeholder="Focus? (e.g. legs, full body, cardio, upper body)"
          value={focus}
          onChange={(e) => setFocus(e.target.value)}
        />
        <div className="row" style={{ alignItems: "center", marginBottom: 12 }}>
          <span className="subtle">Minutes:</span>
          <input
            type="number"
            min={5}
            max={120}
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            style={{ width: 80, marginBottom: 0 }}
          />
        </div>
        <button className="btn" disabled={loading} onClick={generate}>
          {loading ? "Building your workout…" : "Generate workout"}
        </button>
      </div>

      {error && (
        <div className="card" style={{ color: "#c0392b" }}>
          {error}
        </div>
      )}

      {workout && (
        <div className="card">
          <h2>{workout.title}</h2>
          <div className="subtle" style={{ marginBottom: 12 }}>
            ~{workout.estimated_duration_min} min
          </div>

          <div style={{ fontWeight: 700, marginBottom: 4 }}>Warmup</div>
          {workout.warmup.map((w, i) => (
            <div key={i} className="subtle" style={{ marginBottom: 2 }}>
              • {w}
            </div>
          ))}

          <div style={{ fontWeight: 700, margin: "12px 0 4px" }}>Main</div>
          {workout.main.map((w, i) => (
            <div key={i} style={{ marginBottom: 4 }}>
              • {w}
            </div>
          ))}

          <div style={{ fontWeight: 700, margin: "12px 0 4px" }}>Cooldown</div>
          {workout.cooldown.map((w, i) => (
            <div key={i} className="subtle" style={{ marginBottom: 2 }}>
              • {w}
            </div>
          ))}

          {workout.notes && (
            <div className="subtle" style={{ marginTop: 12 }}>
              {workout.notes}
            </div>
          )}

          <button className="btn" style={{ marginTop: 16 }} disabled={logging || logged} onClick={logIt}>
            {logged ? "Logged ✓" : logging ? "Logging…" : "I did this -- log it"}
          </button>
        </div>
      )}
    </div>
  );
}
