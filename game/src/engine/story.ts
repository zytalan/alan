// The year's money in a line for the ledger: what came in and what you kept, the biggest thing that
// moved your net worth, and any milestone it crossed. Built from the same breakdown as "What moved it".

import { pct } from "./format";
import { fmt } from "./ops";
import type { LifeState, Tone, YearRecord } from "./types";

const MARKETS = ["localEq", "globalEq", "picks", "desk", "crypto", "gold", "usd", "bonds"];

/** Wealth in years of the typical wage at which the coin on your account changes metal. */
const COINS: [number, string][] = [
  [1, "a year's typical wage here: your coin turns silver"],
  [2.5, "two and a half years' typical wage here: your coin turns gold"],
  [10, "ten years' typical wage here: your coin turns platinum"],
];

/** What came in and how much of it stayed. `v` picks the phrasing, so neighbouring years don't read alike. */
function earnings(s: LifeState, rec: YearRecord, v: number): string | null {
  const money = (x: number) => fmt(s, Math.abs(x));
  const kept = rec.saved;
  if (s.school) {
    // a student's year is the debt it adds, or how they get by, said once
    if (s.studentDebt > 0) return `Studying: your student debt reaches ${money(s.studentDebt)}.`;
    if (rec.income <= 0 || s.flags.studyNoted === s.school.kind) return null;
    s.flags.studyNoted = s.school.kind;
    return `Studying, you get by on ${money(rec.income)} a year from part-time work and family.`;
  }
  if (rec.income <= 0) return kept < 0 ? `With nothing coming in, you live on ${money(kept)} of savings.` : null;
  const came = s.retired
    ? `Your pension and other income come to ${money(rec.income)}`
    : s.partner?.working
      ? `Your household earns ${money(rec.income)}`
      : `You earn ${money(rec.income)}`;
  if (kept < 0) return `${came}, but you spend ${money(kept)} more than that.`;
  if (kept < 0.02 * rec.income) return `${came}, and almost all of it goes on living.`;
  return v % 3 === 0 ? `${came}, and you put ${money(kept)} aside.` : v % 3 === 1 ? `${came}; ${money(kept)} of it stays.` : `${came}, and you keep ${money(kept)}.`;
}

/** The year's line, or nothing in a year without money worth telling. `wage` and `wageBefore` are this year's and last year's typical wage. */
export function yearLine(s: LifeState, rec: YearRecord, prev: YearRecord | undefined, wage: number, wageBefore: number, infl: number): [string, Tone] | null {
  if (s.age < 18 || !prev || !rec.moves) return null;
  const money = (x: number) => fmt(s, Math.abs(x));
  const m = rec.moves;
  const parts: string[] = [];

  const earned = earnings(s, rec, rec.year + s.seed);
  if (earned) parts.push(earned);

  // the biggest thing besides saving that moved net worth: markets, a home, a business, debt, or prices
  const prices = prev.netWorth > 0.5 * wage && infl >= 0.08 ? -prev.netWorth * infl : 0;
  const drivers: [string, number][] = [
    ["markets", MARKETS.reduce((a, k) => a + (m[k] ?? 0), 0)],
    ["home", m.home ?? 0],
    ["business", m.business ?? 0],
    ["debt", m.interest ?? 0],
    ["prices", prices],
  ];
  const [what, amt] = drivers.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0];
  const kept = Math.max(0, rec.saved);
  if (Math.abs(amt) >= Math.max(0.03 * wage, 0.25 * kept)) {
    const more = rec.income > 0 && Math.abs(amt) >= rec.income ? ", more than a year's income" : kept > 0 && Math.abs(amt) > kept ? ", more than you saved" : "";
    // a move of a fifth or more of what you had invested is a crash or a boom
    const swing = Math.abs(amt) / Math.max(1, rec.liquid - Math.max(0, amt));
    if (what === "markets")
      parts.push(
        amt < 0
          ? `${swing >= 0.2 ? "Markets crash: your" : "Your"} investments lose ${money(amt)}${more}.`
          : `${swing >= 0.2 ? "A great year for markets: your" : "Your"} investments gain ${money(amt)}${more}.`,
      );
    else if (what === "home")
      parts.push(amt > 0 ? `Your ${s.properties.length > 1 ? "property gains" : "home gains"} ${money(amt)} in value${more}.` : `Property prices fall: you lose ${money(amt)} on paper${more}.`);
    else if (what === "business") parts.push(`Your business ${amt > 0 ? "adds" : "loses"} ${money(amt)}${more}.`);
    else if (what === "debt") parts.push(`Interest on your debts costs ${money(amt)}${more}.`);
    else parts.push(`Prices rise ${pct(infl, 0)}, eating ${money(amt)} of what you had${more}.`);
  }

  // a milestone crossed: out of the red, into it, or a new coin
  const now = rec.netWorth / wage;
  const then = prev.netWorth / wageBefore;
  if (prev.netWorth < 0 && rec.netWorth >= 0) parts.push("You're out of the red: you own more than you owe.");
  else if (prev.netWorth >= 0 && rec.netWorth < -0.05 * wage) parts.push("You now owe more than you own.");
  else {
    const coin = COINS.filter(([t]) => then < t && now >= t).pop();
    if (coin) parts.push(`You're now worth more than ${coin[1]}.`);
  }
  // a rise that prices more than took back, or a fall the lines above don't explain (a wedding, a move, a bad bet)
  const change = rec.netWorth - prev.netWorth;
  const real = change - prev.netWorth * infl;
  const told = (what === "prices" || amt < 0) && Math.abs(amt) >= 0.5 * Math.abs(change);
  if (!prices && change > 0 && real <= -0.05 * wage) parts.push(`But prices rose ${pct(infl, 1)}, so you're ${money(real)} worse off than a year ago.`);
  else if (change <= -0.05 * wage && !told && rec.saved >= 0) parts.push(`All told, you end the year ${money(change)} poorer.`);
  if (!parts.length) return null;
  return [parts.join(" "), real >= 0.05 * wage ? "good" : real <= -0.05 * wage ? "bad" : "money"];
}
