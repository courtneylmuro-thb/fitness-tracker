"use client";

import { useEffect, useState } from "react";

const QUOTES = [
  "You said you'd do this. So do it.",
  "Nobody's coming to do it for you.",
  "Skipped workouts don't happen tomorrow either.",
  "Discipline is deciding once, not re-deciding every day.",
  "You don't have to feel like it. You just have to start.",
  "Excuses are permission slips you wrote yourself.",
  "Future you is watching. Don't let her down.",
  "Consistency beats motivation. Every single time.",
  "You don't need a perfect day. You need a done day.",
  "Nobody regrets a workout once it's over. Nobody.",
  "Show up anyway. That's the whole game.",
  "You've done harder things than this.",
  "Stop negotiating with yourself. Just go.",
  "The best time was earlier. The next best time is now.",
  "You're not tired. You're uninspired. Fix that yourself.",
  "Small and consistent beats big and occasional.",
  "You don't get points for good intentions.",
  "Prove it to yourself. Nobody else is keeping score.",
];

export default function QuoteModal() {
  const [quote, setQuote] = useState<string | null>(null);

  useEffect(() => {
    setQuote(QUOTES[Math.floor(Math.random() * QUOTES.length)]);
  }, []);

  if (!quote) return null;

  return (
    <div className="quote-overlay" onClick={() => setQuote(null)}>
      <div className="quote-card" onClick={(e) => e.stopPropagation()}>
        <div className="quote-text">"{quote}"</div>
        <button className="btn" onClick={() => setQuote(null)}>
          Let's go
        </button>
      </div>
    </div>
  );
}
