// Monthly market history for the trading desk. Where the data has real monthly
// prices (OECD share indices, Shiller's S&P 500, Kenneth French's US industries,
// blockchain.com's and Kraken's coin prices, the World Bank's gold and silver) the desk replays them; everywhere
// else — countries without data, gaps, and
// every year after the data ends — the twelve months are drawn so they compound
// exactly to the yearly return the life engine already uses. Draws come from
// streams keyed by the life's macroSeed, so the market is part of the world:
// the same for everyone born into it, whatever they trade.

import { calibration, econ, FIRST_YEAR, LAST_YEAR } from "./macro";
import { stream, type Rng } from "./rng";
import type { LifeState } from "./types";
import { country, onWorldChange } from "./world";

export interface MarketsData {
  v: number;
  generated: string;
  m0: number; // data month 0 is January of this year
  share: Record<string, [number, (number | null)[]]>;
  usDiv: [number, (number | null)[]]; // S&P 500 dividends, annualized, aligned with share.USA
  dy: Record<string, [number, (number | null)[]]>; // yearly dividend yields (JST)
  ind: { start: number; names: string[]; r: Record<string, (number | null)[]> }; // % × 100
  cc?: Record<string, [number, (number | null)[]]>; // coins: monthly average USD prices
  mt?: Record<string, [number, (number | null)[]]>; // gold and silver: monthly average USD per troy ounce
  sources: string[];
}

let MD: MarketsData | null = null;
const cache = new Map<string, unknown>(); // paths and company lists
const small = new Map<string, unknown>(); // yearly dividend yields, industry themes
let indMean: Float64Array | null = null; // average industry log return per data month
const clearAll = () => {
  cache.clear();
  small.clear();
  indMean = null;
};
onWorldChange(clearAll);

export function setMarkets(md: MarketsData): void {
  MD = md;
  clearAll();
}

export function hasMarkets(): boolean {
  return MD !== null;
}

// ------------------------------------------------------------------ months

export const N_MONTHS = (LAST_YEAR - FIRST_YEAR + 1) * 12;
export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Month index: 0 is January of FIRST_YEAR. A price "at t" is that month's average. */
export function tOf(year: number, month: number): number {
  return (year - FIRST_YEAR) * 12 + month - 1;
}
export function yearOfT(t: number): number {
  return FIRST_YEAR + Math.floor(t / 12);
}
export function monthOfT(t: number): number {
  return (((t % 12) + 12) % 12) + 1;
}
export function monthLabel(t: number): string {
  return `${MONTHS[monthOfT(t) - 1]} ${yearOfT(t)}`;
}
/** The last month before `year` starts: where a fresh year's desk opens. */
export function yearStartT(year: number): number {
  return tOf(year, 1) - 1;
}

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

function memoIn<T>(store: Map<string, unknown>, limit: number, key: string, make: () => T): T {
  if (store.has(key)) return store.get(key) as T;
  if (store.size > limit) store.clear();
  const v = make();
  store.set(key, v);
  return v;
}
const memo = <T>(key: string, make: () => T) => memoIn(cache, 600, key, make);
const memoSmall = <T>(key: string, make: () => T) => memoIn(small, 50000, key, make);

/** Real monthly value from the data, by engine month index. */
function dataAt(series: [number, (number | null)[]] | undefined, t: number): number | null {
  if (!MD || !series) return null;
  const k = t - tOf(MD.m0, 1) - series[0];
  if (k < 0 || k >= series[1].length) return null;
  return series[1][k] ?? null;
}

// ------------------------------------------------------------------ dividends

/** Yearly dividend yield of a country's index: real where recorded, else a typical level. */
export function dividendYield(iso: string, year: number): number {
  return memoSmall(`dy|${iso}|${year}`, () => {
    if (!MD) return 0.025;
    if (iso === "USA") {
      const vals: number[] = [];
      for (let m = 1; m <= 12; m++) {
        const p = dataAt(MD.share.USA, tOf(year, m));
        const d = dataAt(MD.usDiv, tOf(year, m));
        if (p && d) vals.push(d / p);
      }
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0.02;
    }
    const s = MD.dy[iso];
    if (!s) return 0.025;
    const k = clamp(year - s[0], 0, s[1].length - 1);
    for (let d = 0; d < s[1].length; d++) {
      const v = s[1][k - d] ?? s[1][k + d];
      if (v != null) return clamp(v, 0, 0.1);
    }
    return 0.025;
  });
}

// ------------------------------------------------------------------ index paths

export interface IndexPath {
  iso: string;
  level: Float64Array; // level[t + 1] = index level at month t; level[0] is the December before FIRST_YEAR
  real: Uint8Array; // 1 where the month replays real data
}

function realYear(iso: string, macroSeed: number, year: number): boolean {
  if (!MD) return false;
  const series = MD.share[iso];
  if (!series || !econ(iso, macroSeed, year).real.eq) return false;
  for (let m = 0; m <= 12; m++) if (!dataAt(series, tOf(year, 1) - 1 + m)) return false;
  return true;
}

/** Twelve monthly log returns that add up to `total` exactly: a Brownian bridge with fat tails. */
function bridge(r: Rng, total: number, sdMonth: number): number[] {
  const z = Array.from({ length: 12 }, () => r.fat(0, 1));
  const zbar = z.reduce((a, b) => a + b, 0) / 12;
  return z.map((x) => total / 12 + sdMonth * (x - zbar));
}

/** A country's stock index, month by month: price only (dividends are paid on top). */
export function indexPath(iso: string, macroSeed: number): IndexPath {
  return memo(`idx|${iso}|${macroSeed}`, () => {
    const level = new Float64Array(N_MONTHS + 1);
    const real = new Uint8Array(N_MONTHS);
    const series = MD?.share[iso];
    const sdMonth = calibration(iso).eqVol / Math.sqrt(12);
    level[0] = 1;
    let anchor: { t: number; v: number } | null = null;
    for (let y = FIRST_YEAR; y <= LAST_YEAR; y++) {
      const t0 = tOf(y, 1);
      let rets: number[];
      if (realYear(iso, macroSeed, y)) {
        rets = [];
        for (let m = 0; m < 12; m++) rets.push(Math.log(dataAt(series, t0 + m)! / dataAt(series, t0 + m - 1)!));
        for (let m = 0; m < 12; m++) real[t0 + m] = 1;
        if (!anchor) anchor = { t: t0 - 1, v: dataAt(series, t0 - 1)! };
      } else {
        const e = econ(iso, macroSeed, y);
        const total = Math.log(Math.max(0.05, 1 + e.eq)) - Math.log(1 + dividendYield(iso, y));
        rets = bridge(stream(macroSeed, "months", iso, y), total, sdMonth);
      }
      for (let m = 0; m < 12; m++) level[t0 + m + 1] = level[t0 + m] * Math.exp(rets[m]);
    }
    // show real index values where the data has them; otherwise 100 when the market opens
    const opened = country(iso).mkt ?? 2000;
    const ref = anchor ?? { t: yearStartT(clamp(opened, FIRST_YEAR + 1, 2000)), v: 100 };
    const scale = ref.v / level[ref.t + 1];
    for (let i = 0; i < level.length; i++) level[i] *= scale;
    return { iso, level, real };
  });
}

export function indexLevel(iso: string, macroSeed: number, t: number): number {
  return indexPath(iso, macroSeed).level[clamp(t, -1, N_MONTHS - 1) + 1];
}

/** Local currency per US dollar in month t, from the yearly averages (read as mid-year values). */
export function fxAt(iso: string, macroSeed: number, t: number): number {
  if (iso === "USA") return 1;
  const pos = (t + 0.5) / 12 + FIRST_YEAR - 0.5; // fractional year measured from mid-years
  const y0 = clamp(Math.floor(pos), FIRST_YEAR, LAST_YEAR);
  const y1 = clamp(y0 + 1, FIRST_YEAR, LAST_YEAR);
  const w = clamp(pos - y0, 0, 1);
  const a = econ(iso, macroSeed, y0).fx;
  const b = econ(iso, macroSeed, y1).fx;
  return a > 0 && b > 0 ? Math.exp((1 - w) * Math.log(a) + w * Math.log(b)) : a || b || 1;
}

// ------------------------------------------------------------------ companies

export interface SectorDef {
  key: string;
  label: string;
  ind: string; // French industry
  from: number; // first year such companies list
  weight: number;
  names: string[];
}

export const SECTORS: SectorDef[] = [
  { key: "bank", label: "Banking", ind: "Banks", from: 0, weight: 3, names: ["Bank", "Savings Bank", "Trust", "Commercial Bank", "Bancorp"] },
  { key: "insur", label: "Insurance", ind: "Insur", from: 0, weight: 1, names: ["Insurance", "Assurance", "Life", "Mutual"] },
  { key: "prop", label: "Property", ind: "RlEst", from: 0, weight: 1.4, names: ["Properties", "Estates", "Land", "Developers", "Realty"] },
  { key: "oil", label: "Oil & gas", ind: "Oil", from: 0, weight: 1.4, names: ["Petroleum", "Oil", "Energy", "Gas"] },
  { key: "util", label: "Utilities", ind: "Util", from: 0, weight: 1, names: ["Power", "Electric", "Water", "Light & Power"] },
  { key: "mine", label: "Mining", ind: "Mines", from: 0, weight: 1, names: ["Mining", "Minerals", "Metals", "Resources"] },
  { key: "steel", label: "Steel", ind: "Steel", from: 0, weight: 0.9, names: ["Steel", "Iron & Steel", "Steelworks"] },
  { key: "chem", label: "Chemicals", ind: "Chems", from: 0, weight: 0.9, names: ["Chemicals", "Chemical", "Materials"] },
  { key: "auto", label: "Cars", ind: "Autos", from: 0, weight: 1, names: ["Motors", "Motor Co.", "Automotive"] },
  { key: "trans", label: "Airlines & shipping", ind: "Trans", from: 0, weight: 1, names: ["Airways", "Shipping", "Lines", "Logistics"] },
  { key: "tel", label: "Telecoms", ind: "Telcm", from: 0, weight: 1, names: ["Telecom", "Telephone", "Communications"] },
  { key: "hw", label: "Computers", ind: "Hardw", from: 1955, weight: 0.9, names: ["Computers", "Electronics", "Data"] },
  { key: "chip", label: "Chips", ind: "Chips", from: 1960, weight: 0.8, names: ["Semiconductor", "Micro", "Silicon"] },
  { key: "soft", label: "Software", ind: "Softw", from: 1975, weight: 1.3, names: ["Software", "Systems", "Digital", "Networks"] },
  { key: "pharma", label: "Pharma", ind: "Drugs", from: 0, weight: 1.1, names: ["Pharma", "Pharmaceuticals", "Health", "Labs"] },
  { key: "food", label: "Food & drink", ind: "Food", from: 0, weight: 1.4, names: ["Foods", "Breweries", "Beverages", "Dairy", "Mills"] },
  { key: "retail", label: "Retail", ind: "Rtail", from: 0, weight: 1.4, names: ["Stores", "Retail", "Mart", "Supermarkets"] },
  { key: "build", label: "Construction", ind: "Cnstr", from: 0, weight: 1, names: ["Construction", "Builders", "Cement", "Engineering"] },
  { key: "media", label: "Media", ind: "Fun", from: 0, weight: 0.7, names: ["Media", "Pictures", "Broadcasting", "Publishing"] },
  { key: "cloth", label: "Clothing", ind: "Clths", from: 0, weight: 0.7, names: ["Textiles", "Apparel", "Garments"] },
  { key: "mach", label: "Machinery", ind: "Mach", from: 0, weight: 0.9, names: ["Machinery", "Industries", "Heavy Industries"] },
];
const SECTOR = Object.fromEntries(SECTORS.map((s) => [s.key, s]));

const PREFIXES = [
  "National", "Union", "First", "Pacific", "Atlas", "Golden", "Summit", "Meridian", "Crescent", "Pioneer", "Liberty",
  "Continental", "Royal", "Eastern", "Western", "Northern", "Southern", "Central", "United", "Sterling", "Harbour",
  "Evergreen", "Horizon", "Keystone", "Unity", "Phoenix", "Delta", "Apex", "Orion", "Granite", "Riverside", "Highland",
  "Coastal", "Imperial", "Capital", "Metro", "Prime", "Silver", "Bright", "Lotus", "Cedar", "Falcon", "Beacon",
];

export interface Company {
  id: string;
  iso: string;
  name: string;
  sector: string;
  listT: number;
  endT: number; // last month it trades
  fate: "bust" | "bought" | "alive";
  beta: number;
  gamma: number; // how closely it follows its industry
  drift: number; // yearly, on top of the market
  vol: number; // yearly idiosyncratic volatility
  boost: number; // extra yearly drift while a breakout winner
  boostFrom: number;
  boostTo: number;
  premium: number; // takeover premium
  ipo: number; // listing price
}

const SLOTS = 10;

function niceIpo(raw: number): number {
  if (!(raw > 0)) return 10;
  const p = 10 ** Math.floor(Math.log10(raw));
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= raw) return m * p;
  return 10 * p;
}

/** Every company that lists on a country's exchange between its opening and LAST_YEAR. */
export function companies(iso: string, macroSeed: number): Company[] {
  return memo(`cos|${iso}|${macroSeed}`, () => {
    const opened = country(iso).mkt;
    if (opened == null) return [];
    const openT = tOf(Math.max(opened, FIRST_YEAR), 1);
    const out: Company[] = [];
    const used = new Set<string>();
    for (let slot = 0; slot < SLOTS; slot++) {
      let t = openT + (slot < 6 ? 0 : slot * 3);
      for (let k = 0; t < N_MONTHS - 12 && k < 60; k++) {
        const r = stream(macroSeed, "company", iso, slot, k);
        const year = yearOfT(t);
        const eligible = SECTORS.filter((s) => year >= s.from);
        const sec = r.weighted(eligible, (s) => s.weight);
        let name = "";
        for (let tries = 0; tries < 12 && (!name || used.has(name)); tries++) name = `${r.pick(PREFIXES)} ${r.pick(sec.names)}`;
        used.add(name);
        // fate: a yearly hazard that rises in crashes, and for banks in banking crises
        const hazard = r.range(0.012, 0.035);
        let fate: Company["fate"] = "alive";
        let endT = N_MONTHS - 1;
        for (let y = year; y <= LAST_YEAR; y++) {
          const e = econ(iso, macroSeed, y);
          const mult = (e.crash ? 2.5 : 1) * (e.bankCrisis && (sec.key === "bank" || sec.key === "prop") ? 4 : 1) * (e.boom ? 0.6 : 1);
          const u = r.next();
          const when = Math.max(t + 9, tOf(y, r.int(1, 12)));
          if (u < hazard * mult) {
            fate = "bust";
            endT = when;
            break;
          }
          if (u < hazard * mult + 0.022) {
            fate = "bought";
            endT = when;
            break;
          }
        }
        const rocket = r.chance(0.05);
        const boostFrom = t + r.int(0, 120);
        out.push({
          id: `co:${iso}:${slot}:${k}`,
          iso,
          name,
          sector: sec.key,
          listT: t,
          endT: Math.min(endT, N_MONTHS - 1),
          fate,
          beta: r.range(0.7, 1.4),
          gamma: r.range(0.7, 1.2),
          drift: r.range(-0.05, 0.015),
          vol: r.range(0.18, 0.42),
          boost: rocket ? r.range(0.25, 0.6) : 0,
          boostFrom,
          boostTo: boostFrom + 12 * r.int(3, 8),
          premium: r.range(1.2, 1.5),
          ipo: niceIpo(econ(iso, macroSeed, year).wage / 250),
        });
        t = endT + 1 + r.int(2, 30);
      }
    }
    return out;
  });
}

export function companyById(id: string, macroSeed: number): Company | null {
  const iso = id.split(":")[1];
  if (!iso) return null;
  return companies(iso, macroSeed).find((c) => c.id === id) ?? null;
}

function industryMean(k: number): number {
  if (!MD) return 0;
  if (!indMean) {
    const n = MD.ind.r[MD.ind.names[0]].length;
    indMean = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let sum = 0;
      let cnt = 0;
      for (const name of MD.ind.names) {
        const v = MD.ind.r[name][i];
        if (v != null) {
          sum += Math.log(1 + v / 10000);
          cnt++;
        }
      }
      indMean[i] = cnt ? sum / cnt : 0;
    }
  }
  return indMean[k] ?? 0;
}

/** An industry's monthly log return relative to the average industry: real from French's data, else simulated. */
function industryRel(sector: string, macroSeed: number, t: number): number {
  const ind = SECTOR[sector]?.ind;
  if (MD && ind) {
    const k = t - tOf(MD.m0, 1) - MD.ind.start;
    const series = MD.ind.r[ind];
    const own = series?.[k];
    if (own != null) return Math.log(1 + own / 10000) - industryMean(k);
  }
  // simulated industry cycles: a theme for the year plus monthly noise
  const y = yearOfT(t);
  const theme = memoSmall(`theme|${sector}|${macroSeed}|${y}`, () => {
    const r = stream(macroSeed, "sector", sector, y);
    return { drift: r.normal(0, 0.08), noise: Array.from({ length: 12 }, () => r.normal(0, 0.03)) };
  });
  return theme.drift / 12 + theme.noise[monthOfT(t) - 1];
}

/** A company's monthly prices from listing to delisting (index 0 is the listing month). */
export function companyPath(c: Company, macroSeed: number): Float64Array {
  return memo(`co|${c.id}|${macroSeed}`, () => {
    const n = c.endT - c.listT + 1;
    const px = new Float64Array(n);
    const idx = indexPath(c.iso, macroSeed).level;
    const sd = c.vol / Math.sqrt(12);
    let p = c.ipo;
    px[0] = p;
    for (let i = 1; i < n; i++) {
      const t = c.listT + i;
      const r = stream(macroSeed, "comonth", c.id, t);
      const market = Math.log(idx[t + 1] / idx[t]);
      const boost = t >= c.boostFrom && t < c.boostTo ? c.boost : 0;
      let lr = c.beta * market + c.gamma * industryRel(c.sector, macroSeed, t) + (c.drift + boost) / 12 - (sd * sd) / 2 + sd * r.fat(0, 1);
      if (c.fate === "bust" && c.endT - t < 9) lr -= 0.12; // the slide before a collapse
      p *= Math.exp(clamp(lr, -1.5, 1));
      if (t === c.endT) p = c.fate === "bust" ? p * 0.02 : c.fate === "bought" ? p * c.premium : p;
      px[i] = p;
    }
    return px;
  });
}

export function companyPrice(c: Company, macroSeed: number, t: number): number | null {
  if (t < c.listT || t > c.endT) return null;
  return companyPath(c, macroSeed)[t - c.listT];
}

// ------------------------------------------------------------------ coins

export interface CoinDef {
  sym: string;
  name: string;
  spread: number; // bid-ask spread on a big exchange today
  // once the data ends: how it swings with Bitcoin, its own volatility and drift, and a yearly chance of collapse
  beta: number;
  vol: number;
  drift: number;
  hazard: number;
}

export const COINS: CoinDef[] = [
  { sym: "BTC", name: "Bitcoin", spread: 0.002, beta: 1, vol: 0, drift: 0, hazard: 0 },
  { sym: "ETH", name: "Ether", spread: 0.003, beta: 1.15, vol: 0.35, drift: 0.04, hazard: 0.01 },
  { sym: "LTC", name: "Litecoin", spread: 0.005, beta: 1.05, vol: 0.4, drift: 0, hazard: 0.03 },
  { sym: "XRP", name: "XRP", spread: 0.005, beta: 1.1, vol: 0.5, drift: 0.04, hazard: 0.03 },
  { sym: "DOGE", name: "Dogecoin", spread: 0.006, beta: 1.2, vol: 0.6, drift: 0.05, hazard: 0.04 },
  { sym: "SOL", name: "Solana", spread: 0.005, beta: 1.3, vol: 0.5, drift: 0.05, hazard: 0.03 },
  { sym: "LUNA", name: "LUNA (Terra)", spread: 0.01, beta: 1, vol: 0.5, drift: 0, hazard: 0 },
];
const COIN = Object.fromEntries(COINS.map((c) => [c.sym, c]));

export function coinDef(sym: string): CoinDef | null {
  return COIN[sym] ?? null;
}

/** Monthly log returns adding up to `total` over n months, with fat tails. */
function bridgeN(r: Rng, total: number, n: number, sd: number): number[] {
  if (n <= 0) return [];
  const z = Array.from({ length: n }, () => r.fat(0, 1));
  const zbar = z.reduce((a, b) => a + b, 0) / n;
  return z.map((x) => total / n + sd * (x - zbar));
}

/** A coin's recorded months, and the last one: NaN where it has no data. */
function coinData(sym: string): { px: Float64Array; last: number } {
  const px = new Float64Array(N_MONTHS).fill(NaN);
  let last = -1;
  const series = MD?.cc?.[sym];
  if (series) {
    for (let t = 0; t < N_MONTHS; t++) {
      const v = dataAt(series, t);
      if (v != null && v > 0) {
        px[t] = v;
        last = t;
      }
    }
  }
  return { px, last };
}

/**
 * Bitcoin in US dollars, month by month: the recorded monthly averages, then months that end
 * each year at the life engine's year-end price, so the desk and your savings hold the same coin.
 */
function btcPath(macroSeed: number): Float64Array {
  return memo(`cc|BTC|${macroSeed}`, () => {
    const { px, last } = coinData("BTC");
    let t = last;
    for (let y = 2010; t < 0 && y <= LAST_YEAR; y++) {
      const b = econ("USA", macroSeed, y).btc;
      if (b) px[(t = tOf(y, 12))] = b;
    }
    while (t >= 0 && t < N_MONTHS - 1) {
      const y = yearOfT(t + 1);
      const end = Math.min(tOf(y, 12), N_MONTHS - 1);
      const target = econ("USA", macroSeed, y).btc ?? px[t];
      const steps = bridgeN(stream(macroSeed, "coinmonths", "BTC", y), Math.log(target / px[t]), end - t, 0.18);
      for (let i = 0; i < steps.length; i++) px[t + i + 1] = px[t + i] * Math.exp(steps[i]);
      t = end;
    }
    return px;
  });
}

/** Other coins: recorded months, then Bitcoin's moves amplified, their own luck, and a chance of collapse. */
function altPath(c: CoinDef, macroSeed: number): Float64Array {
  return memo(`cc|${c.sym}|${macroSeed}`, () => {
    const { px, last } = coinData(c.sym);
    if (last < 0) return px;
    const btc = btcPath(macroSeed);
    const sd = c.vol / Math.sqrt(12);
    let dead = false;
    for (let t = last + 1; t < N_MONTHS; t++) {
      const r = stream(macroSeed, "coinmonth", c.sym, t);
      let lr = c.beta * Math.log(btc[t] / btc[t - 1]) + c.drift / 12 - (sd * sd) / 2 + sd * r.fat(0, 1);
      if (dead) lr = 0.3 * sd * r.normal(); // a dead coin lingers near where it fell
      else if (r.chance(c.hazard / 12)) {
        dead = true;
        lr = Math.log(0.03); // most of the value gone in a month, as with LUNA
      }
      px[t] = px[t - 1] * Math.exp(clamp(lr, -4, 1.5));
    }
    return px;
  });
}

/** A coin's price in US dollars at month t, or null before it trades. */
export function coinUsd(sym: string, macroSeed: number, t: number): number | null {
  const c = COIN[sym];
  if (!c || t < 0 || t >= N_MONTHS) return null;
  const v = (sym === "BTC" ? btcPath(macroSeed) : altPath(c, macroSeed))[t];
  return Number.isFinite(v) && v > 0 ? v : null;
}

// ------------------------------------------------------------------ gold and silver

export interface MetalDef {
  sym: string;
  name: string;
  etf: number; // first full year a cheap exchange-traded fund held it
  spread: [number, number]; // bid-ask spread from a bullion dealer, then from the fund
  fee: [number, number]; // yearly storage and insurance, then the fund's fee
}

export const METALS: MetalDef[] = [
  { sym: "XAU", name: "Gold", etf: 2005, spread: [0.02, 0.002], fee: [0.006, 0.004] },
  { sym: "XAG", name: "Silver", etf: 2007, spread: [0.05, 0.004], fee: [0.01, 0.005] },
];
const METAL = Object.fromEntries(METALS.map((m) => [m.sym, m]));

export function metalDef(sym: string): MetalDef | null {
  return METAL[sym] ?? null;
}

/** A metal's recorded months up to the December of the last complete year, NaN elsewhere. */
function metalData(sym: string): { px: Float64Array; last: number } {
  const px = new Float64Array(N_MONTHS).fill(NaN);
  const series = MD?.mt?.[sym];
  let last = -1;
  for (let y = FIRST_YEAR; y <= LAST_YEAR && series; y++) {
    const months = Array.from({ length: 12 }, (_, m) => dataAt(series, tOf(y, m + 1)));
    if (months.some((v) => v == null || v <= 0)) {
      if (last >= 0) break;
      continue;
    }
    months.forEach((v, m) => (px[tOf(y, m + 1)] = v!));
    last = tOf(y, 12);
  }
  return { px, last };
}

/** Gold in US dollars: recorded months, then years that end at the life engine's gold return, so the desk and your savings hold the same gold. */
function goldPath(macroSeed: number): Float64Array {
  return memo(`mt|XAU|${macroSeed}`, () => {
    const { px, last } = metalData("XAU");
    for (let t = last; t >= 0 && t < N_MONTHS - 1; ) {
      const y = yearOfT(t + 1);
      const end = Math.min(tOf(y, 12), N_MONTHS - 1);
      const total = Math.log(Math.max(0.05, 1 + econ("USA", macroSeed, y).gold));
      const steps = bridgeN(stream(macroSeed, "metalmonths", "XAU", y), total, end - t, 0.15 / Math.sqrt(12));
      for (let i = 0; i < steps.length; i++) px[t + i + 1] = px[t + i] * Math.exp(steps[i]);
      t = end;
    }
    return px;
  });
}

/** Silver: recorded months, then gold divided by a gold-to-silver ratio that wanders and drifts back towards 70. */
function silverPath(macroSeed: number): Float64Array {
  return memo(`mt|XAG|${macroSeed}`, () => {
    const { px, last } = metalData("XAG");
    const gold = goldPath(macroSeed);
    if (last < 0) return px;
    let ratio = Math.log(gold[last] / px[last]);
    for (let t = last + 1; t < N_MONTHS; t++) {
      const r = stream(macroSeed, "metalmonth", "XAG", t);
      ratio += (0.15 / 12) * (Math.log(70) - ratio) + (0.2 / Math.sqrt(12)) * r.fat(0, 1);
      px[t] = gold[t] / Math.exp(clamp(ratio, Math.log(15), Math.log(150)));
    }
    return px;
  });
}

/** A metal's price in US dollars per troy ounce at month t, or null before the data starts. */
export function metalUsd(sym: string, macroSeed: number, t: number): number | null {
  if (!METAL[sym] || t < 0 || t >= N_MONTHS) return null;
  const v = (sym === "XAU" ? goldPath(macroSeed) : silverPath(macroSeed))[t];
  return Number.isFinite(v) && v > 0 ? v : null;
}

// ------------------------------------------------------------------ instruments

export type InstKind = "index" | "spx" | "company" | "coin" | "metal";

export interface Instrument {
  id: string;
  kind: InstKind;
  name: string;
  sub: string;
  company?: Company;
}

const INDEX_NAMES: Record<string, string> = {
  USA: "S&P 500", JPN: "Japan stock index", GBR: "UK stock index", DEU: "German stock index", FRA: "French stock index",
  CHN: "Shanghai stocks", IND: "Indian stock index", BRA: "Brazilian stocks", KOR: "Korean stock index",
};

export function indexName(iso: string): string {
  return INDEX_NAMES[iso] ?? `${country(iso).n.split(",")[0]} stocks`;
}

/** What a player in `iso` can trade at month t. */
export function instruments(
  iso: string,
  macroSeed: number,
  t: number,
  access: { local: boolean; global: boolean; crypto?: boolean; metals?: string[] },
): Instrument[] {
  const out: Instrument[] = [];
  if (access.local) out.push({ id: `idx:${iso}`, kind: "index", name: `${indexName(iso)} fund`, sub: "Index fund" });
  if (access.global && iso !== "USA") out.push({ id: "spx", kind: "spx", name: "S&P 500 fund", sub: "US stocks, in dollars" });
  if (access.local) {
    for (const c of companies(iso, macroSeed)) {
      if (t >= c.listT && t <= c.endT) out.push({ id: c.id, kind: "company", name: c.name, sub: SECTOR[c.sector].label, company: c });
    }
  }
  for (const m of METALS) {
    if (access.metals?.includes(m.sym) && metalUsd(m.sym, macroSeed, t) != null) out.push({ id: `mt:${m.sym}`, kind: "metal", name: m.name, sub: "Metal · per troy ounce" });
  }
  if (access.crypto) {
    for (const c of COINS) if (coinUsd(c.sym, macroSeed, t) != null) out.push({ id: `cc:${c.sym}`, kind: "coin", name: c.name, sub: `Crypto · ${c.sym}` });
  }
  return out;
}

export function sectorLabel(key: string): string {
  return SECTOR[key]?.label ?? key;
}

/** Price of an instrument in month t, in the local currency of `home`. Null when it doesn't trade. */
export function priceOf(id: string, macroSeed: number, t: number, home: string): number | null {
  if (id === "spx") return indexLevel("USA", macroSeed, t) * fxAt(home, macroSeed, t);
  if (id.startsWith("cc:") || id.startsWith("mt:")) {
    const usd = id.startsWith("cc:") ? coinUsd(id.slice(3), macroSeed, t) : metalUsd(id.slice(3), macroSeed, t);
    return usd == null ? null : usd * fxAt(home, macroSeed, t);
  }
  if (id.startsWith("idx:")) return indexLevel(id.slice(4), macroSeed, t);
  const c = companyById(id, macroSeed);
  return c ? companyPrice(c, macroSeed, t) : null;
}

/** Monthly dividend paid per unit held, as a share of the price (index funds only). */
export function monthlyDividendRate(id: string, t: number): number {
  if (id === "spx") return dividendYield("USA", yearOfT(t)) / 12;
  if (id.startsWith("idx:")) return dividendYield(id.slice(4), yearOfT(t)) / 12;
  return 0;
}

/** Whether a month's price for an instrument replays recorded history. */
export function isRealMonth(id: string, macroSeed: number, t: number): boolean {
  if (id === "spx") return indexPath("USA", macroSeed).real[t] === 1;
  if (id.startsWith("idx:")) return indexPath(id.slice(4), macroSeed).real[t] === 1;
  if (id.startsWith("cc:")) return dataAt(MD?.cc?.[id.slice(3)], t) != null;
  if (id.startsWith("mt:")) return t <= memoSmall(`mtlast|${id}`, () => metalData(id.slice(3)).last) && dataAt(MD?.mt?.[id.slice(3)], t) != null;
  return false;
}

/** Market value of a desk: cash plus positions at the desk's current month. */
export function deskValue(s: LifeState): number {
  const d = s.desk;
  if (!d) return 0;
  let v = d.cash;
  for (const p of Object.values(d.pos)) {
    if (p.units <= 0) continue;
    const px = priceOf(p.id, s.macroSeed, d.t, s.country);
    v += (px ?? p.lastPrice) * p.units;
  }
  return v;
}
