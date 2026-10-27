// The trading desk: a brokerage account played month by month inside the
// current year. Orders fill at the month's average price, plus a spread and the
// commission of the era. You can only buy with money you have and only sell what
// you own: no borrowing, no short selling. At year end the remaining months play
// out on their own, gains are taxed, and the account's value counts in net worth.
// Coins trade here too: they sit on the exchange, which can fail, or in your own
// wallet, whose keys can be lost, and some countries ban them. So do gold and
// silver, bought from a dealer and later through funds, where owning gold is legal.

import { CRYPTO_FAILURES, cryptoBan, goldRule, MONTH_NEWS } from "./history";
import {
  coinDef, companyById, COINS, deskValue, fxAt, indexLevel, indexName, instruments, metalDef, METALS, monthLabel, monthlyDividendRate,
  monthOfT, priceOf, tOf, yearOfT, yearStartT, type Instrument,
} from "./markets";
import { toIntl2021 } from "./macro";
import { addMove, caughtInFailure, ec, fmt, gainsTaxRate, invest, liquid, log, pay, raiseCash } from "./ops";
import { stream } from "./rng";
import type { DeskOrder, DeskState, LifeState } from "./types";
import { country } from "./world";

const TRADES_KEPT = 250;

/** Commission as a share of the trade: fixed brokerage until the mid-1970s, near zero today. */
export function commissionRate(year: number): number {
  return year < 1975 ? 0.015 : year < 1990 ? 0.008 : year < 2000 ? 0.004 : year < 2013 ? 0.0015 : 0.0005;
}

/** Exchange fee on a coin trade: Mt. Gox took 0.6%; big exchanges charge about 0.1% today. */
export function cryptoFee(year: number): number {
  return year < 2014 ? 0.006 : year < 2018 ? 0.0025 : year < 2022 ? 0.0015 : 0.001;
}

/** Commission, or the exchange's fee for coins, as a share of the trade. A bullion dealer's cut is all in the spread. */
export function feeRate(id: string, year: number): number {
  if (id.startsWith("mt:")) return year >= (metalDef(id.slice(3))?.etf ?? 2005) ? commissionRate(year) : 0;
  return id.startsWith("cc:") ? cryptoFee(year) : commissionRate(year);
}

/** Bid-ask spread paid on each trade (half on the way in, half on the way out). Early coin markets were thin. */
export function spreadOf(id: string, year = 2026): number {
  if (id.startsWith("cc:")) return (coinDef(id.slice(3))?.spread ?? 0.01) * (year < 2014 ? 4 : year < 2017 ? 2 : 1);
  if (id.startsWith("mt:")) {
    const m = metalDef(id.slice(3));
    return m ? m.spread[year >= m.etf ? 1 : 0] : 0.02;
  }
  return id.startsWith("idx:") ? 0.002 : id === "spx" ? 0.004 : 0.008;
}

/**
 * Extra spread where the rules push trading sideways: coins traded person to person where banks
 * won't serve exchanges, or they're banned (about 2% worse each way), and gold bought as coins
 * where bars are off limits (a 3% premium each way).
 */
function sideSpread(s: LifeState, id: string): number {
  const t = s.desk?.t ?? yearStartT(s.year);
  if (id.startsWith("cc:")) return cryptoBan(s.country, yearOfT(t), monthOfT(t)) ? 0.04 : 0;
  if (id === "mt:XAU") return goldRule(s.country, yearOfT(t), monthOfT(t)) ? 0.06 : 0;
  return 0;
}

/** Yearly cost of holding a metal: storage and insurance at a dealer, later a fund's fee. */
export function metalFee(id: string, year: number): number {
  const m = metalDef(id.slice(3));
  return m ? m.fee[year >= m.etf ? 1 : 0] : 0;
}

/** What it costs to move coins between the exchange and your own wallet: a network fee. */
export const WALLET_FEE = 0.002;

/** Yearly fund fee: the first index funds charged far more than today's. */
export function fundFee(year: number): number {
  return year < 1976 ? 0.015 : year < 2000 ? 0.008 : year < 2015 ? 0.004 : 0.0015;
}

export interface DeskAccess {
  ok: boolean;
  reason?: string;
  local: boolean;
  global: boolean;
  crypto: boolean; // coins can be bought
  cryptoNote?: string; // a ban, or trading person to person
  metals: string[]; // gold and silver that can be bought
  metalNote?: string; // a rule on owning gold
}

export function deskAccess(s: LifeState): DeskAccess {
  const local = s.access.localEq;
  const global = s.access.globalEq;
  const t = s.desk?.t ?? yearStartT(s.year);
  const ban = cryptoBan(s.country, yearOfT(t), monthOfT(t));
  const listed = COINS.some((c) => priceOf(`cc:${c.sym}`, s.macroSeed, t, s.country) != null);
  const crypto = s.access.bank && s.age >= 18 && listed && ban?.kind !== "closed";
  const cryptoNote = !listed || !ban
    ? undefined
    : ban.kind === "closed"
      ? "Crypto trading is banned here. You can still sell coins you hold, person to person, about 2% worse"
      : "Banks here won't serve crypto exchanges, so coins change hands person to person, about 2% worse each way";
  const rule = goldRule(s.country, yearOfT(t), monthOfT(t));
  const quoted = METALS.filter((m) => priceOf(`mt:${m.sym}`, s.macroSeed, t, s.country) != null).map((m) => m.sym);
  // gold only where owning it is allowed, if only as coins; silver everywhere
  const metals = s.access.bank && s.age >= 18 ? quoted.filter((sym) => sym !== "XAU" || !rule || rule.kind === "coins") : [];
  const base = { local, global, crypto, cryptoNote, metals, metalNote: rule && quoted.includes("XAU") ? rule.text : undefined };
  if (!s.alive) return { ok: false, reason: "This life is over", ...base };
  if (s.age < 18) return { ok: false, reason: "You can open a trading account at 18", ...base };
  if (!s.access.bank) return { ok: false, reason: "You need a bank account first", ...base };
  if (!local && !global && !crypto && !metals.length) {
    const mkt = country(s.country).mkt;
    const reason = mkt == null ? "There's no stock market here, and you can't invest abroad" : s.year < mkt ? `The stock market here opens in ${mkt}` : "Nothing you can buy yet";
    return { ok: !!s.desk && Object.keys(s.desk.pos).length > 0, reason, ...base };
  }
  return { ok: true, ...base };
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
  return instruments(s.country, s.macroSeed, d ? d.t : yearStartT(s.year), { local: a.local, global: a.global, crypto: a.crypto, metals: a.metals });
}

export function quote(s: LifeState, id: string, t = s.desk?.t ?? yearStartT(s.year)): number | null {
  return priceOf(id, s.macroSeed, t, s.country);
}

export function instrumentName(s: LifeState, id: string): string {
  if (id === "spx") return "S&P 500 fund";
  if (id.startsWith("idx:")) return `${indexName(id.slice(4))} fund`;
  if (id.startsWith("cc:")) return coinDef(id.slice(3))?.name ?? id.slice(3);
  if (id.startsWith("mt:")) return metalDef(id.slice(3))?.name ?? id.slice(3);
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
  const commission = money * feeRate(id, year);
  const price = px * (1 + (spreadOf(id, year) + sideSpread(s, id)) / 2);
  return { price, units: (money - commission) / price, gross: money - commission, commission, net: money };
}

export function quoteSell(s: LifeState, id: string, units: number): TradeQuote | null {
  const px = quote(s, id);
  if (px == null || units <= 0) return null;
  const year = yearOfT(s.desk?.t ?? yearStartT(s.year));
  const price = px * (1 - (spreadOf(id, year) + sideSpread(s, id)) / 2);
  const gross = units * price;
  const commission = gross * feeRate(id, year);
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
  const p = d.pos[id] ?? { id, units: 0, cost: 0, since: d.t, lastPrice: quote(s, id)!, ...(id.startsWith("cc:") ? { custody: "exchange" as const } : {}) };
  // coins bought for a wallet are sent on to it
  const sent = p.custody === "wallet" ? q.units * WALLET_FEE : 0;
  if (sent) addFee(s, sent * quote(s, id)!);
  p.units += q.units - sent;
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
  if (p.custody === "wallet") setCustody(s, id, "exchange"); // coins go back to the exchange to be sold
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

/** Move a coin between the exchange and your own wallet, for a network fee. */
export function setCustody(s: LifeState, id: string, to: "exchange" | "wallet"): boolean {
  const d = s.desk;
  const p = d?.pos[id];
  if (!d || !p || !id.startsWith("cc:") || (p.custody ?? "exchange") === to) return false;
  const before = deskValue(s);
  const fee = p.units * WALLET_FEE;
  addFee(s, fee * (quote(s, id) ?? p.lastPrice));
  p.units -= fee;
  p.custody = to;
  record(s, d.t, to === "wallet" ? `Moved your ${instrumentName(s, id)} to your own wallet` : `Moved your ${instrumentName(s, id)} back to the exchange`);
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
    if (p.id.startsWith("idx:") || p.id === "spx" || p.id.startsWith("mt:")) {
      const fee = p.id.startsWith("mt:") ? metalFee(p.id, y) / 12 : fundFee(y) / 12 + (p.id === "spx" ? s.access.globalFriction / 12 : 0);
      addFee(s, p.units * px * fee);
      p.units *= 1 - fee;
    }
    const move = p.lastPrice > 0 ? px / p.lastPrice - 1 : 0;
    if (Math.abs(move) >= (p.id.startsWith("cc:") ? 0.3 : 0.1)) events.push(`${name} ${move > 0 ? "jumps" : "falls"} ${Math.abs(move * 100).toFixed(0)}%`);
    p.lastPrice = px;
  }
  events.push(...cryptoMonth(s, t), ...metalMonth(s, t));
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

// ------------------------------------------------------------------ coins: custody, failures, bans

const coinIds = (d: DeskState) => Object.keys(d.pos).filter((id) => id.startsWith("cc:"));

/** A month's crypto risks: failed exchanges, lost keys, repayments and bans. Returns what to tell the player. */
function cryptoMonth(s: LifeState, t: number): string[] {
  const d = s.desk!;
  const out: string[] = [];
  const y = yearOfT(t);
  const m = monthOfT(t);
  const held = coinIds(d);
  // an exchange fails with your coins inside
  for (const f of CRYPTO_FAILURES) {
    if (tOf(f.at[0], f.at[1]) !== t || (f.where && !f.where.includes(s.country))) continue;
    const there = held.filter((id) => (d.pos[id].custody ?? "exchange") === "exchange");
    if (!there.length || !caughtInFailure(s, f)) continue;
    let lost = 0;
    let usd = 0;
    const coins: Record<string, number> = {};
    for (const id of there) {
      const p = d.pos[id];
      const px = priceOf(id, s.macroSeed, t, s.country) ?? p.lastPrice;
      lost += p.units * px;
      usd += p.units * px / fxAt(s.country, s.macroSeed, t);
      coins[id] = p.units;
      noteResult(d, `${instrumentName(s, id)} lost at ${f.name}`, -p.cost);
      delete d.pos[id];
      d.orders = d.orders.filter((o) => o.inst !== id);
    }
    if (f.repay) {
      const share = f.repay.share;
      const at = tOf(f.repay.at[0], f.repay.at[1]);
      d.claims = [...(d.claims ?? []), f.repay.kind === "coins"
        ? { name: f.name, at, kind: "coins", coins: Object.fromEntries(Object.entries(coins).map(([k, u]) => [k, u * share])), text: f.repay.text }
        : { name: f.name, at, kind: "cash", usd: usd * share, text: f.repay.text }];
    }
    const text = `${f.text} ${fmt(s, lost)} gone${f.repay ? ", for now" : ""}.`;
    record(s, t, text, -lost);
    log(s, text, "bad");
    out.push(text);
  }
  // keys to a wallet can be lost: about one wallet in a hundred a year
  const inWallet = coinIds(d).filter((id) => d.pos[id].custody === "wallet");
  if (inWallet.length && stream(s.seed, "keys", t).next() < 0.001) {
    let lost = 0;
    for (const id of inWallet) {
      const p = d.pos[id];
      lost += p.units * (priceOf(id, s.macroSeed, t, s.country) ?? p.lastPrice);
      noteResult(d, `${instrumentName(s, id)} (lost keys)`, -p.cost);
      delete d.pos[id];
      d.orders = d.orders.filter((o) => o.inst !== id);
    }
    const text = `You can't find the keys to your wallet. ${fmt(s, lost)} in coins is locked away for good.`;
    record(s, t, text, -lost);
    log(s, text, "bad");
    out.push(text);
  }
  // repayments from failed exchanges
  for (const c of [...(d.claims ?? [])]) {
    if (c.at > t) continue;
    d.claims = (d.claims ?? []).filter((x) => x !== c);
    let value = 0;
    if (c.kind === "cash") {
      value = (c.usd ?? 0) * fxAt(s.country, s.macroSeed, t);
      d.cash += value;
    } else {
      for (const [id, units] of Object.entries(c.coins ?? {})) {
        const px = priceOf(id, s.macroSeed, t, s.country) ?? 0;
        const v = units * px;
        value += v;
        const p = d.pos[id] ?? { id, units: 0, cost: 0, since: t, lastPrice: px, custody: "exchange" as const };
        p.units += units;
        p.cost += v;
        d.pos[id] = p;
      }
    }
    noteResult(d, `${c.name} repayment`, value);
    const text = `${c.text.replace(/\.$/, "")} (${fmt(s, value)}).`;
    record(s, t, text, value);
    log(s, text, "good");
    out.push(text);
  }
  // bans and the news, for people who hold coins
  if (coinIds(d).length || held.length) {
    const ban = cryptoBan(s.country, y, m);
    const prevT = t - 1;
    if (ban && ban !== cryptoBan(s.country, yearOfT(prevT), monthOfT(prevT))) out.push(ban.text);
    const told = (text: string) => out.some((o) => CRYPTO_FAILURES.some((f) => o.includes(f.name) && text.includes(f.name)));
    out.push(...MONTH_NEWS.filter((n) => n.crypto && n.y === y && n.m === m && (!n.iso || n.iso.includes(s.country)) && !told(n.text)).map((n) => n.text));
  }
  return out;
}

/** Gold rules starting or ending here, and gold and silver headlines for people who hold metal. */
function metalMonth(s: LifeState, t: number): string[] {
  const out: string[] = [];
  const now = goldRule(s.country, yearOfT(t), monthOfT(t));
  const before = goldRule(s.country, yearOfT(t - 1), monthOfT(t - 1));
  const listed = priceOf("mt:XAU", s.macroSeed, t, s.country) != null;
  if (listed && now !== before) {
    const text = now ? now.text : before?.end;
    if (text) out.push(text);
  }
  if (Object.keys(s.desk!.pos).some((id) => id.startsWith("mt:"))) {
    const y = yearOfT(t);
    const m = monthOfT(t);
    out.push(...MONTH_NEWS.filter((n) => n.metal && n.y === y && n.m === m && (!n.iso || n.iso.includes(s.country))).map((n) => n.text));
  }
  return out;
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
    if (tax > fromDesk) {
      pay(s, tax - fromDesk);
      addMove(s, "desk", -(tax - fromDesk));
    }
    d.stats.taxes += tax;
    d.stats.costsReal += real(s, tax);
    record(s, d.t, `Tax on this year's gains: ${fmt(s, tax)}`);
  }
  d.yearGain = 0;
  const flows = d.stats.deposited - d.stats.withdrawn - Number(s.flags.deskFlowsStart ?? flowsBefore);
  const change = deskValue(s) - startValue - flows;
  addMove(s, "desk", change);
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
