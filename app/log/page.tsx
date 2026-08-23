"use client";

import { useRef, useState } from "react";

type Estimate = {
  description: string;
  estimated_calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

export default function LogPage() {
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Estimate | null>(null);
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
      const res = await fetch("/api/food-log", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ description: text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to log food");
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
      const base64 = await fileToBase64(file);
      const res = await fetch("/api/food-log", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ imageBase64: base64, description: text || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to log food");
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
      <div className="greeting">Log Food</div>
      <div className="subtle" style={{ marginBottom: 16 }}>
        Say it, type it, or snap a photo -- doesn't need to be precise.
      </div>

      <div className="card">
        <textarea
          rows={3}
          placeholder="e.g. two eggs, toast with butter, and a coffee with oat milk"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
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
          {loading ? "Estimating…" : "Log it"}
        </button>
      </div>

      {error && (
        <div className="card" style={{ color: "#FF3B30" }}>
          {error}
        </div>
      )}

      {result && (
        <div className="card">
          <h2>Logged</h2>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>{result.description}</div>
          <div className="subtle">
            {Math.round(result.estimated_calories)} cal · {Math.round(result.protein_g)}g protein ·{" "}
            {Math.round(result.carbs_g)}g carbs · {Math.round(result.fat_g)}g fat
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
