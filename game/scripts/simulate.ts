// Batch-simulate lives to sanity-check the engine: crashes, NaNs, lifespans,
// wealth distributions. Usage: npm run sim -- [lives] [policy]

import { readFileSync } from "node:fs";
import { newGame, runLife, steady, typical } from "../src/engine/policy";
import { randomLifestyle } from "../src/engine/report";
import { randomSeed } from "../src/engine/rng";
import type { LifeState } from "../src/engine/types";
import { country, countryName, setWorld } from "../src/engine/world";

setWorld(JSON.parse(readFileSync(new URL("../public/data/world.json", import.meta.url), "utf8")));

const n = Number(process.argv[2] ?? 300);
const chooser = process.argv[3] === "steady" ? steady : typical;
const lives: LifeState[] = [];
let failures = 0;
const t0 = performance.now();
for (let i = 0; i < n; i++) {
  const seed = randomSeed();
  try {
    const s = newGame({ mode: "random", seed, yearDraw: "births" });
    s.lifestyle = randomLifestyle(seed);
    runLife(s, chooser);
    const bad = s.history.find((h) => !Number.isFinite(h.netWorth) || !Number.isFinite(h.realNW));
    if (bad) throw new Error(`non-finite net worth at age ${bad.age}`);
    lives.push(s);
  } catch (err) {
    failures++;
    if (failures <= 5) console.error(`seed ${seed}:`, err instanceof Error ? err.stack : err);
  }
}
const ms = (performance.now() - t0) / n;

const q = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? 0;
};
const fmt = (x: number) => (Math.abs(x) >= 1e6 ? `${(x / 1e6).toFixed(2)}M` : Math.abs(x) >= 1e3 ? `${(x / 1e3).toFixed(1)}k` : x.toFixed(0));

console.log(`${lives.length} lives, ${failures} failures, ${ms.toFixed(1)} ms/life`);
const ages = lives.map((s) => s.death?.age ?? s.age);
console.log(`age at death: mean ${(ages.reduce((a, b) => a + b, 0) / ages.length).toFixed(1)}, under 5: ${(ages.filter((a) => a < 5).length / ages.length * 100).toFixed(1)}%`);
const groups: Record<string, LifeState[]> = {};
for (const s of lives) (groups[country(s.birthCountry).inc] ??= []).push(s);
for (const [inc, g] of Object.entries(groups).sort()) {
  const peaks = g.map((s) => s.peakReal);
  const a = g.map((s) => s.death?.age ?? s.age);
  console.log(
    `${inc.padEnd(4)} n=${String(g.length).padStart(4)}  age ${(a.reduce((x, y) => x + y, 0) / a.length).toFixed(1)}  peak NW (2021 intl$) p10 ${fmt(q(peaks, 0.1))} p50 ${fmt(q(peaks, 0.5))} p90 ${fmt(q(peaks, 0.9))} p99 ${fmt(q(peaks, 0.99))}`,
  );
}
const adults = lives.filter((s) => (s.death?.age ?? 0) >= 30);
const pct = (f: (s: LifeState) => boolean) => `${((adults.filter(f).length / Math.max(1, adults.length)) * 100).toFixed(0)}%`;
console.log(`adults reaching 30: ${adults.length}`);
console.log(`  bankrupt ${pct((s) => s.counters.bankruptcies > 0)}, owned a home ${pct((s) => s.properties.some((p) => p.kind === "home") || s.log.some((l) => l.text.includes("buy a home")))}, married ${pct((s) => s.log.some((l) => l.text.startsWith("You marry")))}, emigrated ${pct((s) => s.counters.moves > 0)}, bank account ${pct((s) => s.access.bank)}`);
console.log(`  university ${pct((s) => ["bachelor", "master", "doctorate"].includes(s.edu))}, never schooled ${pct((s) => s.edu === "none")}, scammed ${pct((s) => s.counters.scams > 0)}`);
const top = [...lives].sort((a, b) => b.peakReal - a.peakReal).slice(0, 5);
for (const s of top) console.log(`  rich: seed ${s.seed} ${countryName(s.birthCountry)} ${s.birthYear} ${s.edu} ${s.job?.title ?? "-"} peak ${fmt(s.peakReal)} biz ${s.counters.bizStarted} crypto ${s.flags.cryptoSeen ? "y" : "n"} lifestyle ${s.lifestyle}`);
const bk = lives.filter((s) => s.counters.bankruptcies > 0).slice(0, 4);
for (const s of bk) console.log(`  bankrupt: seed ${s.seed} ${countryName(s.birthCountry)} ${s.birthYear} ${s.lifestyle} ${s.edu}`);
