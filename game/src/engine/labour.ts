// Jobs by industry. Each year an industry hires or sheds workers, and the real numbers decide how easy it is
// to get hired, how fast pay rises and who gets laid off. The US has BLS employment by industry since 1940,
// measured from the end of one year to the end of the next; every country has ILO estimates since 1992.
// Where a country has no numbers of its own, industries that move worldwide (tech, finance, oil, factories)
// follow the US pattern and the rest follow the country's own booms and slumps.

import { econ } from "./macro";
import { stream } from "./rng";
import { devLevel, onWorldChange, world } from "./world";

export type Industry =
  | "tech" | "finance" | "manufacturing" | "construction" | "energy" | "health" | "education" | "public"
  | "retail" | "hospitality" | "transport" | "media" | "services" | "business" | "agriculture";

export const INDUSTRY_NAMES: Record<Industry, string> = {
  tech: "technology",
  finance: "finance",
  manufacturing: "manufacturing",
  construction: "construction",
  energy: "oil, gas and mining",
  health: "health care",
  education: "education",
  public: "government",
  retail: "shops and trade",
  hospitality: "hotels and restaurants",
  transport: "transport",
  media: "media and communications",
  services: "personal services",
  business: "professional services",
  agriculture: "farming",
};

/** The lines of work a job search can look in: industries grouped the way people think of them. */
export type Area = "tech" | "money" | "industry" | "health" | "public" | "media" | "services" | "farming";

export const AREAS: { id: Area; name: string; industries: Industry[] }[] = [
  { id: "tech", name: "Technology", industries: ["tech"] },
  { id: "money", name: "Finance and business", industries: ["finance", "business"] },
  { id: "industry", name: "Engineering and industry", industries: ["manufacturing", "construction", "energy"] },
  { id: "health", name: "Health and care", industries: ["health"] },
  { id: "public", name: "Education and government", industries: ["education", "public"] },
  { id: "media", name: "Media and design", industries: ["media"] },
  { id: "services", name: "Shops, hotels, transport and services", industries: ["retail", "hospitality", "transport", "services"] },
  { id: "farming", name: "Farming", industries: ["agriculture"] },
];

export const AREA_OF = Object.fromEntries(AREAS.flatMap((a) => a.industries.map((i) => [i, a.id]))) as Record<Industry, Area>;

export interface LabourData {
  y0: number; // first year of the US series
  us: Partial<Record<Industry, (number | null)[]>>; // yearly job growth, tenths of a percent
  i0: number; // first year of the ILO series
  ilo: Record<string, Partial<Record<Industry, (number | null)[]>>>;
}

interface Profile {
  global: number; // how far it follows the US where a country has no numbers of its own
  cycle: number; // how hard the country's booms and slumps hit it
  rich: number; // yearly job growth beyond the data in a rich country
  poor: number; // ...and in a poor one
  sd: number; // how much it swings from year to year beyond the data
}

const PROFILES: Record<Industry, Profile> = {
  tech: { global: 0.8, cycle: 1.5, rich: 0.03, poor: 0.05, sd: 0.04 },
  finance: { global: 0.5, cycle: 1.2, rich: 0.005, poor: 0.03, sd: 0.025 },
  manufacturing: { global: 0.4, cycle: 1.6, rich: -0.01, poor: 0.02, sd: 0.025 },
  construction: { global: 0, cycle: 2.5, rich: 0.005, poor: 0.025, sd: 0.04 },
  energy: { global: 0.6, cycle: 1, rich: -0.01, poor: 0.01, sd: 0.05 },
  health: { global: 0, cycle: 0.2, rich: 0.02, poor: 0.035, sd: 0.01 },
  education: { global: 0, cycle: 0.2, rich: 0.005, poor: 0.025, sd: 0.01 },
  public: { global: 0, cycle: 0.2, rich: 0.005, poor: 0.02, sd: 0.015 },
  retail: { global: 0, cycle: 1, rich: 0, poor: 0.02, sd: 0.015 },
  hospitality: { global: 0, cycle: 1.4, rich: 0.01, poor: 0.03, sd: 0.02 },
  transport: { global: 0, cycle: 1.2, rich: 0.005, poor: 0.02, sd: 0.02 },
  media: { global: 0.3, cycle: 1, rich: 0, poor: 0.02, sd: 0.025 },
  services: { global: 0, cycle: 0.8, rich: 0.01, poor: 0.02, sd: 0.015 },
  business: { global: 0.2, cycle: 1.3, rich: 0.02, poor: 0.04, sd: 0.02 },
  agriculture: { global: 0, cycle: 0.3, rich: -0.02, poor: -0.005, sd: 0.02 },
};

// Before the ILO's estimates begin, some industries took blows the country's overall economy doesn't show.
const SHOCKS: { iso: string[]; from: number; to: number; ind: Industry; g: number }[] = [
  // UK coal: the miners' strike, then the pit closures (about 220,000 miners in 1984, under 60,000 by 1992)
  { iso: ["GBR"], from: 1984, to: 1991, ind: "energy", g: -0.15 },
  // Britain's early-1980s slump took about a fifth of its factory jobs
  { iso: ["GBR"], from: 1980, to: 1982, ind: "manufacturing", g: -0.07 },
  // Latin America's debt crisis
  { iso: ["MEX", "CHL", "ARG", "BRA", "PER", "COL"], from: 1982, to: 1983, ind: "manufacturing", g: -0.06 },
  { iso: ["MEX", "CHL", "ARG", "BRA", "PER", "COL"], from: 1982, to: 1983, ind: "construction", g: -0.1 },
  // the end of central planning: state factories close
  { iso: ["POL", "HUN", "CZE", "SVK", "BGR", "ROU", "RUS", "UKR", "BLR", "KAZ"], from: 1990, to: 1991, ind: "manufacturing", g: -0.1 },
];

const cache = new Map<string, number>();
onWorldChange(() => cache.clear());

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

function at(series: (number | null)[] | undefined, y0: number, year: number): number | null {
  const v = series?.[year - y0];
  return v == null ? null : v / 1000;
}

/** A worldwide cycle for the industry beyond the data: the US pattern the rest of the world follows. */
function simulatedUs(macroSeed: number, ind: Industry, year: number): number {
  const p = PROFILES[ind];
  const r = stream(macroSeed, "industry", ind, year);
  let g = p.rich + 1.4 * p.sd * r.normal();
  if (r.chance(0.05)) g -= 2.5 * p.sd; // now and then a bust
  return g;
}

/** Growth from the country's own economy: its trend for this industry, plus its booms and slumps. */
function fromEconomy(iso: string, year: number, ind: Industry, macroSeed: number, ahead: boolean): number {
  const p = PROFILES[ind];
  const d = devLevel(iso, Math.min(year, world().y1));
  const normal = 0.04 - 0.015 * d; // poorer countries usually grow faster
  let g = p.poor + (p.rich - p.poor) * d + p.cycle * (econ(iso, macroSeed, year).realGrowth - normal);
  if (ahead) g += p.sd * stream(macroSeed, "industry", iso, ind, year).normal();
  return g;
}

/** How many more (or fewer) jobs an industry has this year than last, as a fraction. */
export function industryGrowth(iso: string, year: number, ind: Industry, macroSeed: number): number {
  const key = `${macroSeed}|${iso}|${ind}|${year}`;
  const hit = cache.get(key);
  if (hit != null) return hit;
  const w = world();
  const L = w.labour;
  const ahead = year > w.y1;
  const us = L ? at(L.us[ind], L.y0, year) : null;
  const local = L ? at(L.ilo[iso]?.[ind], L.i0, year) : null;
  let g: number;
  if (iso === "USA" && us != null) g = us;
  else if (local != null && ind === "tech" && us != null) {
    // the ILO counts tech together with transport; the US shows the tech cycle, which richer countries follow more closely
    const follow = 0.25 + 0.35 * devLevel(iso, Math.min(year, w.y1));
    g = follow * us + (1 - follow) * local;
  } else if (local != null) g = local;
  else {
    const own = fromEconomy(iso, year, ind, macroSeed, ahead);
    const world_ = us ?? (ahead ? simulatedUs(macroSeed, ind, year) : null);
    const follow = iso === "USA" ? 0.6 : PROFILES[ind].global;
    g = world_ != null ? follow * world_ + (1 - follow) * own : own;
    if (!ahead) for (const s of SHOCKS) if (s.ind === ind && year >= s.from && year <= s.to && s.iso.includes(iso)) g += s.g;
  }
  g = clamp(g, -0.4, 0.4);
  if (cache.size > 50000) cache.clear();
  cache.set(key, g);
  return g;
}

/** Average yearly job growth over the years before this one: what people could see when they chose. */
export function recentGrowth(iso: string, year: number, ind: Industry, macroSeed: number, years = 3): number {
  let sum = 0;
  for (let y = year - years; y < year; y++) sum += industryGrowth(iso, y, ind, macroSeed);
  return sum / years;
}
