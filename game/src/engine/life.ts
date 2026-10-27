// One life, year by year. beginYear() moves the world forward (school, family,
// history) and deals this year's events; the player answers the pending
// decisions; resolveYear() books income, spending, debt, market returns,
// health and mortality.

import { BIZ, TECH_STAGES } from "./content/business";
import { makeName, nameGroupFor } from "./content/names";
import { OCC } from "./content/occupations";
import { finishDeskYear, markDeskYearStart } from "./desk";
import { enqueue, EVENT_MAP, EVENTS, destinations, rentIncome, syncAllocation, type EventCtx } from "./events";
import { oneIn, pct, topPercent } from "./format";
import { CRYPTO_FAILURES, DEPOSIT_SHOCKS, notesFor } from "./history";
import { econ, toIntl2021, type YearEcon } from "./macro";
import { causeOfDeath, deathProbability, referenceHealth } from "./mortality";
import {
  addMove, adult, buyProperty, buyStock, bump, careAid, careCost, caughtInFailure, clamp, consumerRate, creditLimit, dev, ec,
  endBusiness, fmt, gainsTaxRate, homePrice, incomeTaxRate, invest, liquid, log, loseJob, makeStock, netWorth, pay,
  priceToIncome, propertyValue, raiseCash, rebalance, realNetWorth, refreshAccess, retirementAge, sellProperty, sellStock,
  stockValue, totalDebt, usdPremium,
} from "./ops";
import { stream, type Rng } from "./rng";
import { graduate, startSchool, tuitionPerYear } from "./school";
import {
  ASSET_KEYS, type Allocation, type AssetKey, type Era, type Lifestyle, type LifeState, type Setup, type Stock,
} from "./types";
import { country, countryIn, countryIsos, nearest, onWorldChange, world } from "./world";

export const ERA_RANGES: Record<Exclude<Era, "any">, [number, number]> = {
  past: [1950, 1975],
  recent: [1976, 2000],
  now: [2026, 2026],
};

// Share of income above essentials that gets spent: most people spend most of a raise.
const LIFESTYLE_WANTS: Record<Lifestyle, number> = { frugal: 0.35, modest: 0.72, comfortable: 0.88, lavish: 1 };
const LIFESTYLE_FLOOR: Record<Lifestyle, number> = { frugal: 0, modest: 0, comfortable: 0.15, lavish: 0.5 };
const LIFESTYLE_RENT: Record<Lifestyle, number> = { frugal: 0.7, modest: 1, comfortable: 1.4, lavish: 2.2 };

// ------------------------------------------------------------------ the birth lottery

function birthsIn(iso: string, year: number): number {
  return nearest(iso, "births", Math.min(year, world().y1)) ?? 0;
}

export function birthShare(iso: string, year: number): number {
  const total = countryIsos().reduce((a, c) => a + birthsIn(c, year), 0);
  return total > 0 ? birthsIn(iso, year) / total : 0;
}

/** Every country's share of the world's births in a year, and the total (people). */
export function birthShares(year: number): { total: number; share: Record<string, number> } {
  const isos = countryIsos();
  const total = isos.reduce((a, c) => a + birthsIn(c, year), 0);
  const share: Record<string, number> = {};
  for (const c of isos) share[c] = total > 0 ? birthsIn(c, year) / total : 0;
  return { total: total * 1000, share };
}

export function drawCountry(year: number, r: Rng): string {
  return r.weighted(countryIsos(), (c) => birthsIn(c, year));
}

const worldBirths = new Map<number, number>();
onWorldChange(() => worldBirths.clear());

/** A birth year in an era (any: 1950 to today), weighted by how many babies the world had each year. */
export function drawBirthYear(era: Era, r: Rng): number {
  const [a, b] = era === "any" ? [ERA_RANGES.past[0], ERA_RANGES.now[1]] : ERA_RANGES[era];
  const years = Array.from({ length: b - a + 1 }, (_, i) => a + i);
  for (const y of years) if (!worldBirths.has(y)) worldBirths.set(y, countryIsos().reduce((n, c) => n + birthsIn(c, y), 0));
  return r.weighted(years, (y) => worldBirths.get(y)!);
}

function probit(p: number): number {
  // Acklam's approximation
  const a = [-39.6968302866538, 220.946098424521, -275.928510446969, 138.357751867269, -30.6647980661472, 2.50662827745924];
  const b = [-54.4760987982241, 161.585836858041, -155.698979859887, 66.8013118877197, -13.2806815528857];
  const c = [-0.00778489400243029, -0.322396458041136, -2.40075827716184, -2.54973253934373, 4.37466414146497, 2.93816398269878];
  const d = [0.00778469570904146, 0.32246712907004, 2.445134137143, 3.75440866190742];
  const q = p < 0.5 ? p : 1 - p;
  let x: number;
  if (q < 0.02425) {
    const t = Math.sqrt(-2 * Math.log(q));
    x = (((((c[0] * t + c[1]) * t + c[2]) * t + c[3]) * t + c[4]) * t + c[5]) / ((((d[0] * t + d[1]) * t + d[2]) * t + d[3]) * t + 1);
    x = -x;
  } else {
    const t = q - 0.5;
    const t2 = t * t;
    x = ((((((a[0] * t2 + a[1]) * t2 + a[2]) * t2 + a[3]) * t2 + a[4]) * t2 + a[5]) * t) / (((((b[0] * t2 + b[1]) * t2 + b[2]) * t2 + b[3]) * t2 + b[4]) * t2 + 1);
  }
  return p < 0.5 ? x : -x;
}

function normCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const dd = 0.3989423 * Math.exp((-x * x) / 2);
  const p = dd * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}

function incomeSigma(iso: string, year: number): number {
  const g = clamp((nearest(iso, "gini", year) ?? 38) / 100, 0.2, 0.7);
  return Math.SQRT2 * probit((g + 1) / 2);
}

/** Household income relative to the typical wage, for a percentile of the country's distribution. */
export function householdIncomeMult(iso: string, year: number, pctile: number): number {
  const sigma = incomeSigma(iso, year);
  const p = clamp(pctile, 0.003, 0.997);
  return 1.3 * Math.exp(sigma * probit(p) - (sigma * sigma) / 2);
}

/** Share of the world's people living in households poorer than this one (PPP). */
export function worldIncomePercentile(iso: string, year: number, incomeMult: number): number {
  const y = Math.min(year, world().y1);
  const x = incomeMult * 0.75 * (nearest(iso, "ppp", y) ?? 5000);
  let below = 0;
  let total = 0;
  for (const c of countryIsos()) {
    const pop = nearest(c, "pop", y) ?? 0;
    const sigma = incomeSigma(c, y);
    const mu = Math.log(1.3 * 0.75 * (nearest(c, "ppp", y) ?? 5000)) - (sigma * sigma) / 2;
    below += pop * normCdf((Math.log(x) - mu) / sigma);
    total += pop;
  }
  return total > 0 ? below / total : 0.5;
}

function parentJob(s: LifeState): string {
  const m = s.parents.incomeMult;
  const agr = (nearest(s.country, "agr", s.birthYear) ?? 30) / 100;
  if (m < 0.5) return agr > 0.4 ? "farm a small plot of land" : "do whatever casual work they can find";
  if (m < 0.9) return agr > 0.5 ? "farm and sell what's left at market" : "work in a factory";
  if (m < 1.5) return "work as an office clerk and a shop assistant";
  if (m < 2.5) return "are a teacher and an engineer";
  if (m < 5) return "are a doctor and a manager";
  return "own a successful business";
}

// ------------------------------------------------------------------ create

export function createLife(setup: Setup): LifeState {
  const seed = setup.seed;
  const r = stream(seed, "birth");
  let birthYear: number;
  let iso: string;
  if (setup.mode === "timetravel") {
    iso = setup.country ?? "USA";
    birthYear = (setup.year ?? 1990) - (setup.startAge ?? 18);
  } else if (setup.yearDraw === "births") {
    birthYear = setup.birthYear ?? drawBirthYear(setup.era ?? "any", stream(seed, "birthyear"));
    iso = setup.country ?? drawCountry(birthYear, r);
  } else {
    const era = setup.era && setup.era !== "any" ? setup.era : r.pick(["past", "recent", "now"] as const);
    const [a, b] = ERA_RANGES[era];
    birthYear = setup.birthYear ?? r.int(a, b);
    iso = setup.country ?? drawCountry(birthYear, r);
  }
  const c = country(iso);
  const sex = setup.sex ?? (r.chance(0.512) ? "M" : "F");
  const bgPct = { poor: 0.12, middle: 0.5, rich: 0.92 };
  const familyPct = clamp(setup.familyPct ?? (setup.background ? bgPct[setup.background] + r.range(-0.05, 0.05) : r.next()), 0.003, 0.997);
  const incomeMult = householdIncomeMult(iso, birthYear, familyPct);
  const nameGroup = nameGroupFor(iso, c.r, seed);
  const name = setup.name ?? makeName(nameGroup, sex, r).full;
  const tfr = nearest(iso, "tfr", birthYear) ?? 2.5;
  let siblings = 0;
  for (let k = 0; k < 10; k++) if (r.chance(clamp((tfr - 1) / 10, 0, 0.6))) siblings++;

  const s: LifeState = {
    v: 1,
    setup: { ...setup },
    mode: setup.mode,
    seed,
    macroSeed: setup.macroSeed ?? seed,
    marketVariant: 0,
    name,
    sex,
    birthYear,
    birthCountry: iso,
    country: iso,
    year: birthYear,
    age: 0,
    alive: true,
    startAge: 0,
    familyPct,
    parents: {
      alive: [true, true],
      ageAtBirth: [clamp(Math.round(r.normal(26, 5)), 16, 42), clamp(Math.round(r.normal(29, 6)), 17, 55)],
      wealthMult: familyPct < 0.2 ? 0.1 * incomeMult : 3 * incomeMult ** 1.5 * (familyPct > 0.9 ? 1.5 : 1),
      incomeMult,
      occ: "",
    },
    siblings,
    stats: { health: clamp(referenceHealth(0) + r.normal(0, 5) + (familyPct - 0.5) * 6, 40, 100), happiness: 60, skill: 5, network: 5 },
    edu: "none",
    school: null,
    job: null,
    unemployedYears: 0,
    retired: false,
    formalYears: 0,
    workYears: 0,
    pension: 0,
    business: null,
    pastBusinesses: [],
    partner: null,
    dating: false,
    kids: [],
    lifestyle: "modest",
    allocation: { cash: 1, usd: 0, bonds: 0, localEq: 0, globalEq: 0, gold: 0, crypto: 0 },
    holdings: { cash: 0, usd: 0, bonds: 0, localEq: 0, globalEq: 0, gold: 0, crypto: 0 },
    cashHome: 0,
    stocks: [],
    desk: null,
    properties: [],
    consumerDebt: 0,
    studentDebt: 0,
    frozen: null,
    cryptoCustody: "exchange",
    access: { bank: false, localEq: false, globalEq: false, globalFriction: 0, crypto: false, mortgage: false },
    creditLockUntil: 0,
    livingWithParents: true,
    flags: { nameGroup },
    answers: {},
    pending: [],
    log: [],
    history: [],
    peakReal: 0,
    counters: { bankruptcies: 0, bizStarted: 0, bizSold: 0, jobChanges: 0, moves: 0, soldInCrash: 0, heldThroughCrash: 0, scams: 0 },
    yr: { careerActionUsed: false, income: 0, spending: 0, oneOff: 0, windfall: 0 },
  };
  s.parents.occ = parentJob(s);
  const share = birthShare(iso, birthYear);
  const worldPct = worldIncomePercentile(iso, birthYear, incomeMult);
  s.flags.birthShare = share;
  s.flags.worldPct = worldPct;
  log(s, `You are born in ${countryIn(iso)} in ${birthYear}. ${oneIn(share)} babies born that year were born here.`, "milestone");
  log(s, `Your parents ${s.parents.occ}. Your family is richer than ${pct(familyPct)} of families in ${countryIn(iso)} — ${topPercent(worldPct)} worldwide.`, "neutral");
  if (siblings > 0) log(s, `You have ${siblings} ${siblings === 1 ? "sibling" : "siblings"}.`, "neutral");
  beginYear(s);
  return s;
}

// ------------------------------------------------------------------ hooks

let twinHook: ((s: LifeState) => number) | null = null;
/** policy.ts registers a function that replays this life with default choices. */
/**
 * Where a pay of `mult` typical wages ranks among earners: the share paid less in its country, and
 * worldwide in PPP terms. Pay spreads like income (the country's Gini), with the typical wage in
 * the middle, so it uses the same data that places a family at birth.
 */
export function payRank(iso: string, year: number, mult: number): { country: number; world: number } {
  const y = Math.min(year, world().y1);
  const m = Math.max(mult, 1e-6);
  const home = normCdf(Math.log(m) / incomeSigma(iso, year));
  const x = m * 0.75 * (nearest(iso, "ppp", y) ?? 5000);
  let below = 0;
  let total = 0;
  for (const c of countryIsos()) {
    const pop = nearest(c, "pop", y) ?? 0;
    below += pop * normCdf((Math.log(x) - Math.log(0.75 * (nearest(c, "ppp", y) ?? 5000))) / incomeSigma(c, y));
    total += pop;
  }
  return { country: home, world: total > 0 ? below / total : 0.5 };
}

export function setTwinHook(fn: (s: LifeState) => number): void {
  twinHook = fn;
}

// ------------------------------------------------------------------ begin year

export function beginYear(s: LifeState): void {
  s.yr = { careerActionUsed: false, income: 0, spending: 0, oneOff: 0, windfall: 0 };
  markDeskYearStart(s);
  delete s.flags.incomeCut;
  const e = ec(s);
  refreshAccess(s, stream(s.seed, "access", s.year));
  // a time traveller knows the year's headlines as it begins; everyone else reads them once it's over
  if (s.mode === "timetravel") for (const n of notesFor(s.country, s.year)) log(s, n.text, "history");
  if (s.flags.hpl == null && s.age >= 16) s.flags.hpl = priceToIncome(s.country) * e.wage;
  transitions(s, e, stream(s.seed, "transitions", s.year));
  if (!s.alive) return;
  if (s.age === 50 && twinHook && !s.flags.isTwin && s.flags.twin50 == null) s.flags.twin50 = twinHook(s);
  rollEvents(s, e);
}

function transitions(s: LifeState, e: YearEcon, r: Rng): void {
  const w = e.wage;
  // ---- school
  if (s.age === 6 && s.edu === "none" && !s.school) {
    const prim = clamp((nearest(s.country, "prim", s.year) ?? 90) / 100, 0.05, 1);
    const miss = clamp((1 - prim) * (1.6 - s.familyPct) + (e.war > 500 ? 0.3 : 0), 0.002, 0.97);
    if (!r.chance(miss)) {
      startSchool(s, "primary");
      log(s, "You start school.", "neutral");
    }
  } else if (s.school) {
    s.school.yearsLeft--;
    if (s.school.yearsLeft <= 0) {
      const done = graduate(s);
      if (done === "primary") {
        const sec = clamp((nearest(s.country, "sec", s.year) ?? 60) / 100, 0.03, 1);
        if (!r.chance(clamp((1 - sec) * (1.6 - s.familyPct) + 0.01, 0.01, 0.97))) startSchool(s, "secondary");
        else log(s, "There's no money or place for secondary school. Your schooling ends here.", "bad");
      } else if (done === "secondary") enqueue(s, "after_school");
      else if (done === "bachelor") enqueue(s, "grad_next");
      else enqueue(s, "first_job");
    }
  }
  if (s.flags.retakeYear === s.year) enqueue(s, "after_school");

  // ---- work
  const working = s.job || s.business || s.school || s.retired;
  const pendingJob = s.pending.some((d) => ["first_job", "after_school", "grad_next", "start_business"].includes(d.event));
  if (!working && !pendingJob && s.age >= 15 && s.age < retirementAge(s) && (s.age >= 18 || s.edu !== "none" || !s.flags.firstJobAsked)) {
    if (s.age < 18) s.flags.firstJobAsked = true;
    if (s.age >= 15) enqueue(s, "first_job", s.unemployedYears > 0 ? { title: "Job hunting", body: "You're looking for work." } : {});
  }
  if (s.age >= 18 && s.livingWithParents && (s.age >= 27 || s.partner || !(s.parents.alive[0] || s.parents.alive[1]))) s.livingWithParents = false;

  // most of the world's poor own a home they or their family built on family land
  if (s.age === 28 && !s.properties.length && s.country === s.birthCountry && !s.flags.familyHome) {
    const agr = (nearest(s.country, "agr", s.year) ?? 30) / 100;
    const p = clamp((agr * 1.2 + 0.2) * (1 - 0.5 * dev(s)), 0.05, 0.85);
    if (r.chance(p)) {
      const value = w * r.range(1.5, 3) * (1 + s.familyPct);
      const cost = Math.min(liquid(s) * 0.5, value * 0.3);
      const paid = raiseCash(s, cost);
      s.properties.push({ id: `p${s.year}-fam`, kind: "home", value, price: value, mortgage: 0, rate: 0, payment: 0, bought: s.year });
      addMove(s, agr > 0.3 ? "ev:A house on family land" : "ev:The family home", value - paid);
      s.flags.familyHome = true;
      s.livingWithParents = false;
      log(s, agr > 0.3 ? "You build a simple house on family land." : "You move into the family home.", "milestone");
    }
  }

  // ---- parents
  for (const i of [0, 1] as const) {
    if (!s.parents.alive[i]) continue;
    const pAge = s.age + s.parents.ageAtBirth[i];
    const q = deathProbability(s.birthCountry, s.year, i === 0 ? "F" : "M", pAge, referenceHealth(pAge) + (s.parents.incomeMult - 1) * 4);
    if (r.chance(q)) {
      s.parents.alive[i] = false;
      delete s.flags[`care${i}`];
      bump(s, "happiness", s.age < 18 ? -12 : -8);
      log(s, `Your ${i === 0 ? "mother" : "father"} dies at ${pAge}.`, "bad");
      if (!s.parents.alive[0] && !s.parents.alive[1]) {
        // siblings who did the caring get more of what's left
        const estate = ((Math.max(0, s.parents.wealthMult) * w) / (s.siblings + 1)) * (s.flags.careLeft ? 0.5 : 1);
        if (estate > 0.05 * w) {
          if (s.age >= 18) invest(s, estate);
          else s.cashHome += estate;
          addMove(s, "inherit", estate);
          log(s, `You inherit ${fmt(s, estate)}.`, "money");
        }
        if (s.age < 18) s.parents.incomeMult *= 0.4;
      }
    }
  }

  // ---- care for a frail parent: their savings pay first, then the state's share, then you and your siblings
  for (const i of [0, 1] as const) {
    if (s.flags[`care${i}`] !== "home" || !s.parents.alive[i]) continue;
    const who = i === 0 ? "mother" : "father";
    const cost = careCost(s);
    const fromParents = Math.min(cost, Math.max(0, s.parents.wealthMult * w));
    s.parents.wealthMult -= fromParents / w;
    const share = ((cost - fromParents) * (1 - careAid(s))) / (s.siblings + 1);
    if (share > 0) {
      const paid = share - pay(s, share);
      addMove(s, `ev:Your ${who}'s care`, -paid);
      log(s, `Your share of your ${who}'s care this year: ${fmt(s, paid)}.`, "money");
    }
  }
  if (s.flags.care0 === "self" || s.flags.care1 === "self") {
    bump(s, "happiness", -2);
    bump(s, "health", -1);
  }

  // ---- partner
  if (s.partner && s.age >= 40) {
    const q = deathProbability(s.country, s.year, s.sex === "M" ? "F" : "M", s.age, referenceHealth(s.age));
    if (r.chance(q)) {
      log(s, `${s.partner.name} dies.`, "bad");
      s.partner = null;
      bump(s, "happiness", -18);
    }
  }

  // ---- money that lives on timers
  if (s.flags.ponziEnd) {
    const amt = Number(s.flags.ponziAmt);
    if (s.year < Number(s.flags.ponziEnd)) {
      const payout = amt * 0.3;
      invest(s, payout);
      addMove(s, "ev:The 'guaranteed' fund", payout);
      log(s, `Your 'guaranteed' fund pays out ${fmt(s, payout)}. It works!`, "money");
    } else {
      log(s, `The scheme collapses. The ${fmt(s, amt)} you put in is gone.`, "bad");
      s.counters.scams++;
      bump(s, "happiness", -10);
      delete s.flags.ponziEnd;
      delete s.flags.ponziAmt;
    }
  }
  for (const st of s.stocks) {
    if (st.illiquid && st.alive && st.exitYear === s.year) {
      const mult = st.cost > 0 ? st.value / st.cost : 0;
      invest(s, st.value);
      st.alive = false;
      log(s, mult > 3 ? `${st.name} is acquired! Your stake comes back as ${fmt(s, st.value)} (${mult.toFixed(0)}×).` : mult > 0.5 ? `${st.name} is sold for a modest sum. You get ${fmt(s, st.value)}.` : `${st.name} winds down. You get back ${fmt(s, st.value)}.`, mult > 1 ? "good" : "bad");
    }
  }
  s.stocks = s.stocks.filter((st) => st.alive);
  if (s.frozen && s.year >= s.frozen.until) {
    invest(s, s.frozen.amount);
    log(s, `Your frozen savings are released: ${fmt(s, s.frozen.amount)}.`, "money");
    s.frozen = null;
  }
  if (s.holdings.crypto > 0) {
    const fail = CRYPTO_FAILURES.find((f) => f.at[0] === s.year && (!f.where || f.where.includes(s.country)));
    if (fail && s.cryptoCustody === "exchange" && caughtInFailure(s, fail)) {
      const lost = s.holdings.crypto;
      log(s, `${fail.name} collapses with your coins inside. ${fmt(s, lost)} gone${fail.repay ? ", for now" : ""}.`, "bad");
      addMove(s, `ev:${fail.name} collapses`, -lost);
      if (fail.repay) {
        // the claim is kept in coins, or in dollars at about the price when it failed
        const p = ec(s, s.year - 1);
        const coins = p.btc ? lost / (p.btc * p.fx) : 0;
        s.flags[`claim:${fail.name}`] = fail.repay.share * coins * (fail.repay.kind === "coins" ? 1 : (e.btc ?? p.btc ?? 0));
      }
      s.holdings.crypto = 0;
      syncAllocation(s);
    } else if (s.cryptoCustody === "self" && r.chance(0.01)) {
      log(s, `You can't find your wallet's recovery phrase. ${fmt(s, s.holdings.crypto)} in bitcoin is locked away forever.`, "bad");
      addMove(s, "ev:A lost recovery phrase", -s.holdings.crypto);
      s.holdings.crypto = 0;
      syncAllocation(s);
    }
  }
  for (const f of CRYPTO_FAILURES) {
    const claim = Number(s.flags[`claim:${f.name}`] ?? 0);
    if (!f.repay || !claim || s.year < f.repay.at[0]) continue;
    delete s.flags[`claim:${f.name}`];
    const p = ec(s, s.year - 1);
    const value = f.repay.kind === "coins" ? claim * (p.btc ?? 0) * p.fx : claim * p.fx;
    if (f.repay.kind === "coins" && s.access.crypto) {
      s.holdings.crypto += value;
      syncAllocation(s);
    } else invest(s, value);
    addMove(s, `ev:${f.name} repays`, value);
    log(s, `${f.repay.text.replace(/\.$/, "")} (${fmt(s, value)}).`, "good");
  }
  if (s.flags.loanBack === s.year) {
    invest(s, Number(s.flags.loanAmt));
    addMove(s, "ev:Your sibling pays you back", Number(s.flags.loanAmt));
    log(s, `Your sibling pays you back ${fmt(s, Number(s.flags.loanAmt))}.`, "good");
  }
  if (s.age < 16 && e.war >= 20 && r.chance(clamp(e.war / 2500, 0.02, 0.6))) {
    bump(s, "health", -6);
    bump(s, "happiness", -8);
    s.parents.incomeMult *= 0.85;
    log(s, "War rages around your home. Your family survives, but loses a lot.", "bad");
  }
  if (s.cashHome > w && r.chance(0.03)) {
    const lost = s.cashHome * 0.5;
    s.cashHome -= lost;
    addMove(s, "ev:Thieves", -lost);
    log(s, `Thieves find the cash you keep at home. ${fmt(s, lost)} gone.`, "bad");
  }
}

function rollEvents(s: LifeState, e: YearEcon): void {
  const c: EventCtx = { e, prev: ec(s, s.year - 1), w: e.wage, r: stream(s.seed, "chance", s.year) };
  let random = 0;
  for (const def of EVENTS) {
    if (!def.chance) continue;
    if (def.once && s.flags[`done:${def.id}`]) continue;
    if (def.cooldown && s.year - Number(s.flags[`last:${def.id}`] ?? -999) < def.cooldown) continue;
    if (!def.forced && random >= 2) continue;
    if (s.pending.some((d) => d.event === def.id)) continue;
    const p = def.chance(s, c);
    if (!(p > 0)) continue;
    if (stream(s.seed, "ev", def.id, s.year).next() >= p) continue;
    const before = s.pending.length;
    enqueue(s, def.id);
    if (s.pending.length > before) {
      s.flags[`last:${def.id}`] = s.year;
      if (def.once) s.flags[`done:${def.id}`] = true;
      if (!def.forced) random++;
    }
  }
}

// ------------------------------------------------------------------ decisions

export function choose(s: LifeState, decisionId: string, optionId: string): void {
  const i = s.pending.findIndex((d) => d.id === decisionId);
  if (i < 0) throw new Error(`No pending decision ${decisionId}`);
  const d = s.pending[i];
  const opt = d.options.find((x) => x.id === optionId);
  if (!opt) throw new Error(`Unknown option ${optionId}`);
  if (opt.disabled) throw new Error(`Option ${optionId} is unavailable: ${opt.disabled}`);
  s.pending.splice(i, 1);
  const e = ec(s);
  const c: EventCtx = { e, prev: ec(s, s.year - 1), w: e.wage, r: stream(s.seed, "res", d.event, s.year, optionId) };
  const before = netWorth(s);
  EVENT_MAP[d.event].resolve(s, c, d.payload, optionId);
  addMove(s, `ev:${d.title}`, netWorth(s) - before);
}

// ------------------------------------------------------------------ resolve year

function dependent(s: LifeState): boolean {
  return s.age < 18 && !s.job && !s.business;
}

export function resolveYear(s: LifeState): void {
  if (s.pending.length) throw new Error("Decisions pending");
  if (!s.alive) return;
  const e = ec(s);
  const prev = ec(s, s.year - 1);
  const w = e.wage;
  const r = stream(s.seed, "year", s.year);
  const nwBefore = s.history.length ? s.history[s.history.length - 1].netWorth : 0;

  let income = 0;
  let spending = 0;
  let kept = 0; // what income added to net worth: after tax, living costs and interest
  let deprivation = 0;
  let cons = 1;

  if (dependent(s)) {
    const parentsAlive = s.parents.alive[0] || s.parents.alive[1];
    const famIncome = s.parents.incomeMult * w * (parentsAlive ? 1 : 0.5);
    const needs = 0.42 * w * (2 + 0.3 * (1 + s.siblings));
    cons = famIncome / needs;
    deprivation = clamp(1 - cons, 0, 1);
  } else {
    addMove(s, "bank", -applyDepositShock(s));
    // ---- income
    const caring = s.flags.care0 === "self" || s.flags.care1 === "self";
    const cut = Math.max(Number(s.flags.incomeCut ?? 0), caring ? 0.4 : 0);
    let labor = s.job ? s.job.mult * w * (1 - cut) : 0;
    if (s.flags.hustleUntil && s.year <= Number(s.flags.hustleUntil)) labor += 0.15 * w;
    const partner = s.partner?.working ? s.partner.mult * w : 0;
    const pension = s.retired ? s.pension * w : 0;
    const benefit = !s.job && !s.retired && !s.school && s.unemployedYears === 0 && dev(s) >= 0.65 && s.flags.lastMult ? 0.4 * Number(s.flags.lastMult) * w : 0;
    const rent = rentIncome(s);
    const hadBiz = s.business != null;
    const nwBiz = hadBiz ? netWorth(s) : 0;
    const biz = s.business ? businessYear(s, e, prev, r) : 0;
    if (hadBiz) addMove(s, "business", netWorth(s) - nwBiz);
    let support = 0;
    let tuitionOwn = 0;
    let tuitionBorrowed = 0;
    if (s.school && s.school.kind !== "primary" && s.school.kind !== "secondary") {
      const tuition = tuitionPerYear(s, s.school.kind, Boolean(s.flags.abroad));
      const parentsAlive = s.parents.alive[0] || s.parents.alive[1];
      const famShare = parentsAlive ? clamp(s.familyPct ** 1.2 * 1.3, 0, 1) : 0;
      support = famShare * (tuition + 0.3 * w);
      tuitionOwn = (1 - famShare) * tuition;
      if (tuitionOwn > 0 && s.access.bank && dev(s) >= 0.55) {
        s.studentDebt += tuitionOwn;
        tuitionBorrowed = tuitionOwn;
        tuitionOwn = 0;
      }
      if (!s.job) labor += 0.2 * w * (1 - famShare); // part-time work
    }
    income = labor + partner + pension + benefit + rent + biz + support;
    const taxable = labor + partner + pension + Math.max(0, biz) + rent * 0.8;
    const tax = taxable * incomeTaxRate(s, taxable);
    const disposable = income - tax;

    // ---- spending
    const kidsHome = s.kids.filter((k) => s.year - k.born < 22).length;
    const hh = 1 + (s.partner ? 0.6 : 0) + 0.45 * kidsHome;
    const needs = 0.42 * w * hh * (s.livingWithParents ? 0.5 : 1);
    const home = s.properties.find((p) => p.kind === "home");
    const housing = home ? 0.012 * home.value : s.livingWithParents ? 0 : e.rentYield * homePrice(s) * 0.6 * LIFESTYLE_RENT[s.lifestyle] * (1 + 0.25 * (hh - 1));
    const insurance = s.flags.insured ? 0.03 * w : 0;
    const supportParents = Number(s.flags.supportUntil ?? 0) >= s.year ? 0.08 * Math.max(0, disposable) : 0;
    let debtService = 0;
    let interestPaid = 0;
    for (const p of s.properties) {
      if (p.mortgage <= 0) continue;
      const interest = p.mortgage * p.rate;
      const principal = Math.min(p.mortgage, Math.max(0, p.payment - interest));
      p.mortgage -= principal;
      debtService += interest + principal;
      interestPaid += interest;
    }
    if (s.consumerDebt > 0) {
      const principal = s.consumerDebt * 0.15;
      const interest = s.consumerDebt * consumerRate(s);
      debtService += interest + principal;
      interestPaid += interest;
      s.consumerDebt -= principal;
    }
    if (s.studentDebt > 0 && !s.school) {
      const principal = s.studentDebt * 0.08;
      const interest = s.studentDebt * (e.dep + 0.02);
      debtService += interest + principal;
      interestPaid += interest;
      s.studentDebt -= principal;
    }
    // Fixed obligations come first; living costs adapt to what's left. Poor households
    // don't borrow to eat — they go without (deprivation). Credit only covers the gap
    // for people with a bank account.
    const committed = insurance + supportParents + debtService + tuitionOwn;
    const decent = needs + housing;
    const subsistence = 0.15 * w * hh;
    let available = disposable - committed;
    if (available < 0) {
      const short = -available - raiseCash(s, -available);
      s.consumerDebt += short; // missed payments become arrears
      available = 0;
    }
    // welfare tops up poor households where the state can afford it
    const d = dev(s);
    const welfare = d >= 0.65 ? 0.7 : d >= 0.45 ? 0.3 : 0;
    if (available < decent && welfare > 0 && !s.school) {
      const top = (decent - available) * welfare;
      available += top;
      income += top;
    }
    let essentialsPaid = Math.min(decent, available);
    let net = available - essentialsPaid;
    let help = 0;
    if (essentialsPaid < decent) {
      const gap = decent - essentialsPaid;
      let covered = raiseCash(s, Math.min(gap, liquid(s)));
      if (covered < gap && s.access.bank) {
        const b = Math.min(gap - covered, creditLimit(s) * 0.5);
        s.consumerDebt += b;
        covered += b;
      }
      essentialsPaid += covered;
      const fed = Math.max(essentialsPaid, Math.min(decent, subsistence)); // family and the informal economy keep you fed
      help = fed - essentialsPaid;
      essentialsPaid = fed;
      deprivation = clamp(1 - essentialsPaid / decent, 0, 1);
      net = 0;
    }
    // people spend part of their wealth too, retirees most of all
    const drawRate = (s.retired ? 0.045 : 0.02) * { frugal: 0.5, modest: 1, comfortable: 1.5, lavish: 2.5 }[s.lifestyle];
    const fromWealth = deprivation > 0 ? 0 : raiseCash(s, Math.max(0, liquid(s) - 0.5 * decent) * drawRate);
    const wants = Math.max(0, net) * LIFESTYLE_WANTS[s.lifestyle] + fromWealth;
    const floor = LIFESTYLE_FLOOR[s.lifestyle] * w;
    net -= wants - fromWealth;
    let extra = 0;
    if (floor > wants) {
      // lifestyle spending beyond your means goes on the card
      extra = floor - wants;
      const fromNet = Math.min(Math.max(0, net), extra);
      net -= fromNet;
      // whatever the card won't cover simply goes unpaid
      if (extra - fromNet > 0) help += pay(s, extra - fromNet);
    }
    spending = committed + essentialsPaid + wants + extra;
    // repaying principal moves money into lower debt, so it isn't a loss; interest is
    kept = income - tax - (spending - debtService) - interestPaid - tuitionBorrowed + help;
    addMove(s, "pay", kept + interestPaid);
    addMove(s, "interest", -interestPaid);
    cons = (essentialsPaid + wants + extra) / (0.42 * w * hh);
    applyReturns(s, e, prev, r);
    invest(s, Math.max(0, net));
    s.yr.income = income;
    s.yr.spending = spending;
    s.flags.lastNet = net;
  }

  // informal lenders stop lending long before banks would; what's beyond that is lost to them
  if (!s.access.bank && s.consumerDebt > 1.5 * w) {
    addMove(s, "writeoff", s.consumerDebt - 1.5 * w);
    s.consumerDebt = 1.5 * w;
    if (!s.flags.writtenOff) log(s, "The moneylenders give up on the rest of what you owe. They won't lend to you again soon.", "bad");
    s.flags.writtenOff = true;
    s.creditLockUntil = Math.max(s.creditLockUntil, s.year + 5);
  }

  // ---- careers tick
  if (s.job) {
    const occ = OCC[s.job.occ];
    s.job.years++;
    s.workYears++;
    if (s.job.formal) s.formalYears++;
    s.job.mult *= (1 + (s.workYears <= occ.peak ? occ.growth : 0)) * Math.exp(r.normal(-0.0001, 0.015));
  } else if (adult(s) && !s.retired && !s.school && !s.business && s.age >= 18) s.unemployedYears++;
  if (s.partner && s.age < 50) s.partner.mult *= 1.005;

  updateStats(s, e, r, deprivation, cons, nwBefore);

  // ---- mortality
  const immortal = Number(s.flags.immortalUntil ?? 0);
  if (s.age >= immortal) {
    let q = deathProbability(s.country, s.year, s.sex, s.age, s.stats.health);
    if (s.flags.warRisk) {
      q += 0.1 * Math.min(1, Number(s.flags.warRisk) / 1000);
      delete s.flags.warRisk;
    }
    if (stream(s.seed, "death", s.year).next() < q) {
      const dr = stream(s.seed, "cause", s.year);
      die(s, causeOfDeath(s.age, dev(s), dr, e.war > 50));
    }
  }
  record(s, income, spending, kept);
}

/** A bank freeze or haircut on deposits, if this year brings one. Returns what was lost outright. */
function applyDepositShock(s: LifeState): number {
  const shock = DEPOSIT_SHOCKS.find((d) => d.iso === s.country && d.year === s.year);
  if (!shock || s.flags.withdrew === s.year || s.holdings.cash <= 0) return 0;
  const cash = s.holdings.cash;
  const lost = cash * shock.haircut;
  const rest = cash - lost;
  if (shock.frozenYears > 0) {
    s.frozen = { amount: (s.frozen?.amount ?? 0) + rest, until: s.year + shock.frozenYears };
    s.holdings.cash = 0;
  } else s.holdings.cash = rest;
  log(s, `${shock.text} You lose ${fmt(s, lost)}${shock.frozenYears ? ` and ${fmt(s, rest)} is frozen until ${s.year + shock.frozenYears}` : ""}.`, "bad");
  return lost;
}

function applyReturns(s: LifeState, e: YearEcon, prev: YearEcon, r: Rng): void {
  const fxR = prev.fx > 0 ? e.fx / prev.fx : 1;
  const usDep = econ("USA", s.macroSeed, s.year, s.marketVariant).dep;
  const h = s.holdings;
  const before = h.bonds + h.localEq + h.globalEq + stockValue(s, true);
  const btcR = e.btc && prev.btc ? e.btc / prev.btc : 1;
  const growth: Record<AssetKey, number> = {
    cash: 1 + (s.access.bank ? e.dep : 0),
    usd: (1 + usDep) * fxR,
    bonds: 1 + e.bond,
    localEq: 1 + e.eq,
    globalEq: (1 + e.usEq) * fxR * (1 - s.access.globalFriction),
    gold: (1 + e.gold) * fxR,
    crypto: btcR * fxR,
  };
  for (const k of ASSET_KEYS) {
    addMove(s, k, h[k] * (growth[k] - 1));
    h[k] *= growth[k];
  }
  const picksBefore = stockValue(s);
  const homesBefore = s.properties.reduce((a, p) => a + p.value, 0);
  for (const st of s.stocks) {
    if (!st.alive) continue;
    if (r.chance(st.hazard)) {
      st.value = 0;
      st.alive = false;
      log(s, `${st.name} goes bust. Your shares are worthless.`, "bad");
      continue;
    }
    const boost = s.year <= (st.boostUntil ?? 0) ? (st.boost ?? 0) : 0;
    const ret = st.beta * (e.eq - e.dep) + e.dep + st.drift + boost + st.vol * r.normal() - (st.vol * st.vol) / 2;
    st.value *= Math.max(0.03, 1 + ret);
  }
  s.stocks = s.stocks.filter((st) => st.alive);
  addMove(s, "picks", stockValue(s) - picksBefore);
  for (const p of s.properties) p.value *= 1 + e.house;
  addMove(s, "home", s.properties.reduce((a, p) => a + p.value, 0) - homesBefore);
  if (s.frozen) {
    addMove(s, "cash", s.frozen.amount * e.dep * 0.3);
    s.frozen.amount *= 1 + e.dep * 0.3;
  }
  const after = h.bonds + h.localEq + h.globalEq + stockValue(s, true);
  const gainTax = Math.max(0, after - before) * gainsTaxRate(s) * 0.5;
  if (gainTax > 0) addMove(s, "gainsTax", -raiseCash(s, gainTax));
  s.flags.prevEqReal = Number(s.flags.lastEqReal ?? 0);
  s.flags.lastEqReal = (1 + e.eq) / (1 + e.infl) - 1;
  s.flags.lastCrypto = btcR - 1;
  s.flags.hpl = Number(s.flags.hpl ?? priceToIncome(s.country) * e.wage) * (1 + e.house);
}

function businessYear(s: LifeState, e: YearEcon, prev: YearEcon, r: Rng): number {
  const b = s.business!;
  const def = BIZ[b.type];
  const w = e.wage;
  const age = s.year - b.founded;
  if (b.type === "tech") {
    const pDie = (age === 0 ? 0.25 : 0.17) * (e.recession ? 1.4 : 1) * (1.25 - s.stats.skill / 200);
    if (b.stage < 4 && r.chance(pDie)) {
      log(s, `${b.name} runs out of money and shuts down.`, "bad");
      endBusiness(s, "failed", 0);
      bump(s, "happiness", -10);
      return 0;
    }
    const pUp = 0.22 + s.stats.skill / 400 + s.stats.network / 800 - (s.flags.bootstrap ? 0.08 : 0);
    if (b.stage < 4 && r.chance(pUp)) {
      if (s.flags.bootstrap) {
        b.stage++;
        log(s, `${b.name} reaches the ${TECH_STAGES[b.stage].name} on its own.`, "good");
      } else s.flags.vcOffer = s.year + 1;
    }
    const mood = e.boom ? 1.5 : e.crash ? 0.6 : 1;
    b.valuation = TECH_STAGES[b.stage].valuation * w * b.equity * Math.exp(r.normal(0, 0.3)) * mood;
    b.profit = b.stage >= 1 ? 0.8 * w : 0;
    return b.profit;
  }
  const skillF = 0.6 + s.stats.skill / 125 + s.stats.network / 250;
  const cycle = 1 + 1.5 * (e.realGrowth - 0.02) - (e.recession ? 0.2 : 0);
  const fxShock = b.type === "trading" && prev.fx > 0 ? -0.8 * (e.fx / prev.fx - 1 - (e.infl - e.usInfl)) : 0;
  const war = e.war > 100 ? 0.6 : 1;
  const profit = b.scale * def.profit * w * skillF * Math.exp(r.normal(-(def.vol ** 2) / 2, def.vol)) * Math.max(0.15, cycle + fxShock) * war;
  b.profit = profit;
  const hz = (age === 0 ? def.hazard[0] : def.hazard[1]) * (1.3 - s.stats.skill / 150) * (e.recession ? 1.6 : 1) * (profit < 0 ? 2 : 1);
  if (r.chance(hz)) {
    log(s, `${b.name} fails.`, "bad");
    endBusiness(s, "failed", b.invested * 0.1);
    bump(s, "happiness", -10);
    return Math.max(0, profit * 0.3);
  }
  b.valuation = Math.max(0, profit) * def.multiple * (1 + 0.1 * Math.log(b.scale + 1)) + b.invested * 0.2;
  return profit;
}

function updateStats(s: LifeState, e: YearEcon, r: Rng, deprivation: number, cons: number, nwBefore: number): void {
  const ref = referenceHealth(s.age);
  const occ = s.job ? OCC[s.job.occ] : null;
  const stress = (occ?.stress ?? 0) >= 8 ? 4 : (occ?.stress ?? 0) >= 6 ? 1.5 : 0;
  const bizStress = s.business ? BIZ[s.business.type].stress / 3 : 0;
  const relInc = s.yr.income > 0 ? s.yr.income / e.wage : s.parents.incomeMult;
  // life tables already reflect an average life here, so only the gap from average moves health
  const depWeight = s.age < 18 ? 10 : 20;
  let hTarget = ref - depWeight * deprivation - stress - bizStress + clamp(2 * Math.log(Math.max(0.2, relInc)), -5, 4) + (s.flags.insured ? 1 : 0);
  if (e.war > 200) hTarget -= 5;
  s.stats.health = clamp(s.stats.health + 0.2 * (hTarget - s.stats.health) + r.normal(0, 1.5), 1, 100);

  const kidsHome = s.kids.filter((k) => s.year - k.born < 22).length;
  const idle = adult(s) && !s.job && !s.retired && !s.school && !s.business && s.age >= 18;
  const debtStress = s.consumerDebt > 2 * e.wage ? 8 : s.consumerDebt > 0.5 * e.wage ? 3 : 0;
  const cushion = liquid(s) >= 0.5 * Math.max(s.yr.spending, 0.3 * e.wage) ? 4 : 0;
  const nwNow = netWorth(s);
  const shock = nwBefore > 0 && nwNow < nwBefore * 0.75 ? 6 : 0;
  const target =
    52 + 7 * Math.log(clamp(cons, 0.3, 6)) + (s.partner ? 5 : 0) + Math.min(6, 2 * kidsHome) - (idle ? 10 : 0) - debtStress + cushion + (s.retired ? 4 : 0) + (s.business ? 2 : 0) - deprivation * 20 + (s.stats.health - ref) / 5 - shock - (e.war > 200 ? 8 : 0);
  s.stats.happiness = clamp(s.stats.happiness + 0.35 * (target - s.stats.happiness) + r.normal(0, 2), 0, 100);

  if (s.school) bump(s, "skill", s.age < 12 ? 3 - deprivation * 2 : 3);
  else if (s.job) bump(s, "skill", ((occ?.pay ?? 1) >= 1.5 ? 1.5 : 0.7) * (s.age < 45 ? 1 : 0.3));
  else if (s.business) bump(s, "skill", 1);
  if (s.age > 62) bump(s, "skill", -0.6);
  bump(s, "network", (s.job ? 0.5 : 0) + (s.business ? 1 : 0) + (s.school && s.age >= 18 ? 1.5 : 0) + (s.age < 18 ? 0.8 : 0) - (s.age > 70 ? 1 : 0));
}

function die(s: LifeState, cause: string): void {
  s.alive = false;
  s.death = { year: s.year, age: s.age, cause };
  log(s, `You die at ${s.age}, of ${cause}.`, "milestone");
  const estate = netWorth(s);
  if (s.age < 18) return;
  const heirs = s.kids.length;
  const legacy = s.answers.legacy;
  if (estate <= 0) log(s, estate < 0 ? `You leave debts of ${fmt(s, -estate)}.` : "You leave nothing behind.", "neutral");
  else if (legacy === "charity") log(s, `Half your estate, ${fmt(s, estate / 2)}, goes to charity.`, "good");
  else if (heirs) log(s, `Your estate of ${fmt(s, estate)} passes to your ${heirs === 1 ? "child" : `${heirs} children`}.`, "neutral");
  else log(s, `Your estate of ${fmt(s, estate)} goes to your relatives.`, "neutral");
}

function record(s: LifeState, income: number, spending: number, kept: number): void {
  const nw = netWorth(s);
  const real = toIntl2021(s.country, s.macroSeed, s.year, nw);
  const prevRec = s.history[s.history.length - 1];
  const prevLiquid = prevRec ? prevRec.liquid : 0;
  // what moved net worth this year; whatever wasn't filed under a cause is "other", so the parts add up
  let moves: Record<string, number> | undefined;
  if (prevRec && prevRec.country === s.country) {
    moves = { ...s.yr.moves };
    const filed = Object.values(moves).reduce((a, x) => a + x, 0);
    const other = nw - prevRec.netWorth - filed;
    if (Math.abs(other) > 1e-9 * Math.max(1, Math.abs(nw))) moves.other = (moves.other ?? 0) + other;
  }
  s.history.push({
    year: s.year,
    age: s.age,
    netWorth: nw,
    realNW: real,
    income,
    spending,
    saved: kept,
    invested: Number(s.flags.lastNet ?? 0),
    liquid: liquid(s),
    property: propertyValue(s),
    business: s.business?.valuation ?? 0,
    debt: totalDebt(s),
    health: s.stats.health,
    happiness: s.stats.happiness,
    country: s.country,
    moves,
  });
  void prevLiquid;
  s.peakReal = Math.max(s.peakReal, real);
  delete s.flags.lastNet;
}

// ------------------------------------------------------------------ advance

/** File the year's headlines at the top of the year once it has been lived. */
function fileHeadlines(s: LifeState): void {
  const have = new Set(s.log.filter((l) => l.year === s.year && l.tone === "history").map((l) => l.text));
  const notes = notesFor(s.country, s.year).filter((n) => !have.has(n.text));
  if (!notes.length) return;
  const at = s.log.findIndex((l) => l.year === s.year);
  s.log.splice(at < 0 ? s.log.length : at, 0, ...notes.map((n) => ({ year: s.year, age: s.age, text: n.text, tone: "history" as const })));
}

export function advance(s: LifeState): void {
  if (s.pending.length) throw new Error("Decisions pending");
  finishDeskYear(s);
  resolveYear(s);
  if (s.mode !== "timetravel") fileHeadlines(s);
  if (!s.alive) return;
  s.year++;
  s.age++;
  beginYear(s);
}

// ------------------------------------------------------------------ player actions

export type CareerAction = "jobhunt" | "raise" | "quit" | "study" | "business" | "retire" | "abroad";

export function careerOptions(s: LifeState): { id: CareerAction; label: string; disabled?: string }[] {
  const used = s.yr.careerActionUsed ? "One career move per year" : undefined;
  const pending = s.pending.length ? "Answer the open decision first" : undefined;
  const block = used ?? pending;
  const young = s.age < 15 ? "Too young" : undefined;
  return [
    { id: "jobhunt", label: s.job ? "Look for a better job" : "Look for work", disabled: block ?? young ?? (s.school ? "Finish school first" : undefined) },
    { id: "raise", label: "Ask for a raise", disabled: block ?? (!s.job ? "No job" : undefined) },
    { id: "study", label: "Go back to school", disabled: block ?? young ?? (s.school ? "Already studying" : s.age > 55 ? "Too late" : undefined) },
    { id: "business", label: "Start a business", disabled: block ?? young ?? (s.business ? "You already run one" : undefined) },
    { id: "abroad", label: "Look for work abroad", disabled: block ?? young ?? (destinations(s).length ? undefined : "No easy destinations") },
    { id: "quit", label: "Quit your job", disabled: block ?? (!s.job ? "No job" : undefined) },
    { id: "retire", label: "Retire", disabled: block ?? (s.retired ? "Already retired" : s.age < 45 ? "Too young" : undefined) },
  ];
}

export function careerAction(s: LifeState, action: CareerAction): void {
  const opt = careerOptions(s).find((x) => x.id === action);
  if (!opt || opt.disabled) return;
  s.yr.careerActionUsed = true;
  const r = stream(s.seed, "action", action, s.year);
  switch (action) {
    case "jobhunt":
      enqueue(s, "first_job", { title: "Job hunting", body: "Here's what's out there:" });
      break;
    case "raise": {
      if (r.chance(0.25 + s.stats.skill / 300)) {
        s.job!.mult *= 1.1;
        log(s, "You ask for a raise — and get 10% more.", "good");
      } else if (r.chance(0.06)) {
        log(s, "Your boss doesn't take it well. You're let go.", "bad");
        loseJob(s);
      } else {
        bump(s, "happiness", -2);
        log(s, "Your boss says 'maybe next year'.", "neutral");
      }
      break;
    }
    case "quit":
      loseJob(s);
      bump(s, "happiness", 2);
      log(s, "You quit your job.", "neutral");
      break;
    case "study":
      if (s.edu === "bachelor" || s.edu === "master") enqueue(s, "grad_next");
      else enqueue(s, "after_school");
      break;
    case "business":
      enqueue(s, "start_business");
      break;
    case "abroad":
      enqueue(s, "migration");
      break;
    case "retire":
      enqueue(s, "retire");
      break;
  }
}

export function setLifestyle(s: LifeState, l: Lifestyle): void {
  s.lifestyle = l;
}

export function setAllocation(s: LifeState, a: Allocation, rebalanceNow = true): void {
  const total = ASSET_KEYS.reduce((t, k) => t + Math.max(0, a[k]), 0);
  if (total <= 0) return;
  for (const k of ASSET_KEYS) s.allocation[k] = Math.max(0, a[k]) / total;
  if (rebalanceNow) rebalance(s);
}

/** Three listed companies you could buy this year (fictional, drawn from real return patterns). */
export function stockMarket(s: LifeState): Stock[] {
  if (!s.access.localEq) return [];
  const r = stream(s.seed, "market", s.year);
  return [0, 1, 2].map(() => makeStock(s, r));
}

export function buyListedStock(s: LifeState, index: number, amount: number): boolean {
  const st = stockMarket(s)[index];
  if (!st || amount <= 0 || amount > liquid(s)) return false;
  st.id = `${st.id}-${s.stocks.length}`;
  const ok = buyStock(s, st, amount);
  if (ok) log(s, `You buy ${fmt(s, amount)} of ${st.name}.`, "money");
  return ok;
}

export function sellHolding(s: LifeState, id: string, fraction = 1): void {
  const st = s.stocks.find((x) => x.id === id);
  if (!st) return;
  const got = sellStock(s, id, fraction);
  if (got > 0) log(s, `You sell ${fmt(s, got)} of ${st.name}.`, "money");
}

export function buyHome(s: LifeState, kind: "home" | "rental"): boolean {
  const ok = buyProperty(s, kind, homePrice(s));
  if (ok) {
    if (kind === "home") s.livingWithParents = false;
    log(s, `You buy ${kind === "home" ? "a home" : "a rental property"} for ${fmt(s, homePrice(s))}.`, "milestone");
  }
  return ok;
}

export function sellHome(s: LifeState, id: string): void {
  const p = s.properties.find((x) => x.id === id);
  if (!p) return;
  const got = sellProperty(s, id);
  log(s, `You sell your ${p.kind === "home" ? "home" : "rental"}. After the mortgage you get ${fmt(s, got)}.`, "money");
}

export function repayDebt(s: LifeState, amount: number): void {
  const amt = Math.min(amount, s.consumerDebt);
  const got = raiseCash(s, amt);
  s.consumerDebt -= got;
  if (got > 0) log(s, `You pay down ${fmt(s, got)} of debt.`, "money");
}

export function listBusiness(s: LifeState): void {
  if (!s.business) return;
  s.business.forSale = true;
  log(s, `You put ${s.business.name} up for sale.`, "neutral");
}

export function closeBusiness(s: LifeState): void {
  if (!s.business) return;
  const name = s.business.name;
  endBusiness(s, "closed", s.business.valuation * 0.2);
  log(s, `You close ${name}.`, "neutral");
}

/** Buy an asset with cash (or sell it back to cash) without changing the savings plan. */
export function tradeAsset(s: LifeState, key: AssetKey, amount: number): number {
  if (key === "cash" || amount === 0) return 0;
  if (amount > 0) {
    const fromCash = Math.min(amount, s.holdings.cash + s.cashHome);
    const fromHome = Math.min(s.cashHome, fromCash);
    s.cashHome -= fromHome;
    s.holdings.cash -= fromCash - fromHome;
    const cost = key === "usd" ? usdPremium(s) : key === "gold" ? 0.02 : key === "crypto" ? 0.01 : 0.002;
    s.holdings[key] += fromCash * (1 - cost);
    if (fromCash > 0) log(s, `You buy ${fmt(s, fromCash)} of ${ASSET_LABEL[key].toLowerCase()}.`, "money");
    return fromCash;
  }
  const sell = Math.min(-amount, s.holdings[key]);
  s.holdings[key] -= sell;
  if (s.access.bank) s.holdings.cash += sell;
  else s.cashHome += sell;
  if (sell > 0) log(s, `You sell ${fmt(s, sell)} of ${ASSET_LABEL[key].toLowerCase()}.`, "money");
  return sell;
}

export const ASSET_LABEL: Record<AssetKey, string> = {
  cash: "Cash & deposits",
  usd: "US dollars",
  bonds: "Government bonds",
  localEq: "Local stock index",
  globalEq: "Global stock index",
  gold: "Gold",
  crypto: "Bitcoin",
};

export function realNW(s: LifeState): number {
  return realNetWorth(s);
}

export function localMoney(s: LifeState, amount: number): string {
  return fmt(s, amount);
}
