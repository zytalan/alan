import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { farewell, livedLonger } from "../src/engine/ending";
import { newGame, runLife, typical } from "../src/engine/policy";
import type { LifeState } from "../src/engine/types";
import { setWorld, type WorldData } from "../src/engine/world";

beforeAll(() => {
  setWorld(JSON.parse(readFileSync(new URL("../public/data/world.json", import.meta.url), "utf8")) as WorldData);
});

/** Finished lives that reached adulthood. */
const adults = (n: number) => {
  const out: LifeState[] = [];
  for (let seed = 1; out.length < n; seed++) {
    const s = newGame({ mode: "random", seed: seed * 17, yearDraw: "births" });
    runLife(s, typical);
    if (s.death && s.death.age >= 18) out.push(s);
  }
  return out;
};

describe("the end of a life", () => {
  it("tells every life from its start to its death without gaps in the text", () => {
    for (const s of adults(60)) {
      const f = farewell(s);
      const text = [...f.story, f.mourners, f.epitaph, f.bond, ...f.moments.map((m) => m.text)].filter(Boolean).join(" ");
      expect(f.story[0], s.name).toMatch(/^You (were born|woke up) in /);
      expect(f.story[f.story.length - 1]).toMatch(new RegExp(`^You died at ${f.age}\\b`));
      expect(text).not.toMatch(/undefined|NaN|null|\s\s|\.\./);
      expect(f.mourners).toMatch(/^[A-Z].* came to say goodbye\.$/);
      expect(Math.abs(f.days - f.age * 365.25)).toBeLessThanOrEqual(366);
    }
  });

  it("keeps a dozen moments at most, once each, in the order they happened", () => {
    for (const s of adults(60)) {
      const { moments } = farewell(s);
      expect(moments.length).toBeLessThanOrEqual(12);
      expect(new Set(moments.map((m) => m.text.split(":")[0])).size).toBe(moments.length);
      for (let i = 1; i < moments.length; i++) expect(moments[i].year).toBeGreaterThanOrEqual(moments[i - 1].year);
    }
  });

  it("puts nothing on the stone that the story contradicts, and no pronouns", () => {
    for (const s of adults(80)) {
      const f = farewell(s);
      expect(f.epitaph).not.toMatch(/\b(he|she|his|her|him)\b/i);
      if (/when everyone else sold/.test(f.epitaph)) expect(f.story.join(" ")).not.toMatch(/you sold (half|near the bottom)/);
      if (f.epitaph === "Kept everyone safe.") expect(s.history[s.history.length - 1].netWorth).toBeGreaterThan(0);
    }
  });

  it("names a best year that gained and a worst year that lost", () => {
    for (const s of adults(40)) {
      const { best, worst } = farewell(s);
      if (best) expect(best.usd).toBeGreaterThan(0);
      if (worst) expect(worst.usd).toBeLessThan(0);
      for (const y of [best, worst]) if (y) expect(s.history.some((h) => h.year === y.year)).toBe(true);
    }
  });

  it("measures a death against the people born the same year and place", () => {
    const us = newGame({ mode: "random", seed: 3, country: "USA", birthYear: 1950 });
    const at = [1, 30, 60, 80, 95].map((a) => livedLonger(us, a));
    for (let i = 1; i < at.length; i++) expect(at[i]).toBeLessThan(at[i - 1]);
    expect(at[3]).toBeGreaterThan(0.35); // most Americans born in 1950 reach 80
    expect(at[3]).toBeLessThan(0.7);
    expect(at[4]).toBeLessThan(0.25);
    const ng = newGame({ mode: "random", seed: 3, country: "NGA", birthYear: 1970 });
    expect(livedLonger(ng, 60)).toBeLessThan(livedLonger(us, 60));
  });
});
