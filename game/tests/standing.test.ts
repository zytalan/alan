import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { newGame, runLife, typical } from "../src/engine/policy";
import { buildReport } from "../src/engine/report";
import { people, rankLabel, richerThan } from "../src/engine/standing";
import { setWorld, type WorldData } from "../src/engine/world";

beforeAll(() => {
  setWorld(JSON.parse(readFileSync(new URL("../public/data/world.json", import.meta.url), "utf8")) as WorldData);
});

const small = { worldN: 40, countryN: 30, abroadN: 20, marketN: 2 };

describe("ranks among people your age", () => {
  it("ranks within the sample, counting ties as half", () => {
    const xs = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(richerThan(xs, 50.5)).toBeCloseTo(0.5, 2);
    expect(richerThan([0, 0, 0, 0, 10], 0)).toBeCloseTo(0.4);
    expect(richerThan([-5, 0, 3], -10)).toBe(0);
  });

  it("goes on rising past the richest person sampled, without a jump at the top tenth", () => {
    const xs = Array.from({ length: 160 }, (_, i) => 1000 * 1.04 ** i).sort((a, b) => a - b);
    let last = -1;
    for (let v = 500; v < 1e9; v *= 1.3) {
      const p = richerThan(xs, v);
      expect(p).toBeGreaterThanOrEqual(last);
      expect(p).toBeLessThan(1);
      last = p;
    }
    const p90 = xs[Math.floor(0.9 * xs.length)];
    expect(Math.abs(richerThan(xs, p90 * 1.0001) - richerThan(xs, p90 * 0.9999))).toBeLessThan(0.01);
  });

  it("says a rank and a crowd the way a person would", () => {
    expect(rankLabel(0.97)).toBe("Top 3%");
    expect(rankLabel(0.9995)).toBe("Top 0.05%");
    expect(rankLabel(0.3)).toBe("Richer than 30%");
    expect(rankLabel(0.004)).toBe("Bottom 1%");
    expect(people(95_400_000)).toBe("95 million");
    expect(people(342_000)).toBe("340,000");
    expect(people(37)).toBe("37");
  });

  it("measures a life against the world and its country, and picks a few stats led by the world rank", async () => {
    const s = newGame({ mode: "random", seed: 7, country: "AUS", birthYear: 1975 });
    runLife(s, typical);
    const { standing } = await buildReport(s, small);
    expect(standing.cohorts.map((c) => c.key)).toEqual(["world", "home"]);
    expect(standing.stats[0].key).toBe("world");
    expect(standing.stats.length).toBeLessThanOrEqual(4);
    expect(new Set(standing.stats.map((x) => x.key)).size).toBe(standing.stats.length);
    for (const p of standing.ranks)
      for (const v of [p.world, p.home]) {
        if (v == null) continue;
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    for (const c of standing.cohorts)
      for (const b of c.bands) {
        expect(b.p10).toBeLessThanOrEqual(b.p25);
        expect(b.p25).toBeLessThanOrEqual(b.p50);
        expect(b.p50).toBeLessThanOrEqual(b.p75);
        expect(b.p75).toBeLessThanOrEqual(b.p90);
      }
    for (const x of standing.stats) expect(`${x.label} ${x.value} ${x.note}`).not.toMatch(/undefined|NaN|null|Infinity/);
  });

  it("adds the country someone moved to, from the year they arrived", async () => {
    const s = newGame({ mode: "random", seed: 465, yearDraw: "births" });
    runLife(s, typical);
    expect(s.country).not.toBe(s.birthCountry);
    const { standing } = await buildReport(s, small);
    const abroad = standing.cohorts.find((c) => c.key === "abroad");
    expect(abroad?.iso).toBe(s.country);
    const first = standing.ranks.find((p) => p.abroad != null)!;
    expect(s.history.find((h) => h.age === first.age)?.country).toBe(s.country);
    expect(standing.stats.some((x) => x.key === "abroad")).toBe(true);
  });
});
