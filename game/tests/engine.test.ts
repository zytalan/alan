import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { birthShare, createLife, drawBirthYear, drawCountry } from "../src/engine/life";
import { econ, toIntl2021 } from "../src/engine/macro";
import { memories } from "../src/engine/memories";
import { invest, liquid, netWorth, pay, raiseCash } from "../src/engine/ops";
import { lifeCode, newGame, parseLifeCode, runLife, steady, typical } from "../src/engine/policy";
import { buildReport } from "../src/engine/report";
import { Rng, stream } from "../src/engine/rng";
import { countryIsos, setWorld, world, type WorldData } from "../src/engine/world";

beforeAll(() => {
  setWorld(JSON.parse(readFileSync(new URL("../public/data/world.json", import.meta.url), "utf8")) as WorldData);
});

describe("data", () => {
  it("covers the world's countries and the US market history", () => {
    expect(countryIsos().length).toBeGreaterThanOrEqual(160);
    const w = world();
    const usEq = w.markets.USA.eq;
    expect(usEq.filter((v) => v != null).length).toBe(w.y1 - w.m0 + 1);
    // 2008: the S&P 500 lost about 37% including dividends
    expect(w.markets.USA.eq[2008 - w.m0]).toBeCloseTo(-0.37, 1);
  });

  it("weights the birth lottery by real births", () => {
    expect(birthShare("IND", 2023)).toBeGreaterThan(0.15);
    expect(birthShare("IND", 2023)).toBeLessThan(0.21);
    const r = new Rng(7);
    let india = 0;
    for (let i = 0; i < 4000; i++) if (drawCountry(2023, r) === "IND") india++;
    expect(india / 4000).toBeGreaterThan(0.15);
    expect(india / 4000).toBeLessThan(0.21);
  });
});

describe("birth years", () => {
  it("are drawn from 1950 to today by how many babies each year had", () => {
    const r = new Rng(11);
    const years = Array.from({ length: 3000 }, () => drawBirthYear("any", r));
    expect(Math.min(...years)).toBeGreaterThanOrEqual(1950);
    expect(Math.max(...years)).toBeLessThanOrEqual(2026);
    const share = (a: number, b: number) => years.filter((y) => y >= a && y <= b).length / years.length;
    expect(share(2001, 2025)).toBeGreaterThan(0.28); // these never came up before
    expect(share(2001, 2025)).toBeLessThan(0.42);
    expect(share(2026, 2026)).toBeLessThan(0.03); // a third of lives used to start in 2026
    expect(drawBirthYear("now", r)).toBe(2026);
  });

  it("go into a life's code, so the code replays the same birth", () => {
    for (const setup of [
      { mode: "random" as const, seed: 77, era: "any" as const, yearDraw: "births" as const },
      { mode: "random" as const, seed: 78, birthYear: 2011, yearDraw: "births" as const },
      { mode: "timetravel" as const, seed: 79, country: "KOR", year: 1997, startAge: 18, background: "poor" as const },
    ]) {
      const a = newGame(setup);
      const code = lifeCode(a);
      const b = newGame(parseLifeCode(code)!);
      expect([b.name, b.birthCountry, b.birthYear, b.parents.incomeMult]).toEqual([a.name, a.birthCountry, a.birthYear, a.parents.incomeMult]);
    }
    expect(lifeCode(newGame({ mode: "random", seed: 78, birthYear: 2011, yearDraw: "births" }))).toBe("2011-78");
    // codes from before stay bare seeds, and replay the old way
    expect(parseLifeCode("#1408823311")).toEqual({ mode: "random", seed: 1408823311, era: "any" });
    expect(lifeCode(createLife({ mode: "random", seed: 5, era: "any" }))).toBe("5");
    expect(parseLifeCode("2013-usa-rich-42")).toMatchObject({ mode: "timetravel", country: "USA", year: 2013, background: "rich" });
    expect(parseLifeCode("hello")).toBeNull();
    expect(parseLifeCode("1949-42")).toBeNull();
  });
});

describe("randomness", () => {
  it("streams are deterministic and independent", () => {
    expect(stream(1, "a", 2000).next()).toBe(stream(1, "a", 2000).next());
    expect(stream(1, "a", 2000).next()).not.toBe(stream(1, "a", 2001).next());
  });

  it("the same seed replays the same life", () => {
    const a = runLife(newGame({ mode: "random", seed: 4242 }), typical);
    const b = runLife(newGame({ mode: "random", seed: 4242 }), typical);
    expect(b.log.map((l) => l.text)).toEqual(a.log.map((l) => l.text));
    expect(b.history.map((h) => h.netWorth)).toEqual(a.history.map((h) => h.netWorth));
  });

  it("choices never change the world's history", () => {
    const a = runLife(newGame({ mode: "random", seed: 99, country: "BRA", birthYear: 1980 }), typical);
    const b = runLife(newGame({ mode: "random", seed: 99, country: "BRA", birthYear: 1980 }), steady);
    expect(a.birthCountry).toBe(b.birthCountry);
    for (const y of [1990, 2008, 2040]) expect(econ("BRA", a.macroSeed, y).eq).toBe(econ("BRA", b.macroSeed, y).eq);
  });
});

describe("lives", () => {
  it("run to the end without invalid numbers", () => {
    for (let seed = 1; seed <= 120; seed++) {
      const s = runLife(newGame({ mode: "random", seed: seed * 7919 }), typical);
      expect(s.alive).toBe(false);
      for (const h of s.history) {
        expect(Number.isFinite(h.netWorth)).toBe(true);
        expect(Number.isFinite(h.realNW)).toBe(true);
      }
    }
  });

  it("die at ages that match each country's life tables", () => {
    const meanAge = (iso: string, year: number) => {
      let total = 0;
      for (let i = 0; i < 150; i++) {
        const s = runLife(newGame({ mode: "random", seed: 500 + i, country: iso, birthYear: year }), typical);
        total += s.death?.age ?? s.age;
      }
      return total / 150;
    };
    const us = meanAge("USA", 1960);
    const ng = meanAge("NGA", 1990);
    expect(us).toBeGreaterThan(70);
    expect(us).toBeLessThan(84);
    expect(ng).toBeGreaterThan(35);
    expect(ng).toBeLessThan(62);
  });

  it("time travel drops you in at 18 in the chosen year, remembering what's coming", () => {
    const s = newGame({ mode: "timetravel", seed: 3, country: "USA", year: 1995, startAge: 18, background: "middle" });
    expect(s.year).toBe(1995);
    expect(s.age).toBe(18);
    expect(s.alive).toBe(true);
    const mem = memories(s);
    expect(mem.some((m) => m.year === 2008)).toBe(true);
  });

  it("tell a year's headlines once it's lived, unless you came back in time", () => {
    const s = newGame({ mode: "random", seed: 5, country: "USA", birthYear: 1970 });
    runLife(s, typical, (t) => t.year >= 2008);
    const heads = (x: typeof s, y: number) => x.log.filter((l) => l.year === y && l.tone === "history").map((l) => l.text);
    expect(heads(s, 2008)).toEqual([]);
    runLife(s, typical, (t) => t.year >= 2009);
    expect(heads(s, 2008)[0]).toMatch(/Lehman/);
    expect(s.log.find((l) => l.year === 2008)!.tone).toBe("history"); // filed at the top of the year
    const tt = newGame({ mode: "timetravel", seed: 3, country: "USA", year: 2007, startAge: 18, background: "middle" });
    runLife(tt, typical, (x) => x.year >= 2008);
    expect(heads(tt, 2008)[0]).toMatch(/Lehman/);
  });
});

describe("money rules", () => {
  it("moves money without creating or losing any", () => {
    const s = newGame({ mode: "random", seed: 11, country: "DEU", birthYear: 1980 });
    s.access.bank = true;
    s.allocation = { cash: 0.5, usd: 0, bonds: 0.5, localEq: 0, globalEq: 0, gold: 0, crypto: 0 };
    invest(s, 1000);
    expect(liquid(s)).toBeCloseTo(1000, 6);
    expect(raiseCash(s, 400)).toBeCloseTo(400, 6);
    expect(liquid(s)).toBeCloseTo(600, 6);
  });

  it("borrows only what lenders allow and records the rest as unpaid", () => {
    const s = newGame({ mode: "random", seed: 12, country: "IND", birthYear: 1990 });
    s.access.bank = false;
    s.creditLockUntil = 9999;
    const before = netWorth(s);
    const unpaid = pay(s, 1e6);
    expect(unpaid).toBeGreaterThan(0);
    expect(s.consumerDebt).toBe(0);
    expect(netWorth(s)).toBeLessThanOrEqual(before);
  });

  it("converts money to 2021 international dollars using real prices", () => {
    // a 2021 US dollar is a 2021 international dollar
    expect(toIntl2021("USA", 1, 2021, 100)).toBeCloseTo(100, 6);
    // prices rose between 1990 and 2021, so 1990 dollars are worth more
    expect(toIntl2021("USA", 1, 1990, 100)).toBeGreaterThan(180);
  });
});

describe("report", () => {
  it("splits an outcome into birth, fortune and choices", async () => {
    const s = runLife(newGame({ mode: "random", seed: 2024, country: "MEX", birthYear: 1975 }), steady);
    const r = await buildReport(s, { worldN: 20, countryN: 10, marketN: 3 });
    expect(["S", "A", "B", "C", "D"]).toContain(r.grade);
    for (const v of Object.values(r.luck)) expect(v).toBeGreaterThan(0);
    expect(r.worldPct).toBeGreaterThanOrEqual(0);
    expect(r.worldPct).toBeLessThanOrEqual(1);
    expect(r.you.length).toBe(s.history.length);
  }, 60_000);
});
