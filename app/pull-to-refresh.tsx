"use client";

import { useEffect, useRef, useState } from "react";

const THRESHOLD = 64;

export default function PullToRefresh() {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const pulling = useRef(false);
  const pullRef = useRef(0);

  useEffect(() => {
    pullRef.current = pull;
  }, [pull]);

  useEffect(() => {
    function onTouchStart(e: TouchEvent) {
      if (window.scrollY === 0 && !refreshing) {
        startY.current = e.touches[0].clientY;
        pulling.current = true;
      }
    }
    function onTouchMove(e: TouchEvent) {
      if (!pulling.current || startY.current === null) return;
      const delta = e.touches[0].clientY - startY.current;
      if (delta > 0 && window.scrollY === 0) {
        setPull(Math.min(delta * 0.5, 90));
      } else {
        pulling.current = false;
        setPull(0);
      }
    }
    function onTouchEnd() {
      if (pulling.current && pullRef.current > THRESHOLD) {
        setRefreshing(true);
        setPull(56);
        window.location.reload();
      } else {
        setPull(0);
      }
      pulling.current = false;
      startY.current = null;
    }
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [refreshing]);

  return (
    <div className="ptr-indicator" style={{ height: pull, opacity: pull > 8 ? 1 : 0 }}>
      <div
        className={`ptr-spinner ${refreshing ? "spinning" : ""}`}
        style={{ transform: refreshing ? undefined : `rotate(${pull * 3}deg)` }}
      >
        ↓
      </div>
    </div>
  );
}
