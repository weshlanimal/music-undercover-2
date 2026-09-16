"use client";

import clsx from "clsx";
import type { InputHTMLAttributes } from "react";

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export function TextField({ label, className, id, ...props }: TextFieldProps) {
  return (
    <label className="flex flex-col gap-2 text-left">
      {label && (
        <span className="text-sm text-paper-muted" id={id ? `${id}-label` : undefined}>
          {label}
        </span>
      )}
      <input
        {...props}
        className={clsx(
          "w-full rounded-2xl border border-ink-border bg-ink-elevated px-4 py-3.5 text-paper placeholder:text-paper-faint",
          "focus:border-wave focus:outline-none focus:ring-2 focus:ring-wave/30",
          className
        )}
      />
    </label>
  );
}
