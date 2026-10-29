// Where a life stood among people its age: the spread of wealth at each age among everyone born the
// same year (in the world, in your country, and in the country you moved to), your rank among the
// ones still alive, and the handful of comparisons that say the most about this particular life.

import { countryIn, countryName } from "./world";
import { birthShares } from "./life";
import { intlToUsd } from "./macro";
import { usd } from "./format";
import type { LifeState } from "./types";

/** Real net worth (2021 international dollars) of each comparison life, by age, for those alive at it. */
export type ByAge = number[][];

export interface Band {
  age: number;
  n: number; // people in the sample still alive at this age
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
}

export interface Cohort {
  key: "world" | "home" | "abroad";
  iso: string | null; // null: everyone born that year, anywhere
  name: string; // "the world", "Australia"
  bands: Band[];
}

export interface RankPoint {
  age: number;
  year: number;
  world: number | null; // share of people your age you were richer than
  home: number | null;
  abroad: number | null; // only while you lived in the country you moved to
}

export interface StandingStat {
  key: string;
  label: string;
  value: string;
  note: string;
}

export interface Standing {
  cohorts: Cohort[];
  ranks: RankPoint[];
  stats: StandingStat[];
}

export const ADULT = 18;
// Before about 30 most people own next to nothing, so small sums swing a rank wildly: best ranks,
// falls and climbs are read from 30, and years near the top from 25.
const SETTLED = 30;
const STARTED = 25;
const MIN_ALIVE = 12; // fewer people than this left alive at an age, and a rank says little

export function collect(into: ByAge, t: LifeState): void {
  for (const h of t.history) (into[h.age] ??= []).push(h.realNW);
}

function quantile(sorted: number[], p: number): number {
  const i = (sorted.length - 1) * p;
  const lo = Math.floor(i);
  return sorted[lo] + (sorted[Math.min(lo + 1, sorted.length - 1)] - sorted[lo]) * (i - lo);
}

/**
 * The share of a sorted sample below `v`, ties counted as half. Past the sample's top tenth the
 * share comes from a Pareto tail fitted to it, so a fortune bigger than anyone's in the sample still
 * gets a rank instead of "richer than everyone".
 */
export function richerThan(sorted: number[], v: number): number {
  const n = sorted.length;
  if (!n) return 0.5;
  const k = Math.floor(0.9 * n);
  const x90 = sorted[k];
  if (n >= 20 && x90 > 0 && v > x90) {
    const tail = sorted.slice(k + 1).filter((x) => x > x90);
    const hill = tail.length ? tail.length / tail.reduce((a, x) => a + Math.log(x / x90), 0) : 1.5;
    // a short tail says little about its own slope, so lean on a typical wealth tail's 1.5
    const alpha = Math.min(3, Math.max(1.1, (tail.length * hill + 10 * 1.5) / (tail.length + 10)));
    return 1 - ((n - k) / n) * (v / x90) ** -alpha;
  }
  let below = 0;
  let same = 0;
  for (const x of sorted) {
    if (x < v) below++;
    else if (x === v) same++;
  }
  return (below + same / 2) / n;
}

/** "Top 3%", "Top 0.2%", or for the lower half, "Richer than 30%" and "Bottom 1%". */
export function rankLabel(p: number): string {
  if (p < 0.01) return "Bottom 1%";
  if (p < 0.5) return `Richer than ${Math.floor(p * 100)}%`;
  const top = 1 - p;
  if (top >= 0.01) return `Top ${Math.max(1, Math.round(top * 100))}%`;
  return `Top ${Number((Math.max(top, 1e-6) * 100).toPrecision(1))}%`;
}

/** A count of people, to two figures: "95 million", "340,000", "37". */
export function people(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(n >= 1e10 ? 0 : 1)} billion`;
  if (n >= 1e6) return `${Number((n / 1e6).toPrecision(2))} million`;
  if (n >= 1000) return Number(n.toPrecision(2)).toLocaleString("en-US");
  return String(Math.max(1, Math.round(n)));
}

/** A move between two ranks, said one way on both sides: "Top 4% → top 30%", or "Richer than 62% → 39%". */
function rankMove(a: number, b: number): string {
  if (a >= 0.5 && b >= 0.5) return `${rankLabel(a)} → ${rankLabel(b).toLowerCase()}`;
  return `Richer than ${Math.round(a * 100)}% → ${Math.round(b * 100)}%`;
}

function bandsOf(by: ByAge, from: number, to: number): Band[] {
  const out: Band[] = [];
  for (let age = from; age <= to; age++) {
    const xs = by[age];
    if (!xs || xs.length < MIN_ALIVE) continue;
    const sorted = [...xs].sort((a, b) => a - b);
    out.push({
      age,
      n: sorted.length,
      p10: quantile(sorted, 0.1),
      p25: quantile(sorted, 0.25),
      p50: quantile(sorted, 0.5),
      p75: quantile(sorted, 0.75),
      p90: quantile(sorted, 0.9),
    });
  }
  return out;
}

const years = (n: number) => `${n} year${n === 1 ? "" : "s"}`;

/** The longest run of ages that pass a test: [first, last], or null. */
function longestRun(ages: number[], test: (age: number) => boolean): [number, number] | null {
  let best: [number, number] | null = null;
  let start: number | null = null;
  for (let i = 0; i <= ages.length; i++) {
    const ok = i < ages.length && test(ages[i]) && (start == null || ages[i] === ages[i - 1] + 1);
    if (ok && start == null) start = ages[i];
    if (!ok && start != null) {
      const run: [number, number] = [start, ages[i - 1]];
      if (!best || run[1] - run[0] > best[1] - best[0]) best = run;
      start = i < ages.length && test(ages[i]) ? ages[i] : null;
    }
  }
  return best;
}

export interface CohortSamples {
  world: { by: ByAge; n: number };
  home: { by: ByAge; n: number };
  abroad?: { by: ByAge; n: number; iso: string };
}

/** Bands, ranks and the stats worth showing, for a finished life measured against its cohorts. */
export function standingOf(s: LifeState, c: CohortSamples): Standing {
  const last = s.history[s.history.length - 1];
  const to = last ? last.age : ADULT;
  const births = birthShares(s.birthYear);
  const sorted = (by: ByAge, age: number) => (by[age] && by[age].length >= MIN_ALIVE ? [...by[age]].sort((a, b) => a - b) : null);

  // where you moved to, and from what age you lived there
  const abroad = c.abroad;
  let arrived = Infinity;
  if (abroad) for (let i = s.history.length - 1; i >= 0 && s.history[i].country === abroad.iso; i--) arrived = s.history[i].age;

  const ranks: RankPoint[] = [];
  for (const h of s.history) {
    if (h.age < ADULT) continue;
    const w = sorted(c.world.by, h.age);
    const m = sorted(c.home.by, h.age);
    const a = abroad && h.age >= arrived ? sorted(abroad.by, h.age) : null;
    ranks.push({
      age: h.age,
      year: h.year,
      world: w ? richerThan(w, h.realNW) : null,
      home: m ? richerThan(m, h.realNW) : null,
      abroad: a ? richerThan(a, h.realNW) : null,
    });
  }

  const cohorts: Cohort[] = [
    { key: "world", iso: null, name: "the world", bands: bandsOf(c.world.by, ADULT, to) },
    { key: "home", iso: s.birthCountry, name: countryName(s.birthCountry), bands: bandsOf(c.home.by, ADULT, to) },
  ];
  if (abroad && Number.isFinite(arrived)) cohorts.push({ key: "abroad", iso: abroad.iso, name: countryName(abroad.iso), bands: bandsOf(abroad.by, Math.max(ADULT, arrived), to) });

  return { cohorts, ranks, stats: pickStats(s, c, ranks, cohorts, births, arrived) };
}

function pickStats(
  s: LifeState,
  c: CohortSamples,
  ranks: RankPoint[],
  cohorts: Cohort[],
  births: { total: number; share: Record<string, number> },
  arrived: number,
): StandingStat[] {
  const out: (StandingStat & { weight: number })[] = [];
  const money = (intl: number) => usd(intlToUsd(s.macroSeed, intl));
  const at = (age: number) => s.history.find((h) => h.age === age);
  const alive = (by: ByAge, n: number, age: number, born: number) => born * ((by[age]?.length ?? 0) / n);
  const home = countryIn(s.birthCountry);
  const settled = ranks.some((r) => r.age >= SETTLED) ? ranks.filter((r) => r.age >= SETTLED) : ranks;
  const best = (key: "world" | "home" | "abroad") =>
    settled.reduce<RankPoint | null>((b, r) => (r[key] != null && (!b || r[key]! > b[key]!) ? r : b), null);

  // 1. the best world rank, always, with the number of people it means
  const bw = best("world");
  if (bw) {
    const living = alive(c.world.by, c.world.n, bw.age, births.total);
    const richer = (1 - bw.world!) * living;
    out.push({
      key: "world",
      label: "Your best rank in the world",
      value: rankLabel(bw.world!),
      note: `At ${bw.age}, in ${bw.year}. Of the ${people(living)} people born in ${s.birthYear} still alive, ${richer < 1 ? "probably none" : `about ${people(richer)}`} ${richer < 1.5 ? "was" : "were"} richer.`,
      weight: 10,
    });
  }

  // 2. the best rank at home
  const bh = best("home");
  if (bh) {
    const living = alive(c.home.by, c.home.n, bh.age, births.total * (births.share[s.birthCountry] ?? 0));
    const homeYears = s.history.filter((h) => h.age >= ADULT && h.country === s.birthCountry).length;
    out.push({
      key: "home",
      label: `Your best rank in ${home}`,
      value: rankLabel(bh.home!),
      note: `At ${bh.age}, among the ${people(living)} people born there in ${s.birthYear} still alive.`,
      weight: homeYears >= 10 || !c.abroad ? 0.9 : 0.5,
    });
  }

  // 3. where you ended up in the country you moved to, and how that compares with home
  const abroadRanks = ranks.filter((r) => r.abroad != null);
  if (c.abroad && abroadRanks.length) {
    const end = abroadRanks[abroadRanks.length - 1];
    const there = countryIn(c.abroad.iso);
    out.push({
      key: "abroad",
      label: `Among people your age in ${there}`,
      value: rankLabel(end.abroad!),
      note: `At ${end.age}, after ${years(end.age - arrived + 1)} there.${end.home != null ? ` Among people your age in ${home}: ${rankLabel(end.home).toLowerCase()}.` : ""}`,
      weight: 1.2, // for someone who moved, the comparison that matters most after the world
    });
  }

  // 4. against the typical person your age, at 60 or as close to it as you got. The middle person,
  // not the average: in a sample this size one fortune can multiply the average several times over.
  const ageVs = Math.min(60, ranks.length ? ranks[ranks.length - 1].age : 0);
  const rec = at(ageVs);
  const cohort = (c.abroad && ageVs >= arrived ? cohorts.find((x) => x.key === "abroad") : cohorts.find((x) => x.key === "home"))!;
  const band = cohort.bands.find((b) => b.age === ageVs);
  if (rec && band && ageVs >= STARTED && band.p50 >= 1000) {
    const ratio = rec.realNW / band.p50;
    out.push({
      key: "typical",
      label: `Against the typical ${ageVs}-year-old in ${countryIn(cohort.iso!)}`,
      value: rec.realNW <= 0 ? "In debt" : ratio >= 10 ? `${Math.round(ratio)}×` : ratio >= 0.1 ? `${ratio.toFixed(1)}×` : `${ratio.toFixed(2)}×`,
      note: `${rec.realNW < 0 ? `You owed ${money(-rec.realNW)}` : `You had ${money(rec.realNW)}`}; half the people your age there had less than ${money(band.p50)}.`,
      weight: 0.8,
    });
  }

  // 5. years among the richest people your age
  const grown = ranks.filter((r) => r.age >= STARTED);
  const top1 = grown.filter((r) => (r.world ?? 0) >= 0.99).length;
  const top10 = grown.filter((r) => (r.world ?? 0) >= 0.9).length;
  const run10 = longestRun(grown.map((r) => r.age), (a) => (grown.find((r) => r.age === a)?.world ?? 0) >= (top1 ? 0.99 : 0.9));
  if (top1 || top10 >= 3) {
    out.push({
      key: "top",
      label: top1 ? "Years in the world's top 1%" : "Years in the world's top 10%",
      value: years(top1 || top10),
      note: run10 ? (run10[0] === run10[1] ? `At ${run10[0]}.` : `The longest stretch: from ${run10[0]} to ${run10[1]}.`) : "",
      weight: top1 ? 0.85 : 0.75,
    });
  }

  // 6. years owing more than you owned
  const debtAges = s.history.filter((h) => h.age >= ADULT && h.realNW < 0).map((h) => h.age);
  if (debtAges.length >= 3) {
    const run = longestRun(debtAges, () => true);
    out.push({
      key: "debt",
      label: "Years owing more than you owned",
      value: years(debtAges.length),
      note: run && run[1] > run[0] ? `The longest stretch: from ${run[0]} to ${run[1]}.` : `The first at ${debtAges[0]}.`,
      weight: debtAges.length >= 10 ? 0.82 : 0.7,
    });
  }

  // 7. the biggest fall and the biggest climb in the world, within a few years
  let fall = { drop: 0, from: settled[0], to: settled[0] };
  let climb = { rise: 0, from: settled[0], to: settled[0] };
  for (let i = 0; i < settled.length; i++) {
    for (let j = i + 1; j < settled.length && settled[j].age - settled[i].age <= 5; j++) {
      const a = settled[i].world;
      const b = settled[j].world;
      if (a == null || b == null) continue;
      if (settled[j].age - settled[i].age <= 3 && a - b > fall.drop) fall = { drop: a - b, from: settled[i], to: settled[j] };
      if (b - a > climb.rise) climb = { rise: b - a, from: settled[i], to: settled[j] };
    }
  }
  if (fall.drop >= 0.2)
    out.push({
      key: "fall",
      label: "Your biggest fall",
      value: rankMove(fall.from.world!, fall.to.world!),
      note: `In the world, from ${fall.from.age} to ${fall.to.age} (${fall.from.year}–${fall.to.year}).`,
      weight: 0.6 + 0.4 * fall.drop,
    });
  if (climb.rise >= 0.25)
    out.push({
      key: "climb",
      label: "Your biggest climb",
      value: rankMove(climb.from.world!, climb.to.world!),
      note: `In the world, from ${climb.from.age} to ${climb.to.age} (${climb.from.year}–${climb.to.year}).`,
      weight: 0.5 + 0.4 * climb.rise,
    });

  // 8. where you were at the end, when it's far from your best
  const end = ranks.filter((r) => r.world != null).pop();
  if (end && bw && bw.world! - end.world! >= 0.25)
    out.push({
      key: "end",
      label: "Your world rank at the end",
      value: rankLabel(end.world!),
      note: `At ${end.age}. At your best, at ${bw.age}: ${rankLabel(bw.world!).toLowerCase()}.`,
      weight: 0.55 + 0.3 * (bw.world! - end.world!),
    });

  // the world rank first, then the three that say the most about this life
  const [first, ...rest] = out;
  return (first ? [first, ...rest.sort((a, b) => b.weight - a.weight).slice(0, 3)] : []).map(({ weight: _w, ...stat }) => stat);
}
