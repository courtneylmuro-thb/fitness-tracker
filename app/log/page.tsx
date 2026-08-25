"use client";

import { useRef, useState } from "react";

type LogResult = {
  type: "food" | "workout";
  description?: string;
  estimated_calories?: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
  workout_type?: string;
  duration_min?: number | null;
};

export default function LogPage() {
  const [text, setText] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [listening, setListening] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<LogResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);

  function startListening() {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError("Voice input isn't supported in this browser -- type it instead.");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setText((prev) => (prev ? `${prev} ${transcript}` : transcript));
    };
    recognition.onend = () => setListening(false);
    recognition.start();
    recognitionRef.current = recognition;
    setListening(true);
  }

  function stopListening() {
    recognitionRef.current?.stop();
    setListening(false);
  }

  async function submitText() {
    if (!text.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/log-entry", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, date }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't log that");
      setResult(data);
      setText("");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function submitPhoto(file: File) {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const imageBase64 = await fileToBase64(file);
      const res = await fetch("/api/log-entry", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ imageBase64, mediaType: file.type, text: text || undefined, date }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't log that");
      setResult(data);
      setText("");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container">
      <div className="greeting">Log</div>
      <div className="subtle" style={{ marginBottom: 16 }}>
        Food or workout, say it, type it, or snap a photo -- doesn't need to be precise.
      </div>

      <div className="card">
        <textarea
          rows={3}
          placeholder='e.g. "two eggs and toast" or "yoga sixty minutes"'
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <div className="row" style={{ marginBottom: 12 }}>
          <button className="btn btn-secondary" onClick={listening ? stopListening : startListening}>
            {listening ? "Stop listening" : "🎤 Speak"}
          </button>
          <button className="btn btn-secondary" onClick={() => fileInputRef.current?.click()}>
            📷 Photo
          </button>
        </div>
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
        <button className="btn" disabled={loading || !text.trim()} onClick={submitText}>
          {loading ? "Logging…" : "Log it"}
        </button>
      </div>

      {error && (
        <div className="card" style={{ color: "#c0392b" }}>
          {error}
        </div>
      )}

      {result && result.type === "food" && (
        <div className="card">
          <h2>Logged food</h2>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>{result.description}</div>
          <div className="subtle">
            {Math.round(result.estimated_calories ?? 0)} cal · {Math.round(result.protein_g ?? 0)}g protein ·{" "}
            {Math.round(result.carbs_g ?? 0)}g carbs · {Math.round(result.fat_g ?? 0)}g fat
          </div>
        </div>
      )}

      {result && result.type === "workout" && (
        <div className="card">
          <h2>Logged workout</h2>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>{result.workout_type}</div>
          <div className="subtle">{result.duration_min ? `${result.duration_min} min` : "No duration given"}</div>
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
