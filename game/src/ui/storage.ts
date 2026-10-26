// Past lives and the life in progress are a per-viewer convenience: kept in this browser
// only, and the game works the same when storage is unavailable.

import type { LifeState } from "../engine";

export interface PastLife {
  name: string;
  country: string;
  flag: string;
  birthYear: number;
  deathYear: number;
  age: number;
  peakUsd: number;
  grade: string;
  mode: "random" | "timetravel";
  seed: number;
}

const KEY = "lot-in-life:lives";

export function loadLives(): PastLife[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as PastLife[]) : [];
  } catch {
    return [];
  }
}

export function saveLife(life: PastLife): PastLife[] {
  const lives = [life, ...loadLives()].slice(0, 12);
  try {
    localStorage.setItem(KEY, JSON.stringify(lives));
  } catch {
    // storage blocked: the list just won't persist
  }
  return lives;
}

// ------------------------------------------------------------------ the life in progress

const CURRENT = "lot-in-life:current";
const FORMAT = 1; // bump when a saved life can no longer be read by the engine

export type SavedScreen = "birth" | "play";

export interface SavedLife {
  format: number;
  screen: SavedScreen;
  savedAt: number;
  life: LifeState;
}

/** Keep the unfinished life so a reload or a closed tab can carry on from the same year. */
export function saveCurrent(life: LifeState, screen: SavedScreen): void {
  try {
    localStorage.setItem(CURRENT, JSON.stringify({ format: FORMAT, screen, savedAt: Date.now(), life }));
  } catch {
    // storage full or blocked: the life just won't survive a reload
  }
}

export function loadCurrent(): SavedLife | null {
  try {
    const raw = localStorage.getItem(CURRENT);
    if (!raw) return null;
    const saved = JSON.parse(raw) as SavedLife;
    const l = saved?.life;
    const ok =
      saved?.format === FORMAT &&
      (saved.screen === "birth" || saved.screen === "play") &&
      l?.v === 1 &&
      typeof l.seed === "number" &&
      typeof l.year === "number" &&
      Array.isArray(l.history) &&
      Array.isArray(l.log) &&
      Array.isArray(l.pending);
    return ok ? saved : null;
  } catch {
    return null;
  }
}

export function clearCurrent(): void {
  try {
    localStorage.removeItem(CURRENT);
  } catch {
    // nothing to clear
  }
}
