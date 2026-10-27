// Automatic players. "typical" makes the default choices most people make
// (bank savings, take the offer, sell in a panic sometimes) and is the twin
// you are compared against. "steady" is a sensible index investor, used for
// auto-play and the "if you'd just bought the index" baseline.

import { advance, choose, createLife, setTwinHook } from "./life";
import { toIntl2021 } from "./macro";
import { dev, liquid, log, retirementAge } from "./ops";
import { stream } from "./rng";
import type { Decision, LifeState, Setup } from "./types";
import { country, countryIn, countryIsos } from "./world";

export type Chooser = (s: LifeState, d: Decision) => string;

function roll(s: LifeState, d: Decision): number {
  return stream(s.seed, "policy", d.event, s.year).next();
}

function enabled(d: Decision): string[] {
  return d.options.filter((o) => !o.disabled).map((o) => o.id);
}

function prefer(d: Decision, ...ids: string[]): string {
  const ok = enabled(d);
  for (const id of ids) if (ok.includes(id)) return id;
  return ok[0] ?? d.options[0].id;
}

export const typical: Chooser = (s, d) => {
  const r = roll(s, d);
  const ok = enabled(d);
  const region = country(s.country).r;
  switch (d.event) {
    case "choose_field": {
      // roughly how students split across majors
      const share: Record<string, number> = { business: 0.25, stem: 0.17, arts: 0.17, education: 0.14, cs: 0.12, medicine: 0.08, law: 0.07 };
      const total = ok.reduce((a, id) => a + (share[id] ?? 0.1), 0);
      let x = r * total;
      for (const id of ok) if ((x -= share[id] ?? 0.1) < 0) return id;
      return ok[0];
    }
    case "temperament":
    case "school_focus":
    case "reflect30":
    case "reflect50":
    case "reflect70":
      return ok[Math.floor(r * ok.length)] ?? ok[0];
    case "no_school":
      return r < 0.3 ? "trade" : "work";
    case "pocket_money":
      return r < 0.5 ? "spend" : "save";
    case "stay_in_school":
      return r < 0.55 ? "stay" : "leave";
    case "after_school": {
      const pUni = Number(d.payload.pUni ?? 0);
      if (ok.includes("uni") && pUni > 0.35 && r < 0.4 + s.familyPct * 0.6) return "uni";
      if (r < 0.35) return prefer(d, "voc", "work");
      return "work";
    }
    case "rejected":
      return r < 0.3 ? "voc" : "work";
    case "grad_next":
      return r < 0.15 ? prefer(d, "master", "work") : "work";
    case "first_job":
      return prefer(d, "o0");
    case "job_offer":
      if (r < 0.12) return "counter";
      return r < 0.3 ? prefer(d, "bonus", "remote", "take") : "take";
    case "layoff":
      if (ok.includes("outside")) return r < 0.5 ? "outside" : r < 0.75 ? "wait" : r < 0.9 ? prefer(d, "study", "freelance") : "freelance";
      if (ok.includes("safe") && r < 0.3) return "safe";
      if (ok.includes("early") && r < 0.5) return "early";
      if (ok.includes("move") && r > 0.85) return "move";
      return "quick";
    case "promotion":
      switch (Number(d.payload.stage ?? 0)) {
        case 1:
          return r < 0.6 ? "yes" : r < 0.75 ? "flex" : r < 0.85 ? "train" : "no";
        case 2:
          return r < 0.6 ? "apply" : r < 0.8 ? "back" : "stay";
        case 3:
          return r < 0.5 ? "run" : r < 0.8 ? "share" : "mentor";
        default:
          return ok.includes("equity") && r < 0.2 ? "equity" : "yes";
      }
    case "side_hustle":
      return r < 0.3 ? (ok.find((id) => id !== "no") ?? "no") : "no";
    case "burnout":
      return "push";
    case "retire":
      return s.age >= retirementAge(s) ? "retire" : "work";
    case "first_savings":
      if (dev(s) >= 0.75 && ok.includes("mix")) return r < 0.5 ? "mix" : "bank";
      if ((region === "SAS" || region === "MEA") && r < 0.5) return "gold";
      return "bank";
    case "crash_reaction":
      return r < 0.25 ? "sell" : r < 0.4 ? "half" : "hold";
    case "bubble":
      if (ok.includes("out") && r > 0.9) return "out";
      return d.payload.asset === "localEq" && r < 0.05 ? "allin" : "steady";
    case "stock_tip":
      return r < 0.15 ? "small" : "pass";
    case "ponzi":
      return r < 0.2 ? "some" : "no";
    case "lottery":
      return r < 0.5 ? "one" : "no";
    case "inflation_spike":
      return r < 0.3 ? prefer(d, "usd", "gold") : "stay";
    case "bank_run":
      return r < 0.3 ? "withdraw" : "keep";
    case "home_buy":
      return r < 0.6 ? "home" : "no";
    case "angel":
      return "no";
    case "crypto_discovery":
    case "crypto_later":
      return r < 0.01 ? prefer(d, "little", "buy") : "no";
    case "crypto_custody":
      return "exchange";
    case "debt_crisis":
      if (ok.includes("home") && r < 0.3) return "home";
      return prefer(d, "family", s.consumerDebt > 2 * (s.history[s.history.length - 1]?.income ?? 0) ? "bankrupt" : "pay", "bankrupt", "pay");
    case "romance":
      if (ok.includes("prenup") && r < 0.25) return "prenup";
      return r < 0.75 ? "yes" : "no";
    case "wedding":
      return r < 0.5 ? "small" : "big";
    case "baby":
      return ok.includes("bigger") && r < 0.3 ? "bigger" : "yes";
    case "divorce":
      return "split";
    case "illness": {
      const afford = Number(d.payload.cost ?? 0) <= liquid(s);
      if (ok.includes("change")) return r < 0.45 && afford ? "best" : r < 0.75 ? "manage" : r < 0.9 ? "change" : "skip";
      if (ok.includes("manage") && r < 0.4) return "manage";
      if (ok.includes("rest")) return afford && r < 0.6 ? "best" : r < 0.9 ? "rest" : "skip";
      if (ok.includes("live") && !afford && r < 0.2) return "live";
      return afford ? "best" : prefer(d, "basic", "skip");
    }
    case "insurance":
      return dev(s) >= 0.6 ? "buy" : "no";
    case "parents_support":
      return r < 0.65 ? "yes" : r < 0.85 ? prefer(d, "share", "some") : "some";
    case "teen_gadget":
      return r < 0.4 ? "ask" : r < 0.7 ? "save" : "used";
    case "teen_job":
      return r < 0.4 ? "spend" : r < 0.6 ? "work" : r < 0.8 ? "sport" : "study";
    case "exam_year":
      return s.familyPct > 0.7 && r < 0.4 ? prefer(d, "tutor", "group") : r < 0.4 ? "group" : r < 0.7 ? "alone" : "coast";
    case "moving_out":
      return r < 0.35 ? "share" : r < 0.6 ? "own" : r < 0.75 ? "city" : "stay";
    case "first_car":
      return dev(s) >= 0.75 ? (r < 0.4 ? "new" : r < 0.8 ? prefer(d, "used", "transit") : "transit") : r < 0.5 ? prefer(d, "bike", "used", "transit") : "transit";
    case "credit_card":
      return r < 0.5 ? "full" : r < 0.8 ? "spend" : "no";
    case "night_school":
      return r < 0.25 ? "enrol" : r < 0.5 ? "cheap" : "skip";
    case "big_trip":
      return r < 0.35 ? "go" : r < 0.6 ? "cheap" : "save";
    case "pet":
      return r < 0.35 ? "adopt" : "no";
    case "cosign":
      return r < 0.25 ? "sign" : r < 0.5 ? "lend" : "no";
    case "raise_ask":
      return r < 0.15 ? "big" : r < 0.5 ? "small" : "no";
    case "overtime":
      return r < 0.3 ? "all" : r < 0.7 ? "some" : "none";
    case "strike":
      return r < 0.6 ? "join" : "cross";
    case "credit_thief":
      return r < 0.5 ? "let" : r < 0.7 ? "confront" : r < 0.85 ? "leave" : prefer(d, "above", "let");
    case "transfer":
      return r < 0.25 ? "move" : r < 0.35 ? "commute" : "stay";
    case "pension_match":
      return r < 0.5 ? "max" : r < 0.8 ? "some" : "none";
    case "retrain":
      return r < 0.08 ? "course" : r < 0.25 ? "night" : "stay";
    case "startup_offer":
      return r < 0.2 ? "join" : r < 0.35 ? "advise" : "stay";
    case "gig_work":
      return r < 0.3 ? "evenings" : r < 0.55 ? "weekends" : "no";
    case "windfall":
      return r < 0.35 ? "invest" : r < 0.55 ? prefer(d, "debt", "invest") : r < 0.85 ? "treat" : "share";
    case "refinance":
      return r < 0.7 ? "refi" : r < 0.8 ? "cashout" : "keep";
    case "adviser":
      return r < 0.35 ? "hand" : r < 0.45 ? prefer(d, "index", "no") : "no";
    case "fixer_upper":
      return r < 0.1 ? prefer(d, "flip", "pass") : r < 0.2 ? prefer(d, "rent", "pass") : "pass";
    case "savings_circle":
      return r < 0.45 ? "join" : r < 0.6 ? prefer(d, "first", "join") : "no";
    case "microloan":
      return r < 0.3 ? "invest" : r < 0.45 ? "family" : "no";
    case "farmland":
      return r < 0.3 ? prefer(d, "land", "animals", "no") : r < 0.55 ? prefer(d, "animals", "no") : "no";
    case "remit":
      return r < 0.45 ? "monthly" : r < 0.8 ? "lump" : "no";
    case "charity":
      return r < 0.15 ? "big" : r < 0.5 ? "small" : r < 0.65 ? "time" : "no";
    case "holiday_home":
      return r < 0.15 ? prefer(d, "keep", "no") : r < 0.3 ? prefer(d, "let", "no") : "no";
    case "annuity_offer":
      return r < 0.15 ? "buy" : r < 0.3 ? "some" : "keep";
    case "downsize":
      return r < 0.3 ? "down" : r < 0.45 ? "room" : "stay";
    case "school_choice":
      return r < 0.15 ? "private" : r < 0.35 ? "area" : "local";
    case "kid_hobby":
      return r < 0.5 ? "pay" : r < 0.8 ? "cheap" : "no";
    case "boomerang":
      return r < 0.6 ? "yes" : r < 0.85 ? "rent" : "no";
    case "fitness":
      return r < 0.3 ? "gym" : r < 0.6 ? "run" : r < 0.65 ? "trainer" : "later";
    case "smoking":
      return r < (s.year < 1990 ? 0.4 : 0.15) ? "start" : r < 0.6 ? "parties" : "no";
    case "quit_smoking":
      return r < 0.35 ? "quit" : r < 0.6 ? "patches" : "keep";
    case "checkup":
      return r < 0.4 ? "full" : r < 0.7 ? "basic" : "skip";
    case "romance_scam":
      return r < 0.08 ? "send" : r < 0.4 ? "video" : "block";
    case "british_gas":
      return r < 0.5 ? "small" : r < 0.65 ? "big" : "pass";
    case "vouchers":
      return r < 0.6 ? "sell" : r < 0.85 ? "fund" : "shares";
    case "house_boom":
      return r < 0.15 ? prefer(d, "buy", "stay") : r < 0.2 ? prefer(d, "sell", "stay") : "stay";
    case "lockdown":
      return r < 0.5 ? "home" : r < 0.7 ? "deliver" : r < 0.85 ? "learn" : "wait";
    case "parent_care":
      // care homes in rich countries; in most of the world, parents move in with their children
      if (dev(s) >= 0.75) return r < 0.55 ? "home" : r < 0.8 ? "together" : r < 0.9 ? prefer(d, "siblings", "self") : "self";
      if (dev(s) >= 0.45) return r < 0.25 ? "home" : r < 0.7 ? "together" : r < 0.85 ? prefer(d, "siblings", "self") : "self";
      return r < 0.6 ? "together" : r < 0.8 ? prefer(d, "siblings", "self") : "self";
    case "kid_deposit":
      return r < 0.5 ? "half" : "no";
    case "sibling_loan":
      return "lend";
    case "kid_college":
      return r < 0.2 ? "pay" : r < 0.35 ? "half" : r < 0.45 ? prefer(d, "local", "loans") : r < 0.5 ? prefer(d, "gap", "loans") : "loans";
    // choices that come back
    case "cosign_default":
      return r < 0.35 ? (liquid(s) >= Number(d.payload.owed ?? 0) ? "pay" : "spread") : r < 0.65 ? "spread" : r < 0.9 ? "rescue" : "refuse";
    case "loan_trouble":
      return r < 0.4 ? "forgive" : r < 0.75 ? "wait" : r < 0.9 ? "goods" : "press";
    case "startup_exit":
      return r < 0.7 ? "cash" : r < 0.9 ? "shares" : prefer(d, "roll", "quit");
    case "rental_trouble":
      if (ok.includes("hold")) return r < 0.65 ? "hold" : r < 0.9 ? "sell" : prefer(d, "keys", "hold");
      if (ok.includes("evict")) return r < 0.35 ? "plan" : r < 0.65 ? "evict" : r < 0.85 ? "cash" : "sell";
      return r < 0.55 ? "fix" : r < 0.9 ? "patch" : "sell";
    case "hustle_grows":
      return r < 0.15 ? prefer(d, "full", "grow") : r < 0.55 ? "grow" : r < 0.75 ? "sell" : "stop";
    case "care_change":
      if (ok.includes("payfee")) return r < 0.65 ? "payfee" : r < 0.85 ? "cheaper" : "bring";
      if (ok.includes("take")) return r < 0.25 ? "take" : r < 0.45 ? "carehome" : r < 0.8 ? "send" : "leave";
      if (dev(s) >= 0.6) return r < 0.5 ? "home" : r < 0.75 ? "livein" : prefer(d, "turns", "keep");
      return r < 0.2 ? "livein" : r < 0.5 ? prefer(d, "turns", "keep") : "keep";
    case "kid_dropout":
      return r < 0.3 ? "back" : r < 0.6 ? "finish" : r < 0.75 ? "switch" : "cut";
    case "pet_sick":
      if (r < 0.45) return Number(d.payload.cost ?? 0) <= liquid(s) ? "operate" : "comfort";
      return r < 0.55 ? prefer(d, "fund", "comfort") : r < 0.85 ? "comfort" : "goodbye";
    case "ponzi_more":
      return r < 0.25 ? "out" : r < 0.6 ? "stay" : r < 0.85 ? "more" : "recruit";
    case "card_debt":
      return r < 0.3 ? prefer(d, "clear", "min") : r < 0.55 ? prefer(d, "loan", "min") : r < 0.85 ? "min" : prefer(d, "family", "min");
    case "reno_surprise":
      return r < 0.6 ? "fix" : r < 0.85 ? "hide" : "sell";
    case "homesick":
      return r < 0.5 ? "stay" : r < 0.65 ? "back" : r < 0.75 ? prefer(d, "bring", "send") : "send";
    case "commute_strain":
      return r < 0.35 ? "move" : r < 0.6 ? "back" : r < 0.8 ? prefer(d, "remote", "keep") : "keep";
    case "new_field":
      return r < 0.35 ? "switch" : r < 0.6 ? "inside" : r < 0.8 ? "side" : "stay";
    case "industry_trouble":
      return r < 0.6 ? "stay" : r < 0.75 ? "steady" : r < 0.9 ? "retrain" : "package";
    case "bidding_war":
      return r < 0.4 ? "jump" : r < 0.75 ? "raise" : r < 0.85 ? "startup" : "loyal";
    case "dying_trade":
      return r < 0.3 ? prefer(d, "retrain", "move", "hang") : r < 0.7 ? prefer(d, "move", "hang") : r < 0.9 ? "hang" : prefer(d, "early", "hang");
    case "childcare":
      if (dev(s) < 0.5) return prefer(d, "grand", "partner");
      return r < 0.35 ? "paid" : r < 0.6 ? "partner" : r < 0.85 ? prefer(d, "grand", "paid") : prefer(d, "you", "paid");
    case "migration":
      return r < 0.2 ? "go" : "stay";
    case "war":
      return r < 0.35 ? prefer(d, "flee", "rural") : r < 0.6 ? "rural" : "stay";
    case "disaster":
      return "fix";
    case "midlife":
      return "nothing";
    case "scam_call":
      return r < 0.15 ? "follow" : r < 0.3 ? "check" : "hang";
    case "start_business":
      return "none";
    case "biz_expand":
      return r < 0.25 ? "slow" : "no";
    case "biz_offer":
      return "sell";
    case "biz_crisis":
      return "cut";
    case "vc_round":
      return "take";
    default:
      return ok[0] ?? d.options[0].id;
  }
};

export const steady: Chooser = (s, d) => {
  switch (d.event) {
    case "first_savings":
      return prefer(d, "global", "index", "usd", "gold", "bank");
    case "crash_reaction":
      return "hold";
    case "bubble":
      return "steady";
    case "stock_tip":
    case "ponzi":
    case "angel":
      return prefer(d, "pass", "no");
    case "lottery":
      return "no";
    case "inflation_spike":
      return prefer(d, "usd", "gold");
    case "bank_run":
      return "keep";
    case "illness":
      return "best";
    case "scam_call":
      return "hang";
    case "insurance":
      return "buy";
    case "home_buy":
      return "home";
    case "after_school":
      return prefer(d, "uni", "voc", "work");
    case "first_job":
      return prefer(d, "o0");
    case "crypto_discovery":
    case "crypto_later":
      return "no";
    case "credit_card":
      return "full";
    case "pension_match":
      return "max";
    case "windfall":
      return prefer(d, "debt", "invest");
    case "adviser":
      return prefer(d, "index", "no");
    case "cosign":
    case "smoking":
      return "no";
    case "romance_scam":
      return "block";
    case "cosign_default":
      return liquid(s) >= Number(d.payload.owed ?? 0) ? "pay" : "spread";
    case "ponzi_more":
      return "out";
    case "card_debt":
      return prefer(d, "clear", "loan", "min");
    case "startup_exit":
      return "cash";
    default:
      return typical(s, d);
  }
};

/** Answer decisions with `chooser` and advance until `stop` says so or the life ends. */
export function runLife(s: LifeState, chooser: Chooser, stop?: (s: LifeState) => boolean, maxYears = 130): LifeState {
  for (let guard = 0; s.alive && guard < maxYears; guard++) {
    if (stop && stop(s)) break;
    for (let g = 0; s.pending.length && g < 25; g++) {
      const d = s.pending[0];
      choose(s, d.id, chooser(s, d));
    }
    s.pending = [];
    advance(s);
  }
  return s;
}

/** Start a game. Time travel fast-forwards a childhood and drops you in at the chosen age. */
export function newGame(setup: Setup): LifeState {
  const s = createLife(setup);
  if (setup.mode === "timetravel") {
    const age = setup.startAge ?? 18;
    s.flags.immortalUntil = age;
    runLife(s, typical, (t) => t.age >= age);
    s.startAge = age;
    const keep = s.log.filter((l) => l.age === 0 || l.tone === "milestone");
    s.log = keep.slice(0, 2).concat(keep.slice(2).slice(-4));
    log(s, `You open your eyes. It's ${s.year}. You're ${age} again, in ${countryIn(s.country)} — and you remember everything that's coming.`, "milestone");
  }
  return s;
}

/**
 * A life's code: enough to replay the same birth in the same world. "1985-1408823311" is a birth
 * year and a seed, "2013-USA-rich-1408823311" a trip back in time, and a bare seed a life from
 * before birth years were drawn by births.
 */
export function lifeCode(s: LifeState): string {
  const st = s.setup;
  if (st.mode === "timetravel") return [st.year ?? s.birthYear + s.startAge, st.country ?? s.birthCountry, st.background ?? "middle", s.seed].join("-");
  return st.yearDraw === "births" ? `${s.birthYear}-${s.seed}` : String(s.seed);
}

/** The setup a code stands for, or null if it isn't one. */
export function parseLifeCode(code: string): Setup | null {
  const parts = code.trim().replace(/^#/, "").split(/[\s\-–—·#]+/).filter(Boolean);
  const int = (x: string) => (/^\d+$/.test(x) ? Number(x) : NaN);
  const seed = int(parts[parts.length - 1] ?? "");
  if (!(seed > 0 && seed < 2 ** 32)) return null;
  if (parts.length === 1) return { mode: "random", seed, era: "any" };
  const year = int(parts[0]);
  if (parts.length === 2 && year >= 1950 && year <= 2026) return { mode: "random", seed, birthYear: year, yearDraw: "births" };
  const iso = (parts[1] ?? "").toUpperCase();
  const bg = (parts[2] ?? "").toLowerCase();
  if (parts.length === 4 && year >= 1960 && year <= 2015 && countryIsos().includes(iso) && (bg === "poor" || bg === "middle" || bg === "rich")) {
    return { mode: "timetravel", seed, country: iso, year, startAge: 18, background: bg };
  }
  return null;
}

/** Replay a life from its setup with a different chooser, to the same age (or to the end). */
export function replay(s: LifeState, chooser: Chooser, untilAge?: number, marketVariant = 0): LifeState {
  const t = createLife({ ...s.setup });
  t.flags.isTwin = true;
  t.marketVariant = marketVariant;
  if (s.setup.mode === "timetravel") {
    const age = s.setup.startAge ?? 18;
    t.flags.immortalUntil = age;
    runLife(t, typical, (x) => x.age >= age);
  }
  return runLife(t, chooser, untilAge != null ? (x) => x.age >= untilAge : undefined);
}

/** Convert 2021 international dollars to local money of a given year. */
export function fromIntl2021(iso: string, macroSeed: number, year: number, intl: number): number {
  const unit = toIntl2021(iso, macroSeed, year, 1);
  return unit > 0 ? intl / unit : 0;
}

setTwinHook((s) => {
  const twin = replay(s, typical, s.age);
  const last = twin.history[twin.history.length - 1];
  const real = last ? last.realNW : 0;
  return fromIntl2021(s.country, s.macroSeed, s.year, real);
});
