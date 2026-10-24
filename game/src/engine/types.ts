export type Sex = "M" | "F";
export type Mode = "random" | "timetravel";
export type Era = "past" | "recent" | "now" | "any";
export type Edu = "none" | "primary" | "secondary" | "vocational" | "bachelor" | "master" | "doctorate";
export type Field = "stem" | "business" | "medicine" | "law" | "education" | "arts" | "general";
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
  properties: Property[];
  consumerDebt: number;
  studentDebt: number;
  frozen: { amount: number; until: number } | null;
  cryptoCustody: "exchange" | "self";
  access: Access;
  creditLockUntil: number;
  livingWithParents: boolean;
  flags: Record<string, number | string | boolean>;
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
  };
}
