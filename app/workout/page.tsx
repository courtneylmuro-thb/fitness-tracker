"use client";

import { useState } from "react";

export default function WorkoutPage() {
  const [type, setType] = useState("");
  const [duration, setDuration] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!type.trim()) {
      setError('Give it a name -- "Run", "Yoga", whatever it was.');
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/workout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workout_type: type.trim(),
          duration_min: duration ? Number(duration) : null,
          date,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't save that");
      setMessage(`Logged ${data.workout_type}${data.duration_min ? ` -- ${data.duration_min} min` : ""}.`);
      setType("");
      setDuration("");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="container">
      <div className="greeting">Log workout</div>
      <div className="subtle" style={{ marginBottom: 16 }}>
        Apple Watch workouts and calendar classes (LuxFit, rides) log themselves. Use this for anything else.
      </div>

      <div className="card">
        <h2>Workout</h2>
        <input
          type="text"
          placeholder="e.g. Run, Yoga, Strength training"
          value={type}
          onChange={(e) => setType(e.target.value)}
        />
        <input
          type="text"
          inputMode="numeric"
          placeholder="Duration in minutes (optional)"
          value={duration}
          onChange={(e) => setDuration(e.target.value.replace(/[^0-9]/g, ""))}
        />
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <button className="btn" onClick={submit} disabled={saving}>
          {saving ? "Saving…" : "Log It"}
        </button>
      </div>

      {message && (
        <div className="card" style={{ color: "#2e4c4d" }}>
          {message}
        </div>
      )}
      {error && (
        <div className="card" style={{ color: "#c0392b" }}>
          {error}
        </div>
      )}
    </div>
  );
}
