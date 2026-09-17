"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/hooks/useTheme";

interface ThemeToggleProps {
  /** Position fixe façon QuitButton/RestartMatchButton, plutôt qu'inline dans le flux (pour les écrans de jeu). */
  floating?: boolean;
  className?: string;
}

export function ThemeToggle({ floating, className = "" }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      aria-label={theme === "dark" ? "Passer au thème clair" : "Passer au thème sombre"}
      className={`${floating ? "fixed right-4 top-4 z-50" : ""} flex h-9 w-9 items-center justify-center rounded-full border border-ink-border bg-ink-elevated/90 text-paper-muted shadow-lg backdrop-blur-md transition-colors hover:text-paper ${className}`}
    >
      {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
    </button>
  );
}
