"use client";

import { useEffect, useState } from "react";

const TEAL = "#3c6364";

type SavedFood = {
  id: string;
  name: string;
  description: string | null;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
};

export default function FoodsPage() {
  const [foods, setFoods] = useState<SavedFood[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load(query = "") {
    setLoading(true);
    try {
      const res = await fetch(`/api/saved-foods${query ? `?q=${encodeURIComponent(query)}` : ""}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't load your foods");
      setFoods(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  // debounce search
  useEffect(() => {
    const t = setTimeout(() => load(q), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  async function logIt(f: SavedFood) {
    setNote(null);
    setError(null);
    try {
      const res = await fetch("/api/log-entry", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ saved: f }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Couldn't log it");
      }
      setNote(`Logged "${f.name}" ✓`);
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function remove(f: SavedFood) {
    if (!confirm(`Delete "${f.name}" from your saved foods?`)) return;
    try {
      const res = await fetch(`/api/saved-foods/${f.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Couldn't delete");
      setFoods((list) => list.filter((x) => x.id !== f.id));
    } catch (e: any) {
      setError(e.message);
    }
  }

  return (
    <div className="container">
      <div className="greeting">My Foods</div>
      <div className="subtle" style={{ marginBottom: 16 }}>
        Meals you saved. Tap Log to add one to today.
      </div>

      <input
        type="text"
        placeholder="Search your foods… (e.g. brown rice salad)"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      {note && (
        <div className="card" style={{ background: "#eaf6ec", color: "#248a3d" }}>
          {note}
        </div>
      )}
      {error && (
        <div className="card" style={{ color: "#b3261e" }}>
          {error}
        </div>
      )}

      <div className="card">
        {loading && <div className="empty">Loading…</div>}
        {!loading && foods.length === 0 && (
          <div className="empty">
            {q ? "No saved foods match that." : 'No saved foods yet. Log a meal, then tap "Save as my food."'}
          </div>
        )}
        {foods.map((f) => (
          <div
            key={f.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 0",
              borderBottom: "1px solid #f2f2f7",
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600 }}>{f.name}</div>
              <div className="subtle">
                {f.calories != null ? `${Math.round(f.calories)} cal` : "—"}
                {f.protein_g != null ? ` · ${Math.round(f.protein_g)}g protein` : ""}
              </div>
            </div>
            <button
              onClick={() => logIt(f)}
              aria-label={`Log ${f.name}`}
              style={{
                border: `1px solid ${TEAL}`,
                background: "transparent",
                color: TEAL,
                borderRadius: 8,
                padding: "6px 12px",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Log
            </button>
            <button
              onClick={() => remove(f)}
              aria-label={`Delete ${f.name}`}
              style={{ border: "none", background: "transparent", color: "#b3261e", fontSize: 15, cursor: "pointer" }}
            >
              🗑
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
