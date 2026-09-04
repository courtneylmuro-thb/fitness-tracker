"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

const TEAL = "#3c6364";
const TEAL_DARK = "#2e4c4d";
const CORAL = "#e16fa9";
const CREAM = "#f9f7f4";
const BORDER = "#e0ddd6";

type ApiMsg = { role: "user" | "assistant"; content: string };
type ChatBubble = { role: "user" | "assistant"; text: string };
type Workout = {
  title: string;
  estimated_duration_min: number;
  warmup: string[];
  main: string[];
  cooldown: string[];
  notes?: string;
};

function localDateStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Native browser speech-to-text -- same pattern used on the Log page. No
// external transcription service, just the built-in Web Speech API.
function useSpeech(onFinal: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const recRef = useRef<any>(null);

  const start = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      alert("Voice input isn't supported in this browser -- try typing instead.");
      return;
    }
    const rec = new SR();
    rec.lang = "en-US";
    rec.continuous = false;
    rec.interimResults = false;
    rec.onresult = (e: any) => {
      const transcript = Array.from(e.results)
        .map((r: any) => r[0].transcript)
        .join(" ");
      onFinal(transcript);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recRef.current = rec;
    rec.start();
    setListening(true);
  };

  const stop = () => {
    recRef.current?.stop();
    setListening(false);
  };

  return { listening, start, stop };
}

function MicButton({ listening, onClick }: { listening: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: "none",
        borderRadius: 999,
        width: 40,
        height: 40,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 18,
        cursor: "pointer",
        background: listening ? CORAL : TEAL,
        color: "#fff",
      }}
      aria-label={listening ? "Stop recording" : "Speak"}
      title={listening ? "Stop recording" : "Speak"}
    >
      {listening ? "■" : "🎤"}
    </button>
  );
}

function WorkoutSection({ label, items }: { label: string; items: string[] }) {
  if (!items || items.length === 0) return null;
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontWeight: 700, color: TEAL, fontSize: 13, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
        {label}
      </div>
      <ul style={{ margin: 0, paddingLeft: 20 }}>
        {items.map((item, i) => (
          <li key={i} style={{ marginBottom: 4, lineHeight: 1.4 }}>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function GenerateWorkoutPage() {
  const [history, setHistory] = useState<ApiMsg[]>([]);
  const [bubbles, setBubbles] = useState<ChatBubble[]>([
    { role: "assistant", text: "Where are you working out today, and how long do you have?" },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workout, setWorkout] = useState<Workout | null>(null);

  const [showFeedback, setShowFeedback] = useState(false);
  const [actualMinutes, setActualMinutes] = useState<string>("");
  const [feedbackNotes, setFeedbackNotes] = useState("");
  const [logging, setLogging] = useState(false);
  const [logged, setLogged] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [bubbles, loading, workout, showFeedback, logged]);

  const composerSpeech = useSpeech((text) => setInput((prev) => (prev ? `${prev} ${text}` : text)));
  const feedbackSpeech = useSpeech((text) => setFeedbackNotes((prev) => (prev ? `${prev} ${text}` : text)));

  async function send(textOverride?: string) {
    const text = (textOverride ?? input).trim();
    if (!text || loading) return;
    setError(null);
    setInput("");
    setBubbles((prev) => [...prev, { role: "user", text }]);
    const newHistory: ApiMsg[] = [...history, { role: "user", content: text }];
    setHistory(newHistory);
    setLoading(true);

    try {
      const res = await fetch("/api/generate-workout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: newHistory }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Something went wrong generating that.");

      setHistory((prev) => [...prev, { role: "assistant", content: JSON.stringify(data) }]);

      if (data.type === "question") {
        setBubbles((prev) => [...prev, { role: "assistant", text: data.question }]);
      } else if (data.type === "workout") {
        setWorkout(data);
        setActualMinutes(String(data.estimated_duration_min ?? ""));
        setLogged(false);
        setShowFeedback(false);
        setBubbles((prev) => [
          ...prev,
          { role: "assistant", text: `Here's your workout: ${data.title}. Take a look below -- tell me if you want anything changed.` },
        ]);
      }
    } catch (err: any) {
      setError(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  async function submitFeedback() {
    if (!workout) return;
    setLogging(true);
    setError(null);
    try {
      const res = await fetch("/api/generate-workout", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: workout.title,
          estimated_duration_min: workout.estimated_duration_min,
          actual_duration_min: actualMinutes || null,
          feedback_notes: feedbackNotes || null,
          date: localDateStr(),
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Couldn't log that workout.");
      setLogged(true);
      setShowFeedback(false);
    } catch (err: any) {
      setError(err.message || "Something went wrong logging that.");
    } finally {
      setLogging(false);
    }
  }

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "16px 16px 100px", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <Link href="/" style={{ color: TEAL, textDecoration: "none", fontSize: 14 }}>
          ← Dashboard
        </Link>
        <h1 style={{ fontSize: 20, margin: 0, color: "#1a1a1a" }}>AI Workout</h1>
        <div style={{ width: 70 }} />
      </div>

      <div
        ref={scrollRef}
        style={{
          background: CREAM,
          border: `1px solid ${BORDER}`,
          borderRadius: 12,
          padding: 16,
          minHeight: 200,
          maxHeight: "48vh",
          overflowY: "auto",
          marginBottom: 12,
        }}
      >
        {bubbles.map((b, i) => (
          <div key={i} style={{ display: "flex", justifyContent: b.role === "user" ? "flex-end" : "flex-start", marginBottom: 10 }}>
            <div
              style={{
                maxWidth: "80%",
                padding: "10px 14px",
                borderRadius: 14,
                background: b.role === "user" ? TEAL : "#fff",
                color: b.role === "user" ? "#fff" : "#1a1a1a",
                border: b.role === "user" ? "none" : `1px solid ${BORDER}`,
                fontSize: 15,
                lineHeight: 1.4,
              }}
            >
              {b.text}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display: "flex", justifyContent: "flex-start" }}>
            <div style={{ padding: "10px 14px", borderRadius: 14, background: "#fff", border: `1px solid ${BORDER}`, fontSize: 15, color: "#888" }}>
              thinking…
            </div>
          </div>
        )}
      </div>

      {error && <div style={{ color: "#b3261e", fontSize: 14, marginBottom: 10 }}>{error}</div>}

      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") send();
          }}
          placeholder="I'm at my home gym, want a 25 min workout for my butt…"
          style={{
            flex: 1,
            padding: "10px 14px",
            borderRadius: 999,
            border: `1px solid ${BORDER}`,
            fontSize: 15,
            outline: "none",
          }}
        />
        <MicButton listening={composerSpeech.listening} onClick={() => (composerSpeech.listening ? composerSpeech.stop() : composerSpeech.start())} />
        <button
          onClick={() => send()}
          disabled={loading || !input.trim()}
          style={{
            border: "none",
            borderRadius: 999,
            padding: "0 20px",
            background: TEAL,
            color: "#fff",
            fontWeight: 600,
            fontSize: 15,
            cursor: loading || !input.trim() ? "default" : "pointer",
            opacity: loading || !input.trim() ? 0.5 : 1,
          }}
        >
          Send
        </button>
      </div>

      {workout && (
        <div
          style={{
            background: "#fff",
            border: `1px solid ${BORDER}`,
            borderRadius: 12,
            padding: "20px 22px",
            boxShadow: "2px 4px 12px rgba(0,0,0,0.06)",
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 700, color: "#1a1a1a", marginBottom: 2 }}>{workout.title}</div>
          <div style={{ fontSize: 13, color: TEAL, fontWeight: 600, marginBottom: 16 }}>
            ~{workout.estimated_duration_min} min
          </div>

          <WorkoutSection label="Warmup" items={workout.warmup} />
          <WorkoutSection label="Main" items={workout.main} />
          <WorkoutSection label="Cooldown" items={workout.cooldown} />

          {workout.notes && (
            <div style={{ fontSize: 14, color: "#555", fontStyle: "italic", marginTop: 8 }}>{workout.notes}</div>
          )}

          {!logged && !showFeedback && (
            <button
              onClick={() => setShowFeedback(true)}
              style={{
                marginTop: 16,
                border: "none",
                borderRadius: 999,
                padding: "10px 22px",
                background: CORAL,
                color: "#fff",
                fontWeight: 700,
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              I did this — log it
            </button>
          )}

          {showFeedback && !logged && (
            <div style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${BORDER}` }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>How'd it go?</div>

              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <label style={{ fontSize: 13, color: "#555" }}>Actual minutes:</label>
                <input
                  type="number"
                  value={actualMinutes}
                  onChange={(e) => setActualMinutes(e.target.value)}
                  style={{ width: 70, padding: "6px 8px", borderRadius: 6, border: `1px solid ${BORDER}`, fontSize: 14 }}
                />
              </div>

              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                <input
                  value={feedbackNotes}
                  onChange={(e) => setFeedbackNotes(e.target.value)}
                  placeholder="e.g. felt easy, took 45 min instead of 30"
                  style={{ flex: 1, padding: "10px 14px", borderRadius: 999, border: `1px solid ${BORDER}`, fontSize: 14 }}
                />
                <MicButton
                  listening={feedbackSpeech.listening}
                  onClick={() => (feedbackSpeech.listening ? feedbackSpeech.stop() : feedbackSpeech.start())}
                />
              </div>

              <button
                onClick={submitFeedback}
                disabled={logging}
                style={{
                  border: "none",
                  borderRadius: 999,
                  padding: "10px 22px",
                  background: TEAL,
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: logging ? "default" : "pointer",
                  opacity: logging ? 0.6 : 1,
                }}
              >
                {logging ? "Logging…" : "Log it"}
              </button>
            </div>
          )}

          {logged && (
            <div style={{ marginTop: 16, color: TEAL, fontWeight: 600, fontSize: 14 }}>✓ Logged. Nice work.</div>
          )}
        </div>
      )}
    </div>
  );
}
