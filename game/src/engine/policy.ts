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
    case "temperament":
    case "school_focus":
    case "choose_field":
    case "reflect30":
    case "reflect50":
    case "reflect70":
      return ok[Math.floor(r * ok.length)] ?? ok[0];
    case "no_school":
      return "work";
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
      return "take";
    case "layoff":
      return "quick";
    case "promotion":
      return "yes";
    case "side_hustle":
      return r < 0.3 ? "yes" : "no";
    case "burnout":
      return "push";
    case "retire":
      return s.age >= retirementAge(s) ? "retire" : "work";
    case "first_savings":
      if (dev(s) >= 0.75 && ok.includes("mix")) return r < 0.5 ? "mix" : "bank";
      if ((region === "SAS" || region === "MEA") && r < 0.5) return "gold";
      return "bank";
    case "crash_reaction":
      return r < 0.35 ? "sell" : "hold";
    case "bubble":
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
      return prefer(d, "family", s.consumerDebt > 2 * (s.history[s.history.length - 1]?.income ?? 0) ? "bankrupt" : "pay", "bankrupt");
    case "romance":
      return r < 0.75 ? "yes" : "no";
    case "wedding":
      return r < 0.5 ? "small" : "big";
    case "baby":
      return "yes";
    case "divorce":
      return "split";
    case "illness":
      return Number(d.payload.cost ?? 0) <= liquid(s) ? "best" : "basic";
    case "insurance":
      return dev(s) >= 0.6 ? "buy" : "no";
    case "parents_support":
      return "yes";
    case "parent_care":
      return dev(s) >= 0.75 && r < 0.6 ? "home" : dev(s) >= 0.45 && r < 0.3 ? "home" : r < 0.2 ? prefer(d, "siblings", "self") : "self";
    case "kid_deposit":
      return r < 0.5 ? "half" : "no";
    case "sibling_loan":
      return "lend";
    case "kid_college":
      return "loans";
    case "migration":
      return r < 0.2 ? "go" : "stay";
    case "war":
      return r < 0.4 ? prefer(d, "flee", "stay") : "stay";
    case "disaster":
      return "fix";
    case "midlife":
      return "nothing";
    case "scam_call":
      return r < 0.15 ? "follow" : "hang";
    case "start_business":
      return "none";
    case "biz_expand":
      return "no";
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
