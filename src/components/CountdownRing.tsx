"use client";

import { useEffect, useState } from "react";

interface CountdownRingProps {
  deadline: number | null; // epoch ms, null = pas de timer
  totalMs: number;
  size?: number;
}

export function CountdownRing({ deadline, totalMs, size = 56 }: CountdownRingProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!deadline) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [deadline]);

  if (!deadline) return null;

  const remainingMs = Math.max(0, deadline - now);
  const remainingSeconds = Math.ceil(remainingMs / 1000);
  const progress = totalMs > 0 ? Math.max(0, Math.min(1, remainingMs / totalMs)) : 0;
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const urgent = remainingSeconds <= 5;

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} strokeWidth={4} className="fill-none stroke-ink-border" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={4}
          strokeLinecap="round"
          className={urgent ? "fill-none stroke-signal transition-all duration-200" : "fill-none stroke-wave transition-all duration-200"}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - progress)}
        />
      </svg>
      <span className={`absolute font-display text-sm font-medium ${urgent ? "text-signal" : "text-paper"}`}>{remainingSeconds}</span>
    </div>
  );
}
