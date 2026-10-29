import type { Industry } from "./labour";

export type Sex = "M" | "F";
export type Mode = "random" | "timetravel";
export type Era = "past" | "recent" | "now" | "any";
export type Edu = "none" | "primary" | "secondary" | "vocational" | "bachelor" | "master" | "doctorate";
export type Field = "cs" | "stem" | "business" | "medicine" | "law" | "education" | "arts" | "general";
// what vocational training trains you for
export type Trade = "nursing" | "electrical" | "it" | "hospitality" | "mechanics" | "beauty" | "care" | "design" | "flying";
export type Lifestyle = "frugal" | "modest" | "comfortable" | "lavish";
export type AssetKey = "cash" | "usd" | "bonds" | "localEq" | "globalEq" | "gold" | "crypto";
export type Allocation = Record<AssetKey, number>;
export type Holdings = Record<AssetKey, number>;

export const ASSET_KEYS: AssetKey[] = ["cash", "usd", "bonds", "localEq", "globalEq", "gold", "crypto"];
export const EDU_ORDER: Edu[] = ["none", "primary", "secondary", "vocational", "bachelor", "master", "doctorate"];

export interface Setup {
  mode: Mode;
  seed: number;
  macroSeed?: number;
  era?: Era;
  // "births": the year is drawn by how many babies each year had, from its own stream. Lives from
  // before October 2026 drew an era, then a year in it; their codes are bare seeds.
  yearDraw?: "births";
  // time travel
  country?: string;
  year?: number;
  startAge?: number;
  background?: "poor" | "middle" | "rich";
  // optional overrides
  name?: string;
  sex?: Sex;
  birthYear?: number;
  familyPct?: number;
}

export interface Job {
  occ: string;
  title: string;
  mult: number; // pay as a multiple of the typical wage
  years: number;
  level: number; // promotions
  formal: boolean;
  industry?: Industry; // where the job is: a manager stays in the industry they rose in
}

export interface Stock {
  id: string;
  name: string;
  sector: string;
  pitch: string;
  value: number;
  cost: number;
  beta: number;
  drift: number;
  vol: number;
  hazard: number;
  alive: boolean;
  bought: number;
  illiquid?: boolean; // private startup stakes can't be sold
  exitYear?: number;
  boost?: number; // extra drift while the company is a breakout winner
  boostUntil?: number;
}

export interface Property {
  id: string;
  kind: "home" | "rental";
  value: number;
  price: number;
  mortgage: number;
  rate: number;
  payment: number;
  bought: number;
  personal?: boolean; // a holiday home you keep for yourself: no rent comes in
}

export type BizType = "stall" | "shop" | "trading" | "workshop" | "agency" | "tech";

export interface Business {
  id: string;
  type: BizType;
  name: string;
  founded: number;
  scale: number; // 1 = as founded
  profit: number; // last year, nominal (owner's share before draw)
  valuation: number; // owner's equity value
  equity: number; // ownership share 0..1
  invested: number;
  stage: number; // tech: 0 idea .. 4 growth
  forSale: boolean;
}

export interface Partner {
  name: string;
  edu: Edu;
  mult: number; // income as a multiple of the typical wage
  working: boolean;
  since: number;
}

export interface Kid {
  name: string;
  born: number;
  sex: Sex;
}

/** A yearly cost or income that runs for a while: a pet, a car loan, school fees, an employer's pension match. */
export interface Recurring {
  key: string;
  label: string;
  wage: number; // a year's amount in typical local wages: negative costs, positive brings money in
  until: number; // last year it runs
  needsJob?: boolean; // stops when you're out of work
  health?: number; // yearly nudges to your stats
  happiness?: number;
}

/** A decision that comes back in a later year because of an earlier choice: a friend's loan, a tenant, a startup's sale. */
export interface FollowUp {
  event: string;
  year: number;
  payload: Record<string, unknown>;
}

/** Money that arrives, or falls due, in a later year: a renovation sold, a savings circle's pot, a loan you co-signed. */
export interface Due {
  key: string;
  year: number;
  wage: number; // in typical local wages of that year: positive comes in, negative goes out
  label: string; // its line in the yearly breakdown
  text: string; // the log line, followed by the amount
}

export interface Parents {
  alive: [boolean, boolean];
  ageAtBirth: [number, number];
  wealthMult: number; // household wealth as a multiple of the typical wage
  incomeMult: number; // household income relative to the typical wage
  occ: string;
}

export interface Access {
  bank: boolean;
  localEq: boolean;
  globalEq: boolean;
  globalFriction: number; // annual drag when capital controls apply
  crypto: boolean;
  mortgage: boolean;
}

export type Tone = "good" | "bad" | "neutral" | "history" | "money" | "milestone";

export interface LogEntry {
  year: number;
  age: number;
  text: string;
  tone: Tone;
  about?: string; // what the line tells of the year's money: "money" for the yearly line, a move's key ("ev:<title>") for a choice's outcome
}

export interface YearRecord {
  year: number;
  age: number;
  netWorth: number; // nominal local
  realNW: number; // 2021 international dollars
  income: number;
  spending: number;
  saved: number;
  invested: number; // net new money into the liquid portfolio this year
  liquid: number;
  property: number;
  business: number;
  debt: number;
  health: number;
  happiness: number;
  country: string;
  /**
   * What changed net worth since the year before, by cause, in nominal local money: "pay" (income
   * left after tax and living costs), "interest", one key per asset's return, "home", "business",
   * "desk", "costs", "ev:<decision title>" and "other" for the rest, so the parts add up exactly.
   * Missing in a year you moved country, when the two amounts are in different currencies.
   */
  moves?: Record<string, number>;
}

export interface DecisionOption {
  id: string;
  label: string;
  hint?: string;
  disabled?: string;
}

export interface Decision {
  id: string;
  event: string;
  year: number;
  title: string;
  body: string;
  tag: "life" | "money" | "career" | "market" | "business" | "reflection" | "childhood";
  options: DecisionOption[];
  payload: Record<string, unknown>;
}

export interface Stats {
  health: number;
  happiness: number;
  skill: number;
  network: number;
}

export interface School {
  kind: Edu;
  yearsLeft: number;
  cost: number; // per year, nominal at start
  field?: Field;
  trade?: Trade;
}

export interface DeskPosition {
  id: string;
  units: number;
  cost: number; // total paid, fees included
  since: number; // month index of the first buy
  lastPrice: number;
  custody?: "exchange" | "wallet"; // coins: on the exchange (the default) or in your own wallet
}

/** What a failed exchange owes you, paid out years later. */
export interface DeskClaim {
  name: string;
  at: number; // month it's paid
  kind: "coins" | "cash";
  coins?: Record<string, number>; // units per coin id, already scaled by the share repaid
  usd?: number; // cash repaid, in dollars
  text: string;
}

export interface DeskOrder {
  id: string;
  inst: string;
  side: "buy" | "sell";
  kind: "limit" | "stop";
  price: number;
  amount: number; // money to spend on a buy, units to sell
  placed: number;
}

export interface DeskTrade {
  t: number;
  y?: number; // the year being lived when it happened
  text: string;
  pnl?: number;
}

/** The brokerage account behind the trading desk. Money here counts in net worth but not in savings. */
export interface DeskState {
  cash: number;
  pos: Record<string, DeskPosition>;
  orders: DeskOrder[];
  t: number; // prices are as of this month
  trades: DeskTrade[]; // newest first
  nextId: number;
  yearGain: number; // realized gains and dividends this year, for tax
  claims?: DeskClaim[];
  stats: {
    deposited: number;
    withdrawn: number;
    flowsReal: number; // net money moved in, in 2021 international dollars at the time it moved
    costsReal: number; // fees and tax, same units
    fees: number;
    dividends: number;
    taxes: number;
    realized: number;
    trades: number;
    perf: number; // growth of money kept in the account, ignoring deposits and withdrawals (starts at 1)
    perfPeak: number;
    drawdown: number; // worst fall of `perf` from a peak, as a share
    best: { name: string; pnl: number } | null;
    worst: { name: string; pnl: number } | null;
  };
}

export interface LifeState {
  v: 1;
  setup: Setup;
  mode: Mode;
  seed: number;
  macroSeed: number;
  marketVariant: number;
  name: string;
  sex: Sex;
  birthYear: number;
  birthCountry: string;
  country: string;
  year: number;
  age: number;
  alive: boolean;
  death?: { year: number; age: number; cause: string };
  startAge: number; // time travel starts here; random lives at 0
  familyPct: number;
  parents: Parents;
  siblings: number;
  stats: Stats;
  edu: Edu;
  field?: Field;
  trade?: Trade; // the trade a vocational diploma is in
  school: School | null;
  job: Job | null;
  unemployedYears: number;
  retired: boolean;
  formalYears: number;
  workYears: number;
  pension: number;
  business: Business | null;
  pastBusinesses: { name: string; type: BizType; outcome: string; value: number; year: number }[];
  partner: Partner | null;
  dating: boolean;
  kids: Kid[];
  lifestyle: Lifestyle;
  allocation: Allocation;
  holdings: Holdings;
  cashHome: number; // cash kept outside the banking system
  stocks: Stock[];
  desk: DeskState | null;
  properties: Property[];
  consumerDebt: number;
  studentDebt: number;
  frozen: { amount: number; until: number } | null;
  cryptoCustody: "exchange" | "self";
  access: Access;
  creditLockUntil: number;
  livingWithParents: boolean;
  flags: Record<string, number | string | boolean>;
  recurring?: Recurring[];
  dues?: Due[];
  followUps?: FollowUp[];
  indYears?: Partial<Record<Industry, number>>; // years worked in each industry
  answers: Record<string, string>;
  pending: Decision[];
  log: LogEntry[];
  history: YearRecord[];
  peakReal: number;
  counters: {
    bankruptcies: number;
    bizStarted: number;
    bizSold: number;
    jobChanges: number;
    moves: number;
    soldInCrash: number;
    heldThroughCrash: number;
    scams: number;
  };
  // per-year scratch, reset each year
  yr: {
    careerActionUsed: boolean;
    income: number;
    spending: number;
    oneOff: number; // one-off costs scheduled this year
    windfall: number;
    moves?: Record<string, number>; // what moved net worth so far this year (see YearRecord.moves)
  };
}
