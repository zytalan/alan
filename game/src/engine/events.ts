// The event deck. Each event decides how likely it is this year, builds the
// decision the player sees, and applies the chosen option. Events never hold
// functions in state: a decision stores its event id and payload, and the
// option is applied by looking the event up again.

import { BIZ, BUSINESSES } from "./content/business";
import { FIELD_NAMES, OCC } from "./content/occupations";
import { givenName } from "./content/names";
import { pct, signedPct } from "./format";
import { PONZI_WAVES } from "./history";
import { econ, type YearEcon } from "./macro";
import { referenceHealth } from "./mortality";
import { liquidateDesk, shrinkDesk } from "./desk";
import {
  adult, buyProperty, buyStock, bump, canStartBusiness, clamp, consumerRate, dev, ec, eduAtLeast, endBusiness, fmt,
  homePrice, invest, liquid, log, loseJob, makeOffers, makeStock, mortgageQuote, mortgageRate, netWorth, pay,
  raiseCash, rebalance, retirementAge, salary, sellProperty, startBusiness, stockValue, takeJob, W, type Offer,
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

const CONDITIONS = [
  ["a slipped disc", 1],
  ["pneumonia", 1],
  ["diabetes", 1.5],
  ["a heart condition", 2.5],
  ["a tumour", 3],
  ["kidney disease", 2],
  ["a bad fracture", 1],
] as const;

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
      options: [o("learn", "Learn whatever you can on your own", "Skill"), o("work", "Work hard to help the family", "Family income")],
    }),
    resolve: (s, _c, _p, opt) => {
      if (opt === "learn") bump(s, "skill", 5);
      else {
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
      options: [o("stay", "Stay in school", "Better jobs later"), o("leave", "Leave school and start working", "Money now")],
    }),
    resolve: (s, _c, _p, opt) => {
      if (opt === "stay") {
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
    cooldown: 2,
    chance: (s) => (s.job && !s.retired && s.age >= 22 && s.age <= 62 ? 0.05 + s.stats.network / 800 + s.stats.skill / 1500 : 0),
    build: (s, c) => {
      const cur = s.job!;
      const offers = makeOffers(s, c.r, 1).filter((x) => x.mult > cur.mult * 1.08);
      if (!offers.length) return null;
      const of = offers[0];
      const raise = of.mult / cur.mult - 1;
      return {
        title: "A job offer",
        body: `${of.employer[0].toUpperCase()}${of.employer.slice(1)} wants you as ${aTitle(of.title)}: ${fmt(s, of.mult * c.w)} a year (${signedPct(raise)}).`,
        options: [o("take", "Take it"), o("haggle", "Negotiate for more", "Could go either way"), o("stay", "Stay where you are")],
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
      return {
        title: "Laid off",
        body: `${c.e.recession ? "The slump reaches your workplace. " : ""}You lose your job as ${aTitle(s.job!.title)}.${sev > 0 ? ` Severance: ${fmt(s, sev)}.` : ""}`,
        options: [
          o("quick", "Take the first job you can find", "Lower pay"),
          o("search", "Search properly", "A year without pay, better offers"),
          o("study", "Go back to school", s.age > 45 ? undefined : "Retrain", s.age > 45 && "Too late for that"),
          o("biz", "Start a business", "Use the severance"),
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
      return {
        title: "A promotion",
        body: `Your boss offers you ${toManager || toExec ? `a job as ${aTitle(title)}` : "a step up"}: ${fmt(s, mult * c.w)} a year, longer hours.`,
        options: [o("yes", "Accept", `${signedPct(mult / j.mult - 1)} pay`), o("no", "Decline", "Keep your evenings")],
        payload: { mult, occ: toExec ? "executive" : toManager ? "manager" : j.occ, title, from: j.occ, since: s.year - j.years },
      };
    },
    resolve: (s, _c, p, opt) => {
      if (opt !== "yes" || !s.job) return;
      if (s.job.occ !== p.from || s.year - s.job.years !== p.since) return; // you changed jobs in the meantime
      s.job.mult = Number(p.mult);
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
    chance: (s) => (s.job && s.age >= 20 && s.age <= 55 ? 0.04 : 0),
    build: (s, c) => ({
      title: "Weekend work",
      body: `A friend needs help on weekends: about ${fmt(s, 0.15 * c.w)} a year extra.`,
      options: [o("yes", "Take it", "Extra income, less rest"), o("no", "Pass")],
    }),
    resolve: (s, _c, _p, opt) => {
      if (opt === "yes") {
        s.flags.hustleUntil = s.year + 3;
        log(s, "You start working weekends.", "money");
      }
    },
  },
  {
    id: "burnout",
    tag: "life",
    cooldown: 5,
    chance: (s) => {
      const stressed = (s.job && OCC[s.job.occ].stress >= 8) || s.business;
      return stressed && s.stats.health < referenceHealth(s.age) - 8 ? 0.2 : 0;
    },
    build: () => ({
      title: "Running on empty",
      body: "You can't remember the last time you slept well. Something has to give.",
      options: [o("break", "Take three months off", "Lose a quarter of this year's pay"), o("push", "Push through", "Health takes the hit")],
    }),
    resolve: (s, _c, _p, opt) => {
      if (opt === "break") {
        s.flags.incomeCut = 0.25;
        bump(s, "health", 8);
        bump(s, "happiness", 5);
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
        options: [o("retire", early ? "Retire early" : "Retire"), o("work", "Keep working")],
      };
    },
    resolve: (s, _c, _p, opt) => {
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
    build: (s) => {
      const eqLoss = Number(s.flags.lastEqReal ?? 0);
      const crypto = eqLoss > -0.2;
      const loss = crypto ? Number(s.flags.lastCrypto) : eqLoss;
      return {
        title: crypto ? "Crypto crash" : "The market crashed",
        body: `Last year your ${crypto ? "crypto" : "stocks"} lost ${pct(-loss)} after inflation. Everyone around you is selling.`,
        options: [o("sell", "Sell everything", "Stop the bleeding"), o("hold", "Hold on", "Wait it out"), o("buy", "Buy more", "Everything is on sale")],
        payload: { crypto },
      };
    },
    resolve: (s, _c, p, opt) => {
      const keys: AssetKey[] = p.crypto ? ["crypto"] : ["localEq", "globalEq"];
      if (opt === "sell") {
        move(s, keys, "cash", 1);
        if (!p.crypto) for (const st of s.stocks.filter((x) => !x.illiquid)) {
          s.holdings.cash += st.value;
          st.alive = false;
        }
        s.stocks = s.stocks.filter((x) => x.alive);
        s.counters.soldInCrash++;
        log(s, "You sell near the bottom. At least you can sleep.", "money");
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
    chance: (s, c) => (adult(s) && s.access.localEq && liquid(s) >= 0.5 * c.w ? 0.07 : 0),
    build: (s, c) => {
      const st = makeStock(s, c.r);
      return {
        title: `A hot tip: ${st.name}`,
        body: `${st.sector} company. "${st.pitch}"`,
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
    cooldown: 4,
    chance: (s) => (adult(s) ? 0.03 : 0),
    build: (s, c) => ({
      title: "The jackpot is enormous",
      body: "Everyone at work is buying tickets this week.",
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
    build: () => ({
      title: "Are the banks safe?",
      body: "There are queues outside the banks. People say deposits could be frozen.",
      options: [o("withdraw", "Take your cash out", "Keep it at home — no interest, some risk"), o("keep", "Leave it in the bank")],
    }),
    resolve: (s, _c, _p, opt) => {
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
      options: [o("buy", "Buy some", fmt(s, liquid(s) * 0.05)), o("no", "Pass")],
    }),
    resolve: (s, _c, _p, opt) => {
      s.flags.cryptoSeen = true;
      if (opt !== "buy") return;
      const got = raiseCash(s, liquid(s) * 0.05);
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
      options: [o("exchange", "Leave them on the exchange", "Easy. You trust them."), o("self", "Your own wallet", "Lose the key, lose the coins")],
    }),
    resolve: (s, _c, _p, opt) => {
      s.cryptoCustody = opt === "self" ? "self" : "exchange";
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
    cooldown: 2,
    chance: (s) => (!s.partner && !s.dating && s.age >= 18 && s.age <= 55 ? (s.age < 30 ? 0.13 : s.age < 40 ? 0.07 : 0.03) : 0),
    build: (s, c) => {
      const name = givenName(s.country, country(s.country).r, partnerOf(s), c.r);
      return {
        title: "Someone new",
        body: `You meet ${name}. There's a spark.`,
        options: [o("yes", "See where it goes"), o("no", "Not now — focus on yourself")],
        payload: { name },
      };
    },
    resolve: (s, _c, p, opt) => {
      if (opt === "yes") {
        s.dating = true;
        s.flags.datingName = String(p.name);
        s.flags.datingSince = s.year;
        bump(s, "happiness", 4);
      }
    },
  },
  {
    id: "wedding",
    tag: "life",
    forced: true,
    chance: (s) => (s.dating && s.year - Number(s.flags.datingSince ?? s.year) >= 1 ? 0.5 : 0),
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
      s.livingWithParents = false;
      bump(s, "happiness", opt === "big" ? 9 : 6);
      if (opt === "big") bump(s, "network", 5);
      log(s, `You marry ${s.partner.name}.`, "milestone");
    },
  },
  {
    id: "baby",
    tag: "life",
    cooldown: 1,
    chance: (s) => {
      if (!s.partner || s.age < 20 || s.age > 44 || s.kids.length >= 6) return 0;
      const tfr = nearest(s.country, "tfr", s.year) ?? 2.5;
      return clamp(tfr * 0.07, 0.03, 0.4) * (s.kids.length >= 2 ? 0.5 : 1);
    },
    build: (s, c) => ({
      title: s.kids.length ? "Another child?" : "A baby?",
      body: `Each child costs about ${fmt(s, 0.2 * c.w)} a year until they leave home.`,
      options: [o("yes", "Yes"), o("no", "Not now")],
    }),
    resolve: (s, c, _p, opt) => {
      if (opt !== "yes") return;
      const sex = c.r.chance(0.51) ? "M" : "F";
      let name = givenName(s.country, country(s.country).r, sex, c.r);
      for (let k = 0; k < 6 && (s.kids.some((x) => x.name === name) || s.partner?.name === name); k++) name = givenName(s.country, country(s.country).r, sex, c.r);
      s.kids.push({ name, born: s.year, sex });
      bump(s, "happiness", 6);
      log(s, `${name} is born.`, "milestone");
    },
  },
  {
    id: "divorce",
    tag: "life",
    cooldown: 5,
    chance: (s) => {
      if (!s.partner) return 0;
      const strain = (s.stats.happiness < 40 ? 0.015 : 0) + (s.consumerDebt > 2 * W(s) ? 0.01 : 0);
      return (0.01 + strain) * (dev(s) >= 0.6 ? 1.5 : 0.6);
    },
    build: (s) => ({
      title: "It's over",
      body: `You and ${s.partner!.name} are splitting up. Your net worth is ${fmt(s, netWorth(s))}.`,
      options: [o("split", "Split everything evenly"), o("court", "Fight it in court", `Legal fees ${fmt(s, 0.4 * W(s))}, could go either way`)],
    }),
    resolve: (s, c, _p, opt) => {
      let share = 0.5;
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
    chance: (s) => (s.age >= 18 ? (0.012 + 0.0012 * Math.max(0, s.age - 30)) * clamp(1 + (referenceHealth(s.age) - s.stats.health) / 40, 0.4, 3) : 0),
    build: (s, c) => {
      const [name, severity] = c.r.pick(CONDITIONS);
      const oop = (country(s.country).oop ?? 40) / 100;
      const cost = c.w * severity * 1.2 * oop * (s.flags.insured ? 0.25 : 1);
      return {
        title: "Bad news from the doctor",
        body: `You're diagnosed with ${name}. The best treatment will cost you ${fmt(s, cost)} out of pocket.`,
        options: [o("best", "Get the best treatment", fmt(s, cost)), o("basic", "Basic treatment", fmt(s, cost * 0.3)), o("skip", "Skip it and hope", "Free")],
        payload: { cost, severity, name },
      };
    },
    resolve: (s, _c, p, opt) => {
      const cost = Number(p.cost);
      const sev = Number(p.severity);
      if (opt === "best") {
        pay(s, cost);
        bump(s, "health", -3 * sev);
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
    chance: (s) => (s.age >= 25 && s.age <= 45 && s.access.bank && dev(s) >= 0.3 && !s.flags.insured ? 0.15 : 0),
    build: (s, c) => ({
      title: "Health insurance",
      body: `An agent offers a health plan for ${fmt(s, 0.03 * c.w)} a year. It would cover most big medical bills.`,
      options: [o("buy", "Sign up"), o("no", "No thanks")],
    }),
    resolve: (s, _c, _p, opt) => {
      if (opt === "buy") {
        s.flags.insured = true;
        log(s, "You buy health insurance.", "money");
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
      options: [o("yes", "Support them", "About 8% of your income for six years"), o("no", "You can't afford it")],
    }),
    resolve: (s, _c, _p, opt) => {
      if (opt === "yes") {
        s.flags.supportUntil = s.year + 6;
        bump(s, "happiness", 3);
        bump(s, "network", 3);
      } else bump(s, "happiness", -5);
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
        options: [o("pay", "Pay for it"), o("loans", "Let them take out loans"), o("no", "Tell them to get a job")],
        payload: { cost, name: kid.name },
      };
    },
    resolve: (s, _c, p, opt) => {
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
    cooldown: 6,
    chance: (s) => {
      if (s.age < 20 || s.age > 45 || dev(s) >= 0.85 || s.counters.moves >= 2) return 0;
      if (!(eduAtLeast(s.edu, "bachelor") || s.stats.skill >= 55 || s.stats.network >= 60)) return 0;
      return destinations(s).length ? 0.05 + (s.flags.studiedAbroad ? 0.1 : 0) : 0;
    },
    build: (s, c) => {
      const dest = c.r.pick(destinations(s));
      const ratio = econ(dest, s.macroSeed, s.year).wage / econ(dest, s.macroSeed, s.year).fx / (c.w / c.e.fx);
      return {
        title: `A chance to move to ${countryIn(dest)}`,
        body: `A job abroad has come up. Wages there are about ${ratio.toFixed(1)}× what they are here, in dollars — but so is the rent, and you'd start over.`,
        options: [o("go", `Move to ${countryIn(dest)}`), o("stay", "Stay")],
        payload: { dest },
      };
    },
    resolve: (s, _c, p, opt) => {
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
        options: [o("flee", "Flee abroad", "Lose most of what you own", !safe && "There's nowhere to go"), o("stay", "Stay and endure")],
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
        options: [o("fix", "Rebuild"), o("sell", "Sell it as it is", "At a big discount")],
        payload: { dmg, id: p.id },
      };
    },
    resolve: (s, _c, p, opt) => {
      if (opt === "fix") pay(s, Number(p.dmg));
      else sellProperty(s, String(p.id), 0.35);
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
    chance: (s, c) => (s.age >= 65 && liquid(s) >= c.w ? 0.03 : 0),
    build: () => ({
      title: "An urgent call",
      body: "A polite man from 'your bank' says your account has been hacked. He needs you to move your savings to a safe account, today.",
      options: [o("follow", "Do what he says"), o("hang", "Hang up")],
    }),
    resolve: (s, _c, _p, opt) => {
      if (opt === "follow") {
        const lost = raiseCash(s, liquid(s) * 0.15);
        s.counters.scams++;
        bump(s, "happiness", -8);
        log(s, `It was a scam. ${fmt(s, lost)} is gone.`, "bad");
      }
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
        options: [o("go", "Expand", "Most expansions work. Some don't."), o("no", "Not now")],
        payload: { cost },
      };
    },
    resolve: (s, c, p, opt) => {
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
  return s.properties.filter((p) => p.kind === "rental").reduce((a, p) => a + p.value * e.rentYield * 0.7, 0);
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
