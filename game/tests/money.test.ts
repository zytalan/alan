import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { buy, deposit, ensureDesk, stepMonth } from "../src/engine/desk";
import { advance, payRank } from "../src/engine/life";
import { setMarkets, type MarketsData } from "../src/engine/markets";
import { newGame, runLife, typical } from "../src/engine/policy";
import type { LifeState } from "../src/engine/types";
import { setWorld, type WorldData } from "../src/engine/world";

beforeAll(() => {
  setWorld(JSON.parse(readFileSync(new URL("../public/data/world.json", import.meta.url), "utf8")) as WorldData);
  setMarkets(JSON.parse(readFileSync(new URL("../public/data/markets.json", import.meta.url), "utf8")) as MarketsData);
});

/** What a browser keeps and reads back. */
const reload = (s: LifeState) => JSON.parse(JSON.stringify(s)) as LifeState;

describe("a saved life", () => {
  it("carries on exactly as if it had never stopped", () => {
    for (const seed of [3, 17, 42, 99, 123]) {
      const a = newGame({ mode: "random", seed });
      runLife(a, typical, (t) => t.age >= 20 + (seed % 30));
      const b = reload(a);
      runLife(a, typical);
      runLife(b, typical);
      expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    }
  });

  it("keeps a trading account mid-year, positions and all", () => {
    const a = newGame({ mode: "random", seed: 20, country: "USA", birthYear: 1974 });
    runLife(a, typical, (t) => t.year >= 2008);
    a.pending = [];
    ensureDesk(a);
    deposit(a, a.holdings.cash * 0.5);
    buy(a, "idx:USA", a.desk!.cash * 0.8);
    stepMonth(a);
    stepMonth(a);
    const b = reload(a);
    for (const s of [a, b]) {
      advance(s);
      runLife(s, typical, (t) => t.year >= 2012);
    }
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });
});

describe("what moved your money", () => {
  it("adds up to each year's change in net worth, with little left unexplained", () => {
    let gross = 0;
    let other = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const s = newGame({ mode: "random", seed });
      runLife(s, typical);
      for (let i = 1; i < s.history.length; i++) {
        const rec = s.history[i];
        const prev = s.history[i - 1];
        if (!rec.moves) {
          expect(rec.country).not.toBe(prev.country); // only a move abroad mixes currencies
          continue;
        }
        const sum = Object.values(rec.moves).reduce((a, x) => a + x, 0);
        const scale = Math.max(1, Math.abs(rec.netWorth), Math.abs(prev.netWorth));
        expect(Math.abs(sum - (rec.netWorth - prev.netWorth)) / scale).toBeLessThan(1e-9);
        // what you kept from income is pay left after tax and costs, less interest
        if (rec.saved !== 0) expect((rec.moves.pay ?? 0) + (rec.moves.interest ?? 0)).toBeCloseTo(rec.saved, 6);
        const w = Object.values(rec.moves).reduce((a, x) => a + Math.abs(x), 0);
        gross += w / scale;
        other += Math.abs(rec.moves.other ?? 0) / scale;
      }
    }
    expect(other / gross).toBeLessThan(0.01);
  });

  it("names the decisions that cost or brought money", () => {
    const named = new Set<string>();
    for (let seed = 1; seed <= 30; seed++) {
      const s = newGame({ mode: "random", seed });
      runLife(s, typical);
      for (const rec of s.history) for (const k of Object.keys(rec.moves ?? {})) if (k.startsWith("ev:")) named.add(k);
    }
    expect(named.size).toBeGreaterThan(5);
  });
});

describe("pay rank", () => {
  it("puts a typical wage in the middle at home and ranks the world in PPP", () => {
    expect(payRank("BRA", 2020, 1).country).toBeCloseTo(0.5, 6);
    expect(payRank("USA", 2020, 1).world).toBeGreaterThan(0.85);
    expect(payRank("IND", 2020, 1).world).toBeLessThan(0.5);
    const low = payRank("KEN", 2016, 0.5);
    const high = payRank("KEN", 2016, 3);
    expect(high.country).toBeGreaterThan(low.country);
    expect(high.world).toBeGreaterThan(low.world);
  });
});
