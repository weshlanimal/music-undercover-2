"use client";

import { useState } from "react";

const VOLUME_KEY = "music-undercover:volume";
const DEFAULT_VOLUME = 80;

/**
 * Le volume est strictement une préférence PERSONNELLE de chaque joueur —
 * contrairement à lecture/pause/défilement (pilotés par le présentateur en
 * watch2gether), il ne doit JAMAIS être diffusé aux autres. Mémorisé en
 * local pour ne pas avoir à le régler à chaque nouvel indice.
 */
export function useLocalVolume() {
  const [volume, setVolumeState] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_VOLUME;
    const saved = Number(window.localStorage.getItem(VOLUME_KEY));
    return Number.isFinite(saved) && saved >= 0 && saved <= 100 ? saved : DEFAULT_VOLUME;
  });

  function setVolume(next: number) {
    const clamped = Math.min(100, Math.max(0, Math.round(next)));
    setVolumeState(clamped);
    if (typeof window !== "undefined") window.localStorage.setItem(VOLUME_KEY, String(clamped));
  }

  return { volume, setVolume };
}
