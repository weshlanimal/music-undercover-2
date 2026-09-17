"use client";

import { useEffect, useState } from "react";

const THEME_KEY = "music-undercover:theme";
export type ThemeName = "dark" | "light";

function applyTheme(theme: ThemeName) {
  document.documentElement.dataset.theme = theme;
}

/**
 * Sombre par défaut (demande explicite), clair en option. Le script inline
 * dans layout.tsx applique déjà la préférence mémorisée avant l'hydratation
 * (pour éviter un flash de mauvais thème) — ce hook ne fait que garder l'état
 * React synchronisé et persister les changements.
 */
export function useTheme() {
  const [theme, setThemeState] = useState<ThemeName>("dark");

  useEffect(() => {
    const current = document.documentElement.dataset.theme;
    setThemeState(current === "light" ? "light" : "dark");
  }, []);

  function setTheme(next: ThemeName) {
    setThemeState(next);
    applyTheme(next);
    window.localStorage.setItem(THEME_KEY, next);
  }

  return { theme, setTheme, toggleTheme: () => setTheme(theme === "dark" ? "light" : "dark") };
}
