"use client";

import { useEffect, useRef, useState } from "react";

const THRESHOLD = 64;

function vibrate(pattern: number | number[]) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate(pattern);
    } catch {
      // no-op -- not all browsers implement this
    }
  }
}

export default function PullToRefresh() {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const pulling = useRef(false);
  const pullRef = useRef(0);
  const firedHaptic = useRef(false);

  useEffect(() => {
    pullRef.current = pull;
  }, [pull]);

  useEffect(() => {
    function onTouchStart(e: TouchEvent) {
      if (window.scrollY === 0 && !refreshing) {
        startY.current = e.touches[0].clientY;
        pulling.current = true;
        firedHaptic.current = false;
      }
    }
    function onTouchMove(e: TouchEvent) {
      if (!pulling.current || startY.current === null) return;
      const delta = e.touches[0].clientY - startY.current;
      if (delta > 0 && window.scrollY === 0) {
        const next = Math.min(delta * 0.5, 90);
        setPull(next);
        // light tick the moment the pull crosses the release threshold
        if (next * 2 > THRESHOLD && !firedHaptic.current) {
          firedHaptic.current = true;
          vibrate(10);
        } else if (next * 2 <= THRESHOLD) {
          firedHaptic.current = false;
        }
      } else {
        pulling.current = false;
        setPull(0);
      }
    }
    function onTouchEnd() {
      if (pulling.current && pullRef.current > THRESHOLD) {
        setRefreshing(true);
        setPull(56);
        vibrate([12, 40, 12]);
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
      />
    </div>
  );
}
