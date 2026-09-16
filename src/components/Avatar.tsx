"use client";

import clsx from "clsx";

interface AvatarProps {
  emoji: string;
  size?: "sm" | "md" | "lg";
  ringColor?: "signal" | "wave" | "none";
  dimmed?: boolean;
  pulsing?: boolean;
}

const sizeMap = { sm: "h-9 w-9 text-base", md: "h-12 w-12 text-xl", lg: "h-20 w-20 text-4xl" };

export function Avatar({ emoji, size = "md", ringColor = "none", dimmed, pulsing }: AvatarProps) {
  return (
    <span className="relative inline-flex">
      {pulsing && (
        <span
          className={clsx(
            "absolute inset-0 rounded-full",
            ringColor === "signal" ? "bg-signal" : "bg-wave",
            "animate-pulse-ring"
          )}
        />
      )}
      <span
        className={clsx(
          "relative flex items-center justify-center rounded-full bg-ink-raised",
          sizeMap[size],
          ringColor === "signal" && "ring-2 ring-signal",
          ringColor === "wave" && "ring-2 ring-wave",
          dimmed && "opacity-35 grayscale"
        )}
      >
        {emoji}
      </span>
    </span>
  );
}
