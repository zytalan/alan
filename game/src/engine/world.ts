// Access to the bundled real-world dataset (public/data/world.json).

import type { LabourData } from "./labour";

export type SeriesKey =
  | "pop" | "births" | "tfr" | "leM" | "leF" | "imr" | "u5" | "ppp" | "lcu" | "infl" | "fx"
  | "dep" | "lend" | "gr" | "gini" | "unemp" | "prim" | "sec" | "ter" | "acct" | "agr" | "self";

type Series = (number | null)[];

export interface CountryData {
  n: string; // name
  i2: string; // ISO2
  r: string; // World Bank region id
  inc: string; // income group today
  cur: string; // ISO 4217 currency
  ppp21: number; // local currency per 2021 international dollar
  mkt: number | null; // first year a local stock market existed
  oop: number | null; // out-of-pocket share of health spending, %
  tax: number | null; // tax revenue, % of GDP
  s: Record<SeriesKey, Series>;
  war?: Record<string, number>; // battle-related deaths by year
}

export interface MarketData {
  eq: Series; // local stocks, nominal total return
  bond: Series; // government bonds, nominal total return
  house: Series; // house prices, nominal change
  rent: Series; // gross rental yield
  crisis: number[]; // systemic banking crisis years (JST)
  src: { eq?: string; house?: string };
}

export interface WorldData {
  v: number;
  generated: string;
  y0: number;
  y1: number;
  m0: number;
  countries: Record<string, CountryData>;
  markets: Record<string, MarketData>;
  us: { y0: number; sp: Series; tbill: Series; tbond: Series; re: Series; gold: Series };
  btc: { y0: number; px: Series };
  labour?: LabourData;
  sources: string[];
}

let W: WorldData | null = null;
const listeners: (() => void)[] = [];

export function setWorld(w: WorldData): void {
  W = w;
  for (const fn of listeners) fn();
}

/** Register a cache reset to run whenever new data is loaded. */
export function onWorldChange(fn: () => void): void {
  listeners.push(fn);
}

export function world(): WorldData {
  if (!W) throw new Error("World data not loaded — call setWorld() first");
  return W;
}

export function hasWorld(): boolean {
  return W !== null;
}

export function country(iso: string): CountryData {
  const c = world().countries[iso];
  if (!c) throw new Error(`Unknown country ${iso}`);
  return c;
}

export function countryIsos(): string[] {
  return Object.keys(world().countries);
}

/** Exact observation for a year, or null. */
export function obs(iso: string, key: SeriesKey, year: number): number | null {
  const w = world();
  if (year < w.y0 || year > w.y1) return null;
  return country(iso).s[key][year - w.y0] ?? null;
}

/** Nearest available observation — for slow-moving series (population, life expectancy...). */
export function nearest(iso: string, key: SeriesKey, year: number): number | null {
  const w = world();
  const s = country(iso).s[key];
  const k = Math.min(Math.max(year - w.y0, 0), s.length - 1);
  for (let d = 0; d < s.length; d++) {
    const a = s[k - d];
    if (a != null) return a;
    const b = s[k + d];
    if (b != null) return b;
  }
  return null;
}

export function lastObsYear(iso: string, key: SeriesKey): number | null {
  const w = world();
  const s = country(iso).s[key];
  for (let i = s.length - 1; i >= 0; i--) if (s[i] != null) return w.y0 + i;
  return null;
}

export function market(iso: string, key: "eq" | "bond" | "house" | "rent", year: number): number | null {
  const w = world();
  const m = w.markets[iso];
  if (!m || year < w.m0) return null;
  return m[key][year - w.m0] ?? null;
}

export function bankCrisisYears(iso: string): number[] {
  return world().markets[iso]?.crisis ?? [];
}

export function us(key: "sp" | "tbill" | "tbond" | "re" | "gold", year: number): number | null {
  const u = world().us;
  return u[key][year - u.y0] ?? null;
}

export function btcClose(year: number): number | null {
  const b = world().btc;
  return b.px[year - b.y0] ?? null;
}

export function btcLastYear(): number {
  const b = world().btc;
  return b.y0 + b.px.length - 1;
}

export function usLastYear(): number {
  const u = world().us;
  return u.y0 + u.sp.length - 1;
}

/** Development level 0..1 from GDP per capita (PPP): ~$1k → 0, ~$80k → 1. */
export function devLevel(iso: string, year: number): number {
  const p = nearest(iso, "ppp", year) ?? 5000;
  return Math.min(1, Math.max(0, (Math.log(p) - Math.log(1000)) / (Math.log(80000) - Math.log(1000))));
}

export function flagEmoji(iso2: string): string {
  if (!/^[A-Z]{2}$/.test(iso2)) return "🌐";
  return String.fromCodePoint(...[...iso2].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
}

export const REGION_NAMES: Record<string, string> = {
  EAS: "East Asia & Pacific",
  ECS: "Europe & Central Asia",
  LCN: "Latin America & Caribbean",
  MEA: "Middle East & North Africa",
  NAC: "North America",
  SAS: "South Asia",
  SSF: "Sub-Saharan Africa",
};

/** Short display names for countries whose World Bank names are long. */
const SHORT_NAMES: Record<string, string> = {
  EGY: "Egypt", IRN: "Iran", KOR: "South Korea", RUS: "Russia", SYR: "Syria", VEN: "Venezuela",
  LAO: "Laos", KGZ: "Kyrgyzstan", SVK: "Slovakia", TUR: "Türkiye", COD: "DR Congo", COG: "Congo",
  GMB: "The Gambia", HKG: "Hong Kong", MAC: "Macao", PSE: "Palestine", YEM: "Yemen",
  CZE: "Czechia", BHS: "Bahamas", MKD: "North Macedonia", FSM: "Micronesia",
};

export function countryName(iso: string): string {
  return SHORT_NAMES[iso] ?? country(iso).n;
}

const WITH_ARTICLE = new Set(["USA", "GBR", "NLD", "PHL", "ARE", "CAF", "DOM", "BHS", "COG", "COD", "SLB", "GMB"]);

/** Country name as it reads mid-sentence: "the United States", "China". */
export function countryIn(iso: string): string {
  const n = countryName(iso);
  if (iso === "GMB") return n;
  return WITH_ARTICLE.has(iso) ? `the ${n}` : n;
}
