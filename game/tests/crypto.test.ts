import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import {
  buy, cryptoFee, deposit, deskAccess, ensureDesk, quote, quoteBuy, sell, setCustody, spreadOf, stepMonth, tradable, WALLET_FEE,
} from "../src/engine/desk";
import { syncAllocation } from "../src/engine/events";
import { W } from "../src/engine/ops";
import { econ } from "../src/engine/macro";
import { coinUsd, setMarkets, tOf, type MarketsData } from "../src/engine/markets";
import { newGame, runLife, typical } from "../src/engine/policy";
import { stream } from "../src/engine/rng";
import type { LifeState } from "../src/engine/types";
import { setWorld, type WorldData } from "../src/engine/world";

beforeAll(() => {
  setWorld(JSON.parse(readFileSync(new URL("../public/data/world.json", import.meta.url), "utf8")) as WorldData);
  setMarkets(JSON.parse(readFileSync(new URL("../public/data/markets.json", import.meta.url), "utf8")) as MarketsData);
});

const reload = (s: LifeState) => JSON.parse(JSON.stringify(s)) as LifeState;

/** An adult in `iso` at the start of `year` with money in a trading account. */
function trader(seed: number, iso = "USA", year = 2014): LifeState {
  const s = newGame({ mode: "random", seed, country: iso, birthYear: year - 34 });
  runLife(s, typical, (t) => t.year >= year);
  s.pending = [];
  s.access.bank = true;
  ensureDesk(s);
  s.holdings.cash += 100000;
  deposit(s, 50000);
  return s;
}

/** Seeds whose coins were, or weren't, on Mt. Gox. */
const seeds = Array.from({ length: 40 }, (_, i) => i + 1);
const onGox = (seed: number) => stream(seed, "exchange", "Mt. Gox").next() < 0.6;

describe("coin prices", () => {
  it("replay recorded monthly averages, from each coin's first month of exchange data", () => {
    expect(coinUsd("BTC", 1, tOf(2017, 12))).toBeCloseTo(14846, -1);
    expect(coinUsd("ETH", 1, tOf(2015, 7))).toBeNull();
    expect(coinUsd("ETH", 1, tOf(2015, 8))).toBeCloseTo(1.215, 2);
    expect(coinUsd("LUNA", 1, tOf(2022, 4))!).toBeGreaterThan(50);
    expect(coinUsd("LUNA", 1, tOf(2022, 6))!).toBeLessThan(0.001);
  });

  it("end each simulated year at the Bitcoin price the rest of the life uses", () => {
    for (const y of [2030, 2045]) expect(coinUsd("BTC", 9, tOf(y, 12))).toBeCloseTo(econ("USA", 9, y).btc!, 6);
  });
});

describe("crypto on the desk", () => {
  it("lists coins as they appear, fills at the spread and fee of the era, and charges no fund fee", () => {
    const s = trader(11, "USA", 2015);
    expect(tradable(s).some((i) => i.id === "cc:ETH")).toBe(false);
    for (let m = 0; m < 8; m++) stepMonth(s);
    expect(tradable(s).some((i) => i.id === "cc:ETH")).toBe(true);
    const px = quote(s, "cc:BTC")!;
    expect(buy(s, "cc:BTC", 10000)).toBe(true);
    const units = s.desk!.pos["cc:BTC"].units;
    expect(units).toBeCloseTo((10000 * (1 - cryptoFee(2015))) / (px * (1 + spreadOf("cc:BTC", 2015) / 2)), 9);
    expect(spreadOf("cc:BTC", 2012)).toBeGreaterThan(spreadOf("cc:BTC", 2020));
    for (let m = 0; m < 4; m++) stepMonth(s);
    expect(s.desk!.pos["cc:BTC"].units).toBe(units);
  });

  it("follows national bans: person to person at a worse price, then selling only", () => {
    const open = trader(12, "CHN", 2016);
    expect(deskAccess(open).crypto).toBe(true);
    expect(deskAccess(open).cryptoNote).toBeUndefined();

    const s = trader(12, "CHN", 2019);
    expect(deskAccess(s).crypto).toBe(true);
    expect(deskAccess(s).cryptoNote).toMatch(/person to person/);
    const q = quoteBuy(s, "cc:BTC", 1000)!;
    expect(q.price / quote(s, "cc:BTC")!).toBeCloseTo(1 + (spreadOf("cc:BTC", 2019) + 0.04) / 2, 9);
    expect(buy(s, "cc:BTC", 1000)).toBe(true);

    // September 2021 closes the door: no more buying, but coins already held can still be sold
    runLife(s, typical, (t) => t.year >= 2022);
    s.access.bank = true;
    expect(s.country).toBe("CHN");
    expect(deskAccess(s).crypto).toBe(false);
    expect(deskAccess(s).cryptoNote).toMatch(/banned/);
    expect(buy(s, "cc:BTC", 100)).toBe(false);
    expect(sell(s, "cc:BTC", s.desk!.pos["cc:BTC"].units)).toBe(true);
    expect(s.desk!.pos["cc:BTC"]).toBeUndefined();
  });

  it("loses coins left on a failed exchange and repays a share years later, the same for every replay", () => {
    const s = trader(seeds.find(onGox)!);
    buy(s, "cc:BTC", 20000);
    const units = s.desk!.pos["cc:BTC"].units;
    stepMonth(s); // January
    expect(stepMonth(s).some((e) => e.includes("Mt. Gox"))).toBe(true); // February
    expect(s.desk!.pos["cc:BTC"]).toBeUndefined();
    expect(s.desk!.claims).toHaveLength(1);

    const b = reload(s);
    for (const x of [s, b]) runLife(x, typical, (t) => t.year >= 2025);
    expect(JSON.stringify(b)).toBe(JSON.stringify(s));
    expect(s.desk!.claims).toHaveLength(0);
    expect(s.desk!.pos["cc:BTC"].units).toBeCloseTo(units * 0.2, 9);
    expect(s.desk!.trades.some((t) => t.text.includes("trustee"))).toBe(true);
  });

  it("spares coins on another exchange, and coins in your own wallet", () => {
    const lucky = trader(seeds.find((k) => !onGox(k))!);
    buy(lucky, "cc:BTC", 20000);
    const held = lucky.desk!.pos["cc:BTC"].units;
    stepMonth(lucky);
    stepMonth(lucky);
    expect(lucky.desk!.pos["cc:BTC"].units).toBe(held);

    const s = trader(seeds.find(onGox)!);
    buy(s, "cc:BTC", 20000);
    const before = s.desk!.pos["cc:BTC"].units;
    expect(setCustody(s, "cc:BTC", "wallet")).toBe(true);
    expect(s.desk!.pos["cc:BTC"].units).toBeCloseTo(before * (1 - WALLET_FEE), 9);
    stepMonth(s);
    stepMonth(s);
    expect(s.desk!.pos["cc:BTC"].units).toBeCloseTo(before * (1 - WALLET_FEE), 9);
    // selling sends them back to the exchange first, for the same network fee
    expect(sell(s, "cc:BTC", 1e9)).toBe(true);
    expect(s.desk!.pos["cc:BTC"]).toBeUndefined();
  });

  it("can lose the keys to a wallet", () => {
    const t = tOf(2014, 3);
    const seed = Array.from({ length: 20000 }, (_, i) => i + 1).find((k) => stream(k, "keys", t).next() < 0.001)!;
    const s = trader(seed);
    buy(s, "cc:BTC", 5000);
    setCustody(s, "cc:BTC", "wallet");
    stepMonth(s);
    stepMonth(s);
    expect(stepMonth(s).some((e) => e.includes("keys"))).toBe(true);
    expect(s.desk!.pos["cc:BTC"]).toBeUndefined();
  });
});

describe("crypto in savings", () => {
  it("stays out of reach where it's banned", () => {
    const s = newGame({ mode: "random", seed: 4, country: "BOL", birthYear: 1980 });
    runLife(s, typical, (t) => t.year >= 2016);
    expect(s.access.crypto).toBe(false);
  });

  it("fails with the same exchange as the trading account, and is repaid too", () => {
    let checked = 0;
    for (const seed of seeds.slice(0, 12)) {
      const s = newGame({ mode: "random", seed, country: "USA", birthYear: 1975 });
      runLife(s, typical, (t) => t.year >= 2013);
      if (s.country !== "USA" || !s.alive) continue;
      s.holdings.crypto += 5 * W(s); // enough that a year's bills don't eat it
      s.cryptoCustody = "exchange";
      syncAllocation(s);
      runLife(s, typical, (t) => t.year >= 2025);
      if (s.country !== "USA" || !s.alive) continue;
      const lost = s.log.some((l) => l.year === 2014 && l.text.startsWith("Mt. Gox collapses"));
      expect(lost).toBe(onGox(seed));
      if (lost) expect(s.log.some((l) => l.year === 2024 && l.text.includes("trustee"))).toBe(true);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });
});
