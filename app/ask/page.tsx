"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

const TEAL = "#3c6364";
const CORAL = "#e16fa9";
const BORDER = "#e0ddd6";
const CREAM = "#f9f7f4";

type Msg = { role: "user" | "assistant"; content: string };

const STARTERS = [
  "Brown rice or white rice?",
  "What's a high-protein snack under 200 cal?",
  "Is it okay to eat before a workout?",
  "Good dinner if I've already eaten 1,400 today?",
];

export default function AskPage() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  async function send(question: string) {
    const q = question.trim();
    if (!q || loading) return;
    setError(null);
    const next = [...messages, { role: "user" as const, content: q }];
    setMessages(next);
    setText("");
    setLoading(true);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong");
      setMessages((m) => [...m, { role: "assistant", content: data.answer }]);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "16px 16px 100px", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <Link href="/" style={{ color: TEAL, textDecoration: "none", fontSize: 14 }}>
          ← Dashboard
        </Link>
        <h1 style={{ fontSize: 20, margin: 0, color: "#1a1a1a" }}>Ask</h1>
        <div style={{ width: 70 }} />
      </div>
      <div className="subtle" style={{ marginBottom: 12 }}>
        Your nutrition coach. Ask anything — nothing here gets logged.
      </div>

      <div
        ref={scrollRef}
        style={{
          background: CREAM,
          border: `1px solid ${BORDER}`,
          borderRadius: 12,
          padding: 16,
          minHeight: 240,
          maxHeight: "55vh",
          overflowY: "auto",
          marginBottom: 12,
        }}
      >
        {messages.length === 0 && (
          <div>
            <div className="subtle" style={{ marginBottom: 10 }}>
              Try asking…
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {STARTERS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  style={{
                    border: `1px solid ${TEAL}`,
                    background: "#fff",
                    color: TEAL,
                    borderRadius: 999,
                    padding: "8px 14px",
                    fontSize: 13,
                    cursor: "pointer",
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start", marginBottom: 10 }}>
            <div
              style={{
                maxWidth: "80%",
                padding: "10px 14px",
                borderRadius: 14,
                background: m.role === "user" ? TEAL : "#fff",
                color: m.role === "user" ? "#fff" : "#1a1a1a",
                border: m.role === "user" ? "none" : `1px solid ${BORDER}`,
                fontSize: 15,
                lineHeight: 1.4,
              }}
            >
              {m.content}
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

      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") send(text);
          }}
          placeholder="Ask a question…"
          style={{
            flex: 1,
            padding: "10px 14px",
            borderRadius: 999,
            border: `1px solid ${BORDER}`,
            fontSize: 15,
            outline: "none",
          }}
        />
        <button
          onClick={() => send(text)}
          disabled={loading || !text.trim()}
          style={{
            border: "none",
            borderRadius: 999,
            padding: "0 20px",
            background: CORAL,
            color: "#fff",
            fontWeight: 600,
            fontSize: 15,
            cursor: loading || !text.trim() ? "default" : "pointer",
            opacity: loading || !text.trim() ? 0.5 : 1,
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
}
