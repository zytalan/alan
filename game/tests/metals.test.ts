import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { buy, deposit, deskAccess, ensureDesk, quote, quoteBuy, sell, spreadOf, stepMonth, tradable } from "../src/engine/desk";
import { econ } from "../src/engine/macro";
import { metalUsd, setMarkets, tOf, type MarketsData } from "../src/engine/markets";
import { availableAssets } from "../src/engine/ops";
import { newGame, runLife, typical } from "../src/engine/policy";
import type { LifeState } from "../src/engine/types";
import { setWorld, type WorldData } from "../src/engine/world";

beforeAll(() => {
  setWorld(JSON.parse(readFileSync(new URL("../public/data/world.json", import.meta.url), "utf8")) as WorldData);
  setMarkets(JSON.parse(readFileSync(new URL("../public/data/markets.json", import.meta.url), "utf8")) as MarketsData);
});

/** An adult in `iso` at the start of `year` with money in a trading account. */
function trader(seed: number, iso: string, year: number): LifeState {
  const s = newGame({ mode: "random", seed, country: iso, birthYear: year - 34 });
  s.flags.immortalUntil = 60;
  runLife(s, typical, (t) => t.year >= year);
  return refill(s);
}

/** Back at the desk with money to spend, after the life has moved on. */
function refill(s: LifeState): LifeState {
  s.pending = [];
  s.access.bank = true;
  ensureDesk(s);
  s.holdings.cash += 100000;
  deposit(s, 50000);
  return s;
}

const listed = (s: LifeState, id: string) => tradable(s).some((i) => i.id === id);

describe("gold and silver prices", () => {
  it("replay the World Bank's monthly averages from 1960", () => {
    expect(metalUsd("XAU", 1, tOf(1959, 12))).toBeNull();
    expect(metalUsd("XAU", 1, tOf(1965, 6))).toBe(35);
    expect(metalUsd("XAU", 1, tOf(1980, 1))).toBe(675);
    expect(metalUsd("XAG", 1, tOf(1980, 1))).toBeCloseTo(38.9, 6);
    expect(metalUsd("XAG", 1, tOf(1980, 4))).toBeCloseTo(14.9, 6); // after Silver Thursday
  });

  it("end each simulated year at the gold return the rest of the life uses", () => {
    for (const y of [2030, 2051]) {
      const ratio = metalUsd("XAU", 4, tOf(y, 12))! / metalUsd("XAU", 4, tOf(y - 1, 12))!;
      expect(ratio).toBeCloseTo(1 + econ("USA", 4, y).gold, 9);
    }
    for (let t = tOf(2026, 1); t <= tOf(2100, 12); t += 7) {
      const g = metalUsd("XAU", 4, t)!;
      const s = metalUsd("XAG", 4, t)!;
      expect(Number.isFinite(g) && Number.isFinite(s)).toBe(true);
      expect(g / s).toBeGreaterThan(15);
      expect(g / s).toBeLessThan(150);
    }
  });
});

describe("gold on the desk", () => {
  it("is off limits to Americans until 1975", () => {
    const s = trader(21, "USA", 1974);
    expect(listed(s, "mt:XAG")).toBe(true);
    expect(listed(s, "mt:XAU")).toBe(false);
    expect(deskAccess(s).metalNote).toMatch(/6102/);
    expect(buy(s, "mt:XAU", 1000)).toBe(false);
    expect(availableAssets(s)).not.toContain("gold");
    runLife(s, typical, (t) => t.year >= 1975);
    refill(s);
    expect(listed(s, "mt:XAU")).toBe(false); // the year opens on December's prices, still under the ban
    stepMonth(s);
    expect(listed(s, "mt:XAU")).toBe(true);
    expect(availableAssets(s)).toContain("gold");
    expect(buy(s, "mt:XAU", 1000)).toBe(true);
  });

  it("tells Americans the day the ban ends", () => {
    const s = trader(22, "USA", 1974);
    let news: string[] = [];
    for (let m = 0; m < 12; m++) news = news.concat(stepMonth(s));
    runLife(s, typical, (t) => t.year >= 1975);
    news = news.concat(stepMonth(refill(s)));
    expect(news.some((n) => /Americans may own gold again/.test(n))).toBe(true);
  });

  it("follows Britain's rules: coins at a premium, a ban from 1966 to 1971, then coins again", () => {
    expect(listed(trader(23, "GBR", 1968), "mt:XAU")).toBe(false);
    const s = trader(23, "GBR", 1975);
    expect(listed(s, "mt:XAU")).toBe(true);
    expect(deskAccess(s).metalNote).toMatch(/coins/);
    const q = quoteBuy(s, "mt:XAU", 1000)!;
    expect(q.price / quote(s, "mt:XAU")!).toBeCloseTo(1 + (spreadOf("mt:XAU", 1974) + 0.06) / 2, 9);
    const free = trader(23, "GBR", 1985);
    expect(quoteBuy(free, "mt:XAU", 1000)!.price / quote(free, "mt:XAU")!).toBeCloseTo(1 + spreadOf("mt:XAU", 1984) / 2, 9);
  });

  it("keeps Indians to jewellery until 1990, which still counts as savings", () => {
    const s = trader(24, "IND", 1980);
    expect(listed(s, "mt:XAU")).toBe(false);
    expect(deskAccess(s).metalNote).toMatch(/jewellery/);
    expect(availableAssets(s)).toContain("gold");
    expect(listed(trader(24, "IND", 1992), "mt:XAU")).toBe(true);
  });

  it("charges a dealer's spread and vault fees, then a fund's", () => {
    expect(spreadOf("mt:XAU", 1980)).toBeGreaterThan(spreadOf("mt:XAU", 2010));
    const s = trader(25, "DEU", 1990);
    expect(buy(s, "mt:XAU", 10000)).toBe(true);
    const units = s.desk!.pos["mt:XAU"].units;
    for (let m = 0; m < 12; m++) stepMonth(s);
    expect(s.desk!.pos["mt:XAU"].units).toBeCloseTo(units * (1 - 0.006 / 12) ** 12, 9);
    expect(sell(s, "mt:XAU", 1e9)).toBe(true);
  });
});
