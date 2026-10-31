import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { companionAt, companionEvents, companions, companionStory, firstName } from "../src/engine/companions";
import { newGame, runLife, typical } from "../src/engine/policy";
import { country, setWorld, type WorldData } from "../src/engine/world";

beforeAll(() => {
  setWorld(JSON.parse(readFileSync(new URL("../public/data/world.json", import.meta.url), "utf8")) as WorldData);
});

describe("the four born the same year", () => {
  it("come one from each income group, never from your country, born when you were", () => {
    for (const seed of [3, 17, 41]) {
      const s = newGame({ mode: "random", seed, yearDraw: "births" });
      const cs = companions(s);
      expect(cs.map((c) => country(c.life.birthCountry).inc)).toEqual(["LIC", "LMC", "UMC", "HIC"]);
      for (const c of cs) {
        expect(c.life.birthCountry).not.toBe(s.birthCountry);
        expect(c.life.birthYear).toBe(s.birthYear);
      }
      // families spread from poor to rich
      const fam = cs.map((c) => c.life.familyPct).sort((a, b) => a - b);
      expect(fam[0]).toBeLessThan(0.2);
      expect(fam[3]).toBeGreaterThan(0.8);
    }
  });

  it("are the same people when the same birth is replayed", () => {
    const a = companions(newGame({ mode: "random", seed: 99, country: "BRA", birthYear: 1990 }));
    const b = companions(newGame({ mode: "random", seed: 99, country: "BRA", birthYear: 1990 }));
    expect(a.map((c) => c.life.name)).toEqual(b.map((c) => c.life.name));
    const other = companions(newGame({ mode: "random", seed: 100, country: "BRA", birthYear: 1990 }));
    expect(other.map((c) => c.life.name)).not.toEqual(a.map((c) => c.life.name));
  });

  it("can be looked up in any year of your life, alive or not", () => {
    const s = newGame({ mode: "random", seed: 7, country: "AUS", birthYear: 1975 });
    runLife(s, typical);
    for (const c of companions(s)) {
      for (let y = s.birthYear; y <= s.year; y += 7) {
        const n = companionAt(s, c, y);
        expect(Number.isFinite(n.usd)).toBe(true);
        if (n.alive) expect(n.age).toBe(y - s.birthYear);
        else expect(n.doing).toMatch(/^Died at \d+, /);
        expect(n.doing).not.toMatch(/undefined|NaN/);
      }
      expect(companionStory(c)).toMatch(new RegExp(`^${firstName(c.life)} was born in .+\\.$`));
    }
  });

  it("put their big moments in your ledger, each line led by their name", () => {
    const s = newGame({ mode: "random", seed: 11, country: "IND", birthYear: 1985 });
    runLife(s, typical);
    for (const c of companions(s)) {
      const first = firstName(c.life);
      for (let y = s.birthYear; y <= c.life.year; y++) for (const line of companionEvents(c, y)) expect(line.startsWith(`${first} `), line).toBe(true);
      if (c.life.death) expect(companionEvents(c, c.life.death.year).some((l) => / dies at \d+, /.test(l))).toBe(true);
      // one first job, not every job
      const jobs = Array.from({ length: c.life.year - s.birthYear + 1 }, (_, i) => companionEvents(c, s.birthYear + i)).flat().filter((l) => / starts work as /.test(l));
      expect(jobs.length).toBeLessThanOrEqual(1);
    }
  });

  it("keeps a note of how every year was spent", () => {
    const s = newGame({ mode: "random", seed: 5, country: "USA", birthYear: 1960 });
    runLife(s, typical);
    expect(s.history.every((h) => h.doing)).toBe(true);
    expect(s.history.some((h) => h.doing?.kind === "work")).toBe(true);
  });
});
