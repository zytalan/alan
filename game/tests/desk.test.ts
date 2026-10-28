import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { buy, deposit, deskAccess, finishDeskYear, sell, stepMonth, tradable, withdraw } from "../src/engine/desk";
import { advance } from "../src/engine/life";
import { econ, intlToUsd, toIntl2021 } from "../src/engine/macro";
import { companies, companyPrice, deskValue, dividendYield, indexLevel, setMarkets, tOf, type MarketsData } from "../src/engine/markets";
import { fmt, liquid, netWorth } from "../src/engine/ops";
import { newGame, runLife, typical } from "../src/engine/policy";
import type { LifeState } from "../src/engine/types";
import { setWorld, type WorldData } from "../src/engine/world";

beforeAll(() => {
  setWorld(JSON.parse(readFileSync(new URL("../public/data/world.json", import.meta.url), "utf8")) as WorldData);
  setMarkets(JSON.parse(readFileSync(new URL("../public/data/markets.json", import.meta.url), "utf8")) as MarketsData);
});

/** A US adult in 2008 with savings, ready to trade. */
function trader(seed = 20): LifeState {
  const s = newGame({ mode: "random", seed, country: "USA", birthYear: 1974 });
  runLife(s, typical, (t) => t.year >= 2008);
  s.pending = [];
  return s;
}

describe("monthly markets", () => {
  it("replays real monthly prices where the data has them", () => {
    // Shiller's monthly average of the S&P 500
    expect(indexLevel("USA", 1, tOf(2008, 10))).toBeCloseTo(968.8, 1);
    expect(indexLevel("USA", 1, tOf(2009, 3))).toBeCloseTo(757.13, 1);
  });

  it("draws simulated months that compound exactly to the year's return", () => {
    for (const [iso, year] of [["NGA", 1995], ["USA", 2040], ["IND", 2050]] as const) {
      const e = econ(iso, 77, year);
      const ratio = indexLevel(iso, 77, tOf(year, 12)) / indexLevel(iso, 77, tOf(year, 1) - 1);
      expect(ratio).toBeCloseTo((1 + e.eq) / (1 + dividendYield(iso, year)), 6);
    }
  });

  it("are part of the world: the same for everyone with the same history", () => {
    const a = companies("USA", 42).map((c) => c.name);
    const b = companies("USA", 42).map((c) => c.name);
    expect(a).toEqual(b);
    const c = companies("USA", 42)[3];
    expect(companyPrice(c, 42, c.listT + 5)).toBe(companyPrice(c, 42, c.listT + 5));
    expect(indexLevel("USA", 1, tOf(2045, 6))).not.toBe(indexLevel("USA", 2, tOf(2045, 6)));
  });
});

describe("trading desk", () => {
  it("opens to nearly every young Australian, with the S&P 500 from 1975", () => {
    let unbanked = 0;
    for (let seed = 1; seed <= 200; seed++) if (!newGame({ mode: "timetravel", seed, country: "AUS", year: 2005, startAge: 18, background: "poor" }).access.bank) unbanked++;
    expect(unbanked).toBeLessThan(10); // about 1% of Australians had no account; a poor family's child is likelier to be one of them
    const banked = (year: number) => {
      for (let seed = 1; ; seed++) {
        const s = newGame({ mode: "timetravel", seed, country: "AUS", year, startAge: 18, background: "middle" });
        if (s.access.bank) return s;
      }
    };
    expect(tradable(banked(1974)).map((i) => i.id)).not.toContain("spx");
    expect(tradable(banked(1975)).map((i) => i.id)).toContain("spx");
    expect(deskAccess(banked(2005)).ok).toBe(true);
  });

  it("moves money in and out without creating or losing any", () => {
    const s = trader();
    expect(deskAccess(s).ok).toBe(true);
    const before = netWorth(s);
    const moved = deposit(s, 10_000);
    expect(moved).toBeGreaterThan(0);
    expect(netWorth(s)).toBeCloseTo(before, 6);
    withdraw(s, moved);
    expect(netWorth(s)).toBeCloseTo(before, 6);
    expect(s.desk!.cash).toBeCloseTo(0, 9);
  });

  it("charges fees on trades and never lends", () => {
    const s = trader();
    deposit(s, 5_000);
    const cash = s.desk!.cash;
    const before = netWorth(s);
    expect(buy(s, "idx:USA", cash * 10)).toBe(true); // asks for more than it has
    expect(s.desk!.cash).toBeGreaterThanOrEqual(0);
    const afterBuy = netWorth(s);
    expect(afterBuy).toBeLessThan(before); // commission and spread
    expect(afterBuy).toBeGreaterThan(before - cash * 0.01);
    expect(sell(s, "idx:USA", s.desk!.pos["idx:USA"].units)).toBe(true);
    expect(s.desk!.pos["idx:USA"]).toBeUndefined();
    expect(netWorth(s)).toBeLessThan(afterBuy);
  });

  it("plays the rest of the year by itself and counts the account in net worth", () => {
    const a = trader(31);
    const b = trader(31);
    for (const s of [a, b]) {
      deposit(s, 8_000);
      buy(s, "idx:USA", s.desk!.cash / 2);
    }
    for (let m = 0; m < 12; m++) stepMonth(a); // played month by month
    finishDeskYear(a); // only the year-end tax is left
    finishDeskYear(b); // left alone
    expect(deskValue(b)).toBeCloseTo(deskValue(a), 6);
    const v = deskValue(a);
    expect(v).toBeGreaterThan(0);
    // the crash year: the index fund half lost value
    expect(v).toBeLessThan(8_000);
    advance(b);
    expect(b.history[b.history.length - 1].netWorth).toBeCloseTo(netWorth(b), 6);
  });

  it("wipes out holders of a company that goes bust", () => {
    const s = trader(55);
    const bust = companies("USA", s.macroSeed).find((c) => c.fate === "bust" && c.listT <= tOf(2007, 12) && c.endT > tOf(2008, 1) && c.endT <= tOf(2030, 12));
    expect(bust).toBeTruthy();
    deposit(s, 3_000);
    while (s.year < Math.floor(bust!.endT / 12) + 1940 && s.alive) {
      if (tradable(s).some((i) => i.id === bust!.id) && !s.desk!.pos[bust!.id] && s.desk!.cash > 0) buy(s, bust!.id, s.desk!.cash);
      s.pending = [];
      advance(s);
    }
    if (!s.alive) return;
    finishDeskYear(s);
    expect(s.desk!.pos[bust!.id]).toBeUndefined();
    expect(s.desk!.trades.some((t) => t.text.includes("goes bust"))).toBe(true);
  });

  it("is never opened by default-you", () => {
    for (let seed = 1; seed <= 25; seed++) {
      const s = runLife(newGame({ mode: "random", seed: seed * 101 }), typical);
      expect(s.desk).toBeNull();
    }
  });
});

describe("money across eras", () => {
  it("keeps Soviet-era wages below American ones in today's dollars", () => {
    const today = (iso: string, year: number) => intlToUsd(1, toIntl2021(iso, 1, year, econ(iso, 1, year).wage));
    for (const iso of ["RUS", "UKR", "KAZ"]) expect(today(iso, 1966)).toBeLessThan(today("USA", 1966));
    // and close to the level when the records begin
    expect(today("RUS", 1985) / today("RUS", 1990)).toBeGreaterThan(0.7);
    expect(today("RUS", 1985) / today("RUS", 1990)).toBeLessThan(1.4);
  });

  it("shows today's dollars where the local unit has been redenominated away", () => {
    const s = newGame({ mode: "random", seed: 5, country: "BRA", birthYear: 1966 });
    expect(fmt(s, liquid(s) + 1e-9)).toMatch(/^≈\$/);
    const u = newGame({ mode: "random", seed: 5, country: "USA", birthYear: 1966 });
    expect(fmt(u, 1234)).toBe("$1.2K");
  });
});
