// Shared state helpers: money movement, wealth accounting, jobs, property,
// stocks, businesses and market access. Events and the yearly loop build on
// these so the rules live in one place.

import { BIZ, STOCK_IDEAS, TECH_STAGES } from "./content/business";
import { OCC, OCCUPATIONS, type Occupation } from "./content/occupations";
import { money, usd } from "./format";
import { capitalControl } from "./history";
import { econ, intlToUsd, toIntl2021, type YearEcon } from "./macro";
import { deskValue } from "./markets";
import type { Rng } from "./rng";
import {
  ASSET_KEYS, EDU_ORDER, type Allocation, type AssetKey, type BizType, type Edu, type LifeState, type Property,
  type Stats, type Stock, type Tone,
} from "./types";
import { country, devLevel, nearest } from "./world";

export const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

export function ec(s: LifeState, year = s.year): YearEcon {
  return econ(s.country, s.macroSeed, year, s.marketVariant);
}

export function W(s: LifeState, year = s.year): number {
  return ec(s, year).wage;
}

export function dev(s: LifeState): number {
  return devLevel(s.country, s.year);
}

export function cur(s: LifeState): string {
  return country(s.country).cur;
}

/**
 * Where repeated redenominations leave the local unit meaningless (Brazil before 1993,
 * the Soviet ruble...), a typical wage is a few units or less; show today's dollars instead.
 */
export function localUnitsReadable(s: LifeState, year = s.year): boolean {
  return W(s, year) >= 10;
}

export function fmt(s: LifeState, amount: number): string {
  return fmtIn(s, amount, s.year, s.country);
}

/** Money as it read in another year, or another country the life passed through. */
export function fmtIn(s: LifeState, amount: number, year: number, iso: string): string {
  if (econ(iso, s.macroSeed, year, s.marketVariant).wage < 10) return `≈${usd(intlToUsd(s.macroSeed, toIntl2021(iso, s.macroSeed, year, amount)))}`;
  return money(amount, country(iso).cur);
}

/** Net worth in years of the typical local wage: what the coin's metal and the life strip show. */
export function wageYears(s: LifeState, netWorthNominal: number, year = s.year, iso = s.country): number {
  const w = econ(iso, s.macroSeed, year, s.marketVariant).wage;
  return w > 0 ? netWorthNominal / w : 0;
}

export function log(s: LifeState, text: string, tone: Tone = "neutral"): void {
  s.log.push({ year: s.year, age: s.age, text, tone });
}

export function bump(s: LifeState, key: keyof Stats, delta: number): void {
  s.stats[key] = clamp(s.stats[key] + delta, 0, 100);
}

export function eduAtLeast(edu: Edu, min: Edu): boolean {
  return EDU_ORDER.indexOf(edu) >= EDU_ORDER.indexOf(min);
}

export function adult(s: LifeState): boolean {
  return s.age >= 18 && !(s.school && s.age < 25 && s.livingWithParents && !s.job);
}

// ------------------------------------------------------------------ wealth

export function stockValue(s: LifeState, liquidOnly = false): number {
  return s.stocks.reduce((a, st) => a + (st.alive && (!liquidOnly || !st.illiquid) ? st.value : 0), 0);
}

export function holdingsTotal(s: LifeState): number {
  return ASSET_KEYS.reduce((a, k) => a + s.holdings[k], 0);
}

export function liquid(s: LifeState): number {
  return holdingsTotal(s) + s.cashHome + stockValue(s, true);
}

export function propertyValue(s: LifeState): number {
  return s.properties.reduce((a, p) => a + p.value, 0);
}

export function mortgageDebt(s: LifeState): number {
  return s.properties.reduce((a, p) => a + p.mortgage, 0);
}

export function totalDebt(s: LifeState): number {
  return s.consumerDebt + s.studentDebt + mortgageDebt(s);
}

export function businessValue(s: LifeState): number {
  return s.business ? s.business.valuation : 0;
}

export function netWorth(s: LifeState): number {
  return (
    liquid(s) +
    (stockValue(s) - stockValue(s, true)) +
    deskValue(s) +
    propertyValue(s) +
    businessValue(s) +
    (s.frozen?.amount ?? 0) -
    totalDebt(s)
  );
}

export function realNetWorth(s: LifeState): number {
  return toIntl2021(s.country, s.macroSeed, s.year, netWorth(s));
}

// ------------------------------------------------------------------ tax

export function incomeTaxRate(s: LifeState, income: number): number {
  const d = dev(s);
  const base = d >= 0.8 ? 0.22 : d >= 0.6 ? 0.15 : d >= 0.4 ? 0.09 : 0.04;
  const rel = income / W(s);
  if (rel <= 0) return 0;
  return clamp(base * Math.sqrt(clamp(rel, 0, 1)) * (1 + 0.25 * Math.log(Math.max(1, rel))), 0, 0.5);
}

export function gainsTaxRate(s: LifeState): number {
  const d = dev(s);
  return d >= 0.6 ? 0.12 : d >= 0.4 ? 0.06 : 0;
}

// ------------------------------------------------------------------ access

export function refreshAccess(s: LifeState, r: Rng): void {
  const a = s.access;
  const y = s.year;
  const d = dev(s);
  if (!a.bank && s.age >= 16) {
    const acct = (nearest(s.country, "acct", y) ?? 30) / 100;
    const boost = (0.6 + 0.8 * s.familyPct) * (eduAtLeast(s.edu, "secondary") ? 1.15 : 0.85) * (s.job?.formal ? 1.2 : 1);
    // account ownership is a share of adults: you have one once your country's reach passes your threshold
    const u = Number(s.flags.bankU ?? (s.flags.bankU = r.next()));
    if (u < clamp(acct * boost, 0.01, 0.995)) {
      a.bank = true;
      if (s.cashHome > 0) {
        s.holdings.cash += s.cashHome;
        s.cashHome = 0;
      }
    }
  }
  const mkt = country(s.country).mkt;
  a.localEq = a.bank && mkt != null && y >= mkt && s.age >= 18;
  const control = capitalControl(s.country, y);
  const rich = liquid(s) > 30 * W(s);
  a.globalEq =
    a.bank && s.age >= 18 && y >= 1975 && control !== "closed" && (d >= 0.75 || (y >= 2012 && d >= 0.35) || rich);
  a.globalFriction = control === "quota" ? 0.015 : d >= 0.75 ? 0.001 : 0.005;
  a.crypto = y >= 2011 && s.age >= 16 && (a.bank || d >= 0.45);
  const mortgageMarket =
    s.country === "CHN" ? y >= 1998 : s.country === "RUS" ? y >= 2005 : d >= 0.45 || (y >= 2000 && d >= 0.3);
  a.mortgage = a.bank && mortgageMarket && y >= s.creditLockUntil;
}

export function availableAssets(s: LifeState): AssetKey[] {
  const a = s.access;
  const out: AssetKey[] = ["cash", "usd", "gold"];
  if (a.bank) out.push("bonds");
  if (a.localEq) out.push("localEq");
  if (a.globalEq) out.push("globalEq");
  if (a.crypto) out.push("crypto");
  return out;
}

export function usdPremium(s: LifeState): number {
  if (s.country === "USA") return 0;
  const c = capitalControl(s.country, s.year);
  return c === "closed" ? 0.15 : c === "quota" ? 0.04 : 0.01;
}

const BUY_COST: Partial<Record<AssetKey, number>> = { gold: 0.02, crypto: 0.01, globalEq: 0.002, localEq: 0.002 };

export function normalizedAllocation(s: LifeState): Allocation {
  const allowed = new Set(availableAssets(s));
  const out = Object.fromEntries(ASSET_KEYS.map((k) => [k, 0])) as Allocation;
  let total = 0;
  for (const k of ASSET_KEYS) {
    if (allowed.has(k)) {
      out[k] = Math.max(0, s.allocation[k]);
      total += out[k];
    }
  }
  if (total <= 0) {
    out.cash = 1;
    return out;
  }
  for (const k of ASSET_KEYS) out[k] /= total;
  return out;
}

/** Put new money to work and (optionally) rebalance toward the target mix. */
export function invest(s: LifeState, newMoney: number): void {
  if (!s.access.bank) {
    // Outside the banking system savings are cash at home, gold or dollars.
    const alloc = normalizedAllocation(s);
    const toGold = newMoney * alloc.gold;
    const toUsd = newMoney * alloc.usd;
    s.holdings.gold += toGold * (1 - (BUY_COST.gold ?? 0));
    s.holdings.usd += toUsd * (1 - usdPremium(s));
    s.cashHome += newMoney - toGold - toUsd;
    return;
  }
  if (s.cashHome > 0) {
    newMoney += s.cashHome;
    s.cashHome = 0;
  }
  const alloc = normalizedAllocation(s);
  // new money follows the target mix; existing holdings are left to drift
  for (const k of ASSET_KEYS) s.holdings[k] += buyNet(s, k, newMoney * alloc[k]);
}

/** Sell and buy so holdings match the target mix (only when the player asks). */
export function rebalance(s: LifeState): void {
  if (!s.access.bank) return;
  if (s.cashHome > 0) {
    s.holdings.cash += s.cashHome;
    s.cashHome = 0;
  }
  const alloc = normalizedAllocation(s);
  const total = holdingsTotal(s);
  const current = { ...s.holdings };
  for (const k of ASSET_KEYS) {
    const target = total * alloc[k];
    const delta = target - current[k];
    s.holdings[k] = delta > 0 ? current[k] + buyNet(s, k, delta) : target;
  }
}

function buyNet(s: LifeState, k: AssetKey, amount: number): number {
  if (amount <= 0) return amount;
  const cost = k === "usd" ? usdPremium(s) : (BUY_COST[k] ?? 0);
  return amount * (1 - cost);
}

const SELL_ORDER: AssetKey[] = ["cash", "usd", "bonds", "gold", "globalEq", "localEq", "crypto"];

/** Sell liquid assets to raise cash. Returns the amount raised. */
export function raiseCash(s: LifeState, amount: number): number {
  let need = amount;
  const fromHome = Math.min(s.cashHome, need);
  s.cashHome -= fromHome;
  need -= fromHome;
  for (const k of SELL_ORDER) {
    if (need <= 0) break;
    const take = Math.min(s.holdings[k], need);
    s.holdings[k] -= take;
    need -= take;
  }
  if (need > 0) {
    for (const st of [...s.stocks].sort((a, b) => b.value - a.value)) {
      if (need <= 0) break;
      if (!st.alive || st.illiquid) continue;
      const take = Math.min(st.value, need);
      st.value -= take;
      st.cost *= st.value > 0 ? 1 - take / (st.value + take) : 0;
      need -= take;
      if (st.value <= 1e-9) st.alive = false;
    }
    s.stocks = s.stocks.filter((st) => st.alive);
  }
  if (need > 0 && s.desk && s.desk.cash > 0) {
    // bills come out of idle cash in the trading account before anyone lends you money
    const take = Math.min(s.desk.cash, need);
    s.desk.cash -= take;
    need -= take;
  }
  return amount - Math.max(0, need);
}

export function creditLimit(s: LifeState): number {
  if (s.year < s.creditLockUntil) return 0;
  const lim = s.access.bank ? 3 * W(s) * (dev(s) > 0.5 ? 1 : 0.5) : 0.5 * W(s);
  return Math.max(0, lim - s.consumerDebt);
}

/** Pay a bill: cash first, then assets, then credit. Returns what could not be paid. */
export function pay(s: LifeState, amount: number): number {
  if (amount <= 0) return 0;
  const raised = raiseCash(s, amount);
  let unpaid = amount - raised;
  if (unpaid > 0) {
    const b = Math.min(unpaid, creditLimit(s));
    s.consumerDebt += b;
    unpaid -= b;
  }
  return unpaid;
}

export function consumerRate(s: LifeState): number {
  const e = ec(s);
  return s.access.bank ? clamp(e.lend + 0.06, 0.08, 3) : clamp(e.lend + 0.15, 0.2, 0.6 + e.infl);
}

// ------------------------------------------------------------------ jobs

export interface Offer {
  occ: string;
  title: string;
  mult: number;
  employer: string;
}

const JOB_EMPLOYERS: Record<string, string[]> = {
  construction: ["a construction firm", "a building contractor", "a road crew"],
  factory: ["a textile mill", "an auto parts plant", "a steelworks", "an electronics factory"],
  driver: ["a logistics company", "a bus company", "a delivery firm"],
  retail: ["a supermarket chain", "a department store", "a corner shop"],
  nurse: ["the city hospital", "a private clinic"],
  teacher: ["a public school", "a private school"],
  soldier: ["the police force", "the army"],
  doctor: ["the city hospital", "a private clinic"],
  lawyer: ["a law firm", "a corporate legal team"],
  software: ["a tech company", "a bank's IT team", "a startup"],
  finance: ["a big bank", "an investment firm"],
  trades: ["an electrical contractor", "a repair shop", "a utility company"],
};

const EMPLOYERS: Record<Occupation["pool"], string[]> = {
  farm: ["the family plot", "a neighbour's farm", "a cooperative"],
  informal: ["the market", "a busy street corner", "a local family"],
  industry: ["a textile mill", "an auto parts plant", "a steelworks", "an electronics factory", "a construction firm"],
  services: ["a supermarket chain", "a logistics company", "an insurance office", "a telecom company", "a hotel"],
  public: ["the city government", "the national health service", "the ministry", "a public school"],
  professional: ["a consulting firm", "a big bank", "a tech company", "a hospital", "a law firm", "an engineering group"],
  senior: ["a listed company", "a fast-growing firm", "a multinational"],
};

function poolWeight(s: LifeState, o: Occupation): number {
  const y = s.year;
  const d = dev(s);
  const agr = (nearest(s.country, "agr", y) ?? 30) / 100;
  const self = (nearest(s.country, "self", y) ?? 40) / 100;
  switch (o.pool) {
    case "farm":
      return agr * 3;
    case "informal":
      return self * 1.5;
    case "industry":
      return (1 - agr) * (0.6 + Math.exp(-((d - 0.45) ** 2) / 0.08));
    case "services":
      return (1 - agr) * 1.2;
    case "public":
      return 0.6;
    case "professional":
      return 0.25 + d;
    case "senior":
      return 0.4;
  }
}

export function occEligible(s: LifeState, o: Occupation): boolean {
  const d = dev(s);
  if (o.from && s.year < o.from) return false;
  if (o.minDev != null && d < o.minDev) return false;
  if (o.maxDev != null && d > o.maxDev) return false;
  if (s.stats.skill < o.skill) return false;
  const selfTaught = o.id === "software" && s.year >= 1995 && s.stats.skill >= 75 && eduAtLeast(s.edu, "secondary");
  if (!eduAtLeast(s.edu, o.minEdu) && !selfTaught) return false;
  if (o.fields && !selfTaught && (!s.field || !o.fields.includes(s.field))) return false;
  if (o.minExp && s.formalYears < o.minExp) return false;
  if (o.needs && !(s.flags.pastJobs as string | undefined)?.split(",").some((j) => o.needs!.includes(j))) return false;
  return true;
}

export function payMultiple(s: LifeState, o: Occupation, r: Rng, exp = s.workYears): number {
  const d = dev(s);
  // skilled work pays a bigger premium where skills are scarce
  const premium = o.pay > 1 ? 1 + (o.pay - 1) * (1 + 0.6 * (1 - d)) : o.pay;
  // `pay` is the mid-career level: juniors start below it, veterans end above it
  let mult = premium * (1 + o.growth) ** (Math.min(exp, o.peak) - o.peak / 2);
  if (o.id === "software" && d >= 0.8 && s.year >= 1995) mult *= 1.35;
  mult *= Math.exp(r.normal(-(o.spread ** 2) / 2, o.spread)) * (0.85 + s.stats.skill / 400);
  return Math.max(0.15, mult);
}

export function makeOffers(s: LifeState, r: Rng, n: number, minMult = 0): Offer[] {
  const pool = OCCUPATIONS.filter((o) => occEligible(s, o));
  if (!pool.length) return [];
  const offers: Offer[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < n * 4 && offers.length < n; i++) {
    const o = r.weighted(pool, (x) => poolWeight(s, x) * (x.pay >= 1 ? 1 + s.stats.network / 100 : 1));
    if (seen.has(o.id) && pool.length > n) continue;
    seen.add(o.id);
    const mult = payMultiple(s, o, r);
    if (mult < minMult && i < n * 3) continue;
    offers.push({ occ: o.id, title: o.title, mult, employer: r.pick(JOB_EMPLOYERS[o.id] ?? EMPLOYERS[o.pool]) });
  }
  return offers.sort((a, b) => b.mult - a.mult);
}

export function takeJob(s: LifeState, offer: Offer): void {
  const o = OCC[offer.occ];
  if (s.job && s.job.occ !== offer.occ) s.counters.jobChanges++;
  s.job = { occ: o.id, title: o.title, mult: offer.mult, years: 0, level: 0, formal: o.formal };
  s.unemployedYears = 0;
  s.retired = false;
  const past = new Set(String(s.flags.pastJobs ?? "").split(",").filter(Boolean));
  past.add(o.id);
  s.flags.pastJobs = [...past].join(",");
}

export function loseJob(s: LifeState): void {
  if (s.job) s.flags.lastMult = s.job.mult;
  s.job = null;
}

export function salary(s: LifeState): number {
  return s.job ? s.job.mult * W(s) : 0;
}

export function retirementAge(s: LifeState): number {
  return dev(s) >= 0.7 ? 65 : 60;
}

// ------------------------------------------------------------------ property

const PTI: Record<string, number> = {
  CHN: 9, HKG: 18, KOR: 8, JPN: 6, GBR: 7, AUS: 7, CAN: 6, NZL: 7, USA: 4.5, DEU: 6, FRA: 6, ITA: 6, ESP: 6,
  IND: 6, NGA: 6, BRA: 5, MEX: 4, IDN: 6, PHL: 6, VNM: 10, TUR: 5, RUS: 6, EGY: 6, PAK: 6, BGD: 6, ZAF: 4,
  ARG: 7, ISR: 9, SGP: 5, CHE: 7, SWE: 6, NLD: 6,
};

export function priceToIncome(iso: string): number {
  return PTI[iso] ?? 5;
}

/** Price of a typical home today (tracks the house price index since the life began). */
export function homePrice(s: LifeState): number {
  return Number(s.flags.hpl ?? priceToIncome(s.country) * W(s));
}

export function mortgageRate(s: LifeState): number {
  return clamp(ec(s).lend + (dev(s) > 0.6 ? -0.01 : 0.01), 0.02, 0.6);
}

export function annuity(principal: number, rate: number, years: number): number {
  if (principal <= 0) return 0;
  if (rate <= 0) return principal / years;
  return (principal * rate) / (1 - (1 + rate) ** -years);
}

export function householdIncome(s: LifeState): number {
  const partner = s.partner?.working ? s.partner.mult * W(s) : 0;
  const biz = s.business ? Math.max(0, s.business.profit) * 0.8 : 0;
  return salary(s) + partner + biz + (s.retired ? s.pension * W(s) : 0);
}

export function mortgageQuote(s: LifeState, price: number): { down: number; loan: number; payment: number; ok: boolean; reason?: string } {
  const ltv = dev(s) > 0.6 ? 0.8 : 0.65;
  const loan = s.access.mortgage ? price * ltv : 0;
  const down = price - loan;
  const rate = mortgageRate(s);
  const payment = annuity(loan, rate, 25);
  const inc = householdIncome(s);
  if (liquid(s) < down) return { down, loan, payment, ok: false, reason: `Needs ${fmt(s, down)} up front` };
  if (loan > 0 && payment > 0.45 * inc) return { down, loan, payment, ok: false, reason: "Income too low for the mortgage" };
  return { down, loan, payment, ok: true };
}

export function buyProperty(s: LifeState, kind: Property["kind"], price: number): boolean {
  const q = mortgageQuote(s, price);
  if (!q.ok) return false;
  const raised = raiseCash(s, q.down);
  if (raised < q.down - 1e-6) return false;
  s.properties.push({
    id: `p${s.year}-${s.properties.length}`,
    kind,
    value: price,
    price,
    mortgage: q.loan,
    rate: mortgageRate(s),
    payment: q.payment,
    bought: s.year,
  });
  return true;
}

export function sellProperty(s: LifeState, id: string, discount = 0): number {
  const p = s.properties.find((x) => x.id === id);
  if (!p) return 0;
  const proceeds = p.value * (1 - 0.05 - discount) - p.mortgage;
  s.properties = s.properties.filter((x) => x.id !== id);
  if (proceeds >= 0) invest(s, proceeds);
  else s.consumerDebt += -proceeds;
  return proceeds;
}

// ------------------------------------------------------------------ stocks

export function makeStock(s: LifeState, r: Rng, startup = false): Stock {
  const idea = r.pick(STOCK_IDEAS);
  const rocket = r.chance(startup ? 0.05 : 0.04);
  return {
    id: `st${s.year}-${Math.floor(r.next() * 1e6)}`,
    name: startup ? `${r.pick(["Loop", "Kite", "Grid", "Nim", "Quant", "Orb", "Tide"])}${r.pick(["ly", "wise", "io", "stack", "labs"])}` : r.pick(idea.names),
    sector: startup ? "Private startup" : idea.sector,
    pitch: r.pick(idea.pitch),
    value: 0,
    cost: 0,
    beta: startup ? 0.5 : r.range(0.7, 1.5),
    // most single stocks lag the index; a handful carry it for a few years
    drift: startup ? -0.08 : r.range(-0.06, 0.01),
    boost: rocket ? r.range(0.25, 0.6) : undefined,
    boostUntil: rocket ? s.year + r.int(3, 8) : undefined,
    vol: startup ? 0.8 : r.range(0.25, 0.45),
    hazard: startup ? 0.16 : r.range(0.01, 0.04),
    alive: true,
    bought: s.year,
    illiquid: startup || undefined,
    exitYear: startup ? s.year + r.int(4, 10) : undefined,
  };
}

export function buyStock(s: LifeState, st: Stock, amount: number): boolean {
  const got = raiseCash(s, amount);
  if (got <= 0) return false;
  st.value = got * 0.995;
  st.cost = got;
  st.bought = s.year;
  s.stocks.push(st);
  return true;
}

export function sellStock(s: LifeState, id: string, fraction = 1): number {
  const st = s.stocks.find((x) => x.id === id);
  if (!st || st.illiquid) return 0;
  const amt = st.value * fraction;
  st.value -= amt;
  st.cost *= 1 - fraction;
  if (fraction >= 0.999 || st.value <= 0) s.stocks = s.stocks.filter((x) => x.id !== id);
  invest(s, amt * 0.995);
  return amt;
}

// ------------------------------------------------------------------ business

export function canStartBusiness(s: LifeState, type: BizType): { ok: boolean; reason?: string; cost: number } {
  const b = BIZ[type];
  const cost = b.cost * W(s);
  if (s.business) return { ok: false, reason: "You already run a business", cost };
  if (s.age < 16) return { ok: false, reason: "Too young", cost };
  if (b.from && s.year < b.from) return { ok: false, reason: `Not a thing until ${b.from}`, cost };
  if (b.minDev && dev(s) < b.minDev) return { ok: false, reason: "No market for this here yet", cost };
  if (s.stats.skill < b.minSkill) return { ok: false, reason: `Needs skill ${b.minSkill}+`, cost };
  if (liquid(s) + creditLimit(s) < cost) return { ok: false, reason: `Needs ${fmt(s, cost)}`, cost };
  return { ok: true, cost };
}

export function startBusiness(s: LifeState, type: BizType, r: Rng): boolean {
  const chk = canStartBusiness(s, type);
  if (!chk.ok) return false;
  const unpaid = pay(s, chk.cost);
  if (unpaid > 0) return false;
  const b = BIZ[type];
  s.business = {
    id: `b${s.year}`,
    type,
    name: r.pick(b.names),
    founded: s.year,
    scale: 1,
    profit: 0,
    valuation: type === "tech" ? TECH_STAGES[0].valuation * W(s) : chk.cost * 0.6,
    equity: 1,
    invested: chk.cost,
    stage: 0,
    forSale: false,
  };
  s.counters.bizStarted++;
  if (s.job && type !== "stall") loseJob(s); // going full time
  return true;
}

export function endBusiness(s: LifeState, outcome: "sold" | "closed" | "failed", proceeds: number): void {
  const b = s.business;
  if (!b) return;
  s.pastBusinesses.push({ name: b.name, type: b.type, outcome, value: proceeds, year: s.year });
  if (outcome === "sold") s.counters.bizSold++;
  s.business = null;
  if (proceeds > 0) invest(s, proceeds);
}

export function stageName(stage: number): string {
  return TECH_STAGES[Math.min(stage, TECH_STAGES.length - 1)].name;
}

export function countryLabel(iso: string): string {
  return country(iso).n;
}
