"use client";

import { useRef, useState } from "react";

type Reading = {
  date: string;
  weight_lbs: number | null;
  body_fat_pct: number | null;
  skeletal_muscle_mass_lbs: number | null;
  visceral_fat_level: number | null;
  scan_type?: "inbody" | "scale_photo";
};

function localDateStr(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export default function ScanPage() {
  const [date, setDate] = useState(() => localDateStr());
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Reading | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function submitPhoto(file: File) {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const base64 = await fileToBase64(file);
      const res = await fetch("/api/body-scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ imageBase64: base64, mediaType: file.type, date }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to read scan");
      setResult(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container">
      <div className="greeting">Body Scan</div>
      <div className="subtle" style={{ marginBottom: 16 }}>
        Snap a photo of your InBody printout or a scale reading -- doesn't need to be daily. Either kind gets
        detected automatically.
      </div>

      <div className="card">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ marginBottom: 12 }} />
        <button className="btn" disabled={loading} onClick={() => fileInputRef.current?.click()}>
          {loading ? "Reading scan…" : "📷 Upload InBody or scale photo"}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: "none" }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) submitPhoto(file);
          }}
        />
      </div>

      {error && (
        <div className="card" style={{ color: "#FF3B30" }}>
          {error}
        </div>
      )}

      {result && (
        <div className="card">
          <h2>Saved -- {result.scan_type === "scale_photo" ? "scale reading" : "InBody scan"}</h2>
          <div className="food-entry">
            <span>Weight</span>
            <span>{result.weight_lbs ? `${result.weight_lbs} lb` : "—"}</span>
          </div>
          <div className="food-entry">
            <span>Body fat</span>
            <span>{result.body_fat_pct ? `${result.body_fat_pct}%` : "—"}</span>
          </div>
          <div className="food-entry">
            <span>Skeletal muscle</span>
            <span>{result.skeletal_muscle_mass_lbs ? `${result.skeletal_muscle_mass_lbs} lb` : "—"}</span>
          </div>
          <div className="food-entry">
            <span>Visceral fat level</span>
            <span>{result.visceral_fat_level ?? "—"}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
