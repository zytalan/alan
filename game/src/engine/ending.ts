// The end of a life, told: how it ended, the moments it passed through, who came to say goodbye,
// the stone, and the whole of it in a paragraph. Everything here is read from the finished life;
// nothing changes it. The life is told to you, so no one needs a pronoun.

import { FIELD_NAMES, TRADE_COURSE } from "./content/occupations";
import { aTitle, lc, pct, usd } from "./format";
import { intlToUsd, toIntl2021 } from "./macro";
import { causePhrase, deathProbability, referenceHealth } from "./mortality";
import { W, wageYears } from "./ops";
import { stream } from "./rng";
import type { LifeState, LogEntry } from "./types";
import { countryIn, countryName } from "./world";

export interface Moment {
  year: number;
  age: number;
  text: string;
}

export interface YearTold {
  year: number;
  age: number;
  usd: number; // change in net worth that year, in today's US dollars, after inflation
  why: string; // what moved it most: "an inheritance", "the stock market"
  line: string; // what the ledger said about the year's money
}

const MOVED: Record<string, string> = {
  pay: "what you saved",
  interest: "interest on your debts",
  cash: "interest on your savings",
  usd: "the dollar",
  bonds: "bonds",
  localEq: "the stock market",
  globalEq: "the world's stock markets",
  picks: "the shares you picked",
  desk: "your trading account",
  crypto: "bitcoin",
  gold: "gold",
  home: "property prices",
  business: "your business",
  inherit: "an inheritance",
  writeoff: "debts written off",
  bank: "a banking crisis",
  gainsTax: "tax on your gains",
};

export interface Farewell {
  year: number;
  age: number;
  cause: string;
  died: string; // "You die of a stroke."
  where: string; // "In Australia, where you were born."
  outlived: string | null; // how many of the people born with you lived longer
  outlivedShare: number | null;
  peakUsd: number; // highest net worth, in today's US dollars
  peakAge: number;
  lastYear: string[]; // the final year's entries, before the end
  moments: Moment[];
  mourners: string;
  estate: string | null;
  story: string[]; // the life, a sentence or two at a time
  best: YearTold | null;
  worst: YearTold | null;
  epitaph: string;
  bond: string | null; // "Partner of Chris · parent of Yan and Mei"
  days: number;
}

const list = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const NUMBERS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const count = (n: number) => NUMBERS[n] ?? String(n);
const first = (log: LogEntry[], re: RegExp) => log.find((l) => re.test(l.text));
const all = (log: LogEntry[], re: RegExp) => log.filter((l) => re.test(l.text));
const sentence = (text: string) => text.split(/(?<=[.!?])\s/)[0];
const ANNUITY = "ev:Income for life?"; // buying one swaps savings for an income, so it isn't a loss
// the yearly notes on your industry's hiring, which say nothing about you in particular
const INDUSTRY = /^The hiring boom in .+ is over|^The job losses in .+ stop|is booming here:|^Still booming: jobs in|^Jobs in .+ here fell|is still shedding jobs/;

/** Of everyone born in your country the year you were, the share still alive at the age you died. */
export function livedLonger(s: LifeState, age: number): number {
  let f = 1;
  let m = 1;
  for (let x = 0; x < age; x++) {
    const y = s.birthYear + x;
    f *= 1 - deathProbability(s.birthCountry, y, "F", x, referenceHealth(x));
    m *= 1 - deathProbability(s.birthCountry, y, "M", x, referenceHealth(x));
  }
  return (f + m) / 2;
}

/** The moments a life passes through on its way out: the milestones, a dozen at most, in order. */
function moments(s: LifeState): Moment[] {
  const picks: [RegExp, number, number][] = [
    // what to look for, how much it matters, how many of them to keep
    [/^You are born in /, 10, 1],
    [/^You open your eyes\./, 10, 1],
    [/^You (graduate in|finish (secondary school|a |an |flight)|qualify as|earn a (master|doctor))/, 6, 1],
    [/^You start work as /, 8, 1],
    [/^You marry /, 9, 3],
    [/ is born\.$/, 8, 4],
    [/^You (buy a home|move into the family home|build a simple house)/, 7, 1],
    [/^You (leave .+ for |flee to |leave .+ and go home)/, 8, 3],
    [/^You start .+, an? .+\.$|^You go full time\./, 7, 2],
    [/^You sell .+ for /, 7, 2],
    [/^(Promoted to |You get your boss's job|You take charge of the department|You take the corner office)/, 5, 2],
    [/^You're out of work\./, 4, 1],
    [/^(Stocks crash|Crypto crashes)/, 6, 2],
    [/^You (declare bankruptcy|default on your lenders)/, 7, 1],
    [/^You inherit /, 5, 1],
    [/^You divorce /, 6, 2],
    [/ dies\.$/, 7, 2],
    [/^You retire( early)?,? at /, 7, 1],
    [/your coin turns (gold|platinum)\.$/, 4, 2],
  ];
  const chosen: (Moment & { weight: number; at: number })[] = [];
  for (const [re, weight, keep] of picks) {
    for (const l of all(s.log, re).slice(0, keep)) {
      const text = re.source.includes("coin turns")
        ? `You're now worth ${l.text.match(/You're now worth more than ([^.]+?): your coin/)?.[1] ?? "more than ever"}.`
        : l.text.startsWith("You open your eyes")
          ? l.text.split(/(?<=\.)\s/).slice(0, 2).join(" ")
          : l.text.length > 110 || l.text.startsWith("You are born")
            ? sentence(l.text)
            : l.text;
      chosen.push({ year: l.year, age: l.age, text, weight, at: s.log.indexOf(l) });
    }
  }
  // a time traveller's life starts when they open their eyes, whatever else that year logged first
  for (const c of chosen) if (c.text.startsWith("You open your eyes")) c.at = s.log.findIndex((l) => l.year === c.year) - 0.5;
  // a dozen at most, keeping the ones that matter most, told in the order they happened, each once
  return chosen
    .sort((a, b) => b.weight - a.weight || a.at - b.at)
    .filter((c, i, xs) => xs.findIndex((x) => x.text.split(":")[0] === c.text.split(":")[0]) === i) // a second promotion to the same title says nothing new
    .slice(0, 12)
    .sort((a, b) => a.at - b.at)
    .map(({ year, age, text }) => ({ year, age, text }));
}

/** The year whose real change in net worth was largest, up or down, with the ledger's word on its money. */
function yearOf(s: LifeState, sign: 1 | -1): YearTold | null {
  let best: YearTold | null = null;
  for (let i = 1; i < s.history.length; i++) {
    const h = s.history[i];
    const p = s.history[i - 1];
    if (h.age < 18) continue;
    const swapped = toIntl2021(h.country, s.macroSeed, h.year, h.moves?.[ANNUITY] ?? 0);
    const change = intlToUsd(s.macroSeed, h.realNW - p.realNW - swapped);
    if (sign * change <= 0 || (best && sign * change <= sign * best.usd)) continue;
    // the move in the same direction that did the most, by the ledger's "what moved it"
    const top = Object.entries(h.moves ?? {})
      .filter(([k, v]) => k !== "other" && k !== ANNUITY && sign * v > 0)
      .sort((a, b) => sign * b[1] - sign * a[1])[0];
    const key = top?.[0] ?? "";
    const label = key.startsWith("ev:") ? key.slice(3).replace(/[?!]$/, "") : key === "pay" && sign < 0 ? "spending more than you earned" : (MOVED[key] ?? "");
    const why = label ? label[0].toUpperCase() + label.slice(1) : "";
    // what the ledger said about it: the choice's own outcome, or for markets and the like, the year's money line
    const said = (about: string) => s.log.find((l) => l.year === h.year && l.about === about)?.text;
    const line = said(key) ?? (key.startsWith("ev:") ? "" : (said("money") ?? ""));
    best = { year: h.year, age: h.age, usd: change, why, line };
  }
  return best;
}

/** The life in a few sentences, told to you. */
function story(s: LifeState): string[] {
  const out: string[] = [];
  const born = countryIn(s.birthCountry);
  const log = s.log;
  const death = s.death!;

  // where you started
  if (s.mode === "timetravel") out.push(`You woke up in ${born} in ${s.birthYear + s.startAge}, eighteen again and remembering everything to come.`);
  else out.push(`You were born in ${born} in ${s.birthYear}, into a family better off than ${pct(s.familyPct)} of families there.`);

  // schooling
  const school: Record<string, string> = {
    none: "You never went to school.",
    primary: "You left school after primary school.",
    secondary: "You finished secondary school.",
  };
  let taught = school[s.edu] ?? "";
  if (s.edu === "vocational") taught = s.trade ? `You finished ${TRADE_COURSE[s.trade]}.` : "You did vocational training.";
  if (s.edu === "bachelor" || s.edu === "master" || s.edu === "doctorate") {
    const field = s.field ? FIELD_NAMES[s.field].toLowerCase() : "at university";
    const abroad = s.flags.studiedAbroad ? " abroad" : "";
    taught = s.field === "medicine" ? `You studied medicine${abroad} and qualified as a doctor.` : `You studied ${field}${abroad}${s.edu === "master" ? ", then took a master's degree" : s.edu === "doctorate" ? ", then a doctorate" : ""}.`;
  }

  // work
  const start = first(log, /^You start work as /);
  const firstJob = start?.text.match(/^You start work as (.+?), on /)?.[1] ?? (s.flags.firstJob ? String(s.flags.firstJob) : null);
  const best = s.flags.bestJob ? lc(String(s.flags.bestJob)) : null;
  const layoffs = Number(s.flags["n:layoff"] ?? 0);
  const retired = first(log, /^You retire( early)?,? at /);
  const work: string[] = [];
  if (firstJob) work.push(`started work${start ? ` at ${start.age}` : ""} as ${firstJob}`);
  if (best && firstJob && !firstJob.toLowerCase().includes(best.toLowerCase()))
    work.push(s.flags.bestOcc && s.flags.bestOcc === s.flags.firstOcc ? `rose to ${best}` : `later worked as ${aTitle(best)}`);
  if (layoffs) work.push(`were laid off ${layoffs === 1 ? "once" : layoffs === 2 ? "twice" : `${count(layoffs)} times`}`);
  if (retired) work.push(`retired at ${retired.age}`);
  out.push([taught, work.length ? `You ${list(work)}.` : ""].filter(Boolean).join(" "));

  // businesses
  const built = [...s.pastBusinesses.map((b) => `${b.name}${b.outcome === "sold" ? `, which you sold in ${b.year}` : b.outcome === "closed" ? `, which you closed in ${b.year}` : ""}`), ...(s.business ? [`${s.business.name}, which you ran to the end`] : [])];
  if (built.length) out.push(`You built ${list(built)}.`);

  // family
  const marriages = all(log, /^You marry /).map((l) => `${l.text.slice("You marry ".length, -1)} in ${l.year}`);
  const divorces = all(log, /^You divorce /).length;
  const kids = s.kids.map((k) => k.name);
  const family: string[] = [];
  if (marriages.length) family.push(`married ${list(marriages)}`);
  if (divorces) family.push(`divorced ${divorces === 1 ? "once" : `${count(divorces)} times`}`);
  if (kids.length) family.push(`had ${count(kids.length)} ${kids.length === 1 ? "child" : "children"}, ${list(kids)}`);
  out.push(family.length ? `You ${list(family)}.` : "You never married, and had no children.");

  // home and moving
  const home = first(log, /^You (buy a home for|move into the family home|build a simple house)/);
  const left = all(log, /^You (leave .+ for |flee to )/);
  const places: [number, string][] = []; // told in the order they happened
  if (left.length) places.push([left[0].year, left.map((l) => (l.text.startsWith("You flee") ? `fled to ${l.text.match(/flee to (.+?) with/)?.[1]} in ${l.year}` : `left ${l.text.match(/^You leave (.+?) for (.+?)\./)?.slice(1, 3).join(" for ")} in ${l.year}`)).join(", then ")]);
  if (home)
    places.push([home.year, home.text.includes("buy a home") ? `bought your first home in ${home.year}` : home.text.includes("simple house") ? `built a house on family land in ${home.year}` : "lived in the family home"]);
  if (places.length) out.push(`You ${list(places.sort((a, b) => a[0] - b[0]).map((p) => p[1]))}.`);

  // money
  const peakAt = s.history.reduce((a, h) => (h.realNW > a.realNW ? h : a), s.history[0]);
  const money: string[] = [];
  if (peakAt && peakAt.realNW > 0) money.push(`Your wealth peaked at ${usd(intlToUsd(s.macroSeed, peakAt.realNW))} in today's dollars, when you were ${peakAt.age}.`);
  const crashes = all(log, /^(Stocks crash|Crypto crashes)/);
  if (crashes.length) {
    const did = (t: string) => (/sell near the bottom/.test(t) ? "sold near the bottom" : /sell half/.test(t) ? "sold half" : /buy while/.test(t) ? "bought while everyone else sold" : "held on");
    // the same reaction in several crashes is told once: "in 2036 and 2039 you held on"
    const byReaction = new Map<string, number[]>();
    for (const c of crashes) byReaction.set(did(c.text), [...(byReaction.get(did(c.text)) ?? []), c.year]);
    const told = [...byReaction].map(([what, years]) => `in ${list(years.map(String))} you ${what}`);
    money.push(crashes.length === 1 ? `When the market crashed ${told[0]}.` : `Through ${count(crashes.length)} crashes: ${list(told)}.`);
  }
  if (s.counters.bankruptcies) money.push(`You went bankrupt${s.counters.bankruptcies > 1 ? ` ${count(s.counters.bankruptcies)} times` : ""}, and started again.`);
  if (money.length) out.push(money.join(" "));

  // the end
  const estate = log.find((l) => l.year === death.year && /^(Your estate of|Half your estate|You leave (debts|nothing))/.test(l.text));
  const cause = causePhrase(death.cause);
  const at = s.country !== s.birthCountry ? ` in ${countryIn(s.country)}` : "";
  out.push(`You died at ${death.age}${at}, ${cause}.${estate ? ` ${estate.text}` : ""}`);
  return out.filter(Boolean);
}

/** Who came to say goodbye: whoever was still in your life, and friends in proportion to your network. */
function mourners(s: LifeState): string {
  const who: string[] = [];
  if (s.partner) who.push(s.partner.name);
  const kids = s.kids.map((k) => k.name);
  if (kids.length) who.push(`your ${kids.length === 1 ? "child" : "children"} ${list(kids)}`);
  if (s.siblings && s.death!.age < 85) who.push(`your ${s.siblings === 1 ? "sibling" : `${count(s.siblings)} siblings`}`);
  const friends = Math.round(s.stats.network * 0.6 + (s.retired ? 0 : 8));
  who.push(friends >= 10 ? `about ${friends} friends${s.retired ? "" : " and colleagues"}` : "a few friends");
  return `${list(who)} came to say goodbye.`.replace(/^./, (c) => c.toUpperCase());
}

/** A line for the stone: what this life was, without a word about who should have lived it. */
function epitaph(s: LifeState): string {
  const death = s.death!;
  const finalWage = W(s);
  const net = s.history[s.history.length - 1]?.netWorth ?? 0;
  const sold = s.pastBusinesses.find((b) => b.outcome === "sold" && b.value >= 3 * finalWage);
  if (s.counters.bankruptcies && net > finalWage) return "Fell, and got back up.";
  if (sold || s.business) return `Built ${(sold ?? s.business)!.name}.`;
  if (s.country !== s.birthCountry) return `Made a home far from ${countryName(s.birthCountry)}.`;
  const crashes = all(s.log, /^(Stocks crash|Crypto crashes)/);
  if (crashes.length && !crashes.some((c) => /\bsell\b/.test(c.text)))
    return crashes.some((c) => /buy while/.test(c.text)) ? "Bought when everyone else sold." : "Held on when everyone else sold.";
  // what you said at 30 money was for, and whether the life delivered it
  const peak = s.history.reduce((b, h) => Math.max(b, wageYears(s, h.netWorth, h.year, h.country)), 0);
  const free = peak >= 5 || !!s.business || s.pastBusinesses.length > 0 || !!first(s.log, /^You retire early/);
  const meant: Record<string, string> = {
    security: net >= finalWage ? "Kept everyone safe." : "Tried to keep everyone safe.",
    freedom: free ? "Free, in the end." : "Wanted to be free.",
    status: peak >= 5 || Number(s.flags.bestMult ?? 0) >= 2 ? "Made a name." : "Always wanted more.",
    impact: "Changed something.",
    family: s.kids.length || s.partner ? "Family first, always." : "Kept the family close.",
  };
  if (s.answers.money && meant[s.answers.money]) return meant[s.answers.money];
  if (s.kids.length >= 3) return `Raised ${count(s.kids.length)} children.`;
  if (death.age >= 90) return `${death.age} years, and every one of them counted.`;
  return `${death.age} years in ${countryName(s.country)}.`;
}

export function farewell(s: LifeState): Farewell {
  const death = s.death!;
  const born = countryIn(s.birthCountry);
  const left = first(s.log, /^You (leave .+ for |flee to )/);
  const where =
    s.country === s.birthCountry
      ? `In ${born}, where you were born.`
      : `In ${countryIn(s.country)}, ${left ? `${death.year - left.year} years after you left ${born}` : `far from ${born}`}.`;
  const share = death.age >= 1 ? livedLonger(s, death.age) : null;
  const outlived =
    share == null
      ? null
      : `Of everyone born in ${born} in ${s.birthYear}, ${share < 0.2 ? "only " : ""}about ${pct(share)} lived longer than you.`;
  const end = s.log.findIndex((l) => l.year === death.year && l.text.startsWith("You die at "));
  const lastYear = s.log
    .slice(0, end < 0 ? s.log.length : end)
    .filter((l) => l.year === death.year && l.tone !== "history" && !INDUSTRY.test(l.text))
    .map((l) => l.text);
  const kids = s.kids.map((k) => k.name);
  const bond = [s.partner ? `Partner of ${s.partner.name}` : "", kids.length ? `parent of ${list(kids)}` : ""].filter(Boolean).join(" · ");
  const days = Math.round((death.age + stream(s.seed, "days lived").next()) * 365.25);
  const peakAt = s.history.reduce((a, h) => (h.realNW > a.realNW ? h : a), s.history[0]);
  return {
    year: death.year,
    age: death.age,
    cause: death.cause,
    outlivedShare: share,
    peakUsd: peakAt ? Math.max(0, intlToUsd(s.macroSeed, peakAt.realNW)) : 0,
    peakAge: peakAt?.age ?? death.age,
    died: death.cause.startsWith("killed ") ? `You are ${death.cause}.` : `You die ${causePhrase(death.cause)}.`,
    where,
    outlived,
    lastYear,
    moments: moments(s),
    mourners: mourners(s),
    estate: s.log.find((l) => l.year === death.year && /^(Your estate of|Half your estate|You leave (debts|nothing))/.test(l.text))?.text ?? null,
    story: story(s),
    best: yearOf(s, 1),
    worst: yearOf(s, -1),
    epitaph: epitaph(s),
    bond: bond ? bond[0].toUpperCase() + bond.slice(1) : null,
    days,
  };
}
