import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { givenName, makeName, nameGroupFor } from "../src/engine/content/names";
import { monthNewsFor } from "../src/engine/history";
import { birthShares } from "../src/engine/life";
import { econ } from "../src/engine/macro";
import { wageYears } from "../src/engine/ops";
import { newGame, runLife, typical } from "../src/engine/policy";
import { Rng } from "../src/engine/rng";
import type { Sex } from "../src/engine/types";
import { setWorld, type WorldData } from "../src/engine/world";
import { metalFor } from "../src/ui/Coin";
import { edition } from "../src/ui/FrontPage";

beforeAll(() => {
  setWorld(JSON.parse(readFileSync(new URL("../public/data/world.json", import.meta.url), "utf8")) as WorldData);
});

/** Every first name a tradition can produce. */
function pool(group: string, sex: Sex): Set<string> {
  const out = new Set<string>();
  for (let k = 1; k <= 400; k++) out.add(givenName(group, sex, new Rng(k)));
  return out;
}

describe("birth lottery", () => {
  it("shares out each year's births among the countries", () => {
    const b = birthShares(1990);
    expect(Object.values(b.share).reduce((a, x) => a + x, 0)).toBeCloseTo(1, 6);
    // about 135 million babies were born in 1990 (World Bank)
    expect(b.total).toBeGreaterThan(1.2e8);
    expect(b.total).toBeLessThan(1.5e8);
    expect(b.share.IND + b.share.CHN).toBeGreaterThan(0.3);
  });
});

describe("names", () => {
  it("come from the country's own traditions, in proportion", () => {
    expect(nameGroupFor("KEN", "SSF", 1)).toBe("ke");
    const counts: Record<string, number> = {};
    for (let seed = 1; seed <= 600; seed++) {
      const g = nameGroupFor("NGA", "SSF", seed);
      counts[g] = (counts[g] ?? 0) + 1;
    }
    expect(Object.keys(counts).sort()).toEqual(["ha", "ig", "yo"]);
    expect(counts.ha / 600).toBeGreaterThan(0.35);
    expect(counts.ha / 600).toBeLessThan(0.55);
  });

  it("give women the feminine form of a gendered family name", () => {
    for (let seed = 1; seed <= 40; seed++) {
      expect(makeName("ru", "F", new Rng(seed)).family).toMatch(/a$/);
      expect(makeName("ru", "M", new Rng(seed)).family).not.toMatch(/a$/);
      expect(makeName("pl", "F", new Rng(seed)).family).not.toMatch(/(sk|ck)i$/);
    }
    expect(makeName("mm", "M", new Rng(3)).family).toBe("");
  });

  it("always take two draws, so new name lists never reshuffle the rest of a life", () => {
    for (const g of ["en", "mm", "bd", "ru"]) {
      const a = new Rng(99);
      makeName(g, "F", a);
      const b = new Rng(99);
      b.next();
      b.next();
      expect(a.next()).toBe(b.next());
    }
  });

  it("pass the family's tradition on to its children", () => {
    let checked = 0;
    for (let seed = 1; seed <= 80 && checked < 8; seed++) {
      const s = newGame({ mode: "random", seed, country: "NGA", birthYear: 1975 });
      runLife(s, typical, (t) => t.age >= 45);
      if (!s.kids.length || s.history.some((h) => h.country !== "NGA")) continue;
      const group = String(s.flags.nameGroup);
      for (const k of s.kids) expect(pool(group, k.sex).has(k.name)).toBe(true);
      checked++;
    }
    expect(checked).toBeGreaterThan(3);
  });
});

describe("life graphics", () => {
  it("strikes the coin in the metal your wealth has reached", () => {
    expect([0.5, 1, 2.4, 2.5, 9.9, 10].map(metalFor)).toEqual(["copper", "silver", "silver", "gold", "gold", "platinum"]);
    const s = newGame({ mode: "random", seed: 3, country: "USA", birthYear: 1980 });
    expect(wageYears(s, econ("USA", s.macroSeed, s.year).wage)).toBeCloseTo(1, 9);
  });

  it("puts the year's biggest story on New Year's Eve's front page", () => {
    const news = monthNewsFor("USA", 2008);
    expect(news.map((n) => n.m)).toEqual([...news.map((n) => n.m)].sort((a, b) => a - b));
    const s = newGame({ mode: "random", seed: 5, country: "USA", birthYear: 1970 });
    runLife(s, typical, (t) => t.year >= 2009);
    const ed = edition(s)!;
    expect(ed.year).toBe(2008);
    expect(ed.headline).toMatch(/Lehman/);
    expect(ed.markMonth).toBe(9);
  });
});
