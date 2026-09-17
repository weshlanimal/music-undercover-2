"use client";

import clsx from "clsx";
import type { ButtonHTMLAttributes } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  fullWidth?: boolean;
}

export function Button({ variant = "primary", fullWidth, className, children, ...props }: ButtonProps) {
  return (
    <button
      {...props}
      className={clsx(
        "relative inline-flex items-center justify-center gap-2 rounded-full px-5 py-3.5 text-base font-medium transition-all duration-150 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40",
        fullWidth && "w-full",
        variant === "primary" &&
          "bg-gradient-to-b from-signal-soft to-signal text-white shadow-glow hover:brightness-110",
        variant === "secondary" && "border border-ink-border bg-ink-raised text-paper hover:border-wave/50",
        variant === "ghost" && "bg-transparent text-paper-muted hover:text-paper",
        variant === "danger" && "border border-signal/40 bg-transparent text-signal hover:bg-signal-dim",
        className
      )}
    >
      {children}
    </button>
  );
}
