// The end-of-life report: where you landed among everyone born the same year,
// and how much of it was birth, luck, and your own choices.

import { createLife } from "./life";
import { econ, intlToUsd, toIntl2021 } from "./macro";
import { liquid } from "./ops";
import { replay, runLife, steady, typical } from "./policy";
import { hashString, stream } from "./rng";
import type { LifeState } from "./types";
import { country, countryName, devLevel, world } from "./world";

export interface LuckBreakdown {
  country: number; // country median vs world median
  family: number; // default-you vs country median (family, health, life events)
  choices: number; // you vs default-you
  market: number; // default-you on real history vs on re-rolled market histories
}

export interface Report {
  name: string;
  lifeAvgReal: number; // average real net worth over adult life: what grades and ranks use
  lifeAvgUsd: number;
  countryName: string;
  birthYear: number;
  deathYear: number;
  age: number;
  cause: string;
  peakReal: number; // 2021 intl $
  finalReal: number;
  peakUsd: number; // today's US dollars
  finalUsd: number;
  avgHappiness: number;
  worldPct: number; // share of the cohort you beat
  countryPct: number;
  twinPeak: number;
  steadyPeak: number;
  worldMedian: number;
  countryMedian: number;
  luck: LuckBreakdown;
  grade: "S" | "A" | "B" | "C" | "D";
  hindsight?: { captured: number; oracle: number; bestAsset: string; evalYear: number };
  you: { age: number; real: number }[];
  twin: { age: number; real: number }[];
  steady: { age: number; real: number }[];
  facts: string[];
}

const FLOOR = 1500; // intl $ added before taking ratios so near-zero outcomes don't explode

/** Average real net worth from 25 on — robust to a one-year spike, rewards wealth you kept. */
export function lifetimeWealth(s: LifeState): number {
  const adult = s.history.filter((h) => h.age >= 25);
  return adult.length ? adult.reduce((a, h) => a + h.realNW, 0) / adult.length : 0;
}

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function ratio(a: number, b: number): number {
  return (Math.max(0, a) + FLOOR) / (Math.max(0, b) + FLOOR);
}

function share(xs: number[], v: number): number {
  if (!xs.length) return 0.5;
  let below = 0;
  for (const x of xs) if (x < v) below++;
  return below / xs.length;
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

export function randomLifestyle(seed: number): LifeState["lifestyle"] {
  const r = stream(seed, "lifestyle").next();
  return r < 0.1 ? "frugal" : r < 0.7 ? "modest" : r < 0.95 ? "comfortable" : "lavish";
}

export interface ReportOptions {
  worldN?: number;
  countryN?: number;
  marketN?: number;
  onProgress?: (done: number, total: number) => void;
}

export async function buildReport(s: LifeState, opts: ReportOptions = {}): Promise<Report> {
  const worldN = opts.worldN ?? 160;
  const countryN = opts.countryN ?? 80;
  const marketN = opts.marketN ?? 12;
  const total = worldN + countryN + marketN + 2;
  let done = 0;
  const progress = () => opts.onProgress?.(++done, total);

  const twin = replay(s, typical);
  progress();
  const steadyTwin = replay(s, steady);
  progress();

  const peaksWorld: number[] = [];
  for (let i = 0; i < worldN; i++) {
    const t = createLife({ mode: "random", seed: hashString(`${s.seed}|world|${i}`), macroSeed: s.macroSeed, birthYear: s.birthYear });
    t.flags.isTwin = true;
    t.lifestyle = randomLifestyle(t.seed);
    runLife(t, typical);
    peaksWorld.push(lifetimeWealth(t));
    progress();
    if (i % 10 === 9) await tick();
  }
  const peaksCountry: number[] = [];
  for (let i = 0; i < countryN; i++) {
    const t = createLife({ mode: "random", seed: hashString(`${s.seed}|country|${i}`), macroSeed: s.macroSeed, birthYear: s.birthYear, country: s.birthCountry });
    t.flags.isTwin = true;
    t.lifestyle = randomLifestyle(t.seed);
    runLife(t, typical);
    peaksCountry.push(lifetimeWealth(t));
    progress();
    if (i % 10 === 9) await tick();
  }
  const peaksMarket: number[] = [];
  for (let k = 1; k <= marketN; k++) {
    peaksMarket.push(lifetimeWealth(replay(s, typical, undefined, k)));
    progress();
    if (k % 4 === 0) await tick();
  }

  const worldMedian = median(peaksWorld);
  const countryMedian = median(peaksCountry);
  const mine = lifetimeWealth(s);
  const twinAvg = lifetimeWealth(twin);
  const luck: LuckBreakdown = {
    country: ratio(countryMedian, worldMedian),
    family: ratio(twinAvg, countryMedian),
    choices: ratio(mine, twinAvg),
    market: ratio(twinAvg, median(peaksMarket)),
  };
  const c = luck.choices;
  const grade = c >= 5 ? "S" : c >= 2 ? "A" : c >= 1.15 ? "B" : c >= 0.85 ? "C" : "D";

  const last = s.history[s.history.length - 1];
  const finalReal = last ? last.realNW : 0;
  const happiness = s.history.filter((h) => h.age >= 18);
  const report: Report = {
    name: s.name,
    lifeAvgReal: mine,
    lifeAvgUsd: intlToUsd(s.macroSeed, mine),
    countryName: countryName(s.birthCountry),
    birthYear: s.birthYear,
    deathYear: s.death?.year ?? s.year,
    age: s.death?.age ?? s.age,
    cause: s.death?.cause ?? "",
    peakReal: s.peakReal,
    finalReal,
    peakUsd: intlToUsd(s.macroSeed, s.peakReal),
    finalUsd: intlToUsd(s.macroSeed, finalReal),
    avgHappiness: happiness.length ? happiness.reduce((a, h) => a + h.happiness, 0) / happiness.length : s.stats.happiness,
    worldPct: share(peaksWorld, mine),
    countryPct: share(peaksCountry, mine),
    twinPeak: twinAvg,
    steadyPeak: lifetimeWealth(steadyTwin),
    worldMedian,
    countryMedian,
    luck,
    grade,
    you: s.history.map((h) => ({ age: h.age, real: h.realNW })),
    twin: twin.history.map((h) => ({ age: h.age, real: h.realNW })),
    steady: steadyTwin.history.map((h) => ({ age: h.age, real: h.realNW })),
    facts: facts(s),
  };
  if (s.mode === "timetravel") report.hindsight = hindsight(s);
  return report;
}

function facts(s: LifeState): string[] {
  const out: string[] = [];
  const c = s.counters;
  const h = s.history;
  if (h.length > 2) {
    let best = { year: 0, gain: -Infinity };
    let worst = { year: 0, gain: Infinity };
    for (let i = 1; i < h.length; i++) {
      const g = h[i].realNW - h[i - 1].realNW;
      if (g > best.gain) best = { year: h[i].year, gain: g };
      if (g < worst.gain) worst = { year: h[i].year, gain: g };
    }
    if (best.gain > 0) out.push(`Best year: ${best.year}`);
    if (worst.gain < 0) out.push(`Worst year: ${worst.year}`);
  }
  if (c.bizStarted) out.push(`${c.bizStarted} business${c.bizStarted > 1 ? "es" : ""} started, ${c.bizSold} sold`);
  if (c.heldThroughCrash || c.soldInCrash) out.push(`Crashes: held ${c.heldThroughCrash}, sold ${c.soldInCrash}`);
  if (c.jobChanges) out.push(`${c.jobChanges} job change${c.jobChanges > 1 ? "s" : ""}`);
  if (c.moves) out.push(`Emigrated ${c.moves === 1 ? "once" : `${c.moves} times`}`);
  if (c.bankruptcies) out.push(`${c.bankruptcies} bankruptc${c.bankruptcies > 1 ? "ies" : "y"}`);
  if (c.scams) out.push(`Scammed ${c.scams === 1 ? "once" : `${c.scams} times`}`);
  if (s.kids.length) out.push(`${s.kids.length} child${s.kids.length > 1 ? "ren" : ""}`);
  return out;
}

/** Time travel: compare with someone who put every saving into the best asset with perfect foresight. */
function hindsight(s: LifeState): Report["hindsight"] {
  const w = world();
  const evalYear = Math.min(s.death?.year ?? s.year, w.y1);
  const start = s.birthYear + s.startAge;
  if (evalYear <= start) return undefined;
  const iso = s.birthCountry;
  const d = devLevel(iso, start);
  const mkt = country(iso).mkt;
  type Asset = { name: string; ret: (y: number) => number; from: number };
  const e = (y: number) => econ(iso, s.macroSeed, y);
  const fxR = (y: number) => e(y).fx / e(y - 1).fx;
  const assets: Asset[] = [
    { name: "bank deposits", ret: (y) => e(y).dep, from: 0 },
    { name: "government bonds", ret: (y) => e(y).bond, from: 0 },
    { name: "gold", ret: (y) => (1 + e(y).gold) * fxR(y) - 1, from: 0 },
    { name: "housing", ret: (y) => e(y).house + e(y).rentYield * 0.7, from: 0 },
    { name: "US stocks", ret: (y) => (1 + e(y).usEq) * fxR(y) - 1, from: d >= 0.75 ? 1975 : 2012 },
    { name: "Bitcoin", ret: (y) => ((e(y).btc ?? 1) / (e(y - 1).btc ?? 1)) * fxR(y) - 1, from: 2011 },
  ];
  if (mkt != null) assets.push({ name: "local stocks", ret: (y) => e(y).eq, from: mkt });
  const growth = (a: Asset, from: number) => {
    let g = 1;
    for (let y = from + 1; y <= evalYear; y++) g *= 1 + a.ret(y);
    return g;
  };
  // the money you actually had to work with: what you held on arrival plus each year's savings
  const flows: { year: number; amt: number }[] = [];
  const arrival = s.history.find((h) => h.year === start - 1);
  if (arrival) flows.push({ year: start, amt: Math.max(0, arrival.liquid) });
  for (const h of s.history) if (h.year >= start && h.year < evalYear && h.invested > 0) flows.push({ year: h.year, amt: h.invested });
  let oracle = 0;
  const bestCount: Record<string, number> = {};
  for (const f of flows) {
    let best = assets[0];
    let bestG = -Infinity;
    for (const a of assets) {
      if (f.year < a.from) continue;
      const g = growth(a, f.year);
      if (g > bestG) {
        bestG = g;
        best = a;
      }
    }
    oracle += f.amt * bestG;
    bestCount[best.name] = (bestCount[best.name] ?? 0) + f.amt * bestG;
  }
  const rec = s.history.find((h) => h.year === evalYear) ?? s.history[s.history.length - 1];
  const yours = rec?.netWorth ?? liquid(s);
  const bestAsset = Object.entries(bestCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
  return { captured: oracle > 0 ? Math.max(0, yours) / oracle : 0, oracle, bestAsset, evalYear };
}

export function toToday(s: LifeState, nominal: number, year = s.year): number {
  return intlToUsd(s.macroSeed, toIntl2021(s.country, s.macroSeed, year, nominal));
}
