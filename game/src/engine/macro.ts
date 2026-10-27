// The economy a life is lived in: one row per calendar year for a country.
// Historical years replay the data; gaps and the future are simulated from
// the country's own track record (inflation habits, growth, volatility).
// A non-zero `variant` re-rolls markets only (stocks, bonds, housing, gold,
// bitcoin) while keeping real wages and prices — used to measure market luck.

import { stream } from "./rng";
import { DEPOSIT_SHOCKS, WARS } from "./history";
import {
  bankCrisisYears, btcClose, btcLastYear, country, devLevel, market, nearest, obs, onWorldChange, us, usLastYear, world,
} from "./world";

export const FIRST_YEAR = 1940;
export const LAST_YEAR = 2160;

export interface YearEcon {
  year: number;
  infl: number;
  cpi: number; // price index, 1 in FIRST_YEAR
  realGrowth: number;
  wage: number; // typical full-time annual wage, nominal local currency
  dep: number; // deposit rate
  lend: number; // lending rate
  bond: number; // government bond total return
  eq: number; // local stock market total return
  house: number; // house price change
  rentYield: number;
  fx: number; // local currency per US dollar
  usInfl: number;
  usEq: number; // S&P 500 total return, USD
  gold: number; // USD
  btc: number | null; // USD price at year end
  recession: boolean;
  crash: boolean;
  boom: boolean;
  hyper: boolean;
  currencyCrisis: boolean;
  bankCrisis: boolean;
  war: number; // battle deaths per million people
  real: { infl: boolean; wage: boolean; eq: boolean; house: boolean; fx: boolean; bond: boolean; dep: boolean; btc: boolean };
}

export interface EconPath {
  iso: string;
  variant: number;
  years: YearEcon[];
}

interface Calib {
  dev: number;
  inflMed: number;
  inflVol: number;
  hiInflFreq: number;
  growthMu: number;
  growthVol: number;
  popGrowth: number;
  realDep: number;
  spread: number;
  eqMu: number;
  eqVol: number;
  houseMu: number;
  houseVol: number;
  rentYield: number;
  fxVol: number;
}

interface GlobalYear {
  usInfl: number;
  usEq: number;
  gold: number;
  btc: number | null;
  z: number; // global equity shock
  rec: number; // global recession shock, 0 or negative
  real: boolean;
}

const pathCache = new Map<string, EconPath>();
const globalCache = new Map<string, GlobalYear[]>();
const calibCache = new Map<string, Calib>();
onWorldChange(() => {
  pathCache.clear();
  globalCache.clear();
  calibCache.clear();
});

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const nn = <T>(xs: (T | null)[]): T[] => xs.filter((x): x is T => x != null);

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function mean(xs: number[]): number | null {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

function std(xs: number[]): number | null {
  const m = mean(xs);
  if (m == null || xs.length < 3) return null;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
}

const GLOBAL_RECESSIONS: Record<number, number> = { 1975: -1, 1982: -1, 1991: -0.5, 2008: -0.5, 2009: -1, 2020: -1 };

function calib(iso: string): Calib {
  const hit = calibCache.get(iso);
  if (hit) return hit;
  const c = country(iso);
  const w = world();
  const dev = devLevel(iso, 2020);
  const infl = nn(c.s.infl).map((x) => x / 100);
  const recent = nn(c.s.infl.slice(-12)).map((x) => x / 100);
  const logInfl = infl.map((x) => Math.log(1 + Math.max(x, -0.5)));
  const growth = nn(c.s.gr.slice(-20)).map((x) => x / 100);
  const pops = nn(c.s.pop.slice(-11));
  const popGrowth = pops.length > 2 ? (pops[pops.length - 1] / pops[0]) ** (1 / (pops.length - 1)) - 1 : 0.01;

  const realDeps: number[] = [];
  const spreads: number[] = [];
  for (let i = 0; i < c.s.dep.length; i++) {
    const d = c.s.dep[i];
    const p = c.s.infl[i];
    const l = c.s.lend[i];
    if (d != null && p != null && p < 30) realDeps.push((d - p) / 100);
    if (d != null && l != null) spreads.push((l - d) / 100);
  }

  const m = w.markets[iso];
  const eqReal: number[] = [];
  const houseReal: number[] = [];
  if (m) {
    for (let i = 0; i < m.eq.length; i++) {
      const y = w.m0 + i;
      const p = obs(iso, "infl", y);
      const e = m.eq[i];
      const h = m.house[i];
      if (p == null) continue;
      if (e != null) eqReal.push(Math.log(1 + e) - Math.log(1 + p / 100));
      if (h != null) houseReal.push(Math.log(1 + h) - Math.log(1 + p / 100));
    }
  }
  const fxMoves: number[] = [];
  for (let i = 1; i < c.s.fx.length; i++) {
    const a = c.s.fx[i - 1];
    const b = c.s.fx[i];
    const p = c.s.infl[i];
    const pu = country("USA").s.infl[i];
    if (a && b && p != null && pu != null && p < 50) fxMoves.push(Math.log(b / a) - Math.log((1 + p / 100) / (1 + pu / 100)));
  }

  const eqPrior = dev > 0.75 ? 0.05 : 0.06;
  const eqVolPrior = dev > 0.75 ? 0.18 : 0.28;
  const sampleEq = eqReal.length >= 15 ? mean(eqReal)! : eqPrior;
  const k: Calib = {
    dev,
    inflMed: clamp(median(recent) ?? 0.04, 0.005, 0.25),
    inflVol: clamp(std(logInfl) ?? 0.04, 0.01, 0.3),
    hiInflFreq: infl.length ? infl.filter((x) => x > 0.3).length / infl.length : 0,
    growthMu: clamp(mean(growth) ?? 0.03, -0.01, 0.07),
    growthVol: clamp(std(growth) ?? 0.03, 0.01, 0.07),
    popGrowth: clamp(popGrowth, -0.01, 0.035),
    realDep: clamp(median(realDeps) ?? (dev > 0.6 ? 0.005 : -0.01), -0.05, 0.05),
    spread: clamp(median(spreads) ?? 0.06, 0.02, 0.15),
    eqMu: clamp(0.5 * sampleEq + 0.5 * eqPrior, 0.02, 0.09),
    eqVol: clamp(eqReal.length >= 15 ? std(eqReal)! : eqVolPrior, 0.12, 0.45),
    houseMu: clamp(houseReal.length >= 15 ? mean(houseReal)! : 0.01, -0.01, 0.03),
    houseVol: clamp(houseReal.length >= 15 ? std(houseReal)! : dev > 0.75 ? 0.07 : 0.1, 0.04, 0.15),
    rentYield: clamp(median(nn(m?.rent ?? [])) ?? (dev > 0.75 ? 0.045 : 0.06), 0.025, 0.09),
    fxVol: clamp(std(fxMoves) ?? 0.1, 0.03, 0.35),
  };
  calibCache.set(iso, k);
  return k;
}

function globalPath(macroSeed: number, variant: number): GlobalYear[] {
  const key = `${macroSeed}|${variant}`;
  const hit = globalCache.get(key);
  if (hit) return hit;
  const out: GlobalYear[] = [];
  const histEq = variant === 0 ? usLastYear() : 0;
  const histBtc = variant === 0 ? btcLastYear() : 0;
  let prevInfl = 0.025;
  let btc: number | null = null;
  for (let y = FIRST_YEAR; y <= LAST_YEAR; y++) {
    const r = stream(macroSeed, "global", variant, y);
    const dataInfl = obs("USA", "infl", y);
    const usInfl = dataInfl != null ? dataInfl / 100 : clamp(0.025 + 0.6 * (prevInfl - 0.025) + r.normal(0, 0.01), -0.01, 0.12);
    prevInfl = usInfl;
    let usEq: number;
    let gold: number;
    let z: number;
    let real = false;
    const sp = y <= histEq ? us("sp", y) : null;
    if (sp != null) {
      usEq = sp;
      gold = us("gold", y) ?? 0.03;
      z = (Math.log(1 + usEq) - Math.log(1 + usInfl) - 0.055) / 0.17;
      real = true;
    } else {
      z = r.fat(0, 1);
      usEq = Math.exp(0.055 + 0.165 * z) * (1 + usInfl) - 1;
      gold = Math.exp(0.01 + r.normal(0, 0.14) - 0.03 * z) * (1 + usInfl) - 1;
    }
    if (y < 2010) btc = null;
    else if (y <= histBtc) btc = btcClose(y);
    else if (btc == null) btc = 0.3; // simulated history starts at the 2010 price
    else {
      const t = y - Math.max(2010, histBtc);
      const mu = Math.max(0.02, 0.3 * Math.exp(-t / 12));
      const sd = Math.max(0.25, 0.65 * Math.exp(-t / 20));
      let lr = r.normal(mu, sd);
      if (r.chance(0.06)) lr -= r.range(0.5, 1.2);
      btc = Math.max(0.01, btc * Math.exp(lr));
    }
    const rec = variant === 0 && GLOBAL_RECESSIONS[y] != null ? GLOBAL_RECESSIONS[y] : !real && r.chance(0.07) ? -1 : 0;
    out.push({ usInfl, usEq: clamp(usEq, -0.6, 1.5), gold: clamp(gold, -0.5, 2), btc, z, rec, real });
  }
  globalCache.set(key, out);
  return out;
}

function warIntensity(iso: string, y: number): number {
  const curated = WARS.find((w) => w.iso === iso && y >= w.from && y <= w.to);
  if (curated) return curated.intensity;
  const deaths = country(iso).war?.[String(y)];
  if (!deaths) return 0;
  const popK = obs(iso, "pop", y) ?? 1000;
  return deaths / (popK / 1000);
}

function build(iso: string, macroSeed: number, variant: number): EconPath {
  const c = country(iso);
  const w = world();
  const k = calib(iso);
  const g = globalPath(macroSeed, variant);
  const crises = new Set([...bankCrisisYears(iso), ...DEPOSIT_SHOCKS.filter((d) => d.iso === iso).map((d) => d.year)]);
  const synthMarkets = variant > 0;
  const isUS = iso === "USA";

  // Before the first income observation, prices follow the country's early inflation and
  // wages follow real income per person (the PPP series), so real values stay right even
  // where the nominal records start late.
  const firstLcuIdx = c.s.lcu.findIndex((v) => v != null && v > 0);
  const firstLcuYear = w.y0 + firstLcuIdx;
  const earlyInfl = clamp(median(nn(c.s.infl).slice(0, 8).map((x) => x / 100)) ?? 0.04, 0, 0.08);
  const lcuAt = (y: number) => {
    const v = obs(iso, "lcu", y);
    return v != null && v > 0 ? v : null;
  };
  const pppAt = (y: number) => (y >= w.y0 ? (nearest(iso, "ppp", y) ?? 5000) : (nearest(iso, "ppp", w.y0) ?? 5000) / 1.02 ** (w.y0 - y));
  /** Inflation implied by nominal over real income per person, where the CPI is missing. */
  const impliedInfl = (y: number): number | null => {
    const a = lcuAt(y - 1);
    const b = lcuAt(y);
    if (a == null || b == null) return null;
    return clamp(b / pppAt(y) / (a / pppAt(y - 1)) - 1, -0.3, 50);
  };
  const earlyCpi: number[] = [1];
  for (let y = FIRST_YEAR + 1; y <= firstLcuYear; y++) {
    const d = obs(iso, "infl", y);
    earlyCpi.push(earlyCpi[earlyCpi.length - 1] * (1 + (d != null ? d / 100 : (impliedInfl(y) ?? earlyInfl))));
  }
  const firstLevel = (lcuAt(firstLcuYear) ?? 1) / pppAt(firstLcuYear); // local money per real dollar of income
  const earlyWage = (y: number) => 0.75 * pppAt(y) * firstLevel * (earlyCpi[y - FIRST_YEAR] / earlyCpi[firstLcuYear - FIRST_YEAR]);
  let wage = earlyWage(FIRST_YEAR);
  const firstFx = c.s.fx.find((v) => v != null) ?? 1;

  const years: YearEcon[] = [];
  let cpi = 1;
  let infl = k.inflMed;
  let growth = k.growthMu;
  let fx = firstFx;
  let prevInfl = infl;
  for (let y = FIRST_YEAR; y <= LAST_YEAR; y++) {
    const r = stream(macroSeed, "econ", iso, variant, y);
    const gy = g[y - FIRST_YEAR];
    const ahead = Math.max(0, y - w.y1); // years into the simulated future
    const fade = Math.min(1, ahead / 30);

    // inflation
    const dInfl = obs(iso, "infl", y);
    const realInfl = dInfl != null;
    const implied = realInfl ? null : impliedInfl(y);
    if (realInfl) infl = dInfl / 100;
    else if (implied != null) infl = implied;
    else if (y <= firstLcuYear) infl = earlyInfl; // before the data: a smooth ramp into the first observation
    else {
      const anchor = k.dev > 0.75 ? 0.022 : Math.min(k.inflMed, 0.08);
      const mu = k.inflMed + (anchor - k.inflMed) * fade;
      const sd = Math.min(k.inflVol, k.hiInflFreq > 0.1 ? 0.25 : 0.05) * 0.45;
      let lp = (1 - 0.65) * Math.log(1 + mu) + 0.65 * Math.log(1 + infl) + r.normal(0, sd);
      if (r.chance(k.hiInflFreq * 0.3 * (1 - fade * 0.5))) lp += r.range(0.2, 0.8);
      infl = clamp(Math.exp(lp) - 1, -0.02, 5);
    }

    // real growth and wages
    const dGr = obs(iso, "gr", y);
    const gMu = k.growthMu + ((k.dev > 0.75 ? 0.015 : 0.025) - k.growthMu) * fade;
    if (dGr != null) growth = dGr / 100;
    else growth = clamp(gMu + 0.35 * (growth - gMu) + r.normal(0, k.growthVol) + 0.02 * gy.rec, -0.15, 0.15);
    const rawLcu = obs(iso, "lcu", y);
    const dLcu = rawLcu != null && rawLcu > 0 ? rawLcu : null;
    const realWage = dLcu != null;
    const popG = k.popGrowth * (1 - fade);
    if (realWage) wage = 0.75 * dLcu;
    else if (y < firstLcuYear) wage = earlyWage(y);
    else wage = wage * (1 + growth - popG) * (1 + infl);
    cpi = y === FIRST_YEAR ? 1 : cpi * (1 + infl);

    // rates
    const dDep = obs(iso, "dep", y);
    const dep = dDep != null ? Math.max(0, dDep / 100) : infl > 0.3 ? infl * 0.7 : Math.max(0, infl + k.realDep + r.normal(0, 0.004));
    const dLend = obs(iso, "lend", y);
    const lend = dLend != null ? dLend / 100 : dep + k.spread;

    // exchange rate
    const dFx = obs(iso, "fx", y);
    const realFx = dFx != null;
    const prevFx = fx;
    if (realFx) fx = dFx;
    else if (y > FIRST_YEAR && y > w.y0) fx = fx * ((1 + infl) / (1 + gy.usInfl)) * Math.exp(r.normal(0, k.fxVol * 0.6));

    // markets
    const rho = 0.4 + 0.4 * k.dev;
    let eq: number;
    let realEq = false;
    const dEq = synthMarkets ? null : market(iso, "eq", y);
    if (isUS) {
      eq = gy.usEq;
      realEq = gy.real;
    } else if (dEq != null) {
      eq = dEq;
      realEq = true;
    } else {
      // eqMu is a mean log return, so draw in log space; crashes are paid for by a small premium.
      // Past the data, a young market's wild swings settle toward a mature one's, as growth and inflation do.
      const mu = k.eqMu + (Math.min(k.eqMu, 0.055) - k.eqMu) * fade;
      const vol = k.eqVol + (Math.min(k.eqVol, k.dev > 0.75 ? 0.17 : 0.22) - k.eqVol) * fade;
      let lr = mu + 0.01 + vol * (rho * gy.z + Math.sqrt(1 - rho * rho) * r.fat(0, 1)) + 1.2 * (growth - gMu);
      if (r.chance(0.04)) lr -= r.range(0.15, 0.35);
      eq = clamp(Math.exp(lr) * (1 + infl) - 1, -0.85, 4);
    }
    const dBond = synthMarkets ? null : market(iso, "bond", y);
    const bond = dBond != null ? dBond : clamp(dep + 0.012 + r.normal(0, 0.035) - 2.5 * (infl - prevInfl), -0.6, 1.5);
    const dHouse = synthMarkets ? null : market(iso, "house", y);
    const house =
      dHouse != null
        ? dHouse
        : clamp((1 + infl) * Math.exp(k.houseMu + k.houseVol * r.normal() + 0.6 * (growth - gMu)) - 1, -0.5, 3);
    const rent = market(iso, "rent", y) ?? k.rentYield;

    const realEqRet = (1 + eq) / (1 + infl) - 1;
    const fxMove = y > FIRST_YEAR ? fx / prevFx - 1 : 0;
    years.push({
      year: y,
      infl,
      cpi,
      realGrowth: growth,
      wage,
      dep,
      lend,
      bond,
      eq,
      house,
      rentYield: rent,
      fx,
      usInfl: gy.usInfl,
      usEq: gy.usEq,
      gold: gy.gold,
      btc: gy.btc,
      recession: growth < 0,
      crash: realEqRet < -0.2,
      boom: realEqRet > 0.3,
      hyper: infl > 0.5,
      currencyCrisis: fxMove > Math.max(0.3, infl - gy.usInfl + 0.15),
      bankCrisis: crises.has(y),
      war: warIntensity(iso, y),
      real: {
        infl: realInfl,
        wage: realWage,
        eq: realEq,
        house: dHouse != null,
        fx: realFx,
        bond: dBond != null,
        dep: dDep != null,
        btc: gy.btc != null && variant === 0 && y <= btcLastYear(),
      },
    });
    prevInfl = infl;
  }
  return { iso, variant, years };
}

export function econPath(iso: string, macroSeed: number, variant = 0): EconPath {
  const key = `${iso}|${macroSeed}|${variant}`;
  let p = pathCache.get(key);
  if (!p) {
    if (pathCache.size > 600) pathCache.clear();
    p = build(iso, macroSeed, variant);
    pathCache.set(key, p);
  }
  return p;
}

export function econ(iso: string, macroSeed: number, year: number, variant = 0): YearEcon {
  const p = econPath(iso, macroSeed, variant);
  return p.years[clamp(year, FIRST_YEAR, LAST_YEAR) - FIRST_YEAR];
}

/** Nominal local money in `year` → 2021 international dollars (PPP, inflation-adjusted). */
export function toIntl2021(iso: string, macroSeed: number, year: number, amount: number): number {
  const cpiThen = econ(iso, macroSeed, year).cpi;
  const cpi21 = econ(iso, macroSeed, 2021).cpi;
  return (amount * (cpi21 / cpiThen)) / country(iso).ppp21;
}

/** 2021 international dollars → US dollars of `year` (US inflation since 2021). */
export function intlToUsd(macroSeed: number, intl: number, year = 2026): number {
  const us = econPath("USA", macroSeed);
  const a = us.years[2021 - FIRST_YEAR].cpi;
  const b = us.years[clamp(year, FIRST_YEAR, LAST_YEAR) - FIRST_YEAR].cpi;
  return intl * (b / a);
}

export function calibration(iso: string): Calib {
  return calib(iso);
}
