// The trading desk: a brokerage account played month by month inside the
// current year. Orders fill at the month's average price, plus a spread and the
// commission of the era. You can only buy with money you have and only sell what
// you own: no borrowing, no short selling. At year end the remaining months play
// out on their own, gains are taxed, and the account's value counts in net worth.

import { MONTH_NEWS } from "./history";
import {
  companyById, deskValue, indexLevel, indexName, instruments, monthLabel, monthlyDividendRate, priceOf, tOf, yearOfT,
  yearStartT, type Instrument,
} from "./markets";
import { toIntl2021 } from "./macro";
import { ec, fmt, gainsTaxRate, invest, liquid, log, pay, raiseCash } from "./ops";
import type { DeskOrder, DeskState, LifeState } from "./types";
import { country } from "./world";

const TRADES_KEPT = 250;

/** Commission as a share of the trade: fixed brokerage until the mid-1970s, near zero today. */
export function commissionRate(year: number): number {
  return year < 1975 ? 0.015 : year < 1990 ? 0.008 : year < 2000 ? 0.004 : year < 2013 ? 0.0015 : 0.0005;
}

/** Bid-ask spread paid on each trade (half on the way in, half on the way out). */
export function spreadOf(id: string): number {
  return id.startsWith("idx:") ? 0.002 : id === "spx" ? 0.004 : 0.008;
}

/** Yearly fund fee: the first index funds charged far more than today's. */
export function fundFee(year: number): number {
  return year < 1976 ? 0.015 : year < 2000 ? 0.008 : year < 2015 ? 0.004 : 0.0015;
}

export interface DeskAccess {
  ok: boolean;
  reason?: string;
  local: boolean;
  global: boolean;
}

export function deskAccess(s: LifeState): DeskAccess {
  const local = s.access.localEq;
  const global = s.access.globalEq;
  if (!s.alive) return { ok: false, reason: "This life is over", local, global };
  if (s.age < 18) return { ok: false, reason: "You can open a trading account at 18", local, global };
  if (!s.access.bank) return { ok: false, reason: "You need a bank account first", local, global };
  if (!local && !global) {
    const mkt = country(s.country).mkt;
    const reason = mkt == null ? "There's no stock market here, and you can't invest abroad" : s.year < mkt ? `The stock market here opens in ${mkt}` : "Nothing you can buy yet";
    return { ok: !!s.desk && Object.keys(s.desk.pos).length > 0, reason, local, global };
  }
  return { ok: true, local, global };
}

function newDesk(s: LifeState): DeskState {
  return {
    cash: 0,
    pos: {},
    orders: [],
    t: yearStartT(s.year),
    trades: [],
    nextId: 1,
    yearGain: 0,
    stats: { deposited: 0, withdrawn: 0, flowsReal: 0, costsReal: 0, fees: 0, dividends: 0, taxes: 0, realized: 0, trades: 0, perf: 1, perfPeak: 1, drawdown: 0, best: null, worst: null },
  };
}

export function ensureDesk(s: LifeState): DeskState {
  if (!s.desk) {
    s.desk = newDesk(s);
    s.flags.deskYearStart = 0;
    s.flags.deskFlowsStart = 0;
    log(s, "You open a trading account.", "money");
  }
  return s.desk;
}

/** The December of the year being lived: the desk can't run past it. */
export function deskYearEnd(s: LifeState): number {
  return tOf(s.year, 12);
}

export function monthsPlayed(s: LifeState): number {
  return s.desk ? s.desk.t - yearStartT(s.year) : 0;
}

export function tradable(s: LifeState): Instrument[] {
  const d = s.desk;
  const a = deskAccess(s);
  return instruments(s.country, s.macroSeed, d ? d.t : yearStartT(s.year), { local: a.local, global: a.global });
}

export function quote(s: LifeState, id: string, t = s.desk?.t ?? yearStartT(s.year)): number | null {
  return priceOf(id, s.macroSeed, t, s.country);
}

export function instrumentName(s: LifeState, id: string): string {
  if (id === "spx") return "S&P 500 fund";
  if (id.startsWith("idx:")) return `${indexName(id.slice(4))} fund`;
  return companyById(id, s.macroSeed)?.name ?? id;
}

const real = (s: LifeState, amount: number) => toIntl2021(s.country, s.macroSeed, s.year, amount);

function addFee(s: LifeState, amount: number): void {
  const d = s.desk!;
  d.stats.fees += amount;
  d.stats.costsReal += real(s, amount);
}

function record(s: LifeState, t: number, text: string, pnl?: number): void {
  const d = s.desk!;
  d.trades.unshift({ t, y: s.year, text, pnl });
  if (d.trades.length > TRADES_KEPT) d.trades.length = TRADES_KEPT;
}

function noteResult(d: DeskState, name: string, pnl: number): void {
  d.stats.realized += pnl;
  d.yearGain += pnl;
  if (!d.stats.best || pnl > d.stats.best.pnl) d.stats.best = { name, pnl };
  if (!d.stats.worst || pnl < d.stats.worst.pnl) d.stats.worst = { name, pnl };
}

/** Update the performance index by how much the account's value changed apart from money moved. */
function trackPerf(s: LifeState, before: number): void {
  const d = s.desk!;
  const after = deskValue(s);
  if (before > 1e-9 && after >= 0) d.stats.perf *= after / before;
  d.stats.perfPeak = Math.max(d.stats.perfPeak, d.stats.perf);
  d.stats.drawdown = Math.max(d.stats.drawdown, 1 - d.stats.perf / d.stats.perfPeak);
}

export function fmtPrice(p: number): string {
  if (!Number.isFinite(p)) return "—";
  const a = Math.abs(p);
  if (a >= 1e9 || (a > 0 && a < 1e-3)) return p.toExponential(2);
  if (a >= 1) return p.toLocaleString("en", { minimumFractionDigits: a >= 1e5 ? 0 : 2, maximumFractionDigits: a >= 1e5 ? 0 : 2 });
  return p.toLocaleString("en", { maximumSignificantDigits: 3 });
}

export function fmtUnits(u: number): string {
  const a = Math.abs(u);
  if (a >= 1e9 || (a > 0 && a < 1e-3)) return u.toExponential(2);
  return u.toLocaleString("en", { maximumFractionDigits: a >= 100 ? 0 : a >= 1 ? 2 : 4 });
}

// ------------------------------------------------------------------ money in and out

/** Move savings into the trading account. Returns the amount moved. */
export function deposit(s: LifeState, amount: number): number {
  if (!deskAccess(s).ok || amount <= 0) return 0;
  const d = ensureDesk(s);
  const got = raiseCash(s, Math.min(amount, liquid(s)));
  d.cash += got;
  d.stats.deposited += got;
  d.stats.flowsReal += real(s, got);
  if (got > 0) record(s, d.t, `Moved ${fmt(s, got)} in from savings`);
  return got;
}

/** Move cash from the trading account back into savings (it follows your savings plan). */
export function withdraw(s: LifeState, amount: number): number {
  const d = s.desk;
  if (!d || amount <= 0) return 0;
  const amt = Math.min(amount, d.cash);
  d.cash -= amt;
  d.stats.withdrawn += amt;
  d.stats.flowsReal -= real(s, amt);
  invest(s, amt);
  if (amt > 0) record(s, d.t, `Moved ${fmt(s, amt)} back to savings`);
  return amt;
}

// ------------------------------------------------------------------ trading

export interface TradeQuote {
  price: number; // what one unit costs (buy) or brings (sell), spread included
  units: number;
  gross: number;
  commission: number;
  net: number; // cash out for a buy, cash in for a sell
}

export function quoteBuy(s: LifeState, id: string, money: number): TradeQuote | null {
  const px = quote(s, id);
  if (px == null || px <= 0 || money <= 0) return null;
  const year = yearOfT(s.desk?.t ?? yearStartT(s.year));
  const commission = money * commissionRate(year);
  const price = px * (1 + spreadOf(id) / 2);
  return { price, units: (money - commission) / price, gross: money - commission, commission, net: money };
}

export function quoteSell(s: LifeState, id: string, units: number): TradeQuote | null {
  const px = quote(s, id);
  if (px == null || units <= 0) return null;
  const year = yearOfT(s.desk?.t ?? yearStartT(s.year));
  const price = px * (1 - spreadOf(id) / 2);
  const gross = units * price;
  const commission = gross * commissionRate(year);
  return { price, units, gross, commission, net: gross - commission };
}

export function buy(s: LifeState, id: string, money: number): boolean {
  const d = s.desk;
  if (!d || !deskAccess(s).ok) return false;
  const spend = Math.min(money, d.cash);
  const q = quoteBuy(s, id, spend);
  if (!q || q.units <= 0) return false;
  if (!tradable(s).some((i) => i.id === id)) return false;
  const before = deskValue(s);
  d.cash -= spend;
  addFee(s, q.commission + (q.price - (quote(s, id) ?? q.price)) * q.units);
  const p = d.pos[id] ?? { id, units: 0, cost: 0, since: d.t, lastPrice: quote(s, id)! };
  p.units += q.units;
  p.cost += spend;
  p.lastPrice = quote(s, id)!;
  d.pos[id] = p;
  d.stats.trades++;
  record(s, d.t, `Bought ${fmtUnits(q.units)} ${instrumentName(s, id)} at ${fmtPrice(q.price)} for ${fmt(s, spend)}`);
  trackPerf(s, before);
  return true;
}

export function sell(s: LifeState, id: string, units: number): boolean {
  const d = s.desk;
  const p = d?.pos[id];
  if (!d || !p) return false;
  const n = Math.min(units, p.units);
  const q = quoteSell(s, id, n);
  if (!q || n <= 0) return false;
  const share = n / p.units;
  const basis = p.cost * share;
  const pnl = q.net - basis;
  const before = deskValue(s);
  d.cash += q.net;
  addFee(s, q.commission + ((quote(s, id) ?? q.price) - q.price) * n);
  p.units -= n;
  p.cost -= basis;
  if (p.units <= 1e-9 * Math.max(1, n)) delete d.pos[id];
  d.stats.trades++;
  const name = instrumentName(s, id);
  noteResult(d, name, pnl);
  record(s, d.t, `Sold ${fmtUnits(n)} ${name} at ${fmtPrice(q.price)} for ${fmt(s, q.net)}`, pnl);
  trackPerf(s, before);
  return true;
}

export function placeOrder(s: LifeState, o: Omit<DeskOrder, "id" | "placed">): DeskOrder | null {
  const d = s.desk;
  if (!d || o.price <= 0 || o.amount <= 0) return null;
  if (o.side === "sell" && !d.pos[o.inst]) return null;
  const order: DeskOrder = { ...o, id: `o${d.nextId++}`, placed: d.t };
  d.orders.push(order);
  const what = o.side === "buy" ? `buy ${fmt(s, o.amount)} of` : `sell ${fmtUnits(o.amount)}`;
  record(s, d.t, `Order placed: ${what} ${instrumentName(s, o.inst)} ${o.kind === "stop" ? "if it falls to" : o.side === "buy" ? "at or below" : "at or above"} ${fmtPrice(o.price)}`);
  return order;
}

export function cancelOrder(s: LifeState, id: string): void {
  const d = s.desk;
  if (!d) return;
  d.orders = d.orders.filter((o) => o.id !== id);
}

// ------------------------------------------------------------------ the clock

/** Headlines for a month, worldwide or for this country. */
export function headlines(s: LifeState, t: number, majorOnly = false): string[] {
  const y = yearOfT(t);
  const m = (((t % 12) + 12) % 12) + 1;
  return MONTH_NEWS.filter((n) => n.y === y && n.m === m && (!n.iso || n.iso.includes(s.country)) && (!majorOnly || n.major)).map((n) => n.text);
}

/** Play one month: prices move, dividends and fees post, companies exit, standing orders fill. */
export function stepMonth(s: LifeState): string[] {
  const d = s.desk;
  if (!d || d.t >= deskYearEnd(s)) return [];
  const before = deskValue(s);
  d.t++;
  const t = d.t;
  const y = yearOfT(t);
  const events: string[] = [];
  d.cash *= 1 + ec(s, y).dep / 12;
  for (const p of Object.values(d.pos)) {
    const name = instrumentName(s, p.id);
    if (p.id.startsWith("co:")) {
      const c = companyById(p.id, s.macroSeed);
      if (c && t >= c.endT && c.fate !== "alive") {
        const px = priceOf(p.id, s.macroSeed, c.endT, s.country) ?? 0;
        const value = p.units * px;
        const pnl = value - p.cost;
        d.cash += value;
        noteResult(d, name, pnl);
        delete d.pos[p.id];
        d.orders = d.orders.filter((o) => o.inst !== p.id);
        const text = c.fate === "bust" ? `${name} goes bust. Your shares are worth ${fmt(s, value)}` : `${name} is bought out at ${fmtPrice(px)} a share. You get ${fmt(s, value)}`;
        record(s, t, text, pnl);
        events.push(text);
        continue;
      }
    }
    const px = priceOf(p.id, s.macroSeed, t, s.country);
    if (px == null) continue;
    const div = p.units * px * monthlyDividendRate(p.id, t);
    if (div > 0) {
      d.cash += div;
      d.stats.dividends += div;
      d.yearGain += div;
    }
    if (!p.id.startsWith("co:")) {
      const fee = fundFee(y) / 12 + (p.id === "spx" ? s.access.globalFriction / 12 : 0);
      addFee(s, p.units * px * fee);
      p.units *= 1 - fee;
    }
    const move = p.lastPrice > 0 ? px / p.lastPrice - 1 : 0;
    if (Math.abs(move) >= 0.1) events.push(`${name} ${move > 0 ? "jumps" : "falls"} ${Math.abs(move * 100).toFixed(0)}%`);
    p.lastPrice = px;
  }
  // the local market's big months, even if you hold none of it
  if (s.access.localEq) {
    const iso = s.country;
    const move = indexLevel(iso, s.macroSeed, t) / indexLevel(iso, s.macroSeed, t - 1) - 1;
    if (Math.abs(move) >= 0.1 && !d.pos[`idx:${iso}`]) events.push(`${indexName(iso)} ${move > 0 ? "jumps" : "falls"} ${Math.abs(move * 100).toFixed(0)}% this month`);
  }
  trackPerf(s, before); // order fills below track their own costs
  for (const o of [...d.orders]) {
    const px = priceOf(o.inst, s.macroSeed, t, s.country);
    if (px == null) {
      cancelOrder(s, o.id);
      continue;
    }
    const hit = o.kind === "stop" ? px <= o.price : o.side === "buy" ? px <= o.price : px >= o.price;
    if (!hit) continue;
    cancelOrder(s, o.id);
    const name = instrumentName(s, o.inst);
    const ok = o.side === "buy" ? buy(s, o.inst, Math.min(o.amount, d.cash)) : sell(s, o.inst, Math.min(o.amount, d.pos[o.inst]?.units ?? 0));
    events.push(ok ? `Your ${o.kind === "stop" ? "stop-loss" : "limit"} order on ${name} filled at about ${fmtPrice(px)}` : `Your order on ${name} couldn't fill`);
  }
  events.push(...headlines(s, t, true));
  return events;
}

/** Keep playing months until something needs you, or the year ends. */
export function runUntilSomething(s: LifeState): { events: string[]; months: number } {
  let months = 0;
  while (s.desk && s.desk.t < deskYearEnd(s)) {
    const ev = stepMonth(s);
    months++;
    if (ev.length) return { events: ev, months };
  }
  return { events: [], months };
}

/** Year end: play the rest of the year, pay tax on gains, write a line in the life log. */
export function finishDeskYear(s: LifeState): void {
  const d = s.desk;
  if (!d) return;
  if (d.t < yearStartT(s.year)) d.t = yearStartT(s.year); // a desk left alone since an earlier year
  const startValue = Number(s.flags.deskYearStart ?? deskValue(s));
  const flowsBefore = d.stats.deposited - d.stats.withdrawn;
  while (d.t < deskYearEnd(s)) stepMonth(s);
  const tax = Math.max(0, d.yearGain) * gainsTaxRate(s);
  if (tax > 0) {
    const fromDesk = Math.min(tax, d.cash);
    d.cash -= fromDesk;
    if (tax > fromDesk) pay(s, tax - fromDesk);
    d.stats.taxes += tax;
    d.stats.costsReal += real(s, tax);
    record(s, d.t, `Tax on this year's gains: ${fmt(s, tax)}`);
  }
  d.yearGain = 0;
  const flows = d.stats.deposited - d.stats.withdrawn - Number(s.flags.deskFlowsStart ?? flowsBefore);
  const change = deskValue(s) - startValue - flows;
  if (Object.keys(d.pos).length || Math.abs(change) > 0.5 || d.cash > 0.5) {
    const v = deskValue(s);
    log(s, `Trading account: ${change >= 0 ? "up" : "down"} ${fmt(s, Math.abs(change))} this year, worth ${fmt(s, v)}.`, "money");
  }
  delete s.flags.deskYearStart;
  delete s.flags.deskFlowsStart;
}

/** Called when a new year begins, so the year-end summary can measure the year. */
export function markDeskYearStart(s: LifeState): void {
  if (!s.desk) return;
  s.flags.deskYearStart = deskValue(s);
  s.flags.deskFlowsStart = s.desk.stats.deposited - s.desk.stats.withdrawn;
}

/** Sell everything and move it to savings: emigration, bankruptcy. */
export function liquidateDesk(s: LifeState, why: string): number {
  const d = s.desk;
  if (!d) return 0;
  for (const id of Object.keys(d.pos)) sell(s, id, d.pos[id].units);
  d.orders = [];
  const cash = d.cash;
  withdraw(s, cash);
  if (cash > 0.5) record(s, d.t, why);
  return cash;
}

/** Share of the account lost to a divorce settlement or a court. */
export function shrinkDesk(s: LifeState, share: number): void {
  const d = s.desk;
  if (!d) return;
  d.cash *= 1 - share;
  for (const p of Object.values(d.pos)) {
    p.units *= 1 - share;
    p.cost *= 1 - share;
  }
}

export { deskValue, monthLabel };
