// Four people born the same year as you, in other countries and other families, living by the same
// rules: one from each of the World Bank's income groups, with families spread from poor to rich.
// Their lives are simulated in full from your life's seed, so a replay meets them again, and are
// shown one year at a time as you live yours.

import { calledBy } from "./content/names";
import { aTitle, lc } from "./format";
import { createLife } from "./life";
import { intlToUsd } from "./macro";
import { causePhrase } from "./mortality";
import { runLife, typical } from "./policy";
import { randomLifestyle } from "./report";
import { hashString, stream } from "./rng";
import type { Doing, LifeState } from "./types";
import { country, countryIn, countryIsos, countryName, nearest } from "./world";

const GROUPS = ["LIC", "LMC", "UMC", "HIC"] as const;

export interface Companion {
  life: LifeState;
  group: (typeof GROUPS)[number];
}

/** Where a companion is at a given year of your life. */
export interface CompanionNow {
  name: string;
  first: string;
  born: string; // birth country
  where: string; // country they live in that year
  age: number;
  alive: boolean;
  died: { year: number; age: number; cause: string } | null;
  doing: string; // "A nurse", "At university", "Retired"
  usd: number; // net worth that year (or when they died), in today's US dollars
  familyPct: number;
}

const cache = new Map<string, Companion[]>();

/** What a companion is called in a sentence: "Fatou", or "Wei" for Huang Wei. */
export const firstName = (life: LifeState) => calledBy(life.name, String(life.flags.nameGroup ?? ""));

/** Four lives born the year you were, one from each income group of countries, never your own. */
export function companions(s: LifeState): Companion[] {
  const key = `${s.seed}|${s.macroSeed}|${s.birthYear}|${s.birthCountry}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const r = stream(s.seed, "companions");
  const births = (iso: string) => nearest(iso, "births", Math.min(s.birthYear, 2025)) ?? 0;
  // families spread across the range, so the four start from different rungs as well as different places
  const rungs = [0.1, 0.35, 0.65, 0.9].map((p) => p + r.range(-0.08, 0.08));
  for (let i = rungs.length - 1; i > 0; i--) {
    const j = r.int(0, i);
    [rungs[i], rungs[j]] = [rungs[j], rungs[i]];
  }
  const out: Companion[] = [];
  GROUPS.forEach((group, i) => {
    const pool = countryIsos().filter((c) => c !== s.birthCountry && country(c).inc === group && births(c) > 0);
    if (!pool.length) return;
    const iso = r.weighted(pool, births);
    const seed = hashString(`${s.seed}|companion|${i}`);
    const life = createLife({ mode: "random", seed, macroSeed: s.macroSeed, birthYear: s.birthYear, country: iso, familyPct: rungs[i] });
    life.flags.isTwin = true;
    life.lifestyle = randomLifestyle(seed);
    runLife(life, typical);
    out.push({ life, group });
  });
  if (cache.size > 8) cache.delete(cache.keys().next().value!);
  cache.set(key, out);
  return out;
}

const STAGE: Record<string, string> = {
  primary: "At primary school",
  secondary: "At secondary school",
  vocational: "In vocational training",
  bachelor: "At university",
  master: "Studying for a master's",
  doctorate: "Studying for a doctorate",
};

function doingText(d: Doing | undefined, age: number): string {
  if (!d) return age < 6 ? "A small child" : "Growing up";
  switch (d.kind) {
    case "school":
      return STAGE[d.label ?? ""] ?? "At school";
    case "work":
      return d.label ? aTitle(d.label).replace(/^./, (c) => c.toUpperCase()) : "Working";
    case "business":
      return d.label ? `Running ${d.label}` : "Running a business";
    case "retired":
      return "Retired";
    case "child":
      return age < 6 ? "A small child" : "Growing up";
    default:
      return age < 18 ? "Out of school" : "Out of work";
  }
}

/** A companion as they were in a given year: alive and what they were doing, or how they died. */
export function companionAt(s: LifeState, c: Companion, year: number): CompanionNow {
  const life = c.life;
  const first = firstName(life);
  const death = life.death && life.death.year <= year ? life.death : null;
  const rec = [...life.history].reverse().find((h) => h.year <= year) ?? life.history[0];
  return {
    name: life.name,
    first,
    born: life.birthCountry,
    where: rec?.country ?? life.birthCountry,
    age: death ? death.age : year - life.birthYear,
    alive: !death,
    died: death ? { year: death.year, age: death.age, cause: death.cause } : null,
    doing: death ? `Died at ${death.age}, ${causePhrase(death.cause)}` : doingText(rec?.doing, year - life.birthYear),
    usd: rec ? intlToUsd(s.macroSeed, rec.realNW) : 0,
    familyPct: life.familyPct,
  };
}

/**
 * What a companion's year brought that's worth a line in your ledger: a first job, a wedding, a first
 * child, a move abroad, a bankruptcy, retirement, death. Each line starts with their name.
 */
export function companionEvents(c: Companion, year: number): string[] {
  const life = c.life;
  const first = firstName(life);
  const out: string[] = [];
  const firstKid = life.log.find((l) => / is born\.$/.test(l.text) && !/^You are born/.test(l.text));
  const firstJob = life.log.find((l) => /^You start work as /.test(l.text));
  for (const l of life.log) {
    if (l.year !== year) continue;
    const t = l.text;
    let m: RegExpMatchArray | null;
    if ((m = t.match(/^You die at (\d+), (.+)\.$/))) out.push(`${first} dies at ${m[1]}, ${m[2]}.`);
    else if ((m = t.match(/^You marry (.+)\.$/))) out.push(`${first} marries ${m[1]}.`);
    else if (l === firstKid) out.push(`${first} has a first child, ${t.replace(/ is born\.$/, "")}.`);
    else if ((m = t.match(/^You leave .+? for (.+?)\./))) out.push(`${first} moves to ${m[1]}.`);
    else if ((m = t.match(/^You flee to (.+?) with/))) out.push(`${first} flees to ${m[1]}.`);
    else if (l === firstJob && (m = t.match(/^You start work as (.+?), on /))) out.push(`${first} starts work as ${lc(m[1].split(" at ")[0])}.`);
    else if (/^You (declare bankruptcy|default on your lenders)/.test(t)) out.push(`${first} goes bankrupt.`);
    else if ((m = t.match(/^You retire( early)?,? at (\d+)\./))) out.push(`${first} retires at ${m[2]}.`);
  }
  return out;
}

/** One sentence for a whole companion life, told at the end. */
export function companionStory(c: Companion): string {
  const life = c.life;
  const first = firstName(life);
  const fam = life.familyPct < 0.25 ? "a poor family" : life.familyPct < 0.5 ? "a family of modest means" : life.familyPct < 0.75 ? "a comfortable family" : "a well-off family";
  const work = [...life.history].reverse().find((h) => h.doing?.kind === "work" || h.doing?.kind === "business")?.doing;
  const did = work ? (work.kind === "work" ? `worked as ${aTitle(work.label ?? "a worker")}` : `ran ${work.label}`) : "never held a steady job";
  const moved = life.country !== life.birthCountry ? `, moved to ${countryName(life.country)}` : "";
  const kids = life.kids.length ? `, had ${life.kids.length === 1 ? "a child" : `${life.kids.length} children`}` : "";
  const end = life.death ? `and died at ${life.death.age}, ${causePhrase(life.death.cause)}` : "and is still alive";
  return `${first} was born in ${countryIn(life.birthCountry)} into ${fam}, ${did}${moved}${kids} ${end}.`;
}
