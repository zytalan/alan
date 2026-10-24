// Print one life year by year.
// Usage: npx tsx scripts/trace.ts seed <seed>   |   npx tsx scripts/trace.ts <ISO> <birthYear> [seed] [familyPct]

import { readFileSync } from "node:fs";
import { createLife } from "../src/engine/life";
import { ec, holdingsTotal, propertyValue, W } from "../src/engine/ops";
import { newGame, runLife, typical } from "../src/engine/policy";
import { randomLifestyle } from "../src/engine/report";
import { setWorld } from "../src/engine/world";

setWorld(JSON.parse(readFileSync(new URL("../public/data/world.json", import.meta.url), "utf8")));
const args = process.argv.slice(2);
let s;
if (args[0] === "seed") {
  s = newGame({ mode: "random", seed: Number(args[1]) });
  s.lifestyle = randomLifestyle(Number(args[1]));
} else {
  const [iso = "USA", by = "1960", seed = "42", fam = "0.5"] = args;
  s = createLife({ mode: "random", seed: Number(seed), country: iso, birthYear: Number(by), familyPct: Number(fam) });
}
const k = (x: number) => (Math.abs(x) >= 1e6 ? `${(x / 1e6).toFixed(2)}M` : `${(x / 1e3).toFixed(1)}k`);
let lastLog = 0;
runLife(s, typical, (t) => {
  const h = t.history[t.history.length - 1];
  if (h && h.age >= 15) {
    const e = ec(t, h.year);
    const hold = Object.entries(t.holdings).filter(([, v]) => v > 1).map(([key, v]) => `${key}:${k(v)}`).join(" ");
    console.log(
      `${h.year} age ${String(h.age).padStart(3)} W ${k(W(t, h.year)).padStart(8)} inc ${k(h.income).padStart(8)} spend ${k(h.spending).padStart(8)} NW ${k(h.netWorth).padStart(9)} real ${k(h.realNW).padStart(8)} prop ${k(propertyValue(t)).padStart(8)} debt ${k(h.debt).padStart(7)} infl ${(e.infl * 100).toFixed(1)} eq ${(e.eq * 100).toFixed(0)} btc ${e.btc ? Math.round(e.btc) : "-"} ${t.job?.title ?? "-"} ${t.job ? t.job.mult.toFixed(2) : ""} [${hold}]`,
    );
  }
  for (; lastLog < t.log.length; lastLog++) console.log("      ·", t.log[lastLog].year, t.log[lastLog].text);
  return false;
});
void holdingsTotal;
