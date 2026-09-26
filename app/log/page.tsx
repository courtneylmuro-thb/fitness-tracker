"use client";

import { useRef, useState } from "react";

type LogResult = {
  type: "food" | "workout" | "weight" | "period";
  description?: string;
  estimated_calories?: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
  workout_type?: string;
  duration_min?: number | null;
  weight_lbs?: number | null;
  flow?: string | null;
  notes?: string | null;
};

function localDateStr(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// iOS Safari (and every other iOS browser, since Apple forces them all onto
// WebKit) never implemented Web Speech API, so voice input is recorded with
// MediaRecorder instead and transcribed server-side via Groq/Whisper. Safari
// only supports audio/mp4 for MediaRecorder, not audio/webm, so this checks
// what the current browser can actually produce and uses that.
function pickRecorderMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg"];
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return "";
}

// Wraps whatever the browser throws (often a terse WebKit DOMException like
// "The string did not match the expected pattern.") with which step it
// actually happened in, so a future failure says where to look instead of
// just repeating the raw browser message with no context.
function stepError(step: string, e: any): Error {
  const raw = e?.message || e?.name || String(e);
  return new Error(`${step}: ${raw}`);
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const result = reader.result as string;
        const parts = result.split(",");
        if (parts.length < 2) {
          reject(stepError("Reading recording (unexpected data URL format)", new Error("no comma separator")));
          return;
        }
        resolve(parts[1]);
      } catch (e) {
        reject(stepError("Reading recording", e));
      }
    };
    reader.onerror = () => reject(stepError("Reading recording", reader.error));
    reader.readAsDataURL(blob);
  });
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const result = reader.result as string;
        const parts = result.split(",");
        if (parts.length < 2) {
          reject(stepError("Reading photo (unexpected data URL format)", new Error("no comma separator")));
          return;
        }
        resolve(parts[1]);
      } catch (e) {
        reject(stepError("Reading photo", e));
      }
    };
    reader.onerror = () => reject(stepError("Reading photo", reader.error));
    reader.readAsDataURL(file);
  });
}

export default function LogPage() {
  const [text, setText] = useState("");
  const [date, setDate] = useState(() => localDateStr());
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<LogResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  // "How I feel" -- stored for future graphing, nothing displayed from it yet.
  const [feelingScore, setFeelingScore] = useState<number | null>(null);
  const [feelingSaved, setFeelingSaved] = useState(false);
  const [feelingError, setFeelingError] = useState<string | null>(null);
  const [feelingSaving, setFeelingSaving] = useState(false);

  async function startListening() {
    setError(null);
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("Voice input isn't supported in this browser -- type it instead.");
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e: any) {
      setError("Couldn't access the microphone -- check Settings > Privacy > Microphone and try again.");
      return;
    }

    try {
      const mimeType = pickRecorderMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        try {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        } catch (err) {
          setError(stepError("Capturing recording chunk", err).message);
        }
      };

      recorder.onerror = (e: any) => {
        setError(stepError("Recording", e?.error || e).message);
        setListening(false);
      };

      recorder.onstop = async () => {
        try {
          stream.getTracks().forEach((t) => t.stop());
          const blob = new Blob(chunksRef.current, { type: recorder.mimeType || mimeType || "audio/mp4" });
          await transcribeBlob(blob);
        } catch (e: any) {
          setError(e?.message ? e.message : stepError("Finishing recording", e).message);
          setListening(false);
        }
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setListening(true);
    } catch (e: any) {
      stream.getTracks().forEach((t) => t.stop());
      setError(stepError("Setting up the recorder", e).message);
    }
  }

  function stopListening() {
    try {
      mediaRecorderRef.current?.stop();
    } catch (e: any) {
      setError(stepError("Stopping recording", e).message);
    }
    setListening(false);
  }

  async function transcribeBlob(blob: Blob) {
    if (blob.size === 0) {
      setError("Didn't catch any audio -- try again.");
      return;
    }
    setTranscribing(true);
    setError(null);
    try {
      let audioBase64: string;
      try {
        audioBase64 = await blobToBase64(blob);
      } catch (e: any) {
        throw e.message ? e : stepError("Encoding recording", e);
      }

      let res: Response;
      try {
        res = await fetch("/api/transcribe", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ audioBase64, mimeType: blob.type }),
        });
      } catch (e: any) {
        throw stepError("Sending recording to transcription", e);
      }

      let data: any;
      try {
        data = await res.json();
      } catch (e: any) {
        throw stepError("Reading transcription response", e);
      }

      if (!res.ok) throw new Error(data.error || "Couldn't transcribe that");
      if (data.text) {
        setText((prev) => (prev ? `${prev} ${data.text}` : data.text));
      } else {
        setError("Didn't catch that -- try again or type it.");
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setTranscribing(false);
    }
  }

  async function submitText() {
    if (!text.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      let res: Response;
      try {
        res = await fetch("/api/log-entry", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text, date }),
        });
      } catch (e: any) {
        throw stepError("Sending entry", e);
      }

      let data: any;
      try {
        data = await res.json();
      } catch (e: any) {
        throw stepError("Reading log response", e);
      }

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
      let imageBase64: string;
      try {
        imageBase64 = await fileToBase64(file);
      } catch (e: any) {
        throw e.message ? e : stepError("Encoding photo", e);
      }

      let res: Response;
      try {
        res = await fetch("/api/log-entry", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ imageBase64, mediaType: file.type, text: text || undefined, date }),
        });
      } catch (e: any) {
        throw stepError("Sending photo", e);
      }

      let data: any;
      try {
        data = await res.json();
      } catch (e: any) {
        throw stepError("Reading log response", e);
      }

      if (!res.ok) throw new Error(data.error || "Couldn't log that");
      setResult(data);
      setText("");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  // Was silently failing before: if the fetch itself threw (network drop,
  // etc.) or the response wasn't ok, nothing told Courtney it didn't save --
  // feelingSaved just stayed false with no visible error, so a real failure
  // looked identical to "haven't tapped a number yet." Now every path ends
  // in either a clear saved state or a clear, visible error.
  async function saveFeeling(score: number) {
    setFeelingScore(score);
    setFeelingSaving(true);
    setFeelingSaved(false);
    setFeelingError(null);
    try {
      const res = await fetch("/api/mood", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ date, feelingScore: score }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Didn't save -- try tapping it again.");
      setFeelingSaved(true);
    } catch (e: any) {
      setFeelingError(e.message || "Didn't save -- try tapping it again.");
    } finally {
      setFeelingSaving(false);
    }
  }

  const micLabel = listening ? "⏹ Stop" : transcribing ? "Transcribing…" : "🎤 Speak";

  return (
    <div className="container">
      <div className="greeting">Log</div>
      <div className="subtle" style={{ marginBottom: 16 }}>
        Food, workout, weigh-in, or period note -- say it, type it, or snap a photo, doesn't need to be precise.
      </div>

      <div className="card">
        <textarea
          rows={3}
          placeholder='e.g. "two eggs and toast", "yoga sixty minutes", "weighed in at 117", or "started my period"'
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <div className="row" style={{ marginBottom: 12 }}>
          <button
            className="btn btn-secondary"
            onClick={listening ? stopListening : startListening}
            disabled={transcribing}
          >
            {micLabel}
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

      <div className="card">
        <h2>How do you feel today?</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(10, 1fr)", gap: 4 }}>
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              onClick={() => saveFeeling(n)}
              style={{
                padding: "8px 0",
                borderRadius: 8,
                border: "1px solid #3c6364",
                background: feelingScore === n ? "#3c6364" : "transparent",
                color: feelingScore === n ? "#fff" : "#3c6364",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {n}
            </button>
          ))}
        </div>
        {feelingError ? (
          <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 6, color: "#c0392b", fontWeight: 600, fontSize: 13 }}>
            ✕ {feelingError}
          </div>
        ) : (
          <div
            style={{
              marginTop: 10,
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 13,
              fontWeight: feelingSaved ? 700 : 400,
              color: feelingSaved ? "#3c6364" : "#86868b",
            }}
          >
            {feelingSaving ? "Saving…" : feelingSaved ? `✓ Saved ${feelingScore}/10 for today.` : "1 = rough, 10 = amazing."}
          </div>
        )}
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

      {result && result.type === "weight" && (
        <div className="card">
          <h2>Logged weigh-in</h2>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>
            {result.weight_lbs ? `${result.weight_lbs} lbs` : "Weight recorded"}
          </div>
          <div className="subtle">Saved to Body Composition.</div>
        </div>
      )}

      {result && result.type === "period" && (
        <div className="card">
          <h2>Logged period note</h2>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>{result.flow ? `Flow: ${result.flow}` : "Noted"}</div>
          {result.notes && <div className="subtle">{result.notes}</div>}
        </div>
      )}
    </div>
  );
}
