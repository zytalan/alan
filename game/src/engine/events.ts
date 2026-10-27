// The event deck. Each event decides how likely it is this year, builds the
// decision the player sees, and applies the chosen option. Events never hold
// functions in state: a decision stores its event id and payload, and the
// option is applied by looking the event up again.

import { BIZ, BUSINESSES } from "./content/business";
import { FIELD_NAMES, OCC } from "./content/occupations";
import { givenName, nameGroupFor } from "./content/names";
import { pct, signedPct } from "./format";
import { PONZI_WAVES } from "./history";
import { econ, type YearEcon } from "./macro";
import { referenceHealth } from "./mortality";
import { liquidateDesk, shrinkDesk } from "./desk";
import {
  addDue, adult, annuity, buyProperty, buyStock, bump, canStartBusiness, careAid, careCost, clamp, commit, consumerRate, dev, ec,
  eduAtLeast, endBusiness,
  fmt, homePrice, invest, liquid, log, loseJob, makeOffers, makeStock, mortgageQuote, mortgageRate, netWorth, pay, raiseCash,
  rebalance, retirementAge, salary, sellProperty, startBusiness, stockValue, takeJob, W, type Offer,
} from "./ops";
import { stream, type Rng } from "./rng";
import { admissionChance, startSchool, tuitionPerYear, universityClosed } from "./school";
import {
  ASSET_KEYS, type Allocation, type AssetKey, type BizType, type Decision, type DecisionOption, type Edu, type Field,
  type LifeState,
} from "./types";
import { country, countryIn, countryIsos, devLevel, nearest } from "./world";

export interface EventCtx {
  e: YearEcon;
  prev: YearEcon;
  w: number;
  r: Rng;
}

interface Built {
  title: string;
  body: string;
  options: DecisionOption[];
  payload?: Record<string, unknown>;
}

export interface EventDef {
  id: string;
  tag: Decision["tag"];
  forced?: boolean; // not limited by the per-year cap
  once?: boolean;
  cooldown?: number;
  repeats?: number; // the chance shrinks by this factor each time it has come up before
  core?: boolean; // drives a career, a family or health: never crowded out by the yearly limit
  chance?(s: LifeState, c: EventCtx): number;
  build(s: LifeState, c: EventCtx, payload: Record<string, unknown>): Built | null;
  resolve(s: LifeState, c: EventCtx, payload: Record<string, unknown>, option: string): void;
}

const o = (id: string, label: string, hint?: string, disabled?: string | false): DecisionOption => ({
  id,
  label,
  hint,
  disabled: disabled || undefined,
});

export function ctxFor(s: LifeState, key: string): EventCtx {
  const e = ec(s);
  return { e, prev: ec(s, s.year - 1), w: e.wage, r: stream(s.seed, key, s.year, s.pending.length, s.log.length) };
}

export function enqueue(s: LifeState, id: string, payload: Record<string, unknown> = {}): void {
  const def = EVENT_MAP[id];
  const c = ctxFor(s, `build-${id}`);
  const b = def.build(s, c, payload);
  if (!b) return;
  const seq = Number(s.flags.dseq ?? 0) + 1;
  s.flags.dseq = seq;
  s.pending.push({ id: `d${seq}`, event: id, year: s.year, tag: def.tag, title: b.title, body: b.body, options: b.options, payload: b.payload ?? payload });
}

/** A living parent old enough to need care, with nothing arranged yet. */
function frailParent(s: LifeState): 0 | 1 | null {
  const need = ([0, 1] as const).filter((i) => s.parents.alive[i] && !s.flags[`care${i}`] && s.age + s.parents.ageAtBirth[i] >= 75);
  return need.length ? need.reduce((a, b) => (s.parents.ageAtBirth[a] >= s.parents.ageAtBirth[b] ? a : b)) : null;
}

/** A child between 25 and 35 who hasn't asked for help with a home yet. */
function grownKidBuying(s: LifeState) {
  return s.kids.find((k) => s.year - k.born >= 25 && s.year - k.born <= 35 && s.flags[`deposit:${k.name}`] == null) ?? null;
}

/** Holdings changed by a one-off trade: make the target mix follow what the player now holds. */
export function syncAllocation(s: LifeState): void {
  const total = ASSET_KEYS.reduce((a, k) => a + s.holdings[k], 0);
  if (total <= 0) return;
  for (const k of ASSET_KEYS) s.allocation[k] = s.holdings[k] / total;
}

function move(s: LifeState, from: AssetKey[], to: AssetKey, share: number): number {
  let moved = 0;
  for (const k of from) {
    const amt = s.holdings[k] * share;
    s.holdings[k] -= amt;
    moved += amt;
  }
  if (to === "cash" && !s.access.bank) s.cashHome += moved;
  else s.holdings[to] += moved * (to === "gold" ? 0.98 : to === "crypto" ? 0.99 : 1);
  syncAllocation(s);
  return moved;
}

function setAllocation(s: LifeState, a: Partial<Allocation>): void {
  for (const k of ASSET_KEYS) s.allocation[k] = a[k] ?? 0;
}

function equityShare(s: LifeState): number {
  const l = liquid(s);
  if (l <= 0) return 0;
  return (s.holdings.localEq + s.holdings.globalEq + stockValue(s, true)) / l;
}

function partnerOf(s: LifeState) {
  return s.sex === "M" ? "F" : "M";
}

/** Your own family's name tradition, or the local one once you live abroad. */
function familyNames(s: LifeState, ...keys: (string | number)[]): string {
  const own = typeof s.flags.nameGroup === "string" ? s.flags.nameGroup : nameGroupFor(s.birthCountry, country(s.birthCountry).r, s.seed);
  return s.country === s.birthCountry ? own : nameGroupFor(s.country, country(s.country).r, s.seed, ...keys);
}

/** Most people marry within their own community; some don't. */
function partnerNames(s: LifeState): string {
  if (s.country === s.birthCountry && stream(s.seed, "partner-names", s.year).chance(0.75)) return familyNames(s);
  return nameGroupFor(s.country, country(s.country).r, s.seed, "partner", s.year);
}

function moneyYears(s: LifeState, amount: number): string {
  const yrs = amount / W(s);
  return yrs >= 1 ? `${yrs.toFixed(yrs < 10 ? 1 : 0)} years of a typical wage here` : `${Math.round(yrs * 12)} months of a typical wage here`;
}

/** "an accountant", "a nurse" */
function aTitle(title: string): string {
  const t = title.toLowerCase();
  return `${/^[aeiou]/.test(t) ? "an" : "a"} ${t}`;
}

function offerLine(of: Offer): string {
  return `${of.title} at ${of.employer}`;
}

const MIGRATION: Record<string, string[]> = {
  SAS: ["USA", "GBR", "ARE", "SAU", "CAN", "AUS"],
  EAS: ["USA", "CAN", "AUS", "JPN", "KOR", "SGP"],
  LCN: ["USA", "ESP", "CAN", "ITA"],
  SSF: ["GBR", "USA", "FRA", "ZAF", "CAN"],
  MEA: ["DEU", "FRA", "SAU", "ARE", "CAN"],
  ECS: ["DEU", "GBR", "USA", "CAN"],
  NAC: ["GBR", "AUS"],
};

export function destinations(s: LifeState): string[] {
  const region = country(s.country).r;
  const all = new Set(countryIsos());
  return (MIGRATION[region] ?? ["USA", "GBR", "DEU"]).filter((d) => all.has(d) && d !== s.country && devLevel(d, s.year) > dev(s) + 0.1);
}

/** Move to another country: everything converts at the going exchange rate. */
export function moveCountry(s: LifeState, dest: string, lossShare = 0): void {
  liquidateDesk(s, "Sold everything before moving abroad");
  const fromFx = ec(s).fx;
  const toFx = econ(dest, s.macroSeed, s.year, s.marketVariant).fx;
  const conv = toFx / fromFx;
  for (const p of [...s.properties]) {
    if (lossShare >= 0.99) s.properties = s.properties.filter((x) => x !== p);
    else sellProperty(s, p.id, 0.1 + lossShare * 0.5);
  }
  if (s.business) {
    const v = s.business.valuation * (0.4 - lossShare * 0.4);
    endBusiness(s, "sold", Math.max(0, v));
  }
  const keep = 1 - lossShare;
  for (const k of ["cash", "bonds", "localEq"] as AssetKey[]) s.holdings[k] *= conv * keep;
  for (const k of ["usd", "globalEq", "gold", "crypto"] as AssetKey[]) s.holdings[k] *= conv; // dollar assets travel
  s.cashHome *= conv * keep;
  s.consumerDebt *= conv;
  s.studentDebt *= conv;
  for (const st of s.stocks) {
    st.value *= conv * keep;
    st.cost *= conv;
  }
  if (s.holdings.localEq > 0) {
    s.holdings.cash += s.holdings.localEq;
    s.holdings.localEq = 0;
  }
  s.country = dest;
  s.flags.hpl = undefined as unknown as number;
  delete s.flags.hpl;
  s.access = { bank: devLevel(dest, s.year) > 0.6, localEq: false, globalEq: false, globalFriction: 0, crypto: false, mortgage: false };
  if (s.access.bank && s.cashHome > 0) {
    s.holdings.cash += s.cashHome;
    s.cashHome = 0;
  }
  s.livingWithParents = false;
  s.counters.moves++;
  s.flags.immigrantSince = s.year;
  if (s.partner) s.partner.mult *= 0.6;
  bump(s, "network", -20);
  bump(s, "happiness", -8);
  syncAllocation(s);
}

// what you might be diagnosed with: name, how serious, and the age it starts to show up
const CONDITIONS: [string, number, number][] = [
  ["a slipped disc", 1, 25],
  ["pneumonia", 1, 18],
  ["a bad fracture", 1, 18],
  ["appendicitis", 0.8, 18],
  ["a torn knee ligament", 0.8, 18],
  ["depression", 1.2, 18],
  ["asthma", 0.8, 18],
  ["kidney stones", 0.8, 25],
  ["diabetes", 1.5, 35],
  ["high blood pressure", 1, 35],
  ["a heart condition", 2.5, 45],
  ["a tumour", 3, 40],
  ["kidney disease", 2, 45],
  ["a stroke", 3, 55],
  ["cataracts", 0.8, 60],
  ["a broken hip", 1.5, 65],
];

// what a rotating savings circle is called where it's common
const SAVINGS_CIRCLES: Record<string, string> = {
  GHA: "susu", NGA: "ajo", SEN: "tontine", CIV: "tontine", CMR: "tontine", BEN: "tontine", TGO: "tontine", MLI: "tontine",
  BFA: "tontine", KEN: "chama", UGA: "chama", TZA: "upatu", ZAF: "stokvel", ETH: "equb", SOM: "ayuuto", EGY: "gameya",
  IND: "chit fund", PAK: "committee", IDN: "arisan", PHL: "paluwagan", VNM: "hụi", CHN: "hui", KOR: "gye", MEX: "tanda",
  GTM: "cuchubal", PER: "pandero", BOL: "pasanaku",
};

/** What a lifetime annuity pays a year per unit of savings: more the older you buy it. */
function annuityRate(s: LifeState): number {
  return 0.045 + 0.0025 * Math.max(0, s.age - 60);
}

/** Side work you can take on, by era and what you know. */
const HUSTLES: { id: string; label: (s: LifeState) => string; hint: string; wage: number; ok: (s: LifeState) => boolean; health?: number; happiness?: number; skill?: number; network?: number }[] = [
  { id: "tutor", label: () => "Tutoring kids", hint: "Keeps you sharp", wage: 0.1, skill: 2, ok: (s) => s.stats.skill >= 45 },
  { id: "drive", label: (s) => (s.year >= 2012 ? "Driving for a ride app" : "Driving a taxi at night"), hint: "Good money, long nights", wage: 0.18, health: -2, ok: () => true },
  { id: "market", label: () => "A market stall on weekends", hint: "You'll meet half the town", wage: 0.14, network: 2, ok: () => true },
  { id: "online", label: () => "Selling things online", hint: "Slow to start", wage: 0.12, ok: (s) => s.year >= 2005 },
  { id: "repair", label: () => "Fixing things for the neighbours", hint: "Cash in hand", wage: 0.1, network: 1, ok: () => true },
  { id: "deliver", label: (s) => (s.year >= 2014 ? "Delivering food" : "Delivering newspapers at dawn"), hint: "Tiring, but steady", wage: 0.12, health: -1, ok: () => true },
  { id: "translate", label: () => "Translation work", hint: "Quiet work at home", wage: 0.13, ok: (s) => eduAtLeast(s.edu, "bachelor") },
  { id: "bar", label: () => "Bar shifts on Friday and Saturday nights", hint: "The tips are good", wage: 0.12, happiness: -1, network: 2, ok: (s) => s.age <= 40 },
  { id: "freelance", label: () => "Freelance design and websites", hint: "Clients come and go", wage: 0.2, ok: (s) => s.year >= 2000 && s.stats.skill >= 55 },
];

const DEFS: EventDef[] = [
  // ------------------------------------------------------------- childhood
  {
    id: "temperament",
    tag: "childhood",
    forced: true,
    once: true,
    chance: (s) => (s.age === 2 ? 1 : 0),
    build: () => ({
      title: "Two years old",
      body: "The world outside is huge and strange. What kind of toddler are you?",
      options: [
        o("curious", "Into everything", "Skill"),
        o("social", "Glued to the other kids", "Network"),
        o("careful", "Careful and watchful", "Health, and a lifelong saver's streak"),
        o("bold", "Fearless — climbs everything", "A taste for risk"),
      ],
    }),
    resolve: (s, _c, _p, opt) => {
      if (opt === "curious") bump(s, "skill", 6);
      if (opt === "social") bump(s, "network", 6);
      if (opt === "careful") {
        bump(s, "health", 3);
        s.flags.prudent = true;
      }
      if (opt === "bold") {
        s.flags.bold = true;
        bump(s, "happiness", 2);
      }
    },
  },
  {
    id: "no_school",
    tag: "childhood",
    forced: true,
    once: true,
    chance: (s) => (s.age === 7 && s.edu === "none" && !s.school ? 1 : 0),
    build: () => ({
      title: "No school for you",
      body: "There's no place at school, or no money for it. You spend your days working alongside your family.",
      options: [
        o("learn", "Learn whatever you can on your own", "Skill"),
        o("trade", "Learn a trade from a neighbour", "Some skill, some family income"),
        o("work", "Work hard to help the family", "Family income"),
      ],
    }),
    resolve: (s, _c, _p, opt) => {
      if (opt === "learn") bump(s, "skill", 5);
      else if (opt === "trade") {
        bump(s, "skill", 3);
        s.parents.incomeMult *= 1.02;
      } else {
        s.parents.incomeMult *= 1.05;
        bump(s, "health", -2);
      }
    },
  },
  {
    id: "school_focus",
    tag: "childhood",
    forced: true,
    once: true,
    chance: (s) => (s.age === 8 && s.school?.kind === "primary" ? 1 : 0),
    build: (s) => ({
      title: "Eight years old",
      body: "School has become your world. Where does your energy go?",
      options: [
        o("books", "Books and top marks", "Skill"),
        o("friends", "Friends and sport", "Network, health"),
        o("help", "Helping out at home", "Family income", s.familyPct > 0.6 && "Your family doesn't need it"),
        o("dream", "Drawing and daydreaming", "Happiness"),
      ],
    }),
    resolve: (s, _c, _p, opt) => {
      if (opt === "books") {
        bump(s, "skill", 8);
        bump(s, "happiness", -2);
      }
      if (opt === "friends") {
        bump(s, "network", 6);
        bump(s, "health", 2);
      }
      if (opt === "help") {
        s.parents.incomeMult *= 1.04;
        bump(s, "skill", -2);
        bump(s, "network", 2);
      }
      if (opt === "dream") {
        bump(s, "happiness", 4);
        s.flags.creative = true;
      }
    },
  },
  {
    id: "pocket_money",
    tag: "childhood",
    forced: true,
    once: true,
    chance: (s) => (s.age === 11 ? 1 : 0),
    build: (s, c) => {
      const amt = c.w * (0.004 + 0.03 * s.familyPct ** 2);
      return {
        title: "Your first money",
        body: `An uncle presses ${fmt(s, amt)} into your hand. It's more money than you've ever held.`,
        options: [o("save", "Save it in a jar", "Builds the habit"), o("spend", "Spend it on something fun", "Happiness"), o("flip", "Buy snacks wholesale and resell them at school", "Could double it")],
        payload: { amt },
      };
    },
    resolve: (s, c, p, opt) => {
      const amt = Number(p.amt);
      if (opt === "save") {
        s.cashHome += amt;
        s.flags.saver = true;
        log(s, "You keep the money in a jar and watch it.", "money");
      }
      if (opt === "spend") bump(s, "happiness", 3);
      if (opt === "flip") {
        s.flags.hustler = true;
        bump(s, "skill", 2);
        if (c.r.chance(0.6)) {
          s.cashHome += amt * 2;
          log(s, `Your snack business works: you turn it into ${fmt(s, amt * 2)}.`, "good");
        } else {
          s.cashHome += amt * 0.4;
          log(s, "A teacher confiscates your stock. You learn something about risk.", "bad");
        }
      }
    },
  },
  {
    id: "stay_in_school",
    tag: "childhood",
    forced: true,
    once: true,
    chance: (s) => (s.age === 15 && s.school?.kind === "secondary" ? clamp((1 - s.familyPct) * (1 - dev(s)) * 1.5, 0, 0.9) : 0),
    build: (s, c) => ({
      title: "Fifteen, and needed",
      body: `Your family is struggling. A job now would bring in about ${fmt(s, c.w * 0.4)} a year.`,
      options: [
        o("stay", "Stay in school", "Better jobs later"),
        o("both", "Stay in school and work evenings", "Some money, little sleep"),
        o("leave", "Leave school and start working", "Money now"),
      ],
    }),
    resolve: (s, _c, _p, opt) => {
      if (opt === "both") {
        s.parents.incomeMult *= 1.03;
        bump(s, "health", -3);
        bump(s, "happiness", -2);
        s.flags.persisted = true;
      } else if (opt === "stay") {
        bump(s, "happiness", -2);
        s.flags.persisted = true;
      } else {
        s.school = null;
        s.edu = "primary";
        s.parents.incomeMult *= 1.08;
        log(s, "You leave school to work.", "neutral");
        enqueue(s, "first_job");
      }
    },
  },
  {
    id: "teen_gadget",
    tag: "childhood",
    once: true,
    chance: (s) => (s.age === 13 ? 0.6 : 0),
    build: (s, c) => {
      const item = s.year < 1965 ? "a bicycle" : s.year < 1977 ? "a transistor radio" : s.year < 1987 ? "a cassette player" : s.year < 1997 ? "a games console" : s.year < 2008 ? "a mobile phone" : "the latest smartphone";
      return {
        title: "Everyone has one",
        body: `Half your class has ${item}. It costs about ${fmt(s, c.w * (s.year < 1997 ? 0.03 : 0.05))}.`,
        options: [
          o("save", "Save up for it yourself", "A year of pocket money"),
          o("ask", "Beg your parents", s.familyPct < 0.3 ? "Money is tight at home" : "They might say yes"),
          o("used", "Hunt for a second-hand one", "Half the price"),
          o("skip", "Decide you don't need it", "A saver's streak"),
        ],
      };
    },
    resolve: (s, c, _p, opt) => {
      if (opt === "save") {
        s.flags.saver = true;
        bump(s, "skill", 1);
      } else if (opt === "ask") {
        if (c.r.chance(clamp(s.familyPct + 0.2, 0.1, 0.95))) bump(s, "happiness", 4);
        else {
          bump(s, "happiness", -2);
          log(s, "Your parents say no.", "neutral");
        }
      } else if (opt === "used") {
        s.flags.hustler = true;
        bump(s, "happiness", 2);
      } else {
        s.flags.prudent = true;
        bump(s, "happiness", -2);
      }
    },
  },
  {
    id: "teen_job",
    tag: "childhood",
    once: true,
    chance: (s) => (s.age === 15 && s.school ? (s.familyPct < 0.4 ? 0.8 : 0.5) : 0),
    build: (s, c) => {
      const work = c.r.pick(
        s.year < 1990
          ? ["a paper round", "a Saturday job at the grocer's", "picking fruit in the summer", "washing dishes at a café"]
          : ["a Saturday job in a shop", "waiting tables at weekends", "babysitting for the neighbours", "a summer job at a burger place"],
      );
      const earn = 0.04 * c.w;
      return {
        title: "Your first job?",
        body: `You could get ${work}: about ${fmt(s, earn)} a year.`,
        options: [
          o("work", "Take it and save the money", "Money, and the habit of work"),
          o("spend", "Take it and enjoy the money", "Freedom"),
          o("sport", "Spend weekends on the team instead", "Health and friends"),
          o("study", "Study instead", "Better marks"),
        ],
        payload: { earn },
      };
    },
    resolve: (s, _c, p, opt) => {
      if (opt === "work") {
        const saved = Number(p.earn) * 2;
        s.cashHome += saved;
        s.flags.workEthic = true;
        bump(s, "skill", 1);
        log(s, `Two years of weekend work: ${fmt(s, saved)} saved.`, "money");
      } else if (opt === "spend") {
        s.flags.workEthic = true;
        bump(s, "happiness", 4);
      } else if (opt === "sport") {
        bump(s, "health", 4);
        bump(s, "network", 3);
      } else bump(s, "skill", 5);
    },
  },
  {
    id: "exam_year",
    tag: "childhood",
    once: true,
    chance: (s) => (s.age === 16 && s.school?.kind === "secondary" ? 0.7 : 0),
    build: (s, c) => ({
      title: "Exam year",
      body: "Next year's exams decide a lot: university places, apprenticeships, first jobs.",
      options: [
        o("tutor", "A private tutor", `Your family pays about ${fmt(s, 0.05 * c.w)}`, s.familyPct < 0.35 && "Your family can't afford it"),
        o("group", "Study with friends", "Marks and friends"),
        o("alone", "Grind alone every evening", "The best marks, the least fun"),
        o("coast", "Coast through", "Enjoy being sixteen"),
      ],
    }),
    resolve: (s, _c, _p, opt) => {
      if (opt === "tutor") {
        bump(s, "skill", 7);
        s.parents.wealthMult = Math.max(0, s.parents.wealthMult - 0.05);
      } else if (opt === "group") {
        bump(s, "skill", 4);
        bump(s, "network", 3);
      } else if (opt === "alone") {
        bump(s, "skill", 6);
        bump(s, "happiness", -3);
      } else {
        bump(s, "happiness", 4);
        bump(s, "skill", -2);
      }
    },
  },
  // ------------------------------------------------------------- education
  {
    id: "after_school",
    tag: "life",
    build: (s, c) => {
      const pUni = admissionChance(s, "bachelor");
      const pVoc = admissionChance(s, "vocational");
      const tuition = tuitionPerYear(s, "bachelor");
      const stall = canStartBusiness(s, "stall");
      const abroadOk = s.familyPct >= 0.85 && dev(s) < 0.85;
      const options = [
        o("uni", "Apply to university", `Admission chance ${pct(pUni)} · tuition ${fmt(s, tuition)}/yr`, universityClosed(s) && "Universities are closed"),
        o("voc", "Vocational training (2 years)", `Admission chance ${pct(pVoc)}`),
        o("work", "Start working", "Earn now"),
        o("stall", "Start a street stall", `Costs ${fmt(s, stall.cost)}`, !stall.ok && stall.reason),
      ];
      if (abroadOk) options.push(o("abroad", "Study abroad", `About ${fmt(s, tuitionPerYear(s, "bachelor", true))}/yr — your family pays`));
      return {
        title: "School's out",
        body: `You're ${s.age}. ${c.e.recession ? "The economy is in a slump. " : ""}What next?`,
        options,
        payload: { pUni, pVoc },
      };
    },
    resolve: (s, c, p, opt) => {
      if (opt === "uni") {
        if (c.r.chance(Number(p.pUni))) {
          log(s, "You get into university!", "good");
          enqueue(s, "choose_field");
        } else {
          log(s, "Your university applications are rejected.", "bad");
          enqueue(s, "rejected");
        }
      } else if (opt === "voc") {
        if (c.r.chance(Number(p.pVoc))) {
          startSchool(s, "vocational");
          log(s, "You start vocational training.", "neutral");
        } else {
          log(s, "There are no places left on the course.", "bad");
          enqueue(s, "first_job");
        }
      } else if (opt === "work") enqueue(s, "first_job");
      else if (opt === "stall") {
        enqueue(s, "start_business", { only: "stall" });
      } else if (opt === "abroad") {
        s.flags.abroad = true;
        enqueue(s, "choose_field", { abroad: true });
      }
    },
  },
  {
    id: "rejected",
    tag: "life",
    build: () => ({
      title: "Rejected",
      body: "No university wants you this year.",
      options: [o("retake", "Study for a year and try again", "Skill +5, a year without income"), o("voc", "Vocational training instead"), o("work", "Start working")],
    }),
    resolve: (s, _c, _p, opt) => {
      if (opt === "retake") {
        bump(s, "skill", 5);
        s.flags.retakeYear = s.year + 1;
      } else if (opt === "voc") startSchool(s, "vocational");
      else enqueue(s, "first_job");
    },
  },
  {
    id: "choose_field",
    tag: "life",
    build: (s, _c, p) => {
      const fields: Field[] = ["stem", "business", "medicine", "law", "education", "arts"];
      const need: Partial<Record<Field, number>> = { medicine: 62, law: 52, stem: 45 };
      return {
        title: "Pick your major",
        body: p.abroad ? "You're heading abroad. What will you study?" : "What will you study?",
        options: fields.map((f) =>
          o(f, FIELD_NAMES[f], f === "medicine" ? "6 years, then the best-paid safe job there is" : f === "arts" ? "Follow your heart" : undefined, (need[f] ?? 0) > s.stats.skill && `Needs skill ${need[f]}+`),
        ),
        payload: p,
      };
    },
    resolve: (s, _c, p, opt) => {
      startSchool(s, "bachelor", opt as Field, Boolean(p.abroad));
      log(s, `You start a degree in ${FIELD_NAMES[opt]}${p.abroad ? " abroad" : ""}.`, "milestone");
    },
  },
  {
    id: "grad_next",
    tag: "career",
    build: (s) => {
      const pMa = admissionChance(s, "master", s.field);
      const pPhd = admissionChance(s, "doctorate", s.field);
      return {
        title: "Degree in hand",
        body: "You've graduated. Keep studying or start earning?",
        options: [
          o("work", "Start working"),
          o("master", s.field === "law" ? "Law school (2 years)" : "Master's degree (2 years)", `Admission chance ${pct(pMa)}`),
          o("phd", "Doctorate (4 years)", `Admission chance ${pct(pPhd)}`, s.stats.skill < 60 && "Needs skill 60+"),
        ],
        payload: { pMa, pPhd },
      };
    },
    resolve: (s, c, p, opt) => {
      if (opt === "master" && c.r.chance(Number(p.pMa))) {
        startSchool(s, "master", s.field);
        log(s, "You start graduate school.", "neutral");
      } else if (opt === "phd" && c.r.chance(Number(p.pPhd))) {
        startSchool(s, "doctorate", s.field);
        log(s, "You start a doctorate.", "neutral");
      } else {
        if (opt !== "work") log(s, "You don't get in. Time to find a job.", "bad");
        enqueue(s, "first_job");
      }
    },
  },
  // ------------------------------------------------------------- career
  {
    id: "first_job",
    tag: "career",
    build: (s, c, p) => {
      const offers = makeOffers(s, c.r, 3);
      if (!offers.length) offers.push({ occ: "laborer", title: "Day laborer", mult: 0.45, employer: "the market" });
      return {
        title: p.title ? String(p.title) : s.job ? "Job hunting" : "Your first job",
        body: p.body ? String(p.body) : `${c.e.recession ? "Jobs are scarce right now. " : ""}Here's what you can get:`,
        options: [
          ...offers.map((of, i) => o(`o${i}`, offerLine(of), `${fmt(s, of.mult * c.w)} a year`)),
          o("wait", "Keep looking", "A year without pay, better odds next time"),
        ],
        payload: { offers },
      };
    },
    resolve: (s, _c, p, opt) => {
      const offers = p.offers as Offer[];
      if (opt === "wait") {
        s.flags.searching = s.year + 1;
        bump(s, "skill", 1);
        log(s, "You keep looking for something better.", "neutral");
        return;
      }
      const of = offers[Number(opt.slice(1))];
      takeJob(s, of);
      log(s, `You start work as ${aTitle(of.title)} at ${of.employer}.`, "milestone");
    },
  },
  {
    id: "job_offer",
    tag: "career",
    core: true,
    cooldown: 2,
    chance: (s) => (s.job && !s.retired && s.age >= 22 && s.age <= 62 ? 0.05 + s.stats.network / 800 + s.stats.skill / 1500 : 0),
    build: (s, c) => {
      const cur = s.job;
      if (!cur) return null; // asked for after a job was already lost
      const offers = makeOffers(s, c.r, 1).filter((x) => x.mult > cur.mult * 1.08);
      if (!offers.length) return null;
      const of = offers[0];
      const raise = of.mult / cur.mult - 1;
      const who = `${of.employer[0].toUpperCase()}${of.employer.slice(1)}`;
      const [title, lead] = c.r.pick([
        ["A job offer", `${who} wants you as ${aTitle(of.title)}`],
        ["Headhunted", `${who} has had its eye on you, and wants you as ${aTitle(of.title)}`],
        ["An old colleague calls", `An old colleague, now at ${of.employer}, wants you there as ${aTitle(of.title)}`],
        ["A recruiter's message", `A recruiter has a post for ${aTitle(of.title)} at ${of.employer}`],
      ]);
      return {
        title,
        body: `${lead}: ${fmt(s, of.mult * c.w)} a year (${signedPct(raise)}).`,
        options: [
          o("take", "Take it"),
          o("haggle", "Negotiate for more", "Could go either way"),
          o("counter", "Ask your boss to match it", "A raise, or a cold shoulder"),
          o("stay", "Stay where you are"),
        ],
        payload: { of },
      };
    },
    resolve: (s, c, p, opt) => {
      const of = p.of as Offer;
      if (opt === "take") {
        takeJob(s, of);
        log(s, `You switch jobs: ${of.title.toLowerCase()} at ${of.employer}.`, "good");
      } else if (opt === "haggle") {
        const roll = c.r.next();
        if (roll < 0.55) {
          takeJob(s, { ...of, mult: of.mult * 1.1 });
          log(s, "You negotiate 10% more and take the job.", "good");
        } else if (roll < 0.8) {
          takeJob(s, of);
          log(s, "They won't budge, but you take it anyway.", "neutral");
        } else log(s, "They withdraw the offer.", "bad");
      } else if (opt === "counter" && s.job) {
        const roll = c.r.next();
        if (roll < 0.45) {
          s.job.mult = Math.max(s.job.mult, Math.min(of.mult, s.job.mult * 1.1));
          log(s, "Your boss matches most of it to keep you.", "good");
        } else if (roll < 0.85) log(s, "Your boss wishes you well. By then the other job has gone.", "neutral");
        else {
          bump(s, "network", -3);
          log(s, "Your boss doesn't take it well.", "bad");
        }
      }
    },
  },
  {
    id: "layoff",
    tag: "career",
    forced: true,
    chance: (s, c) => {
      if (!s.job || s.retired) return 0;
      const occ = OCC[s.job.occ];
      const slump = c.e.recession ? 1 + occ.cyclical * Math.min(2, -c.e.realGrowth * 25) : 1;
      return clamp(occ.layoff * slump * (1.2 - s.stats.skill / 200) * (c.e.war > 100 ? 2 : 1), 0, 0.6);
    },
    build: (s, c) => {
      const sev = s.job!.formal && dev(s) >= 0.5 ? 0.25 * salary(s) : 0;
      const why = c.e.recession
        ? "The slump reaches your workplace."
        : c.r.pick([
            "Your employer is cutting staff.",
            "The company is restructuring, and your team is gone.",
            "Your employer goes bust.",
            s.year >= 1985 ? "Your work is moving to a cheaper country." : "The business loses its biggest customer.",
            s.year >= 1990 ? "New software does most of your job now." : "New machines do most of your job now.",
          ]);
      return {
        title: c.r.pick(["Laid off", "Out of a job", "The end of a job"]),
        body: `${why} You lose your job as ${aTitle(s.job!.title)}.${sev > 0 ? ` Severance: ${fmt(s, sev)}.` : ""}`,
        options: [
          o("quick", "Take the first job you can find", "Lower pay"),
          o("search", "Search properly", "A year without pay, better offers"),
          o("study", "Go back to school", s.age > 45 ? undefined : "Retrain", s.age > 45 && "Too late for that"),
          o("biz", "Start a business", sev > 0 ? "Use the severance" : "Start small, with what you have"),
        ],
        payload: { sev },
      };
    },
    resolve: (s, c, p, opt) => {
      const sev = Number(p.sev);
      const lastMult = s.job?.mult ?? 0.5;
      loseJob(s);
      if (sev > 0) invest(s, sev);
      bump(s, "happiness", -6);
      log(s, "You're out of work.", "bad");
      if (opt === "quick") {
        const offers = makeOffers(s, c.r, 3);
        const of = offers.sort((a, b) => Math.abs(a.mult - lastMult * 0.85) - Math.abs(b.mult - lastMult * 0.85))[0];
        if (of) {
          takeJob(s, { ...of, mult: Math.min(of.mult, lastMult * 0.9) });
          log(s, `You take a job as ${aTitle(of.title)}.`, "neutral");
        }
      } else if (opt === "search") s.flags.searching = s.year + 1;
      else if (opt === "study") enqueue(s, "grad_next");
      else enqueue(s, "start_business");
    },
  },
  {
    id: "promotion",
    tag: "career",
    core: true,
    cooldown: 3,
    chance: (s) => (s.job && s.job.years >= 3 && s.job.level < 4 && !s.retired && s.job.formal ? 0.06 + s.stats.skill / 900 + s.stats.network / 1200 : 0),
    build: (s, c) => {
      const j = s.job!;
      const mgr = OCC.manager;
      const toManager = !["manager", "executive", "doctor", "lawyer", "professor", "farmer", "laborer", "vendor", "domestic", "creator", "driver", "retail", "construction", "soldier"].includes(j.occ) && s.formalYears >= 6 && s.stats.skill >= mgr.skill;
      const toExec = j.occ === "manager" && s.stats.skill >= 75 && s.stats.network >= 60 && s.formalYears >= 12;
      const occ = OCC[j.occ];
      const premium = occ.pay > 1 ? 1 + (occ.pay - 1) * (1 + 0.6 * (1 - dev(s))) : occ.pay;
      const ceiling = premium * (1 + occ.growth) ** occ.peak * 1.35;
      if (!toManager && !toExec && j.mult >= ceiling) return null;
      const mult = toExec ? Math.max(j.mult * 1.4, 3.5) : toManager ? Math.max(j.mult * 1.2, mgr.pay) : Math.min(ceiling, j.mult * c.r.range(1.05, 1.12));
      const title = toExec ? "Executive" : toManager ? "Manager" : j.title;
      const step = toManager || toExec ? `a job as ${aTitle(title)}` : "a step up";
      const why = c.r.pick([
        `Your boss offers you ${step}`,
        `A senior colleague is leaving, and they want you to take over: ${step}`,
        `Head office has noticed your work. They offer you ${step}`,
        `After a strong year, you're offered ${step}`,
      ]);
      return {
        title: toExec ? "The corner office" : toManager ? "Leading a team" : c.r.pick(["A promotion", "A step up", "Moving up"]),
        body: `${why}: ${fmt(s, mult * c.w)} a year, longer hours.`,
        options: [
          o("yes", "Accept", `${signedPct(mult / j.mult - 1)} pay`),
          o("more", "Accept, but ask for more", "Often works. Sometimes the job goes to someone else"),
          o("no", "Decline", "Keep your evenings"),
        ],
        payload: { mult, occ: toExec ? "executive" : toManager ? "manager" : j.occ, title, from: j.occ, since: s.year - j.years },
      };
    },
    resolve: (s, c, p, opt) => {
      if (opt === "no" || !s.job) return;
      if (s.job.occ !== p.from || s.year - s.job.years !== p.since) return; // you changed jobs in the meantime
      let mult = Number(p.mult);
      if (opt === "more") {
        if (c.r.chance(0.25)) {
          bump(s, "happiness", -3);
          log(s, "You push too hard. The job goes to someone else.", "bad");
          return;
        }
        if (c.r.chance(0.6)) mult *= 1.06;
      }
      s.job.mult = mult;
      s.job.level++;
      if (p.occ !== s.job.occ) {
        s.job.occ = String(p.occ);
        s.job.title = String(p.title);
        s.flags.pastJobs = `${s.flags.pastJobs ?? ""},${p.occ}`;
      }
      bump(s, "happiness", 3);
      log(s, p.occ === p.from ? "You're promoted." : `Promoted — you're now ${s.job.title.toLowerCase()}.`, "good");
    },
  },
  {
    id: "side_hustle",
    tag: "career",
    cooldown: 8,
    repeats: 0.6,
    chance: (s) => (s.job && s.age >= 20 && s.age <= 55 ? 0.04 : 0),
    build: (s, c) => {
      const pool = HUSTLES.filter((h) => h.ok(s));
      const picks = c.r.shuffle(pool).slice(0, 3);
      return {
        title: c.r.pick(["Extra money on the side", "Weekend work", "A second income?"]),
        body: "Your pay only goes so far. There's work going in the evenings and on weekends.",
        options: [...picks.map((h) => o(h.id, h.label(s), `About ${fmt(s, h.wage * c.w)} a year · ${h.hint}`)), o("no", "Keep your weekends")],
      };
    },
    resolve: (s, _c, _p, opt) => {
      const h = HUSTLES.find((x) => x.id === opt);
      if (!h) return;
      commit(s, { key: "hustle", label: h.label(s), wage: h.wage, until: s.year + 3, health: h.health, happiness: h.happiness });
      if (h.skill) bump(s, "skill", h.skill);
      if (h.network) bump(s, "network", h.network);
      log(s, `On the side: ${h.label(s).toLowerCase()}.`, "money");
    },
  },
  {
    id: "burnout",
    tag: "life",
    cooldown: 5,
    chance: (s) => {
      const stressed = (s.job && OCC[s.job.occ].stress >= 6) || s.business;
      return stressed && s.stats.health < referenceHealth(s.age) - 3 ? 0.12 : 0;
    },
    build: () => ({
      title: "Running on empty",
      body: "You can't remember the last time you slept well. Something has to give.",
      options: [
        o("break", "Take three months off", "Lose a quarter of this year's pay"),
        o("part", "Go part-time for two years", "A third less pay, your evenings back"),
        o("push", "Push through", "Health takes the hit"),
      ],
    }),
    resolve: (s, _c, _p, opt) => {
      if (opt === "break") {
        s.flags.incomeCut = 0.25;
        bump(s, "health", 8);
        bump(s, "happiness", 5);
      } else if (opt === "part" && s.job) {
        commit(s, { key: "parttime", label: "Working part-time", wage: -0.33 * s.job.mult, until: s.year + 2, needsJob: true, health: 3, happiness: 2 });
        log(s, "You cut your hours.", "neutral");
      } else bump(s, "health", -7);
    },
  },
  {
    id: "retire",
    tag: "career",
    forced: true,
    chance: (s) => {
      if (s.retired || (!s.job && !s.business)) return 0;
      if (s.age >= retirementAge(s)) return s.flags.askedRetire === s.year - 1 ? 0.5 : 1;
      const fi = liquid(s) * 0.04 + rentIncome(s) > spendingEstimate(s);
      return s.age >= 45 && fi && !s.flags.fiAsked ? 1 : 0;
    },
    build: (s) => {
      const early = s.age < retirementAge(s);
      if (early) s.flags.fiAsked = true;
      s.flags.askedRetire = s.year;
      return {
        title: early ? "You could stop" : "Retirement age",
        body: early
          ? `Your savings could cover your spending for good. You're ${s.age}.`
          : `You're ${s.age}. ${pensionFor(s) > 0 ? `Your pension would be about ${fmt(s, pensionFor(s) * W(s))} a year.` : "There's no pension waiting for you."}`,
        options: [
          o("retire", early ? "Retire early" : "Retire"),
          o("part", "Work part-time", "Half the pay, half the hours", (!s.job || Boolean(s.flags.partTime)) && "You're not in a job you can cut back"),
          o("work", "Keep working"),
        ],
      };
    },
    resolve: (s, _c, _p, opt) => {
      if (opt === "part" && s.job) {
        s.job.mult *= 0.5;
        s.flags.partTime = true;
        bump(s, "happiness", 3);
        log(s, "You go part-time.", "milestone");
        return;
      }
      if (opt !== "retire") return;
      s.pension = pensionFor(s);
      loseJob(s);
      if (s.business) s.business.forSale = true;
      s.retired = true;
      bump(s, "happiness", 5);
      log(s, `You retire at ${s.age}.`, "milestone");
    },
  },
  // ------------------------------------------------------------- money
  {
    id: "first_savings",
    tag: "money",
    forced: true,
    once: true,
    chance: (s, c) => (adult(s) && s.age >= 18 && liquid(s) >= 0.4 * c.w ? 1 : 0),
    build: (s) => {
      const a = s.access;
      const local = country(s.country).cur;
      const options = [
        o("bank", a.bank ? "Keep it in the bank" : "Keep it at home", a.bank ? `Earns ${pct(ec(s).dep, 1)} interest` : "No bank will take you yet"),
        o("index", "A local stock index fund", "Rides the national market", !a.localEq && (country(s.country).mkt == null || s.year < (country(s.country).mkt ?? 9999) ? "No stock market here yet" : "You can't access the stock market")),
        o("global", "A global index fund", "Owns the world, priced in dollars", !a.globalEq && "Not available to you"),
        o("gold", "Gold", "The old reliable"),
      ];
      if (local !== "USD") options.push(o("usd", "US dollars", `Protection if the ${local} falls`));
      options.push(o("mix", "A bit of everything"));
      return {
        title: "Your first savings",
        body: `You've put aside ${fmt(s, liquid(s))}. Where should your money live? (You can change this any time.)`,
        options,
      };
    },
    resolve: (s, _c, _p, opt) => {
      const map: Record<string, Partial<Allocation>> = {
        bank: { cash: 1 },
        index: { localEq: 0.8, cash: 0.2 },
        global: { globalEq: 0.6, localEq: 0.2, cash: 0.2 },
        gold: { gold: 0.6, cash: 0.4 },
        usd: { usd: 0.7, cash: 0.3 },
        mix: { cash: 0.25, bonds: 0.15, localEq: 0.25, globalEq: 0.15, gold: 0.1, usd: 0.1 },
      };
      setAllocation(s, map[opt]);
      rebalance(s);
      log(s, "You decide where your savings will live.", "money");
    },
  },
  {
    id: "crash_reaction",
    tag: "market",
    forced: true,
    chance: (s) => {
      const eqLoss = Number(s.flags.lastEqReal ?? 0);
      const cryptoLoss = Number(s.flags.lastCrypto ?? 0);
      const l = liquid(s);
      if (l <= 0) return 0;
      if (eqLoss < -0.2 && equityShare(s) >= 0.25) return 1;
      if (cryptoLoss < -0.5 && s.holdings.crypto / l >= 0.15) return 1;
      return 0;
    },
    build: (s, c) => {
      const eqLoss = Number(s.flags.lastEqReal ?? 0);
      const crypto = eqLoss > -0.2;
      const loss = crypto ? Number(s.flags.lastCrypto) : eqLoss;
      const what = crypto ? "crypto" : "stocks";
      const seen = Number(s.flags["n:crash_reaction"] ?? 0);
      const again = s.flags.crashYear === s.year - 1;
      const last = String(s.flags.crashLast ?? "");
      const title = again
        ? crypto ? "Crypto falls again" : "Down again"
        : seen === 0
          ? crypto ? "Crypto crash" : "The market crashed"
          : c.r.pick(crypto ? ["Crypto crash", "Coins in free fall"] : ["Another crash", "Red on every screen", "Panic selling", "The market is falling"]);
      const before = { sell: "Last time you sold near the bottom.", half: "Last time you sold half.", hold: "Last time you held on.", buy: "Last time you bought more." }[last] ?? "";
      const crowd = c.r.pick(["Everyone around you is selling.", "The news talks of nothing else.", "Friends keep asking what you're doing.", "The headlines say this time is different."]);
      const nth = ["", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"][seen];
      return {
        title,
        body: [
          `Last year your ${what} lost ${pct(-loss)} after inflation.`,
          again ? "It's the second bad year in a row." : nth ? `It's the ${nth} crash you've lived through.` : seen >= 10 ? "You've lost count of the crashes you've lived through." : "",
          before,
          crowd,
        ].filter(Boolean).join(" "),
        options: [o("sell", "Sell everything", "Stop the bleeding"), o("half", "Sell half", "Sleep a little better"), o("hold", "Hold on", "Wait it out"), o("buy", "Buy more", "Everything is on sale")],
        payload: { crypto },
      };
    },
    resolve: (s, _c, p, opt) => {
      const keys: AssetKey[] = p.crypto ? ["crypto"] : ["localEq", "globalEq"];
      s.flags.crashYear = s.year;
      s.flags.crashLast = opt;
      if (opt === "sell" || opt === "half") {
        const share = opt === "sell" ? 1 : 0.5;
        move(s, keys, "cash", share);
        if (!p.crypto) for (const st of s.stocks.filter((x) => !x.illiquid)) {
          s.holdings.cash += st.value * share;
          st.value *= 1 - share;
          if (share === 1) st.alive = false;
        }
        s.stocks = s.stocks.filter((x) => x.alive);
        if (opt === "sell") {
          s.counters.soldInCrash++;
          log(s, "You sell near the bottom. At least you can sleep.", "money");
        } else log(s, "You sell half and keep the rest riding.", "money");
      } else if (opt === "hold") {
        s.counters.heldThroughCrash++;
        log(s, "You hold on and try not to look.", "money");
      } else {
        const target = p.crypto ? "crypto" : s.access.localEq ? "localEq" : "globalEq";
        move(s, ["cash", "bonds"], target, 0.5);
        s.counters.heldThroughCrash++;
        log(s, "You buy while everyone else is selling.", "money");
      }
    },
  },
  {
    id: "bubble",
    tag: "market",
    cooldown: 4,
    repeats: 0.6,
    chance: (s) => {
      if (!adult(s) || liquid(s) < W(s) * 0.5) return 0;
      const eqHot = Number(s.flags.lastEqReal ?? 0) > 0.2 && Number(s.flags.prevEqReal ?? 0) > 0.15 && s.access.localEq;
      const cryptoHot = Number(s.flags.lastCrypto ?? 0) > 1 && s.access.crypto;
      return eqHot || cryptoHot ? 0.5 : 0;
    },
    build: (s) => {
      const cryptoHot = Number(s.flags.lastCrypto ?? 0) > 1 && s.access.crypto;
      const asset: AssetKey = cryptoHot ? "crypto" : "localEq";
      const gain = cryptoHot ? Number(s.flags.lastCrypto) : Number(s.flags.lastEqReal);
      return {
        title: cryptoHot ? "Crypto fever" : "Everyone is getting rich",
        body: cryptoHot
          ? `Bitcoin rose ${pct(gain)} last year. A coworker just quit to trade full time.`
          : `The stock market is up ${pct(gain)} after inflation last year, and the year before. Your barber gives you stock tips.`,
        options: [o("allin", "Go all in", "80% of your savings"), o("trim", "Take some profits"), o("steady", "Stay the course")],
        payload: { asset },
      };
    },
    resolve: (s, _c, p, opt) => {
      const asset = p.asset as AssetKey;
      if (opt === "allin") {
        const others = ASSET_KEYS.filter((k) => k !== asset);
        move(s, others, asset, 0.8);
        log(s, "You go all in. It feels amazing.", "money");
      } else if (opt === "trim" && s.holdings[asset] > 0) {
        s.holdings.cash += s.holdings[asset] * 0.4;
        s.holdings[asset] *= 0.6;
        syncAllocation(s);
        log(s, "You take some chips off the table.", "money");
      }
    },
  },
  {
    id: "stock_tip",
    tag: "market",
    cooldown: 3,
    repeats: 0.5,
    chance: (s, c) => (adult(s) && s.access.localEq && liquid(s) >= 0.5 * c.w ? 0.07 : 0),
    build: (s, c) => {
      const st = makeStock(s, c.r);
      const who = c.r.pick(["A colleague", "Your brother-in-law", "A man at the gym", "Your barber", "A financial columnist", "An old school friend"]);
      return {
        title: c.r.pick([`A hot tip: ${st.name}`, `Everyone's talking about ${st.name}`, `${st.name} is going to the moon`]),
        body: `${who} swears by it. ${st.sector} company. "${st.pitch}"`,
        options: [o("small", "Invest 10% of your savings", fmt(s, liquid(s) * 0.1)), o("big", "Invest 30%", fmt(s, liquid(s) * 0.3)), o("pass", "Pass")],
        payload: { st },
      };
    },
    resolve: (s, _c, p, opt) => {
      if (opt === "pass") return;
      const st = { ...(p.st as Record<string, unknown>) } as unknown as Parameters<typeof buyStock>[1];
      const amt = liquid(s) * (opt === "big" ? 0.3 : 0.1);
      if (buyStock(s, st, amt)) log(s, `You buy ${fmt(s, amt)} of ${st.name}.`, "money");
    },
  },
  {
    id: "ponzi",
    tag: "market",
    cooldown: 6,
    repeats: 0.5,
    chance: (s, c) => {
      if (!adult(s) || liquid(s) < 0.3 * c.w || s.flags.ponziEnd) return 0;
      const wave = PONZI_WAVES.some((w) => w.iso === s.country && s.year >= w.from && s.year <= w.to);
      return 0.01 + (wave ? 0.4 : 0);
    },
    build: (s) => {
      const wave = PONZI_WAVES.find((w) => w.iso === s.country && s.year >= w.from && s.year <= w.to);
      return {
        title: "A guaranteed return",
        body: wave ? wave.text : "A smooth-talking acquaintance offers an investment club paying 5% a month, guaranteed. Early members swear by it.",
        options: [o("some", "Put in 10%", fmt(s, liquid(s) * 0.1)), o("lots", "Put in half", fmt(s, liquid(s) * 0.5)), o("no", "Walk away")],
      };
    },
    resolve: (s, c, _p, opt) => {
      if (opt === "no") return;
      const amt = raiseCash(s, liquid(s) * (opt === "lots" ? 0.5 : 0.1));
      s.flags.ponziAmt = amt;
      s.flags.ponziEnd = s.year + c.r.int(1, 3);
      log(s, `You hand over ${fmt(s, amt)}.`, "money");
    },
  },
  {
    id: "lottery",
    tag: "money",
    cooldown: 6,
    repeats: 0.4,
    chance: (s) => (adult(s) ? 0.03 : 0),
    build: (s, c) => ({
      ...c.r.pick([
        { title: "The jackpot is enormous", body: "Everyone at work is buying tickets this week." },
        { title: "The office syndicate", body: "Your colleagues are pooling money for the big draw." },
        { title: "A rollover week", body: "Nobody has won for weeks. The queue at the corner shop is out the door." },
      ]),
      options: [o("one", "Buy a ticket", fmt(s, 0.0005 * c.w)), o("many", "Buy a hundred", fmt(s, 0.03 * c.w)), o("no", "Skip it")],
    }),
    resolve: (s, c, _p, opt) => {
      if (opt === "no") return;
      const cost = (opt === "many" ? 0.03 : 0.0005) * W(s);
      pay(s, cost);
      const tickets = opt === "many" ? 100 : 1;
      if (c.r.chance(tickets * 2e-7)) {
        const prize = 200 * W(s);
        invest(s, prize);
        log(s, `You win the jackpot: ${fmt(s, prize)}!`, "good");
      } else if (c.r.chance(0.02 * tickets ** 0.5)) {
        invest(s, cost * 5);
        log(s, `A small prize: ${fmt(s, cost * 5)}.`, "good");
      } else log(s, "Not even close.", "neutral");
    },
  },
  {
    id: "inflation_spike",
    tag: "market",
    forced: true,
    cooldown: 2,
    chance: (s, c) => (adult(s) && c.e.infl > 0.25 && s.holdings.cash + s.cashHome >= 0.3 * c.w ? 1 : 0),
    build: (s, c) => ({
      title: "Your cash is melting",
      body: `Prices are rising ${pct(c.e.infl)} a year. Money in the bank pays ${pct(c.e.dep)}.`,
      options: [o("usd", "Swap most of it for US dollars", s.country === "USA" ? undefined : `Black-market premium where controls apply`), o("gold", "Buy gold"), o("stay", "Keep it as it is")],
    }),
    resolve: (s, _c, _p, opt) => {
      if (opt === "stay") return;
      if (s.cashHome > 0) {
        s.holdings.cash += s.cashHome;
        s.cashHome = 0;
      }
      move(s, ["cash"], opt === "usd" ? "usd" : "gold", 0.8);
      log(s, opt === "usd" ? "You turn your savings into dollars." : "You buy gold.", "money");
    },
  },
  {
    id: "bank_run",
    tag: "market",
    forced: true,
    once: false,
    chance: (s, c) => (c.e.bankCrisis && s.access.bank && s.holdings.cash >= 0.3 * c.w ? 1 : 0),
    build: (s) => ({
      title: "Are the banks safe?",
      body: "There are queues outside the banks. People say deposits could be frozen.",
      options: [
        o("withdraw", "Take your cash out", "Keep it at home — no interest, some risk"),
        o("dollars", "Change it into US dollars", "If the banks fall, the currency may too", s.country === "USA" && "You already hold dollars"),
        o("keep", "Leave it in the bank"),
      ],
    }),
    resolve: (s, _c, _p, opt) => {
      if (opt === "dollars") {
        move(s, ["cash"], "usd", 1);
        log(s, "You swap your savings for dollars.", "money");
      }
      if (opt === "withdraw") {
        s.cashHome += s.holdings.cash;
        s.holdings.cash = 0;
        s.flags.withdrew = s.year;
        log(s, "You withdraw your savings and hide them at home.", "money");
      }
    },
  },
  {
    id: "home_buy",
    tag: "money",
    core: true,
    cooldown: 3,
    chance: (s) => {
      if (!adult(s) || s.age < 24 || s.age > 62 || s.properties.some((p) => p.kind === "home")) return 0;
      return mortgageQuote(s, homePrice(s)).ok ? 0.25 : 0;
    },
    build: (s, c) => {
      const price = homePrice(s) * c.r.range(0.75, 1.25);
      const q = mortgageQuote(s, price);
      if (!q.ok) return null;
      return {
        title: "A place of your own?",
        body: `A ${s.kids.length ? "house" : "flat"} you like is for sale for ${fmt(s, price)}. ${q.loan > 0 ? `With ${fmt(s, q.down)} down, the mortgage is ${fmt(s, q.payment)} a year at ${pct(mortgageRate(s), 1)}.` : "No bank will lend here — it's cash only."}`,
        options: [o("home", "Buy it and move in", "No more rent"), o("rent", "Buy it to rent out", `Rent ~${fmt(s, price * c.e.rentYield)}/yr`), o("no", "Keep renting")],
        payload: { price },
      };
    },
    resolve: (s, _c, p, opt) => {
      if (opt === "no") return;
      if (buyProperty(s, opt === "home" ? "home" : "rental", Number(p.price))) {
        if (opt === "home") s.livingWithParents = false;
        log(s, opt === "home" ? `You buy a home for ${fmt(s, Number(p.price))}.` : `You buy a rental property for ${fmt(s, Number(p.price))}.`, "milestone");
      }
    },
  },
  {
    id: "angel",
    tag: "market",
    cooldown: 5,
    chance: (s, c) => (s.stats.network >= 45 && liquid(s) >= 2 * c.w && s.age >= 28 && s.age <= 65 ? 0.05 : 0),
    build: (s, c) => {
      const st = makeStock(s, c.r, true);
      return {
        title: "A startup is raising money",
        body: `A former colleague is building ${st.name}. They're asking friends to invest. Most startups fail; a few return 100×.`,
        options: [o("small", "Invest", fmt(s, 0.5 * c.w)), o("big", "Invest big", fmt(s, 2 * c.w)), o("no", "Pass")],
        payload: { st },
      };
    },
    resolve: (s, _c, p, opt) => {
      if (opt === "no") return;
      const st = { ...(p.st as Record<string, unknown>) } as unknown as Parameters<typeof buyStock>[1];
      const amt = (opt === "big" ? 2 : 0.5) * W(s);
      if (buyStock(s, st, amt)) log(s, `You invest ${fmt(s, amt)} in ${st.name}.`, "money");
    },
  },
  {
    id: "crypto_discovery",
    tag: "market",
    once: true,
    forced: true,
    chance: (s) => (s.year >= 2011 && s.year <= 2013 && s.age >= 15 && s.age <= 65 && s.access.crypto ? 0.45 : 0),
    build: (s, c) => ({
      title: "Magic internet money",
      body: `An online forum is buzzing about Bitcoin, a digital currency trading at about ${fmtUsd(c.prev.btc ?? 1)}. Most people think it's a joke.`,
      options: [o("little", "Buy a little", fmt(s, Math.max(0.02 * c.w, liquid(s) * 0.05))), o("lot", "Buy a lot", fmt(s, liquid(s) * 0.25)), o("no", "Ignore it")],
    }),
    resolve: (s, c, _p, opt) => {
      s.flags.cryptoSeen = true;
      if (opt === "no") return;
      const amt = opt === "lot" ? liquid(s) * 0.25 : Math.min(liquid(s), Math.max(0.02 * c.w, liquid(s) * 0.05));
      const got = raiseCash(s, amt);
      s.holdings.crypto += got * 0.99;
      log(s, `You buy ${fmt(s, got)} of bitcoin.`, "money");
      enqueue(s, "crypto_custody");
    },
  },
  {
    id: "crypto_later",
    tag: "market",
    cooldown: 4,
    chance: (s) => (s.year >= 2014 && !s.flags.cryptoSeen && s.access.crypto && s.age >= 18 && s.age <= 65 && liquid(s) > 0 ? 0.06 : 0),
    build: (s, c) => ({
      title: "Bitcoin again",
      body: `Bitcoin is at ${fmtUsd(c.prev.btc ?? 1)}. Your nephew says it's going to the moon.`,
      options: [o("buy", "Buy some", fmt(s, liquid(s) * 0.05)), o("lots", "Bet big", fmt(s, liquid(s) * 0.2)), o("no", "Pass")],
    }),
    resolve: (s, _c, _p, opt) => {
      s.flags.cryptoSeen = true;
      if (opt !== "buy" && opt !== "lots") return;
      const got = raiseCash(s, liquid(s) * (opt === "lots" ? 0.2 : 0.05));
      s.holdings.crypto += got * 0.99;
      log(s, `You buy ${fmt(s, got)} of bitcoin.`, "money");
      enqueue(s, "crypto_custody");
    },
  },
  {
    id: "crypto_custody",
    tag: "market",
    once: true,
    build: () => ({
      title: "Where do you keep your coins?",
      body: "You can leave them on the exchange, or move them to a wallet only you control.",
      options: [
        o("exchange", "Leave them on the exchange", "Easy. You trust them."),
        o("self", "Your own wallet", "Lose the key, lose the coins"),
        o("backup", "Your own wallet, with the recovery words in a safe", "A bit of effort, far less risk"),
      ],
    }),
    resolve: (s, _c, _p, opt) => {
      s.cryptoCustody = opt === "exchange" ? "exchange" : "self";
      if (opt === "backup") s.flags.walletBackup = true;
    },
  },
  {
    id: "debt_crisis",
    tag: "money",
    forced: true,
    cooldown: 3,
    chance: (s, c) => (s.consumerDebt > 2.5 * c.w && liquid(s) < s.consumerDebt * 0.2 ? 1 : 0),
    build: (s) => {
      const legal = dev(s) >= 0.5;
      const family = (s.parents.alive[0] || s.parents.alive[1]) && s.parents.wealthMult > 1;
      return {
        title: "Drowning in debt",
        body: `You owe ${fmt(s, s.consumerDebt)} at ${pct(consumerRate(s))} interest. ${moneyYears(s, s.consumerDebt)}.`,
        options: [
          o("bankrupt", legal ? "Declare bankruptcy" : "Default and disappear for a while", legal ? "Debts wiped, credit locked for 7 years" : "The lenders won't forget"),
          o("family", "Ask your family for help", undefined, !family && "They can't help"),
          o("plan", "Agree a repayment plan", "A fifth written off, credit locked for 3 years"),
          o("pay", "Keep paying"),
        ],
      };
    },
    resolve: (s, _c, _p, opt) => {
      if (opt === "bankrupt") {
        const legal = dev(s) >= 0.5;
        liquidateDesk(s, "The trading account is closed in the bankruptcy");
        const seized = raiseCash(s, Math.max(0, liquid(s) - 0.3 * W(s)));
        s.consumerDebt = legal ? 0 : Math.max(0, s.consumerDebt - seized) * 0.5;
        s.creditLockUntil = s.year + 7;
        s.counters.bankruptcies++;
        bump(s, "happiness", -15);
        bump(s, "network", legal ? -5 : -12);
        log(s, legal ? "You declare bankruptcy." : "You default on your lenders.", "bad");
      } else if (opt === "plan") {
        s.consumerDebt *= 0.8;
        s.creditLockUntil = s.year + 3;
        bump(s, "happiness", -5);
        log(s, "You agree a repayment plan with your lenders.", "neutral");
      } else if (opt === "family") {
        const help = s.consumerDebt * 0.5;
        s.consumerDebt -= help;
        s.parents.wealthMult = Math.max(0, s.parents.wealthMult - help / W(s));
        bump(s, "network", -4);
        log(s, `Your family pays off ${fmt(s, help)} of your debts.`, "neutral");
      }
    },
  },
  // ------------------------------------------------------------- family
  {
    id: "romance",
    tag: "life",
    core: true,
    cooldown: 2,
    chance: (s) => (!s.partner && !s.dating && s.age >= 18 && s.age <= 55 ? (s.age < 30 ? 0.13 : s.age < 40 ? 0.07 : 0.03) : 0),
    build: (s, c) => {
      const name = givenName(partnerNames(s), partnerOf(s), c.r);
      const where = c.r.pick([
        s.school ? "at college" : "at work",
        "through friends",
        "at a friend's wedding",
        s.year >= 2008 ? "on a dating app" : "at a dance",
        "on a long train journey",
        "at a neighbour's party",
      ]);
      return {
        title: c.r.pick(["Someone new", "A spark", "A first date"]),
        body: `You meet ${name} ${where}. There's a spark.`,
        options: [o("yes", "See where it goes"), o("slow", "Keep it slow", "No rush to settle down"), o("no", "Not now — focus on yourself")],
        payload: { name },
      };
    },
    resolve: (s, _c, p, opt) => {
      if (opt === "yes" || opt === "slow") {
        s.dating = true;
        s.flags.datingName = String(p.name);
        s.flags.datingSince = s.year;
        s.flags.datingSlow = opt === "slow";
        bump(s, "happiness", 4);
      }
    },
  },
  {
    id: "wedding",
    tag: "life",
    forced: true,
    chance: (s) => (s.dating && s.year - Number(s.flags.datingSince ?? s.year) >= (s.flags.datingSlow ? 3 : 1) ? 0.5 : 0),
    build: (s, c) => ({
      title: "Marriage?",
      body: `${s.flags.datingName} wants to get married.`,
      options: [o("small", "A small wedding", fmt(s, 0.25 * c.w)), o("big", "A big wedding", `${fmt(s, 1.2 * c.w)} — the whole town comes`), o("wait", "Not ready yet")],
    }),
    resolve: (s, c, _p, opt) => {
      if (opt === "wait") {
        if (c.r.chance(0.3)) {
          s.dating = false;
          bump(s, "happiness", -8);
          log(s, `${s.flags.datingName} leaves.`, "bad");
        }
        return;
      }
      pay(s, (opt === "big" ? 1.2 : 0.25) * W(s));
      const eduOrder: Edu[] = ["none", "primary", "secondary", "vocational", "bachelor", "master", "doctorate"];
      const i = clamp(eduOrder.indexOf(s.edu) + c.r.int(-1, 1), 0, eduOrder.length - 1);
      const pEdu = eduOrder[i];
      const base: Record<Edu, number> = { none: 0.4, primary: 0.6, secondary: 0.85, vocational: 1, bachelor: 1.4, master: 1.7, doctorate: 2 };
      const region = country(s.country).r;
      const partnerFemale = partnerOf(s) === "F";
      const lfp = partnerFemale ? (region === "MEA" || region === "SAS" ? 0.3 : 0.7) : 0.9;
      s.partner = { name: String(s.flags.datingName), edu: pEdu, mult: base[pEdu] * Math.exp(c.r.normal(0, 0.35)), working: c.r.chance(lfp), since: s.year };
      s.dating = false;
      delete s.flags.datingSlow;
      s.livingWithParents = false;
      bump(s, "happiness", opt === "big" ? 9 : 6);
      if (opt === "big") bump(s, "network", 5);
      log(s, `You marry ${s.partner.name}.`, "milestone");
    },
  },
  {
    id: "baby",
    tag: "life",
    core: true,
    cooldown: 1,
    chance: (s) => {
      if (!s.partner || s.age < 20 || s.age > 44 || s.kids.length >= 6 || s.flags.noMoreKids || Number(s.flags.babyWait ?? 0) > s.year) return 0;
      const tfr = nearest(s.country, "tfr", s.year) ?? 2.5;
      return clamp(tfr * 0.07, 0.03, 0.4) * (s.kids.length >= 2 ? 0.5 : 1);
    },
    build: (s, c) => ({
      title: s.kids.length ? c.r.pick(["Another child?", "A bigger family?"]) : c.r.pick(["A baby?", "Starting a family"]),
      body: `${s.kids.length ? `You have ${s.kids.length === 1 ? "one child" : `${s.kids.length} children`}. ` : `You and ${s.partner!.name} talk about children. `}Each child costs about ${fmt(s, 0.2 * c.w)} a year until they leave home.`,
      options: [o("yes", "Yes"), o("later", "In a couple of years"), o("never", s.kids.length ? "Our family is complete" : "We don't want children")],
    }),
    resolve: (s, c, _p, opt) => {
      if (opt === "later") s.flags.babyWait = s.year + 2;
      if (opt === "never") s.flags.noMoreKids = true;
      if (opt !== "yes") return;
      const sex = c.r.chance(0.51) ? "M" : "F";
      const names = familyNames(s, "kids");
      let name = givenName(names, sex, c.r);
      for (let k = 0; k < 6 && (s.kids.some((x) => x.name === name) || s.partner?.name === name); k++) name = givenName(names, sex, c.r);
      s.kids.push({ name, born: s.year, sex });
      bump(s, "happiness", 6);
      log(s, `${name} is born.`, "milestone");
    },
  },
  {
    id: "divorce",
    tag: "life",
    core: true,
    cooldown: 5,
    chance: (s) => {
      if (!s.partner) return 0;
      const strain = (s.stats.happiness < 40 ? 0.015 : 0) + (s.consumerDebt > 2 * W(s) ? 0.01 : 0);
      return (0.01 + strain) * (dev(s) >= 0.6 ? 1.5 : 0.6);
    },
    build: (s) => ({
      title: "It's over",
      body: `You and ${s.partner!.name} are splitting up. Your net worth is ${fmt(s, netWorth(s))}.`,
      options: [
        o("split", "Split everything evenly"),
        o("mediate", "Go to a mediator", `${fmt(s, 0.08 * W(s))}, a calmer deal`),
        o("court", "Fight it in court", `Legal fees ${fmt(s, 0.4 * W(s))}, could go either way`),
      ],
    }),
    resolve: (s, c, _p, opt) => {
      let share = 0.5;
      if (opt === "mediate") {
        pay(s, 0.08 * W(s));
        share = c.r.range(0.42, 0.5);
        bump(s, "happiness", 3);
      }
      if (opt === "court") {
        pay(s, 0.4 * W(s));
        share = c.r.chance(0.5) ? 0.35 : 0.6;
      }
      giveAway(s, share);
      log(s, `You divorce ${s.partner!.name}. They leave with ${pct(share)} of what you had.`, "bad");
      s.partner = null;
      bump(s, "happiness", -14);
    },
  },
  {
    id: "illness",
    tag: "life",
    core: true,
    chance: (s) => (s.age >= 18 ? (0.012 + 0.0012 * Math.max(0, s.age - 30)) * clamp(1 + (referenceHealth(s.age) - s.stats.health) / 40, 0.4, 3) : 0),
    build: (s, c) => {
      const [name, severity] = c.r.pick(CONDITIONS.filter(([, , from]) => s.age >= from));
      const oop = (country(s.country).oop ?? 40) / 100;
      const cost = c.w * severity * 1.2 * oop * (s.flags.insured ? 0.25 : s.flags.insuredBasic ? 0.6 : 1);
      const abroad = dev(s) >= 0.75 && cost >= 0.4 * c.w;
      return {
        title: c.r.pick(["Bad news from the doctor", "Test results", "A hospital visit"]),
        body: `You're diagnosed with ${name}. The best treatment will cost you ${fmt(s, cost)} out of pocket.`,
        options: [
          o("best", "Get the best treatment", fmt(s, cost)),
          o("basic", "Basic treatment", fmt(s, cost * 0.3)),
          ...(abroad ? [o("abroad", "Get treated abroad", `${fmt(s, cost * 0.45)} and a long trip`)] : []),
          o("skip", "Skip it and hope", "Free"),
        ],
        payload: { cost, severity, name },
      };
    },
    resolve: (s, _c, p, opt) => {
      const cost = Number(p.cost);
      const sev = Number(p.severity);
      if (opt === "best") {
        pay(s, cost);
        bump(s, "health", -3 * sev);
      } else if (opt === "abroad") {
        pay(s, cost * 0.45);
        bump(s, "health", -4 * sev);
        bump(s, "happiness", -2);
      } else if (opt === "basic") {
        pay(s, cost * 0.3);
        bump(s, "health", -8 * sev);
      } else bump(s, "health", -16 * sev);
      bump(s, "happiness", -4);
      log(s, `You're treated for ${p.name}.`, opt === "skip" ? "bad" : "neutral");
    },
  },
  {
    id: "insurance",
    tag: "money",
    once: true,
    chance: (s) => (s.age >= 25 && s.age <= 45 && s.access.bank && dev(s) >= 0.3 && !s.flags.insured && !s.flags.insuredBasic ? 0.15 : 0),
    build: (s, c) => ({
      title: "Health insurance",
      body: `An agent offers a full health plan for ${fmt(s, 0.03 * c.w)} a year, covering most big medical bills, or a basic one for ${fmt(s, 0.012 * c.w)} that covers about half.`,
      options: [o("buy", "The full plan"), o("basic", "The basic plan"), o("no", "No thanks")],
    }),
    resolve: (s, _c, _p, opt) => {
      if (opt === "buy") {
        s.flags.insured = true;
        log(s, "You buy health insurance.", "money");
      } else if (opt === "basic") {
        s.flags.insuredBasic = true;
        log(s, "You buy a basic health plan.", "money");
      }
    },
  },
  {
    id: "parents_support",
    tag: "life",
    cooldown: 6,
    chance: (s) => ((s.parents.alive[0] || s.parents.alive[1]) && s.age >= 28 && s.parents.incomeMult < 1 && dev(s) < 0.8 && Number(s.flags.supportUntil ?? 0) < s.year ? 0.12 : 0),
    build: () => ({
      title: "Your parents are getting old",
      body: "They can't work anymore and they never had savings.",
      options: [o("yes", "Support them", "About 8% of your income for six years"), o("some", "Send what you can", "About 4% of your income"), o("no", "You can't afford it")],
    }),
    resolve: (s, _c, _p, opt) => {
      if (opt === "yes" || opt === "some") {
        s.flags.supportUntil = s.year + 6;
        s.flags.supportShare = opt === "some" ? 0.04 : 0.08;
        bump(s, "happiness", 3);
        bump(s, "network", 3);
      } else bump(s, "happiness", -5);
    },
  },
  {
    id: "parent_care",
    tag: "life",
    forced: true,
    chance: (s) => {
      const i = frailParent(s);
      return i == null || !adult(s) || s.age < 25 ? 0 : clamp((s.age + s.parents.ageAtBirth[i] - 74) * 0.04, 0.04, 0.35);
    },
    build: (s, c) => {
      const i = frailParent(s);
      if (i == null) return null;
      const who = i === 0 ? "mother" : "father";
      const cost = careCost(s);
      const theirs = Math.max(0, s.parents.wealthMult * c.w);
      const aid = careAid(s);
      const yours = (Math.max(0, cost - theirs) * (1 - aid)) / (s.siblings + 1);
      const home = dev(s) >= 0.45;
      return {
        title: `Your ${who} needs care`,
        body:
          `Your ${who} is ${s.age + s.parents.ageAtBirth[i]} and can't live alone any more. ${home ? "A care home" : "A carer at home"} costs about ${fmt(s, cost)} a year here.` +
          (theirs >= 0.1 * c.w ? ` Their savings, ${fmt(s, theirs)}, pay first.` : "") +
          (aid >= 0.5 ? " Once they're spent, the state pays most of it." : aid > 0 ? " Once they're spent, the state helps a little." : "") +
          (s.siblings ? ` You'd split the rest with ${s.siblings === 1 ? "your sibling" : `your ${s.siblings} siblings`}.` : ""),
        options: [
          o("home", home ? "Pay for a care home" : "Pay for a carer", yours > 0 ? `About ${fmt(s, yours)} a year from you` : "Their savings cover it for now"),
          o("together", "Move them in with you", s.job ? "A quarter of the cost and about 15% less pay" : "A quarter of the cost, and a full house"),
          o("self", "Look after them yourself", s.job ? "About 40% less pay while they need you" : "It will wear on you"),
          ...(s.siblings ? [o("siblings", "Leave it to your siblings", "Free now. The family will remember")] : []),
        ],
        payload: { i },
      };
    },
    resolve: (s, _c, p, opt) => {
      const i = Number(p.i);
      const who = i === 0 ? "mother" : "father";
      s.flags[`care${i}`] = opt;
      if (opt === "home") log(s, dev(s) >= 0.45 ? `Your ${who} moves into a care home.` : `You pay a carer to look after your ${who}.`, "neutral");
      else if (opt === "together") {
        bump(s, "network", 2);
        log(s, `Your ${who} moves in with you, with a carer coming in by day.`, "neutral");
      } else if (opt === "self") {
        bump(s, "network", 3);
        log(s, `You cut back at work to look after your ${who}.`, "neutral");
      } else {
        s.flags.careLeft = true;
        bump(s, "happiness", -4);
        bump(s, "network", -6);
        log(s, `Your siblings take on your ${who}'s care.`, "neutral");
      }
    },
  },
  {
    id: "kid_deposit",
    tag: "money",
    cooldown: 3,
    chance: (s, c) => (adult(s) && grownKidBuying(s) && liquid(s) >= 1.5 * c.w ? 0.15 : 0),
    build: (s, c) => {
      const k = grownKidBuying(s);
      if (!k) return null;
      const amt = Math.min(1.5 * c.w, 0.3 * liquid(s));
      return {
        title: `A deposit for ${k.name}`,
        body: `${k.name} is ${s.year - k.born} and buying a first home, but is short of the deposit.`,
        options: [o("all", `Give ${fmt(s, amt)}`, "A head start you won't see again"), o("half", `Give ${fmt(s, amt / 2)}`), o("no", "They'll manage")],
        payload: { name: k.name, amt },
      };
    },
    resolve: (s, _c, p, opt) => {
      s.flags[`deposit:${p.name}`] = s.year;
      if (opt === "no") return;
      const amt = Number(p.amt) * (opt === "half" ? 0.5 : 1);
      pay(s, amt);
      bump(s, "happiness", 3);
      log(s, `You give ${p.name} ${fmt(s, amt)} towards a first home.`, "money");
    },
  },
  {
    id: "sibling_loan",
    tag: "life",
    cooldown: 7,
    chance: (s, c) => (s.siblings > 0 && adult(s) && liquid(s) >= c.w ? 0.035 : 0),
    build: (s, c) => ({
      title: "Your sibling needs money",
      body: `They need ${fmt(s, 0.5 * c.w)} to save their business. They promise to pay you back.`,
      options: [o("lend", "Lend it"), o("gift", "Give it, no strings"), o("no", "Say no")],
    }),
    resolve: (s, c, _p, opt) => {
      const amt = 0.5 * W(s);
      if (opt === "no") {
        bump(s, "network", -4);
        return;
      }
      pay(s, amt);
      if (opt === "gift") {
        bump(s, "network", 5);
        bump(s, "happiness", 2);
      } else if (c.r.chance(0.4)) {
        s.flags.loanBack = s.year + 3;
        s.flags.loanAmt = amt;
      }
      log(s, `You ${opt === "gift" ? "give" : "lend"} your sibling ${fmt(s, amt)}.`, "money");
    },
  },
  {
    id: "kid_college",
    tag: "life",
    forced: true,
    chance: (s) => (s.kids.some((k) => s.year - k.born === 18) ? 1 : 0),
    build: (s) => {
      const kid = s.kids.find((k) => s.year - k.born === 18)!;
      const cost = tuitionPerYear(s, "bachelor") * 4 + 0.3 * W(s) * 4;
      return {
        title: `${kid.name} got into university`,
        body: `Four years of tuition and living costs: about ${fmt(s, cost)}.`,
        options: [o("pay", "Pay for it"), o("half", "Pay half", "They borrow the rest"), o("loans", "Let them take out loans"), o("no", "Tell them to get a job")],
        payload: { cost, name: kid.name },
      };
    },
    resolve: (s, _c, p, opt) => {
      if (opt === "half") {
        pay(s, Number(p.cost) / 2);
        bump(s, "happiness", 2);
      }
      if (opt === "pay") {
        pay(s, Number(p.cost));
        bump(s, "happiness", 4);
        s.flags.kidsCollege = Number(s.flags.kidsCollege ?? 0) + 1;
      } else if (opt === "no") bump(s, "network", -3);
    },
  },
  {
    id: "migration",
    tag: "life",
    core: true,
    cooldown: 6,
    chance: (s) => {
      if (s.age < 20 || s.age > 45 || dev(s) >= 0.85 || s.counters.moves >= 2 || s.flags.rooted) return 0;
      if (!(eduAtLeast(s.edu, "bachelor") || s.stats.skill >= 55 || s.stats.network >= 60)) return 0;
      return destinations(s).length ? 0.05 + (s.flags.studiedAbroad ? 0.1 : 0) : 0;
    },
    build: (s, c) => {
      const dest = c.r.pick(destinations(s));
      const ratio = econ(dest, s.macroSeed, s.year).wage / econ(dest, s.macroSeed, s.year).fx / (c.w / c.e.fx);
      return {
        title: `A chance to move to ${countryIn(dest)}`,
        body: `A job abroad has come up. Wages there are about ${ratio.toFixed(1)}× what they are here, in dollars — but so is the rent, and you'd start over.`,
        options: [o("go", `Move to ${countryIn(dest)}`), o("stay", "Not now", "Something else may come up"), o("never", "Stay for good", "Home is home")],
        payload: { dest },
      };
    },
    resolve: (s, _c, p, opt) => {
      if (opt === "never") s.flags.rooted = true;
      if (opt !== "go") return;
      const dest = String(p.dest);
      const from = countryIn(s.country);
      loseJob(s);
      moveCountry(s, dest);
      log(s, `You leave ${from} for ${countryIn(dest)}.`, "milestone");
      enqueue(s, "first_job", { title: "A new country", body: "Your qualifications don't fully count here yet. Here's what's on offer:" });
    },
  },
  {
    id: "war",
    tag: "life",
    forced: true,
    cooldown: 2,
    chance: (s, c) => (s.age >= 16 && c.e.war >= 20 ? clamp(c.e.war / 2500, 0.02, 0.6) : 0),
    build: (s) => {
      const safe = destinations(s).length > 0;
      return {
        title: "War comes to your town",
        body: "Shelling at night. Neighbours are packing what they can carry.",
        options: [
          o("flee", "Flee abroad", "Lose most of what you own", !safe && "There's nowhere to go"),
          o("rural", "Go to relatives in the countryside", "Safer, but you leave your work behind"),
          o("stay", "Stay and endure"),
        ],
      };
    },
    resolve: (s, c, _p, opt) => {
      if (opt === "flee") {
        const dest = c.r.pick(destinations(s));
        loseJob(s);
        moveCountry(s, dest, 0.7);
        s.flags.refugee = true;
        bump(s, "happiness", -15);
        log(s, `You flee to ${countryIn(dest)} with almost nothing.`, "bad");
        enqueue(s, "first_job", { title: "Starting over", body: "As a refugee, you take what work you can find:" });
      } else if (opt === "rural") {
        if (s.job) loseJob(s);
        bump(s, "health", -5);
        bump(s, "happiness", -8);
        for (const p of s.properties) p.value *= 0.8;
        if (s.business) s.business.scale *= 0.6;
        s.flags.warRisk = c.e.war * 0.4;
        log(s, "You sit out the fighting with relatives in the countryside.", "bad");
      } else {
        bump(s, "health", -12);
        bump(s, "happiness", -10);
        for (const p of s.properties) p.value *= 0.7;
        if (s.business) s.business.scale *= 0.5;
        s.flags.warRisk = c.e.war;
        log(s, "You stay. The war takes a toll.", "bad");
      }
    },
  },
  {
    id: "disaster",
    tag: "life",
    chance: (s) => (s.properties.length ? 0.004 : 0),
    build: (s, c) => {
      const p = s.properties[0];
      const dmg = p.value * c.r.range(0.15, 0.4);
      return {
        title: c.r.pick(["Flood", "Fire", "Earthquake", "Storm"]),
        body: `Your property is badly damaged. Repairs: ${fmt(s, dmg)}.`,
        options: [
          o("fix", "Rebuild properly"),
          o("patch", "Patch it up", `${fmt(s, dmg * 0.4)}, and it's worth less`),
          o("sell", "Sell it as it is", "At a big discount"),
        ],
        payload: { dmg, id: p.id },
      };
    },
    resolve: (s, _c, p, opt) => {
      if (opt === "fix") pay(s, Number(p.dmg));
      else if (opt === "patch") {
        pay(s, Number(p.dmg) * 0.4);
        const prop = s.properties.find((x) => x.id === p.id);
        if (prop) prop.value *= 0.88;
      } else sellProperty(s, String(p.id), 0.35);
      bump(s, "happiness", -5);
    },
  },
  {
    id: "midlife",
    tag: "life",
    once: true,
    chance: (s) => (s.age >= 42 && s.age <= 50 ? 0.2 : 0),
    build: (s, c) => ({
      title: "Is this it?",
      body: "You feel time slipping away.",
      options: [o("car", "Buy the car you always wanted", fmt(s, 0.8 * c.w)), o("sabbatical", "Take a year off", "Half a year's income"), o("dream", "Start the business you always talked about"), o("nothing", "Nothing changes")],
    }),
    resolve: (s, _c, _p, opt) => {
      if (opt === "car") {
        pay(s, 0.8 * W(s));
        bump(s, "happiness", 4);
      }
      if (opt === "sabbatical") {
        s.flags.incomeCut = 0.5;
        bump(s, "happiness", 6);
        bump(s, "health", 3);
      }
      if (opt === "dream") enqueue(s, "start_business");
    },
  },
  {
    id: "scam_call",
    tag: "money",
    cooldown: 8,
    repeats: 0.5,
    chance: (s, c) => (s.age >= 65 && liquid(s) >= c.w ? 0.03 : 0),
    build: () => ({
      title: "An urgent call",
      body: "A polite man from 'your bank' says your account has been hacked. He needs you to move your savings to a safe account, today.",
      options: [o("follow", "Do what he says"), o("check", "Hang up and ring the number on your card"), o("hang", "Hang up")],
    }),
    resolve: (s, _c, _p, opt) => {
      if (opt === "follow") {
        const lost = raiseCash(s, liquid(s) * 0.15);
        s.counters.scams++;
        bump(s, "happiness", -8);
        log(s, `It was a scam. ${fmt(s, lost)} is gone.`, "bad");
      } else if (opt === "check") {
        bump(s, "skill", 1);
        log(s, "Your bank has never heard of him. You report the number.", "good");
      }
    },
  },
  // ------------------------------------------------------------- everyday life: young adults
  {
    id: "moving_out",
    tag: "life",
    once: true,
    chance: (s) => (adult(s) && s.livingWithParents && s.age >= 19 && s.age <= 26 ? 0.3 : 0),
    build: (s, c) => ({
      title: "Moving out",
      body: `You still live with your parents. Rent for a small place here runs to about ${fmt(s, c.e.rentYield * homePrice(s) * 0.6)} a year.`,
      options: [
        o("share", "Share a flat with friends", "About half the rent, never a quiet night"),
        o("own", "A place of your own", "Your own space, the full rent"),
        o("city", "Move to the big city", "Better pay, a third more rent"),
        o("stay", "Stay home and save", "Free, but you're still in your old room"),
      ],
    }),
    resolve: (s, _c, _p, opt) => {
      if (opt === "stay") {
        bump(s, "happiness", -2);
        return;
      }
      s.livingWithParents = false;
      s.flags.housing = opt === "share" ? "shared" : opt === "city" ? "city" : "own";
      if (opt === "share") bump(s, "network", 3);
      if (opt === "own") bump(s, "happiness", 4);
      if (opt === "city") {
        bump(s, "network", 4);
        if (s.job) s.job.mult *= 1.12;
      }
      log(s, opt === "share" ? "You move into a shared flat." : opt === "city" ? "You move to the big city." : "You move into a place of your own.", "milestone");
    },
  },
  {
    id: "first_car",
    tag: "money",
    once: true,
    chance: (s) => (adult(s) && s.age >= 20 && s.age <= 40 && dev(s) >= 0.25 && (s.job || s.business) ? 0.12 : 0),
    build: (s, c) => {
      const twoWheels = dev(s) < 0.6;
      return {
        title: c.r.pick(["Getting around", "Wheels of your own"]),
        body: `Getting to work takes ${c.r.pick(["over an hour each way", "two buses and a long walk", "most of your mornings"])}.`,
        options: [
          o("new", "A new car on finance", `${fmt(s, 0.2 * c.w)} down, then ${fmt(s, 0.18 * c.w)} a year for five years`),
          o("used", "A used car, paid in cash", `${fmt(s, 0.35 * c.w)}, and repairs`, liquid(s) < 0.35 * c.w && "You don't have the cash"),
          ...(twoWheels ? [o("bike", "A motorbike", fmt(s, 0.12 * c.w), liquid(s) < 0.12 * c.w && "You don't have the cash")] : []),
          o("transit", s.year >= 1975 ? "Public transport and a bicycle" : "Walk and take the bus", "Free, and fitter"),
        ],
      };
    },
    resolve: (s, _c, _p, opt) => {
      if (opt === "new") {
        pay(s, 0.2 * W(s));
        commit(s, { key: "car", label: "Car payments", wage: -0.18, until: s.year + 5, happiness: 1 });
        log(s, "You drive a new car off the lot.", "money");
      } else if (opt === "used") {
        pay(s, 0.35 * W(s));
        commit(s, { key: "car", label: "Car repairs", wage: -0.04, until: s.year + 6 });
        bump(s, "happiness", 3);
      } else if (opt === "bike") {
        pay(s, 0.12 * W(s));
        bump(s, "happiness", 2);
      } else bump(s, "health", 2);
    },
  },
  {
    id: "credit_card",
    tag: "money",
    once: true,
    chance: (s) => (adult(s) && s.age >= 20 && s.age <= 35 && s.access.bank && s.year >= (dev(s) >= 0.6 ? 1970 : 1995) ? 0.15 : 0),
    build: (s, c) => ({
      title: "Pre-approved!",
      body: `A bank offers you a credit card with a ${fmt(s, 0.4 * c.w)} limit, at ${pct(consumerRate(s), 0)} a year on anything you don't pay off.`,
      options: [
        o("full", "Take it, and pay it off every month", "A good credit record: cheaper loans later"),
        o("spend", "Take it and treat yourself", `${fmt(s, 0.25 * c.w)} of things you've wanted`),
        o("no", "Cut it up", "Cash only"),
      ],
    }),
    resolve: (s, _c, _p, opt) => {
      if (opt === "full") s.flags.goodCredit = true;
      else if (opt === "spend") {
        s.consumerDebt += 0.25 * W(s);
        bump(s, "happiness", 4);
        log(s, "The card fills up fast.", "money");
      } else s.flags.prudent = true;
    },
  },
  {
    id: "night_school",
    tag: "career",
    cooldown: 8,
    repeats: 0.5,
    chance: (s) => (s.job && !s.retired && s.age >= 22 && s.age <= 50 ? 0.06 : 0),
    build: (s, c) => {
      const subject = c.r.pick(
        s.year >= 1995
          ? ["coding", "accounting", "a foreign language", "project management", "data analysis", "digital marketing"]
          : ["typing and bookkeeping", "accounting", "a foreign language", "electrical work", "management"],
      );
      const cost = 0.12 * c.w;
      return {
        title: "Night school",
        body: `A college near you runs an evening course in ${subject}: ${fmt(s, cost)} for the year.`,
        options: [
          o("enrol", "Enrol", "Skill, and a better shot at a raise"),
          o("cheap", s.year >= 2010 ? "Take a free online version" : "Teach yourself from library books", "Some of the benefit, none of the cost"),
          o("skip", "Your evenings are full"),
        ],
        payload: { subject, cost },
      };
    },
    resolve: (s, c, p, opt) => {
      if (opt === "enrol") {
        pay(s, Number(p.cost));
        bump(s, "skill", 6);
        bump(s, "network", 2);
        if (s.job && c.r.chance(0.4)) {
          s.job.mult *= 1.06;
          log(s, `Your ${p.subject} course pays off with a raise.`, "good");
        }
      } else if (opt === "cheap") bump(s, "skill", 3);
    },
  },
  {
    id: "big_trip",
    tag: "life",
    cooldown: 6,
    repeats: 0.6,
    chance: (s, c) => (adult(s) && s.age >= 20 && s.age <= 70 && liquid(s) >= 0.3 * c.w ? 0.06 : 0),
    build: (s, c) => {
      const trip = c.r.pick([
        { what: "a month backpacking abroad", cost: 0.2 },
        { what: "a week on a beach abroad", cost: 0.15 },
        { what: "a road trip across the country", cost: 0.08 },
        { what: "a cruise", cost: 0.3 },
        { what: "a visit to relatives on the other side of the world", cost: 0.25 },
      ]);
      return {
        title: c.r.pick(["Pack your bags?", "Time off", "A trip with friends"]),
        body: `Friends are planning ${trip.what}. Your share would be about ${fmt(s, trip.cost * c.w)}.`,
        options: [o("go", "Go", "Memories, and a lighter wallet"), o("cheap", "Go, but on the cheap", fmt(s, trip.cost * 0.5 * c.w)), o("save", "Stay home and save")],
        payload: { cost: trip.cost },
      };
    },
    resolve: (s, _c, p, opt) => {
      const cost = Number(p.cost) * W(s);
      if (opt === "go") {
        pay(s, cost);
        bump(s, "happiness", 6);
        bump(s, "network", 3);
      } else if (opt === "cheap") {
        pay(s, cost / 2);
        bump(s, "happiness", 3);
      }
    },
  },
  {
    id: "pet",
    tag: "life",
    once: true,
    chance: (s) => (adult(s) && s.age >= 22 && s.age <= 65 ? 0.025 : 0),
    build: (s, c) => {
      const pet = c.r.pick(["dog", "cat"]);
      const yearly = pet === "dog" ? 0.04 : 0.025;
      return {
        title: c.r.pick([`A ${pet} needs a home`, "A new friend?"]),
        body: `A shelter near you has a ${pet} that needs a home. Food, vets and care come to about ${fmt(s, yearly * c.w)} a year.`,
        options: [o("adopt", "Adopt", "Years of company"), o("foster", "Foster for a few months", "Free, and you can say goodbye"), o("no", "Not now")],
        payload: { pet, yearly },
      };
    },
    resolve: (s, _c, p, opt) => {
      if (opt === "adopt") {
        commit(s, { key: "pet", label: `Your ${p.pet}`, wage: -Number(p.yearly), until: s.year + 12, happiness: 1 });
        log(s, `You adopt a ${p.pet}.`, "milestone");
      } else if (opt === "foster") bump(s, "happiness", 2);
    },
  },
  {
    id: "cosign",
    tag: "money",
    once: true,
    chance: (s) => (adult(s) && s.age >= 25 && s.age <= 55 && s.access.bank ? 0.04 : 0),
    build: (s, c) => {
      const amt = 0.8 * c.w;
      return {
        title: "Will you co-sign?",
        body: `An old friend needs a co-signer for ${c.r.pick(["a car loan", "a loan to open a café", "a mortgage", "a loan for a delivery van"])}: ${fmt(s, amt)}. If they don't pay, you do.`,
        options: [
          o("sign", "Co-sign", "Most people pay. Some don't"),
          o("lend", `Lend ${fmt(s, amt * 0.3)} yourself instead`, "Smaller, and on your terms"),
          o("no", "Say no", "The friendship cools"),
        ],
        payload: { amt },
      };
    },
    resolve: (s, c, p, opt) => {
      const amt = Number(p.amt);
      if (opt === "sign") {
        bump(s, "network", 4);
        if (c.r.chance(0.3)) addDue(s, { key: "cosign", year: s.year + c.r.int(1, 3), wage: -amt / W(s), label: "The loan you co-signed", text: "Your friend stops paying. The bank comes to you for" });
      } else if (opt === "lend") {
        pay(s, amt * 0.3);
        bump(s, "network", 2);
        if (c.r.chance(0.65)) addDue(s, { key: "lent", year: s.year + 2, wage: (amt * 0.3) / W(s), label: "Your friend repays you", text: "Your friend pays you back:" });
      } else bump(s, "network", -4);
    },
  },
  // ------------------------------------------------------------- everyday life: work
  {
    id: "raise_ask",
    tag: "career",
    cooldown: 5,
    repeats: 0.5,
    chance: (s) => (s.job && !s.retired && s.age >= 23 && s.age <= 60 ? 0.05 : 0),
    build: (s, c) => ({
      title: c.r.pick(["Ask for a raise?", "Pay review"]),
      body: `${c.r.pick(["Your annual review is next week.", "A colleague just told you what they earn. It's more than you.", "You've taken on twice the work since last year."])} You earn ${fmt(s, salary(s))} a year.`,
      options: [
        o("big", "Ask for 15%", "Bold. Might sour things"),
        o("small", "Ask for 5%", "Usually works"),
        o("offer", "Get an offer elsewhere first", "Leverage", s.stats.network < 35 && "You don't know anyone hiring"),
        o("no", "Keep your head down"),
      ],
    }),
    resolve: (s, c, _p, opt) => {
      if (!s.job) return;
      if (opt === "big") {
        if (c.r.chance(0.2 + s.stats.skill / 300)) {
          s.job.mult *= 1.13;
          bump(s, "happiness", 4);
          log(s, "You get the raise you asked for.", "good");
        } else {
          bump(s, "happiness", -3);
          log(s, "Your boss says no, and remembers that you asked.", "bad");
        }
      } else if (opt === "small") {
        if (c.r.chance(0.6)) {
          s.job.mult *= 1.045;
          log(s, "You get a small raise.", "good");
        } else log(s, "Not this year, says your boss.", "neutral");
      } else if (opt === "offer") {
        if (c.r.chance(0.5)) {
          s.job.mult *= 1.1;
          log(s, "Your employer matches the outside offer.", "good");
        } else enqueue(s, "job_offer");
      }
    },
  },
  {
    id: "overtime",
    tag: "career",
    cooldown: 4,
    repeats: 0.5,
    chance: (s) => (s.job && !s.retired && s.age >= 20 && s.age <= 60 ? 0.04 : 0),
    build: (s, c) => ({
      title: c.r.pick(["Overtime", "All hands on deck", "Busy season"]),
      body: `${c.r.pick(["A huge order has come in.", "Half your team is off sick.", "The end-of-year rush is here."])} Overtime this year could add up to ${fmt(s, 0.25 * salary(s))}.`,
      options: [o("all", "Take every shift going", "Money now, health later"), o("some", "Take some", "A bit extra"), o("none", "Go home on time")],
    }),
    resolve: (s, _c, _p, opt) => {
      if (!s.job || opt === "none") return;
      const share = opt === "all" ? 0.25 : 0.1;
      commit(s, { key: "overtime", label: "Overtime", wage: share * s.job.mult, until: s.year, needsJob: true });
      bump(s, "health", opt === "all" ? -4 : -1);
    },
  },
  {
    id: "strike",
    tag: "career",
    cooldown: 8,
    chance: (s) => (s.job?.formal && !s.retired && dev(s) >= 0.35 ? (s.year < 1990 ? 0.05 : 0.02) : 0),
    build: (s, c) => ({
      title: "Strike!",
      body: c.r.pick([
        "Your union votes to walk out until pay catches up with prices.",
        "Management wants longer hours for the same pay. The union says no.",
        "The union calls a strike after the company freezes pay.",
      ]),
      options: [
        o("join", "Join the strike", "No pay while it lasts. Might win a raise"),
        o("lead", "Help organise it", "Good for your friends, risky for your career", s.stats.network < 30 && "You don't have the standing"),
        o("cross", "Keep working", "Full pay, and some cold looks"),
      ],
    }),
    resolve: (s, c, _p, opt) => {
      if (!s.job) return;
      if (opt === "cross") {
        bump(s, "network", -6);
        bump(s, "happiness", -2);
        return;
      }
      s.flags.incomeCut = Math.max(Number(s.flags.incomeCut ?? 0), 0.08);
      bump(s, "network", opt === "lead" ? 8 : 4);
      if (c.r.chance(0.55)) {
        s.job.mult *= opt === "lead" ? 1.08 : 1.06;
        log(s, "The strike wins a pay rise.", "good");
      } else log(s, "The strike ends with nothing gained.", "bad");
      if (opt === "lead" && c.r.chance(0.2)) {
        bump(s, "happiness", -4);
        log(s, "Management doesn't forget your name.", "bad");
      }
    },
  },
  {
    id: "credit_thief",
    tag: "career",
    cooldown: 10,
    chance: (s) => (s.job && !s.retired && s.age >= 22 && s.age <= 60 ? 0.03 : 0),
    build: () => ({
      title: "Your idea, their name",
      body: "Your manager presents your project to the bosses as their own.",
      options: [
        o("confront", "Confront them", "Could clear the air, or poison it"),
        o("above", "Quietly tell their boss", "Risky politics"),
        o("leave", "Start looking for another job"),
        o("let", "Let it go"),
      ],
    }),
    resolve: (s, c, _p, opt) => {
      if (opt === "confront") {
        if (c.r.chance(0.5)) {
          bump(s, "happiness", 3);
          log(s, "Your manager backs down and gives you the credit.", "good");
        } else {
          bump(s, "happiness", -4);
          log(s, "Things get frosty at work.", "bad");
        }
      } else if (opt === "above") {
        if (s.job && c.r.chance(0.45)) {
          s.job.mult *= 1.05;
          bump(s, "network", 4);
          log(s, "Their boss notices you. Your pay goes up.", "good");
        } else {
          bump(s, "network", -4);
          log(s, "It backfires. Nobody likes going over heads.", "bad");
        }
      } else if (opt === "leave") enqueue(s, "job_offer");
      else bump(s, "happiness", -3);
    },
  },
  {
    id: "transfer",
    tag: "career",
    once: true,
    chance: (s) => (s.job?.formal && !s.retired && s.age >= 25 && s.age <= 50 ? 0.04 : 0),
    build: (s, c) => ({
      title: "A transfer",
      body: `Your employer offers you a move to ${c.r.pick(["the capital", "a new branch in another city", "head office", "a new plant across the country"])}, with 15% more pay.${s.partner ? ` ${s.partner.name} would have to move too.` : ""}`,
      options: [o("move", "Move", "More pay, a fresh start"), o("commute", "Take it, but come home at weekends", "More pay, lonely weeks"), o("stay", "Stay where you are")],
    }),
    resolve: (s, c, _p, opt) => {
      if (!s.job || opt === "stay") return;
      if (opt === "move") {
        s.job.mult *= 1.15;
        bump(s, "network", -5);
        bump(s, "happiness", -2);
        if (s.partner?.working && c.r.chance(0.5)) {
          s.partner.working = false;
          log(s, `${s.partner.name} has to give up their job for the move.`, "neutral");
        }
        log(s, "You move for work.", "milestone");
      } else {
        s.job.mult *= 1.12;
        commit(s, { key: "commute", label: "Weekly commuting", wage: -0.04, until: s.year + 3, needsJob: true, happiness: -2 });
      }
    },
  },
  {
    id: "pension_match",
    tag: "money",
    once: true,
    chance: (s) => (s.job?.formal && !s.retired && s.age >= 22 && s.age <= 45 && dev(s) >= 0.6 && s.year >= 1980 ? 0.12 : 0),
    build: () => ({
      title: "Free money?",
      body: "Your employer will match whatever you put into the company pension, up to 5% of your pay.",
      options: [o("max", "Put in 5%", "They add another 5%"), o("some", "Put in 2%", "They add 2%"), o("none", "Not now", "Keep all your pay to spend")],
    }),
    resolve: (s, _c, _p, opt) => {
      if (!s.job || opt === "none") return;
      const rate = opt === "max" ? 0.05 : 0.02;
      commit(s, { key: "match", label: "Your employer's pension match", wage: rate * s.job.mult, until: s.year + 40, needsJob: true });
      log(s, `You join the pension plan. Your employer adds ${pct(rate, 0)} of your pay.`, "money");
    },
  },
  {
    id: "retrain",
    tag: "career",
    once: true,
    chance: (s) => (s.job && !s.retired && s.age >= 30 && s.age <= 50 && s.job.years >= 5 ? 0.04 : 0),
    build: (s) => ({
      title: "A new direction?",
      body: `You've been ${aTitle(s.job!.title)} for ${s.job!.years} years. A year of full-time training could open a different career.`,
      options: [o("course", "Quit and retrain for a year", "No pay for a year, better jobs after"), o("night", "Study at night while you work", "Slower, and tiring"), o("stay", "Stick with what you know")],
    }),
    resolve: (s, _c, _p, opt) => {
      if (opt === "course") {
        loseJob(s);
        bump(s, "skill", 10);
        bump(s, "happiness", 2);
        log(s, "You leave your job to retrain.", "milestone");
      } else if (opt === "night") {
        bump(s, "skill", 6);
        bump(s, "health", -2);
      }
    },
  },
  {
    id: "startup_offer",
    tag: "career",
    once: true,
    chance: (s) => (s.job && !s.retired && s.age >= 24 && s.age <= 42 && s.stats.skill >= 50 && s.year >= 1995 && dev(s) >= 0.5 ? 0.04 : 0),
    build: (s, c) => {
      const name = `${c.r.pick(["Loop", "Kite", "Grid", "Nim", "Quant", "Orb", "Tide"])}${c.r.pick(["ly", "wise", "io", "stack", "labs"])}`;
      const boom = s.year >= 1997 && s.year <= 2000;
      return {
        title: `${name} wants you`,
        body: `${boom ? "A dot-com" : "A young startup"} offers you a job at a quarter less pay, plus shares that could be worth a fortune, or nothing.`,
        options: [
          o("join", "Join", "Less pay now, a lottery ticket"),
          o("advise", "Advise them on the side", "Your evenings, for a sliver of shares"),
          o("stay", "Stay where it's safe"),
        ],
        payload: { name },
      };
    },
    resolve: (s, c, p, opt) => {
      if (opt === "advise") {
        const st = makeStock(s, c.r, true);
        st.name = String(p.name);
        st.value = 0.04 * W(s);
        s.stocks.push(st);
        bump(s, "network", 3);
        bump(s, "happiness", -1);
        log(s, `You advise ${st.name} in your evenings, for a sliver of its shares.`, "neutral");
        return;
      }
      if (opt !== "join" || !s.job) return;
      s.job.mult *= 0.75;
      const st = makeStock(s, c.r, true);
      st.name = String(p.name);
      st.value = 0.3 * W(s);
      s.stocks.push(st);
      bump(s, "happiness", 3);
      log(s, `You join ${st.name}, for shares and a smaller salary.`, "milestone");
    },
  },
  {
    id: "gig_work",
    tag: "career",
    cooldown: 6,
    repeats: 0.6,
    chance: (s) => (adult(s) && s.year >= 2012 && !s.retired && !s.school && (!s.job || s.job.mult < 0.9) ? 0.06 : 0),
    build: (s, c) => ({
      title: "The apps are hiring",
      body: `Delivery and ride apps sign up anyone with a phone. People say you can make ${fmt(s, 0.2 * c.w)} a year in the evenings.`,
      options: [o("evenings", "Every evening", "More money, less sleep"), o("weekends", "Weekends only"), o("no", "Not for you")],
    }),
    resolve: (s, _c, _p, opt) => {
      if (opt === "evenings") commit(s, { key: "gig", label: "App work", wage: 0.2, until: s.year + 2, health: -2, happiness: -1 });
      else if (opt === "weekends") commit(s, { key: "gig", label: "App work", wage: 0.08, until: s.year + 2 });
    },
  },
  // ------------------------------------------------------------- everyday life: money
  {
    id: "windfall",
    tag: "money",
    cooldown: 8,
    repeats: 0.4,
    chance: (s) => (adult(s) ? 0.03 : 0),
    build: (s, c) => {
      const kinds = [
        { title: "A tax refund", body: "You overpaid tax for years. The refund arrives", wage: 0.15 },
        { title: "A bonus", body: "Your team had a record year. Your bonus is", wage: 0.3, job: true },
        { title: "A prize draw", body: "You win a prize draw you'd forgotten you entered", wage: 0.2 },
        { title: "An old debt repaid", body: "Someone who owed you money for years finally pays it back", wage: 0.1 },
      ].filter((k) => !k.job || s.job);
      const k = c.r.pick(kinds);
      const amt = k.wage * c.w;
      return {
        title: k.title,
        body: `${k.body}: ${fmt(s, amt)}.`,
        options: [
          o("invest", "Invest it"),
          o("debt", "Pay down debt", undefined, s.consumerDebt + s.studentDebt <= 0 && "You don't owe anything"),
          o("treat", "Treat yourself"),
          o("share", "Share it with family"),
        ],
        payload: { amt },
      };
    },
    resolve: (s, _c, p, opt) => {
      const amt = Number(p.amt);
      if (opt === "invest") invest(s, amt);
      else if (opt === "debt") {
        const a = Math.min(s.consumerDebt, amt);
        s.consumerDebt -= a;
        const b = Math.min(s.studentDebt, amt - a);
        s.studentDebt -= b;
        if (amt - a - b > 0) invest(s, amt - a - b);
      } else if (opt === "treat") bump(s, "happiness", 5);
      else {
        bump(s, "network", 4);
        bump(s, "happiness", 2);
      }
    },
  },
  {
    id: "refinance",
    tag: "money",
    cooldown: 4,
    chance: (s) => (s.properties.some((p) => p.mortgage > 0 && p.rate - mortgageRate(s) >= 0.01) ? 0.4 : 0),
    build: (s) => {
      const p = s.properties.filter((x) => x.mortgage > 0).sort((a, b) => b.rate - a.rate)[0];
      if (!p) return null;
      const now = mortgageRate(s);
      return {
        title: "Rates have fallen",
        body: `Your mortgage costs ${pct(p.rate, 1)} a year. New loans cost ${pct(now, 1)}. Switching would cut your payments from ${fmt(s, p.payment)} to about ${fmt(s, annuity(p.mortgage, now, 20))} a year, for a fee of ${fmt(s, 0.01 * p.mortgage)}.`,
        options: [
          o("refi", "Refinance"),
          o("cashout", "Refinance and borrow 20% more", `${fmt(s, 0.2 * p.mortgage)} to spend or invest`),
          o("keep", "Keep the loan you have"),
        ],
        payload: { id: p.id },
      };
    },
    resolve: (s, _c, payload, opt) => {
      const p = s.properties.find((x) => x.id === payload.id);
      if (!p || opt === "keep") return;
      const now = mortgageRate(s);
      pay(s, 0.01 * p.mortgage);
      if (opt === "cashout") {
        const extra = 0.2 * p.mortgage;
        p.mortgage += extra;
        invest(s, extra);
      }
      p.rate = now;
      p.payment = annuity(p.mortgage, now, 20);
      log(s, `You refinance at ${pct(now, 1)}.`, "money");
    },
  },
  {
    id: "adviser",
    tag: "money",
    once: true,
    chance: (s, c) => (adult(s) && s.age >= 35 && s.age <= 75 && dev(s) >= 0.5 && liquid(s) >= 4 * c.w ? 0.06 : 0),
    build: (s) => ({
      title: "A financial adviser calls",
      body: `A polished adviser offers to manage your ${fmt(s, liquid(s))} for 1.5% a year. "You can't time the market. I can."`,
      options: [
        o("hand", "Hand it over", "1.5% a year, every year"),
        o("index", "Buy a cheap index fund yourself", "A tenth of the cost", !s.access.localEq && !s.access.globalEq && "You can't reach the stock market"),
        o("no", "Keep doing what you're doing"),
      ],
    }),
    resolve: (s, _c, _p, opt) => {
      if (opt === "hand") {
        s.flags.adviser = true;
        move(s, ["cash", "usd", "gold"], s.access.localEq ? "localEq" : "bonds", 0.5);
        log(s, "An adviser now manages your savings.", "money");
      } else if (opt === "index") move(s, ["cash", "bonds"], s.access.globalEq ? "globalEq" : "localEq", 0.5);
    },
  },
  {
    id: "fixer_upper",
    tag: "money",
    cooldown: 10,
    repeats: 0.5,
    chance: (s, c) => (adult(s) && s.age >= 28 && s.age <= 62 && liquid(s) >= 1.2 * c.w ? 0.03 : 0),
    build: (s, c) => {
      const price = homePrice(s) * c.r.range(0.35, 0.55);
      const reno = 0.25 * price;
      const rent = mortgageQuote(s, price);
      return {
        title: "A fixer-upper",
        body: `A run-down flat nearby is for sale for ${fmt(s, price)}. It needs about ${fmt(s, reno)} of work.`,
        options: [
          o("flip", "Buy it, fix it, sell it", "Most flips make money. Some don't", liquid(s) < price + reno && "You don't have the cash"),
          o("rent", "Buy it, fix it, rent it out", "Steady rent", (!rent.ok || liquid(s) < rent.down + reno) && (rent.reason ?? "You don't have the cash")),
          o("pass", "Pass"),
        ],
        payload: { price, reno },
      };
    },
    resolve: (s, c, p, opt) => {
      const price = Number(p.price);
      const reno = Number(p.reno);
      if (opt === "flip") {
        pay(s, price + reno);
        const mult = c.r.chance(0.7) ? c.r.range(1.1, 1.35) : c.r.range(0.75, 0.95);
        addDue(s, { key: `flip${s.year}`, year: s.year + 2, wage: ((price + reno) * mult) / W(s), label: "Your renovation project", text: "You sell the renovated flat for" });
        log(s, "You buy a wreck and start knocking down walls.", "money");
      } else if (opt === "rent" && buyProperty(s, "rental", price)) {
        pay(s, reno);
        s.properties[s.properties.length - 1].value *= 1.15;
        log(s, "You renovate a flat and rent it out.", "money");
      }
    },
  },
  {
    id: "savings_circle",
    tag: "money",
    cooldown: 8,
    repeats: 0.6,
    chance: (s, c) => (adult(s) && s.age >= 20 && s.age <= 65 && dev(s) < 0.7 && liquid(s) + s.cashHome >= 0.3 * c.w ? 0.06 : 0),
    build: (s, c) => {
      const name = SAVINGS_CIRCLES[s.country];
      const pot = 0.3 * c.w;
      return {
        title: name ? `Join the ${name}?` : "A savings circle",
        body: `${name ? `Your neighbours' ${name}` : "A savings circle at the market"}: ten members each put in ${fmt(s, pot / 10)} a month, and every month one member takes the whole pot.`,
        options: [
          o("join", "Join and wait your turn", "Forced saving. Now and then an organiser runs off"),
          o("first", "Join and ask for the first pot", "Money now, paid back over the year", s.stats.network < 40 && "They don't know you well enough yet"),
          o("no", "Keep your money where you can see it"),
        ],
        payload: { pot },
      };
    },
    resolve: (s, c, p, opt) => {
      const pot = Number(p.pot);
      if (opt === "join") {
        pay(s, pot);
        bump(s, "network", 3);
        s.flags.saver = true;
        const ok = c.r.chance(0.92);
        addDue(s, { key: `circle${s.year}`, year: s.year + 1, wage: (ok ? pot : pot * 0.3) / W(s), label: "Your savings circle", text: ok ? "Your turn comes. The pot pays out" : "The organiser vanishes. You get back only" });
      } else if (opt === "first") {
        invest(s, pot);
        bump(s, "network", 2);
        addDue(s, { key: `circle${s.year}`, year: s.year + 1, wage: -(pot * 1.02) / W(s), label: "Your savings circle", text: "You pay your share back into the circle:" });
      }
    },
  },
  {
    id: "microloan",
    tag: "money",
    cooldown: 8,
    chance: (s) => (adult(s) && s.age >= 20 && s.age <= 55 && dev(s) < 0.5 && !s.business && (!s.job || s.job.mult < 1) ? 0.05 : 0),
    build: (s, c) => {
      const amt = 0.3 * c.w;
      const farm = (nearest(s.country, "agr", s.year) ?? 30) > 35;
      const what = farm ? c.r.pick(["a cow", "seed and fertiliser for a bigger harvest", "a water pump"]) : c.r.pick(["a sewing machine", "stock for a small kiosk", "a second-hand motorbike to carry passengers"]);
      return {
        title: "A microloan",
        body: `A microfinance group offers you ${fmt(s, amt)} at 30% a year, to buy ${what}.`,
        options: [o("invest", `Borrow and buy ${what}`, "Could lift your income for years"), o("family", "Borrow for the family's needs", "Easier months, then the debt"), o("no", "Don't borrow")],
        payload: { amt },
      };
    },
    resolve: (s, c, p, opt) => {
      const amt = Number(p.amt);
      if (opt === "no") return;
      s.consumerDebt += amt;
      if (opt === "family") {
        bump(s, "happiness", 3);
        return;
      }
      const works = c.r.chance(0.65);
      commit(s, { key: "microloan", label: "Your microloan's investment", wage: works ? 0.15 : 0.03, until: s.year + 6 });
      bump(s, "skill", 2);
      log(s, works ? "The loan pays for itself, and more." : "The investment barely covers the loan.", works ? "good" : "bad");
    },
  },
  {
    id: "farmland",
    tag: "money",
    once: true,
    chance: (s, c) => (adult(s) && s.age >= 25 && s.age <= 60 && dev(s) < 0.6 && (nearest(s.country, "agr", s.year) ?? 30) > 25 && liquid(s) + s.cashHome >= 0.4 * c.w ? 0.08 : 0),
    build: (s, c) => {
      const price = 2 * c.w;
      const q = mortgageQuote(s, price);
      return {
        title: "Land for sale",
        body: `A plot of farmland near your village is for sale for ${fmt(s, price)}. Farmers would rent it from you.`,
        options: [
          o("land", "Buy the land", "Land rarely loses its value", !q.ok && (q.reason ?? "You can't afford it")),
          o("animals", "Buy cattle instead", `${fmt(s, 0.4 * c.w)}: milk and calves to sell`, liquid(s) + s.cashHome < 0.4 * c.w && "You don't have the cash"),
          o("no", "Keep your savings"),
        ],
        payload: { price },
      };
    },
    resolve: (s, c, p, opt) => {
      if (opt === "land") {
        if (buyProperty(s, "rental", Number(p.price))) log(s, "You buy a plot of farmland.", "milestone");
      } else if (opt === "animals") {
        if (s.cashHome > 0) {
          s.holdings.cash += s.cashHome;
          s.cashHome = 0;
        }
        pay(s, 0.4 * W(s));
        commit(s, { key: "livestock", label: "Your cattle", wage: 0.12, until: s.year + c.r.int(4, 9) });
        log(s, "You buy cattle.", "money");
      }
    },
  },
  {
    id: "remit",
    tag: "life",
    cooldown: 6,
    repeats: 0.6,
    chance: (s) => (adult(s) && s.counters.moves > 0 && s.country !== s.birthCountry && devLevel(s.birthCountry, s.year) < dev(s) ? 0.12 : 0),
    build: (s) => ({
      title: "Money for home",
      body: `Your family back in ${countryIn(s.birthCountry)} is struggling. Everyone there assumes you're rich now.`,
      options: [o("monthly", "Send a tenth of your pay every month", "For the next five years"), o("lump", `Send ${fmt(s, 0.2 * W(s))} once`), o("no", "You can't right now")],
    }),
    resolve: (s, _c, _p, opt) => {
      if (opt === "monthly") commit(s, { key: "remit", label: "Money sent home", wage: -0.1 * (s.job?.mult ?? 0.5), until: s.year + 5, happiness: 1 });
      else if (opt === "lump") {
        pay(s, 0.2 * W(s));
        bump(s, "network", 3);
      } else bump(s, "happiness", -3);
    },
  },
  {
    id: "charity",
    tag: "money",
    cooldown: 10,
    repeats: 0.6,
    chance: (s, c) => (adult(s) && s.age >= 40 && liquid(s) >= 3 * c.w ? 0.05 : 0),
    build: (s, c) => {
      const cause = c.r.pick(["The hospital where you were born", "The school you went to", "Relief for an earthquake abroad", "A shelter in your town", "Research into the illness that took a friend"]);
      return {
        title: "A cause close to your heart",
        body: `${cause} is raising money.`,
        options: [o("big", `Give ${fmt(s, 0.05 * liquid(s))}`, "A twentieth of your savings"), o("small", `Give ${fmt(s, 0.01 * liquid(s))}`), o("time", "Give your time instead"), o("no", "Not this time")],
      };
    },
    resolve: (s, _c, _p, opt) => {
      if (opt === "big") {
        pay(s, 0.05 * liquid(s));
        bump(s, "happiness", 5);
        bump(s, "network", 3);
      } else if (opt === "small") {
        pay(s, 0.01 * liquid(s));
        bump(s, "happiness", 2);
      } else if (opt === "time") {
        bump(s, "happiness", 3);
        bump(s, "network", 4);
      }
    },
  },
  {
    id: "holiday_home",
    tag: "money",
    once: true,
    chance: (s, c) => (adult(s) && s.age >= 45 && s.age <= 70 && dev(s) >= 0.55 && liquid(s) >= 6 * c.w ? 0.06 : 0),
    build: (s, c) => {
      const where = c.r.pick(["by the sea", "on a lake", "in the mountains", "in the countryside"]);
      const price = homePrice(s) * c.r.range(0.5, 0.8);
      return {
        title: "A place to escape to",
        body: `A cottage ${where} is for sale for ${fmt(s, price)}.`,
        options: [o("keep", "Buy it for yourself", "Holidays for life, upkeep every year"), o("let", "Buy it and rent it to holidaymakers", "Some income, some hassle"), o("no", "Keep renting your holidays")],
        payload: { price },
      };
    },
    resolve: (s, _c, p, opt) => {
      if (opt === "no" || !buyProperty(s, "rental", Number(p.price))) return;
      if (opt === "keep") {
        s.properties[s.properties.length - 1].personal = true;
        commit(s, { key: "cottage", label: "Upkeep on the cottage", wage: -0.04, until: s.year + 30, happiness: 1 });
      }
      log(s, opt === "keep" ? "You buy a holiday cottage." : "You buy a cottage to let.", "milestone");
    },
  },
  {
    id: "annuity_offer",
    tag: "money",
    once: true,
    chance: (s, c) => (adult(s) && dev(s) >= 0.6 && Math.abs(s.age - retirementAge(s)) <= 1 && liquid(s) >= 4 * c.w ? 0.5 : 0),
    build: (s) => {
      const rate = annuityRate(s);
      const part = liquid(s) / 3;
      return {
        title: "Income for life?",
        body: `An insurer will turn a third of your savings, ${fmt(s, part)}, into ${fmt(s, part * rate)} a year for as long as you live.`,
        options: [
          o("buy", "Buy the annuity", "You can't run out, but it's gone when you are"),
          o("some", "Buy a smaller one", `A sixth of your savings, for ${fmt(s, (part / 2) * rate)} a year`),
          o("keep", "Keep it invested"),
        ],
      };
    },
    resolve: (s, _c, _p, opt) => {
      if (opt !== "buy" && opt !== "some") return;
      const got = raiseCash(s, liquid(s) / (opt === "buy" ? 3 : 6));
      s.pension += (got * annuityRate(s)) / W(s);
      log(s, `You buy an annuity paying ${fmt(s, got * annuityRate(s))} a year.`, "money");
    },
  },
  {
    id: "downsize",
    tag: "money",
    once: true,
    chance: (s) => (adult(s) && s.age >= 60 && s.age <= 82 && s.properties.some((p) => p.kind === "home") && !s.kids.some((k) => s.year - k.born < 22) ? 0.1 : 0),
    build: (s) => {
      const home = s.properties.find((p) => p.kind === "home")!;
      return {
        title: "The house feels big now",
        body: `Your home is worth about ${fmt(s, home.value)}. A smaller place would cost about half that.`,
        options: [o("down", "Sell and move somewhere smaller", "Free up the difference"), o("room", "Rent out a spare room", "A lodger, and some income"), o("stay", "Stay put", "Memories in every room")],
      };
    },
    resolve: (s, _c, _p, opt) => {
      const home = s.properties.find((p) => p.kind === "home");
      if (!home || opt === "stay") return;
      if (opt === "room") {
        commit(s, { key: "lodger", label: "Rent from a lodger", wage: 0.06, until: s.year + 10 });
        return;
      }
      const value = home.value;
      sellProperty(s, home.id);
      if (buyProperty(s, "home", value * 0.5)) log(s, "You sell up and move somewhere smaller.", "milestone");
      else log(s, "You sell the house and rent instead.", "milestone");
    },
  },
  // ------------------------------------------------------------- everyday life: family and health
  {
    id: "school_choice",
    tag: "life",
    forced: true,
    once: true,
    chance: (s) => (adult(s) && dev(s) >= 0.3 && s.kids.some((k) => s.year - k.born === 5) ? 1 : 0),
    build: (s, c) => {
      const kid = s.kids.find((k) => s.year - k.born === 5)!;
      return {
        title: `${kid.name} starts school`,
        body: "Where should they go?",
        options: [
          o("private", "A private school", `About ${fmt(s, 0.25 * c.w)} a year until they're eighteen`),
          o("area", "Move near the best state school", `About ${fmt(s, 0.06 * c.w)} a year more in rent or mortgage`),
          o("local", "The school down the road", "Free"),
        ],
        payload: { name: kid.name },
      };
    },
    resolve: (s, _c, p, opt) => {
      if (opt === "private") commit(s, { key: `school:${p.name}`, label: `${p.name}'s school fees`, wage: -0.25, until: s.year + 12 });
      else if (opt === "area") commit(s, { key: `school:${p.name}`, label: "Living near a good school", wage: -0.06, until: s.year + 12 });
    },
  },
  {
    id: "kid_hobby",
    tag: "life",
    once: true,
    chance: (s) => (adult(s) && s.kids.some((k) => s.year - k.born >= 8 && s.year - k.born <= 12) ? 0.3 : 0),
    build: (s, c) => {
      const kid = c.r.pick(s.kids.filter((k) => s.year - k.born >= 8 && s.year - k.born <= 12));
      const what = c.r.pick(["piano lessons", "to join a football club", "swimming lessons", "ballet classes", s.year >= 2005 ? "a coding camp" : "a chess club", "a drum kit"]);
      return {
        title: c.r.pick([`${kid.name} has a request`, `Something ${kid.name} really wants`]),
        body: `${kid.name} wants ${what}. It would cost about ${fmt(s, 0.04 * c.w)} a year.`,
        options: [o("pay", "Pay for it"), o("cheap", "Find something cheaper", `About ${fmt(s, 0.015 * c.w)} a year`), o("no", "Not this year")],
        payload: { name: kid.name },
      };
    },
    resolve: (s, _c, p, opt) => {
      if (opt === "pay") commit(s, { key: `hobby:${p.name}`, label: `${p.name}'s lessons`, wage: -0.04, until: s.year + 6, happiness: 1 });
      else if (opt === "cheap") commit(s, { key: `hobby:${p.name}`, label: `${p.name}'s club`, wage: -0.015, until: s.year + 6 });
      else bump(s, "happiness", -1);
    },
  },
  {
    id: "boomerang",
    tag: "life",
    cooldown: 10,
    chance: (s) => (adult(s) && s.age >= 48 && s.kids.some((k) => s.year - k.born >= 22 && s.year - k.born <= 34) ? 0.04 : 0),
    build: (s, c) => {
      const kid = c.r.pick(s.kids.filter((k) => s.year - k.born >= 22 && s.year - k.born <= 34));
      return {
        title: `${kid.name} wants to come home`,
        body: `${kid.name} has lost their job and wants to move back in for a while.`,
        options: [o("yes", "Of course", `About ${fmt(s, 0.08 * c.w)} a year in extra costs`), o("rent", `Help with their rent instead`, fmt(s, 0.3 * c.w)), o("no", "They need to stand on their own feet")],
        payload: { name: kid.name },
      };
    },
    resolve: (s, _c, p, opt) => {
      if (opt === "yes") commit(s, { key: "boomerang", label: `${p.name} back home`, wage: -0.08, until: s.year + 2, happiness: 1 });
      else if (opt === "rent") pay(s, 0.3 * W(s));
      else bump(s, "happiness", -3);
    },
  },
  {
    id: "fitness",
    tag: "life",
    cooldown: 10,
    repeats: 0.4,
    chance: (s) => (adult(s) && s.age >= 25 && s.age <= 70 ? 0.035 : 0),
    build: (s, c) => ({
      title: c.r.pick(["New Year's resolution", "Getting out of shape", "Your doctor's advice"]),
      body: "Climbing the stairs leaves you out of breath.",
      options: [
        o("gym", "Join a gym", `${fmt(s, 0.025 * c.w)} a year`),
        o("trainer", "Hire a personal trainer for a year", fmt(s, 0.08 * c.w)),
        o("run", "Start running in the park", "Free"),
        o("later", "Maybe next year"),
      ],
    }),
    resolve: (s, c, _p, opt) => {
      if (opt === "gym") commit(s, { key: "gym", label: "Gym membership", wage: -0.025, until: s.year + 2, health: c.r.chance(0.5) ? 2 : 0.5 });
      else if (opt === "trainer") {
        pay(s, 0.08 * W(s));
        bump(s, "health", 6);
      } else if (opt === "run") bump(s, "health", c.r.chance(0.6) ? 4 : 1);
    },
  },
  {
    id: "smoking",
    tag: "life",
    once: true,
    chance: (s) => (s.age >= 16 && s.age <= 22 ? (s.year < 1990 ? 0.12 : 0.06) : 0),
    build: () => ({
      title: "Want one?",
      body: "Your friends are passing round cigarettes.",
      options: [o("start", "Take one, and keep taking them", "Everyone does"), o("parties", "Only at parties"), o("no", "No thanks")],
    }),
    resolve: (s, _c, _p, opt) => {
      if (opt === "start") {
        s.flags.smoker = true;
        commit(s, { key: "smoking", label: "Cigarettes", wage: -0.02, until: s.year + 60, health: -1 });
      } else if (opt === "parties") bump(s, "network", 1);
    },
  },
  {
    id: "quit_smoking",
    tag: "life",
    cooldown: 5,
    chance: (s) => (s.flags.smoker && s.age >= 30 ? 0.12 : 0),
    build: () => ({
      title: "Time to quit?",
      body: "Your doctor listens to your chest and frowns.",
      options: [o("quit", "Quit cold turkey", "A miserable few months"), o("patches", "Quit with nicotine patches", "Easier, costs a little"), o("keep", "Keep smoking")],
    }),
    resolve: (s, _c, _p, opt) => {
      if (opt === "keep") {
        bump(s, "health", -2);
        return;
      }
      if (opt === "patches") pay(s, 0.02 * W(s));
      else bump(s, "happiness", -3);
      s.flags.smoker = false;
      s.recurring = (s.recurring ?? []).filter((x) => x.key !== "smoking");
      log(s, "You stop smoking.", "good");
    },
  },
  {
    id: "checkup",
    tag: "life",
    cooldown: 8,
    repeats: 0.4,
    chance: (s) => (adult(s) && s.age >= 45 && s.age <= 80 && dev(s) >= 0.4 ? 0.04 : 0),
    build: (s, c) => ({
      title: "A health check",
      body: `A clinic offers a full check-up, scans and all, for ${fmt(s, 0.04 * c.w)}.`,
      options: [o("full", "Get the full check", "Catch things early"), o("basic", "Just the basic tests", fmt(s, 0.01 * c.w)), o("skip", "You feel fine")],
    }),
    resolve: (s, _c, _p, opt) => {
      if (opt === "full") {
        pay(s, 0.04 * W(s));
        bump(s, "health", 3);
      } else if (opt === "basic") {
        pay(s, 0.01 * W(s));
        bump(s, "health", 1);
      }
    },
  },
  {
    id: "romance_scam",
    tag: "money",
    cooldown: 10,
    chance: (s, c) => (adult(s) && s.age >= 55 && !s.partner && s.year >= 2005 && liquid(s) >= c.w ? 0.03 : 0),
    build: (s) => ({
      title: "Someone lovely online",
      body: `For months you've been writing to someone kind and funny abroad. Now they need ${fmt(s, 0.3 * liquid(s))} for a flight to come and meet you.`,
      options: [o("send", "Send the money"), o("video", "Ask for a video call first"), o("block", "Block them")],
    }),
    resolve: (s, _c, _p, opt) => {
      if (opt === "send") {
        const lost = raiseCash(s, 0.3 * liquid(s));
        s.counters.scams++;
        bump(s, "happiness", -10);
        log(s, `They never come. ${fmt(s, lost)} is gone.`, "bad");
      } else if (opt === "video") log(s, "The camera never works. You stop writing.", "neutral");
    },
  },
  // ------------------------------------------------------------- moments in history
  {
    id: "british_gas",
    tag: "market",
    once: true,
    chance: (s, c) => (s.country === "GBR" && s.year === 1986 && adult(s) && liquid(s) >= 0.2 * c.w ? 0.7 : 0),
    build: (s, c) => ({
      title: "Tell Sid",
      body: "Adverts everywhere: British Gas is selling its shares to the public. 'If you see Sid, tell him.'",
      options: [
        o("big", "Apply for as many as they'll give you", fmt(s, 0.15 * c.w)),
        o("small", "Apply for a few", fmt(s, 0.05 * c.w)),
        o("pass", "Shares aren't for people like you"),
      ],
    }),
    resolve: (s, c, _p, opt) => {
      if (opt === "pass") return;
      const st = makeStock(s, c.r);
      Object.assign(st, { name: "British Gas", sector: "Gas", pitch: "Privatised", beta: 0.8, drift: 0.02, vol: 0.2, hazard: 0, boost: undefined, boostUntil: undefined });
      if (buyStock(s, st, (opt === "big" ? 0.15 : 0.05) * W(s))) {
        st.value *= 1.2; // the first day's jump
        log(s, "You get your British Gas shares. They jump on the first day.", "good");
      }
    },
  },
  {
    id: "vouchers",
    tag: "market",
    once: true,
    chance: (s) => (s.country === "RUS" && (s.year === 1992 || s.year === 1993) && adult(s) ? 0.9 : 0),
    build: () => ({
      title: "Your share of the country",
      body: "Every citizen gets a privatisation voucher with a face value of 10,000 rubles, to swap for shares in the companies the state is selling.",
      options: [
        o("sell", "Sell it for cash", "A few bottles of vodka's worth"),
        o("fund", "Put it in a voucher fund", "Funds promise big returns"),
        o("shares", "Swap it for shares in a big energy company", "If it survives, who knows"),
      ],
    }),
    resolve: (s, c, _p, opt) => {
      if (opt === "sell") {
        invest(s, 0.02 * W(s));
        return;
      }
      if (opt === "fund") {
        if (c.r.chance(0.3)) addDue(s, { key: "voucherfund", year: s.year + 3, wage: 0.06, label: "Your voucher fund", text: "Your voucher fund pays out" });
        else log(s, "Your voucher fund quietly disappears.", "bad");
        return;
      }
      const st = makeStock(s, c.r);
      Object.assign(st, { name: "An energy giant", sector: "Oil and gas", pitch: "Voucher privatisation", beta: 1.3, drift: 0.12, vol: 0.5, hazard: 0.03, value: 0.02 * W(s), cost: 0, boost: undefined, boostUntil: undefined });
      s.stocks.push(st);
      log(s, "You swap your voucher for shares in an energy company.", "money");
    },
  },
  {
    id: "house_boom",
    tag: "market",
    once: true,
    chance: (s, c) => (["USA", "ESP", "IRL", "GBR"].includes(s.country) && s.year >= 2004 && s.year <= 2006 && adult(s) && s.age >= 25 && liquid(s) >= c.w ? 0.25 : 0),
    build: (s) => {
      const price = homePrice(s) * 0.8;
      const q = mortgageQuote(s, price);
      return {
        title: "Everyone is buying",
        body: `House prices have soared for years. Your neighbour owns three flats bought off-plan. A new flat would cost ${fmt(s, price)}.`,
        options: [
          o("buy", "Buy one to let, with a big mortgage", "Prices only go up, they say", !q.ok && (q.reason ?? "The bank says no")),
          o("sell", "Sell your own home and rent", "Cash in near the top, if this is the top", !s.properties.some((x) => x.kind === "home") && "You don't own a home"),
          o("stay", "Stay out of it"),
        ],
        payload: { price },
      };
    },
    resolve: (s, _c, p, opt) => {
      if (opt === "buy" && buyProperty(s, "rental", Number(p.price))) log(s, "You buy a flat to let at the top of the boom.", "money");
      const home = s.properties.find((x) => x.kind === "home");
      if (opt === "sell" && home) {
        sellProperty(s, home.id);
        log(s, "You sell your home at the height of the boom and rent instead.", "money");
      }
    },
  },
  {
    id: "lockdown",
    tag: "life",
    forced: true,
    once: true,
    chance: (s) => (s.year === 2020 && adult(s) && (s.job || s.business) && !s.retired ? 0.8 : 0),
    build: () => ({
      title: "Lockdown",
      body: "The pandemic shuts offices, shops and restaurants. Nobody knows for how long.",
      options: [
        o("home", "Work from home and save", "Nowhere to spend money anyway"),
        o("deliver", "Pick up delivery work", "Busy, and risky"),
        o("learn", "Use the time to learn something", "Skill"),
        o("wait", "Wait it out"),
      ],
    }),
    resolve: (s, _c, _p, opt) => {
      if (opt === "home") {
        commit(s, { key: "lockdown", label: "Lockdown savings", wage: 0.06, until: s.year });
        bump(s, "happiness", -3);
      } else if (opt === "deliver") {
        commit(s, { key: "lockdown", label: "Delivery work", wage: 0.1, until: s.year });
        bump(s, "health", -2);
      } else if (opt === "learn") bump(s, "skill", 5);
      else bump(s, "happiness", -2);
    },
  },
  // ------------------------------------------------------------- business
  {
    id: "start_business",
    tag: "business",
    build: (s, _c, p) => {
      const types = p.only ? [p.only as BizType] : BUSINESSES.map((b) => b.type);
      return {
        title: "Start a business",
        body: "What will you build?",
        options: [
          ...types.map((t) => {
            const chk = canStartBusiness(s, t);
            return o(t, BIZ[t].title, `${fmt(s, chk.cost)} · ${BIZ[t].blurb}`, !chk.ok && chk.reason);
          }),
          o("none", "Never mind"),
        ],
      };
    },
    resolve: (s, c, _p, opt) => {
      if (opt === "none") {
        if (!s.job && !s.school && s.age < retirementAge(s)) enqueue(s, "first_job");
        return;
      }
      if (startBusiness(s, opt as BizType, c.r)) log(s, `You start ${s.business!.name}, a ${BIZ[opt as BizType].title.toLowerCase()}.`, "milestone");
    },
  },
  {
    id: "biz_expand",
    tag: "business",
    cooldown: 3,
    chance: (s) => (s.business && s.business.type !== "tech" && s.business.profit > 0 ? 0.15 : 0),
    build: (s, c) => {
      const b = s.business!;
      const cost = BIZ[b.type].cost * b.scale * c.w * 0.8;
      return {
        title: "Room to grow",
        body: `${b.name} could expand — a second location, more staff. It would cost ${fmt(s, cost)}.`,
        options: [
          o("go", "Expand", "Most expansions work. Some don't."),
          o("slow", "Grow step by step", `${fmt(s, cost * 0.3)} now, a smaller gain, less risk`),
          o("no", "Not now"),
        ],
        payload: { cost },
      };
    },
    resolve: (s, c, p, opt) => {
      if (opt === "slow" && s.business) {
        pay(s, Number(p.cost) * 0.3);
        s.business.invested += Number(p.cost) * 0.3;
        const ok = c.r.chance(0.85);
        s.business.scale *= ok ? 1.25 : 1.05;
        log(s, ok ? `${s.business.name} grows, one step at a time.` : "The extra space sits half empty.", ok ? "good" : "neutral");
        return;
      }
      if (opt !== "go" || !s.business) return;
      pay(s, Number(p.cost));
      s.business.invested += Number(p.cost);
      const ok = c.r.chance(0.55 + s.stats.skill / 400);
      s.business.scale *= ok ? 1.7 : 1.1;
      log(s, ok ? `${s.business.name} expands successfully.` : "The expansion struggles.", ok ? "good" : "bad");
    },
  },
  {
    id: "biz_offer",
    tag: "business",
    cooldown: 2,
    chance: (s) => {
      const b = s.business;
      if (!b || (b.profit <= 0 && b.stage < 2)) return 0;
      return 0.06 + s.stats.network / 1000 + (b.forSale ? 0.6 : 0);
    },
    build: (s, c) => {
      const b = s.business!;
      const price = b.valuation * c.r.range(0.7, 1.4);
      return {
        title: "Someone wants to buy you out",
        body: `A buyer offers ${fmt(s, price)} for ${b.name}${b.equity < 1 ? ` (your share: ${fmt(s, price)})` : ""}. ${moneyYears(s, price)}.`,
        options: [o("sell", "Sell"), o("counter", "Ask for more", "They might walk"), o("no", "Not for sale")],
        payload: { price },
      };
    },
    resolve: (s, c, p, opt) => {
      if (!s.business || opt === "no") return;
      let price = Number(p.price);
      if (opt === "counter") {
        const roll = c.r.next();
        if (roll < 0.5) price *= 1.2;
        else if (roll < 0.8) {
          log(s, "The buyer walks away.", "bad");
          return;
        }
      }
      const name = s.business.name;
      endBusiness(s, "sold", price * (1 - gainsTax(s)));
      bump(s, "happiness", 6);
      log(s, `You sell ${name} for ${fmt(s, price)}.`, "good");
      if (!s.job && !s.retired && s.age < retirementAge(s) - 5) enqueue(s, "first_job", { title: "What's next?", body: "You're free. Want a job?" });
    },
  },
  {
    id: "biz_crisis",
    tag: "business",
    cooldown: 2,
    chance: (s, c) => (s.business ? (c.e.recession ? 0.3 : 0.06) : 0),
    build: (s, c) => {
      const b = s.business!;
      const cost = 0.5 * BIZ[b.type].cost * b.scale * c.w;
      return {
        title: `${b.name} is in trouble`,
        body: c.r.pick(["Your biggest customer just left.", "A competitor opened across the street.", "Sales have collapsed.", "A supplier went bust and took your deposit."]),
        options: [o("inject", "Put in more money", fmt(s, cost)), o("cut", "Cut back hard", "Smaller, but alive"), o("close", "Shut it down")],
        payload: { cost },
      };
    },
    resolve: (s, _c, p, opt) => {
      if (!s.business) return;
      if (opt === "inject") {
        pay(s, Number(p.cost));
        s.business.invested += Number(p.cost);
      } else if (opt === "cut") s.business.scale *= 0.65;
      else {
        const name = s.business.name;
        endBusiness(s, "closed", s.business.valuation * 0.2);
        log(s, `You close ${name}.`, "bad");
        if (!s.job && s.age < retirementAge(s)) enqueue(s, "first_job");
      }
    },
  },
  {
    id: "vc_round",
    tag: "business",
    forced: true,
    chance: (s) => (s.business?.type === "tech" && s.flags.vcOffer === s.year ? 1 : 0),
    build: (s) => {
      const b = s.business!;
      return {
        title: "Investors are interested",
        body: `A venture fund offers to invest in ${b.name} at a valuation of ${fmt(s, b.valuation / b.equity * 1.6)} for 20% of the company.`,
        options: [o("take", "Take the money", "Grow faster, own less"), o("no", "Stay independent", "Slower, all yours")],
      };
    },
    resolve: (s, _c, _p, opt) => {
      const b = s.business;
      if (!b) return;
      if (opt === "take") {
        b.equity *= 0.8;
        b.stage = Math.min(4, b.stage + 1);
        log(s, `${b.name} raises a ${stageNameOf(b.stage)}.`, "good");
      } else s.flags.bootstrap = true;
    },
  },
  // ------------------------------------------------------------- reflection
  {
    id: "reflect30",
    tag: "reflection",
    forced: true,
    once: true,
    chance: (s) => (s.age === 30 ? 1 : 0),
    build: (s) => ({
      title: "Thirty",
      body: `You're worth ${fmt(s, netWorth(s))} — ${moneyYears(s, Math.abs(netWorth(s)))}${netWorth(s) < 0 ? " in the red" : ""}. What is money for, to you?`,
      options: [o("security", "Security"), o("freedom", "Freedom"), o("family", "Family"), o("status", "Status"), o("impact", "Changing something")],
    }),
    resolve: (s, _c, _p, opt) => {
      s.answers.money = opt;
    },
  },
  {
    id: "reflect50",
    tag: "reflection",
    forced: true,
    once: true,
    chance: (s) => (s.age === 50 ? 1 : 0),
    build: (s) => {
      const twin = Number(s.flags.twin50 ?? NaN);
      const twinLine = Number.isFinite(twin)
        ? ` If you'd made the default choices all along — same birth, same luck — you'd have about ${fmt(s, twin)}.`
        : "";
      return {
        title: "Fifty",
        body: `You're worth ${fmt(s, netWorth(s))}.${twinLine} Looking back?`,
        options: [o("same", "I'd do it all the same"), o("more", "I'd take more risks"), o("less", "I'd take fewer risks"), o("time", "I'd trade money for time")],
      };
    },
    resolve: (s, _c, _p, opt) => {
      s.answers.regret = opt;
    },
  },
  {
    id: "reflect70",
    tag: "reflection",
    forced: true,
    once: true,
    chance: (s) => (s.age === 70 ? 1 : 0),
    build: (s) => ({
      title: "Seventy",
      body: `You have ${fmt(s, netWorth(s))}. What will you do with it?`,
      options: [o("heirs", s.kids.length ? "Leave it to the kids" : "Leave it to family"), o("charity", "Give a big part away"), o("spend", "Spend it — you earned it"), o("keep", "Keep it, just in case")],
    }),
    resolve: (s, _c, _p, opt) => {
      s.answers.legacy = opt;
      if (opt === "spend") s.lifestyle = "lavish";
    },
  },
];

// helpers that need the deck or the yearly loop's estimates

function fmtUsd(x: number): string {
  return x < 1 ? `$${x.toFixed(2)}` : `$${Math.round(x).toLocaleString("en")}`;
}

export function rentIncome(s: LifeState): number {
  const e = ec(s);
  return s.properties.filter((p) => p.kind === "rental" && !p.personal).reduce((a, p) => a + p.value * e.rentYield * 0.7, 0);
}

export function spendingEstimate(s: LifeState): number {
  const last = s.history[s.history.length - 1];
  return last ? last.spending : 0.6 * W(s);
}

/** Pension as a multiple of the typical wage: a basic state pension plus an earnings-related part. */
export function pensionFor(s: LifeState): number {
  const d = dev(s);
  const basic = d >= 0.75 ? 0.3 : d >= 0.55 ? 0.15 : d >= 0.4 ? 0.05 : 0.02;
  const rate = d >= 0.75 ? 0.3 : d >= 0.55 ? 0.3 : d >= 0.4 ? 0.2 : 0.05;
  const last = s.job?.mult ?? Number(s.flags.lastMult ?? 0.6);
  return basic + rate * Math.min(1, s.formalYears / 35) * last;
}

function gainsTax(s: LifeState): number {
  return dev(s) >= 0.6 ? 0.15 : dev(s) >= 0.4 ? 0.08 : 0;
}

function stageNameOf(stage: number): string {
  return ["idea", "seed round", "Series A", "Series B", "growth round"][Math.min(stage, 4)];
}

/** Lose a share of everything (divorce, court). */
export function giveAway(s: LifeState, share: number): void {
  shrinkDesk(s, share);
  for (const k of ASSET_KEYS) s.holdings[k] *= 1 - share;
  s.cashHome *= 1 - share;
  for (const st of s.stocks) st.value *= 1 - share;
  for (const p of [...s.properties]) {
    const equity = p.value - p.mortgage;
    s.properties = s.properties.filter((x) => x !== p);
    const mine = equity * (1 - share);
    if (mine > 0) s.holdings.cash += mine;
    else s.consumerDebt += -mine;
  }
}

export const EVENT_MAP: Record<string, EventDef> = Object.fromEntries(DEFS.map((d) => [d.id, d]));
export const EVENTS = DEFS;
