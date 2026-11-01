// More ways to put money to work, each priced from the same economy as everything else:
// bonds of several kinds (funds, and fixed-rate bonds held to maturity), listed companies with their
// dividends and prices, startup rounds and private equity funds, businesses for sale and stakes in
// other people's, and property of every sort.

import { BIZ, BUSINESSES } from "./content/business";
import { econ, type YearEcon } from "./macro";
import {
  addMove, adult, annuity, buyStock, clamp, commit, dev, ec, fmt, householdIncome, invest, liquid, log, loseJob, makeStock, mortgageRate,
  raiseCash, W,
} from "./ops";
import { stream, type Rng } from "./rng";
import type { AssetKey, BizType, BondLot, LifeState, PropUse, Stock } from "./types";

// ------------------------------------------------------------------ bond and property funds

/**
 * A year's growth for the funds added beside the old ones. Corporate bonds earn government bonds plus a
 * credit spread, less the defaults that bunch in slumps. Inflation-linked bonds earn prices plus a real
 * yield, sharing nominal bonds' swings in real rates but not their inflation surprises. US Treasuries are
 * American government bonds in dollars. A property fund moves partly with stocks and partly with homes and
 * their rents.
 */
export function fundGrowth(s: LifeState, e: YearEcon, prev: YearEcon, fxR: number): { corp: number; linkers: number; ust: number; reit: number } {
  const corp = e.bond + 0.017 - (e.recession ? 0.035 : 0) - (e.crash ? 0.05 : 0) - (e.bankCrisis ? 0.06 : 0) - (e.currencyCrisis ? 0.04 : 0);
  // swings in real rates show in nominal bonds' excess over deposits once their inflation surprise is taken out;
  // where prices run away that signal is noise, and linkers just pay inflation and their real yield
  const calm = e.infl < 0.25 && prev.infl < 0.25;
  const realSwing = calm ? Math.log((1 + e.bond) / (1 + e.dep)) - 0.012 + 1.5 * Math.log((1 + e.infl) / (1 + prev.infl)) : 0;
  const linkers = (1 + e.infl) * (1 + clamp(0.012 + 0.8 * realSwing, -0.15, 0.2)) - 1;
  const us = econ("USA", s.macroSeed, s.year, s.marketVariant);
  // a property fund trades like a stock, with its own year on top, the same for everyone in the country
  const own = stream(s.macroSeed, "reit", s.country, s.year).normal(0, 0.07);
  const reit = 0.6 * e.eq + 0.4 * (e.house + e.rentYield * 0.75) - 0.005 + own;
  return {
    corp: 1 + Math.max(-0.6, corp),
    linkers: 1 + Math.max(-0.6, linkers),
    ust: (1 + us.bond) * fxR * (1 - s.access.globalFriction),
    reit: 1 + Math.max(-0.7, reit),
  };
}

/** What each fund did last year in local money: what you'd have read in the paper. */
export function lastYearReturns(s: LifeState): Partial<Record<AssetKey, number>> {
  const e = ec(s, s.year - 1);
  const p = ec(s, s.year - 2);
  const fxR = p.fx > 0 ? e.fx / p.fx : 1;
  const usDep = econ("USA", s.macroSeed, s.year - 1, s.marketVariant).dep;
  const f = fundGrowth({ ...s, year: s.year - 1 }, e, p, fxR);
  return {
    cash: e.dep,
    usd: (1 + usDep) * fxR - 1,
    bonds: e.bond,
    corp: f.corp - 1,
    linkers: f.linkers - 1,
    ust: f.ust - 1,
    localEq: e.eq,
    globalEq: (1 + e.usEq) * fxR - 1,
    reit: f.reit - 1,
    gold: (1 + e.gold) * fxR - 1,
    crypto: e.btc && p.btc ? (e.btc / p.btc) * fxR - 1 : undefined,
  };
}

// ------------------------------------------------------------------ fixed-rate bonds

export const BOND_TERMS = [2, 5, 10] as const;

/** Today's yield on a government bond of this many years: the deposit rate, a term premium, and part of any gap to last year's inflation. */
export function bondYield(s: LifeState, years: number, year = s.year): number {
  const e = ec(s, year);
  const p = ec(s, year - 1);
  const term = years <= 2 ? 0.005 : years <= 5 ? 0.012 : 0.019;
  return Math.max(0.001, e.dep) + term + 0.25 * Math.max(0, p.infl - e.dep);
}

/** What a bond paying `rate` on `face` sells for with `left` coupons still to come, at yield `y`. */
export function bondPrice(face: number, rate: number, left: number, y: number): number {
  if (left <= 0) return face;
  let pv = 0;
  for (let t = 1; t <= left; t++) pv += (face * rate) / (1 + y) ** t;
  return pv + face / (1 + y) ** left;
}

export function canBuyBonds(s: LifeState): string | null {
  if (!adult(s)) return "You need to be an adult";
  if (!s.access.bank) return "You need a bank account";
  return null;
}

export function buyBond(s: LifeState, years: number, amount: number): boolean {
  if (canBuyBonds(s) || amount <= 0 || amount > liquid(s) + 1e-6) return false;
  const got = raiseCash(s, amount);
  if (got <= 0) return false;
  const rate = bondYield(s, years);
  const lot: BondLot = { id: `bd${s.year}-${years}-${(s.bondLots ?? []).length}`, years, face: got, rate, bought: s.year, matures: s.year + years - 1, value: got, cost: got };
  s.bondLots = [...(s.bondLots ?? []), lot];
  log(s, `You buy a ${years}-year government bond: ${fmt(s, got)} at ${(rate * 100).toFixed(1)}% a year, repaid at the end of ${lot.matures}.`, "money");
  return true;
}

export function sellBond(s: LifeState, id: string): number {
  const b = (s.bondLots ?? []).find((x) => x.id === id);
  if (!b) return 0;
  const got = b.value * 0.995;
  s.bondLots = (s.bondLots ?? []).filter((x) => x !== b);
  invest(s, got);
  log(s, `You sell your ${b.years}-year bond early for ${fmt(s, got)}${b.value < b.cost * 0.97 ? `, less than the ${fmt(s, b.cost)} it cost` : ""}.`, "money");
  return got;
}

/** Governments that can't pay make bondholders take less. Rare; the same for everyone in that country and year. */
export function bondDefault(s: LifeState, e: YearEcon): number {
  const d = dev(s);
  const p = (e.currencyCrisis && d < 0.7 ? 0.25 : 0) + (e.hyper ? 0.3 : 0) + (e.war > 500 ? 0.2 : 0);
  if (p <= 0) return 0;
  const r = stream(s.macroSeed, "default", s.country, s.year);
  return r.next() < p ? r.range(0.3, 0.6) : 0;
}

/** The year for fixed-rate bonds: coupons in, maturities repaid, prices marked to today's yields. */
export function bondYear(s: LifeState, e: YearEcon): void {
  const lots = s.bondLots ?? [];
  if (!lots.length) return;
  const before = lots.reduce((a, b) => a + b.value, 0);
  const cut = bondDefault(s, e);
  if (cut > 0) {
    for (const b of lots) {
      b.face *= 1 - cut;
      b.value *= 1 - cut;
    }
    log(s, `The government can't pay in full: holders of its bonds take ${Math.round(cut * 100)}% less.`, "bad");
  }
  let cash = 0;
  const keep: BondLot[] = [];
  for (const b of lots) {
    cash += b.face * b.rate;
    if (s.year >= b.matures) {
      cash += b.face;
      log(s, `Your ${b.years}-year bond from ${b.bought} is repaid: ${fmt(s, b.face)}, after ${fmt(s, b.face * b.rate * b.years)} in interest.`, "money");
      continue;
    }
    const left = b.matures - s.year;
    b.value = bondPrice(b.face, b.rate, left, bondYield(s, left, s.year + 1));
    keep.push(b);
  }
  s.bondLots = keep;
  const after = keep.reduce((a, b) => a + b.value, 0);
  addMove(s, "fixed", after + cash - before);
  invest(s, cash);
}

// ------------------------------------------------------------------ listed companies

export interface Listing {
  stock: Stock;
  dividend: number;
  pe: number;
  last: number; // last year's move in its price
}

// what a company of each kind is like: how it moves with the market, how much it swings on its own,
// how often one goes bust, what it pays out and what it costs for each unit of profit
const SECTOR: Record<string, { beta: [number, number]; vol: number; hazard: number; div: [number, number]; pe: [number, number] }> = {
  Tech: { beta: [1.2, 1.6], vol: 0.38, hazard: 0.02, div: [0, 0.01], pe: [25, 60] },
  Energy: { beta: [0.8, 1.3], vol: 0.28, hazard: 0.01, div: [0.03, 0.06], pe: [6, 15] },
  Banking: { beta: [1, 1.4], vol: 0.26, hazard: 0.012, div: [0.03, 0.05], pe: [6, 14] },
  Property: { beta: [0.9, 1.3], vol: 0.28, hazard: 0.012, div: [0.03, 0.06], pe: [6, 16] },
  Consumer: { beta: [0.6, 0.9], vol: 0.2, hazard: 0.006, div: [0.015, 0.035], pe: [15, 30] },
  Pharma: { beta: [0.7, 1], vol: 0.3, hazard: 0.01, div: [0.01, 0.03], pe: [15, 35] },
  Auto: { beta: [1, 1.5], vol: 0.3, hazard: 0.012, div: [0.005, 0.03], pe: [6, 15] },
};

/** Three listed companies you could buy this year. Cheap ones do a little better on average; any one can fail. */
export function listings(s: LifeState): Listing[] {
  if (!s.access.localEq) return [];
  const r = stream(s.seed, "listings", s.year);
  // every candidate is drawn in full whether it's shown or not, so the year's list stays put as you buy and sell
  const candidates: Listing[] = [];
  for (let i = 0; i < 8; i++) {
    const st = makeStock(s, r);
    const sec = SECTOR[st.sector] ?? SECTOR.Consumer;
    const pe = Math.round(r.range(...sec.pe));
    const dividend = Math.round(r.range(...sec.div) * 1000) / 1000;
    st.id = `L${s.year}-${i}`;
    st.kind = "listed";
    st.beta = r.range(...sec.beta);
    st.vol = sec.vol * r.range(0.85, 1.15);
    st.hazard = sec.hazard;
    // a single company lags the index a little on average; the cheap ones a little less
    st.drift = r.range(-0.015, 0.015) + 0.015 * clamp((15 - pe) / 10, -1, 1);
    // one in twenty runs far ahead for a few years
    const rocket = r.chance(0.05);
    st.boost = rocket ? r.range(0.15, 0.35) : undefined;
    st.boostUntil = rocket ? s.year + r.int(3, 6) : undefined;
    st.payout = dividend;
    st.peRatio = pe;
    const last = clamp(r.normal(0.06, st.vol) + (rocket ? 0.15 : 0), -0.7, 2.5);
    candidates.push({ stock: st, dividend, pe, last });
  }
  // companies you already own from earlier years aren't offered again
  const held = new Set(s.stocks.filter((x) => !x.id.startsWith(`L${s.year}-`)).map((x) => x.name));
  const out: Listing[] = [];
  for (const c of candidates) {
    if (out.length < 3 && !held.has(c.stock.name) && !out.some((l) => l.stock.name === c.stock.name)) out.push(c);
  }
  return out;
}

export function buyListing(s: LifeState, index: number, amount: number): boolean {
  const l = listings(s)[index];
  if (!l || amount <= 0 || amount > liquid(s) + 1e-6) return false;
  const have = s.stocks.find((x) => x.id === l.stock.id && x.alive);
  if (have) {
    // don't sell these shares to pay for more of them
    const was = have.illiquid;
    have.illiquid = true;
    const got = raiseCash(s, amount);
    have.illiquid = was;
    have.value += got * 0.995;
    have.cost += got;
  } else if (!buyStock(s, l.stock, amount)) return false;
  log(s, `You buy ${fmt(s, amount)} of ${l.stock.name} shares.`, "money");
  return true;
}

// ------------------------------------------------------------------ private deals

export interface Deal {
  stock: Stock;
  min: number;
  max: number;
  what: string;
}

/** A startup raising money from people who know the founders. Most fail; a few return many times over. */
export function startupDeal(s: LifeState): Deal | null {
  const w = W(s);
  if (!adult(s) || s.age < 25 || s.age > 72 || s.stats.network < 40 || s.year < 1985 || dev(s) < 0.35 || liquid(s) < w) return null;
  const r = stream(s.seed, "startup deal", s.year);
  if (!r.chance(0.5)) return null;
  const st = makeStock(s, r, true);
  st.id = `S${s.year}`;
  st.kind = "startup";
  return { stock: st, min: 0.25 * w, max: Math.max(0.25 * w, liquid(s) * 0.25), what: `${st.name} is raising a seed round from friends of the founders.` };
}

const FUNDS = ["Summit Capital Partners", "Northgate Equity", "Harbourline Ventures", "Blue Ridge Capital", "Meridian Growth Partners"];

/** A private equity fund for the well off: your money is locked away for ten years. */
export function privateFund(s: LifeState): Deal | null {
  const w = W(s);
  if (!adult(s) || s.age < 30 || s.age > 75 || s.year < 1985 || dev(s) < 0.6 || liquid(s) < 15 * w) return null;
  const r = stream(s.seed, "pe fund", s.year);
  const name = `${r.pick(FUNDS)} Fund ${["II", "III", "IV", "V", "VI", "VII"][r.int(0, 5)]}`;
  const st: Stock = {
    id: `F${s.year}`,
    name,
    sector: "Private equity",
    pitch: "Buys companies, fixes them up and sells them on.",
    value: 0,
    cost: 0,
    beta: 1.1,
    drift: 0.01,
    vol: 0.12,
    hazard: 0.003,
    alive: true,
    bought: s.year,
    illiquid: true,
    exitYear: s.year + 10,
    kind: "pe",
  };
  return { stock: st, min: 3 * w, max: Math.max(3 * w, liquid(s) * 0.3), what: `${name} is taking money for ten years.` };
}

export function joinDeal(s: LifeState, d: Deal, amount: number): boolean {
  if (amount < d.min - 1e-6 || amount > liquid(s) + 1e-6) return false;
  if (s.stocks.some((x) => x.id === d.stock.id)) return false;
  const st = { ...d.stock, bought: s.year };
  if (!buyStock(s, st, amount)) return false;
  st.value = st.cost; // no spread on a private round
  log(s, st.kind === "pe" ? `You put ${fmt(s, amount)} into ${st.name}, locked until ${st.exitYear}.` : `You invest ${fmt(s, amount)} in ${st.name}.`, "money");
  return true;
}

// ------------------------------------------------------------------ businesses for sale, and backing one

export interface BizForSale {
  id: string;
  type: BizType;
  name: string;
  founded: number;
  scale: number;
  profit: number; // last year's
  price: number;
}

/** Two going concerns for sale this year, priced on what they made last year. */
export function businessesForSale(s: LifeState): BizForSale[] {
  if (!adult(s) || s.age < 21 || s.age > 72 || s.business) return [];
  const r = stream(s.seed, "for sale", s.year);
  const d = dev(s);
  const w = W(s);
  const kinds = BUSINESSES.filter((b) => b.type !== "tech" && (b.from ?? 0) <= s.year && (b.minDev ?? 0) <= d && (d < 0.7 || b.type !== "stall"));
  const out: BizForSale[] = [];
  for (let i = 0; i < 2; i++) {
    const def = r.pick(kinds);
    const age = r.int(3, 20);
    const scale = r.range(1.1, 2.6);
    const profit = Math.max(0.1, scale * def.profit * w * Math.exp(r.normal(-0.03, 0.25)));
    out.push({ id: `B${s.year}-${i}`, type: def.type, name: r.pick(def.names), founded: s.year - age, scale, profit, price: profit * (def.multiple + 1) * r.range(0.9, 1.25) });
  }
  return out;
}

/** Profit left once a hired manager is paid: the work you'd have done yourself now costs a wage. */
export function managedProfit(profit: number, w: number): number {
  return profit * 0.75 - 0.25 * w;
}

export function buyBusiness(s: LifeState, id: string, managed: boolean): boolean {
  const b = businessesForSale(s).find((x) => x.id === id);
  if (!b || s.business || liquid(s) < b.price) return false;
  const got = raiseCash(s, b.price);
  if (got < b.price - 1e-6) return false;
  s.business = {
    id: b.id, type: b.type, name: b.name, founded: b.founded, scale: b.scale, profit: b.profit, valuation: b.price * 0.85, equity: 1,
    invested: b.price, stage: 0, forSale: false, managed, bought: s.year,
  };
  if (!managed && s.job && b.type !== "stall") loseJob(s);
  log(s, `You buy ${b.name}, ${BIZ[b.type].title.toLowerCase()}, for ${fmt(s, b.price)}${managed ? ", and hire a manager to run it" : ", and run it yourself"}.`, "milestone");
  return true;
}

/** Hand the business to a manager, or take it back and run it yourself (leaving your job). */
export function setManaged(s: LifeState, managed: boolean): void {
  const b = s.business;
  if (!b || b.type === "tech" || Boolean(b.managed) === managed) return;
  b.managed = managed;
  if (!managed && s.job && b.type !== "stall") loseJob(s);
  log(s, managed ? `You hire a manager to run ${b.name}.` : `You take ${b.name} back and run it yourself.`, "neutral");
}

const PARTNER_NEEDS = ["a second shop", "new machines", "a bigger kitchen", "a delivery van", "stock for the busy season", "a new branch"];

/** Someone you know needs a partner's money for their business: a share of the profit each year, and a buyout later. */
export function partnerDeal(s: LifeState): Deal | null {
  const w = W(s);
  if (!adult(s) || s.age < 25 || s.age > 75 || s.stats.network < 25 || liquid(s) < 0.5 * w) return null;
  const r = stream(s.seed, "partner deal", s.year);
  if (!r.chance(0.6)) return null;
  const def = r.pick(BUSINESSES.filter((b) => b.type !== "tech" && b.type !== "stall"));
  const name = r.pick(def.names);
  const ask = r.range(0.6, 2.5) * w;
  const share = Math.round(r.range(0.2, 0.45) * 100);
  const payout = r.range(0.09, 0.16);
  const st: Stock = {
    id: `P${s.year}`,
    name,
    sector: "Partner stake",
    pitch: `${share}% of ${name} for ${fmt(s, ask)}, to pay for ${r.pick(PARTNER_NEEDS)}.`,
    value: 0,
    cost: 0,
    beta: 0.5,
    // the business pays out its profit and otherwise just about keeps its value
    drift: payout - 0.03,
    vol: 0.3,
    hazard: r.range(0.05, 0.09),
    alive: true,
    bought: s.year,
    illiquid: true,
    exitYear: s.year + r.int(5, 9),
    kind: "stake",
    payout,
  };
  return { stock: st, min: ask, max: ask, what: `The owner of ${name} wants a partner: ${st.pitch}` };
}

// ------------------------------------------------------------------ property of every sort

export const PROPERTY_USES: Record<PropUse, { label: string; price: number; yield: number; ltv: number; blurb: string }> = {
  flat: { label: "A small flat to let", price: 0.55, yield: 1.15, ltv: 1, blurb: "Cheaper, and more rent for its price; tenants come and go" },
  house: { label: "A house to let", price: 1, yield: 1, ltv: 1, blurb: "Families stay for years" },
  shop: { label: "A shop or office to let", price: 1.3, yield: 1.55, ltv: 0.75, blurb: "Higher rent, but it can stand empty in a slump" },
  farm: { label: "Farmland", price: 0.6, yield: 0.55, ltv: 0.6, blurb: "Farmers pay a low rent; land holds its value" },
  holiday: { label: "A holiday home", price: 0.7, yield: 0, ltv: 1, blurb: "No rent, upkeep every year, and holidays for life" },
};

export function propertyQuote(s: LifeState, use: PropUse): { price: number; down: number; loan: number; payment: number; rent: number; ok: boolean; reason?: string } {
  const u = PROPERTY_USES[use];
  const price = Number(s.flags.hpl ?? 0) > 0 ? Number(s.flags.hpl) * u.price : 5 * W(s) * u.price;
  const ltv = (dev(s) > 0.6 ? 0.8 : 0.65) * u.ltv;
  const loan = s.access.mortgage ? price * ltv : 0;
  const down = price - loan;
  const payment = annuity(loan, mortgageRate(s), 25);
  const rent = price * ec(s).rentYield * u.yield;
  if (!adult(s)) return { price, down, loan, payment, rent, ok: false, reason: "You need to be an adult" };
  if (liquid(s) < down) return { price, down, loan, payment, rent, ok: false, reason: `Needs ${fmt(s, down)} up front` };
  if (loan > 0 && payment > 0.45 * (householdIncome(s) + rent * 0.7)) return { price, down, loan, payment, rent, ok: false, reason: "Income too low for the mortgage" };
  return { price, down, loan, payment, rent, ok: true };
}

export function buyPropertyOf(s: LifeState, use: PropUse): boolean {
  const q = propertyQuote(s, use);
  if (!q.ok) return false;
  const raised = raiseCash(s, q.down);
  if (raised < q.down - 1e-6) return false;
  s.properties.push({
    id: `p${s.year}-${s.properties.length}`,
    kind: "rental",
    value: q.price,
    price: q.price,
    mortgage: q.loan,
    rate: mortgageRate(s),
    payment: q.payment,
    bought: s.year,
    use,
    personal: use === "holiday" || undefined,
  });
  if (use === "holiday") commit(s, { key: `holiday${s.year}`, label: "Upkeep on the holiday home", wage: -(q.price * 0.015) / W(s), until: s.year + 60, happiness: 1 });
  log(s, `You buy ${PROPERTY_USES[use].label.toLowerCase().replace(/ to let$/, " to let out")} for ${fmt(s, q.price)}.`, "milestone");
  return true;
}

/** How a property's value moves in a year, by what it is. */
export function propertyGrowth(use: PropUse | undefined, e: YearEcon): number {
  if (use === "shop") return 1.2 * e.house - (e.recession ? 0.05 : 0);
  if (use === "farm") return 0.5 * e.house + 0.5 * e.infl + 0.3 * Math.max(0, e.realGrowth);
  return e.house;
}

/** Gross rent as a share of value, by what it is: a shop may stand empty in a slump. */
export function rentShare(use: PropUse | undefined, e: YearEcon, empty: boolean): number {
  if (empty) return 0;
  return e.rentYield * (use ? PROPERTY_USES[use].yield : 1);
}

/** Whether a shop or office stands empty this year: a third of them do in a recession. */
export function standsEmpty(s: LifeState, id: string, e: YearEcon): boolean {
  return e.recession && stream(s.seed, "empty", id, s.year).next() < 0.35;
}

/** Say so in the ledger when a shop or office you let stands empty this year. */
export function noteEmptyShops(s: LifeState): void {
  const e = ec(s);
  for (const p of s.properties) {
    if (p.kind === "rental" && p.use === "shop" && standsEmpty(s, p.id, e)) log(s, "Your shop unit stands empty all year: no one is renting in this slump.", "bad");
  }
}

// ------------------------------------------------------------------ cash paid out by what you own

/** Dividends from listed shares and partners' cuts of profit, paid in cash before prices move. */
export function payouts(s: LifeState, r: Rng): void {
  let picks = 0;
  let stakes = 0;
  for (const st of s.stocks) {
    if (!st.alive || !st.payout) continue;
    // a partner's cut follows how the business did this year
    const cash = st.value * st.payout * (st.kind === "stake" ? Math.max(0, 1 + r.normal(0, 0.35)) : 1);
    if (st.kind === "stake") stakes += cash;
    else picks += cash;
  }
  if (picks > 0) addMove(s, "picks", picks);
  if (stakes > 0) addMove(s, "stakes", stakes);
  if (picks + stakes > 0) invest(s, picks + stakes);
}

/** Bring a life saved before these options existed up to date. */
export function upgradeLife(s: LifeState): LifeState {
  for (const k of ["corp", "linkers", "ust", "reit"] as const) {
    s.holdings[k] ??= 0;
    s.allocation[k] ??= 0;
  }
  s.bondLots ??= [];
  return s;
}
