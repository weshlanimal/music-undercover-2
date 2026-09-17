"use client";

import type { ReactNode } from "react";

interface PhaseShellProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  children?: ReactNode;
  footer?: ReactNode;
  /** Conteneur plus large (utilisé pour les écrans où l'embed vidéo est l'élément principal). */
  wide?: boolean;
}

export function PhaseShell({ eyebrow, title, subtitle, children, footer, wide }: PhaseShellProps) {
  const maxWidth = wide ? "max-w-xl" : "max-w-md";
  return (
    <div className={`mx-auto flex min-h-[calc(100dvh-4rem)] w-full ${maxWidth} flex-col px-5 pb-28 pt-16 animate-rise`}>
      <div className="mb-7">
        {eyebrow && (
          <p className="mb-2 inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.14em] text-wave">
            <span className="h-1 w-1 rounded-full bg-wave" />
            {eyebrow}
          </p>
        )}
        <h1 className="font-display text-3xl font-medium leading-tight text-paper">{title}</h1>
        {subtitle && <p className="mt-2 text-paper-muted">{subtitle}</p>}
      </div>
      <div className="flex-1">{children}</div>
      {footer && (
        <div className="fixed inset-x-0 bottom-0 border-t border-ink-border bg-ink/90 px-5 py-4 backdrop-blur-md">
          <div className={`mx-auto ${maxWidth}`}>{footer}</div>
        </div>
      )}
    </div>
  );
}
