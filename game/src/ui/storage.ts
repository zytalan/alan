// Past lives are a per-viewer convenience: kept in this browser only, and the
// game works the same when storage is unavailable.

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
