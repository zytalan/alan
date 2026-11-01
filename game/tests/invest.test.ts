import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import {
  bondPrice, bondYield, businessesForSale, buyBond, buyBusiness, buyListing, buyPropertyOf, joinDeal, listings, partnerDeal, privateFund,
  propertyQuote, sellBond, standsEmpty, startupDeal, upgradeLife,
} from "../src/engine/invest";
import { advance, buyWithSavings, sellHome } from "../src/engine/life";
import { econ } from "../src/engine/macro";
import { availableAssets, liquid, netWorth, refreshAccess, W } from "../src/engine/ops";
import { newGame, runLife, typical } from "../src/engine/policy";
import { stream } from "../src/engine/rng";
import type { LifeState } from "../src/engine/types";
import { setWorld, type WorldData } from "../src/engine/world";

beforeAll(() => {
  setWorld(JSON.parse(readFileSync(new URL("../public/data/world.json", import.meta.url), "utf8")) as WorldData);
});

/** A grown-up with money to invest, in a given country and year. */
function investor(iso: string, year: number, wages = 20, seed = 5): LifeState {
  const s = newGame({ mode: "timetravel", seed, country: iso, year, startAge: 40 });
  // banked, like most adults where these markets are
  s.flags.bankU = 0;
  refreshAccess(s, stream(seed, "access"));
  s.holdings.cash += wages * W(s) + s.cashHome;
  s.cashHome = 0;
  s.stats.network = 70;
  s.pending = [];
  return s;
}

/** Live a year with no decisions taken. */
function year(s: LifeState): void {
  s.pending = [];
  advance(s);
  s.pending = [];
}

describe("more ways to invest", () => {
  it("offers each fund only where it existed", () => {
    expect(availableAssets(investor("GBR", 1990))).toContain("linkers"); // gilts linked to prices since 1981
    expect(availableAssets(investor("GBR", 1975))).not.toContain("linkers");
    expect(availableAssets(investor("USA", 2005))).not.toContain("ust"); // Americans' own bonds are just bonds
    expect(availableAssets(investor("DEU", 2005))).toContain("ust");
    expect(availableAssets(investor("USA", 2005))).toEqual(expect.arrayContaining(["corp", "reit"]));
  });

  it("spends cash first, then sells other savings, without making or losing money beyond the fee", () => {
    const s = investor("DEU", 2005);
    s.holdings.globalEq = s.holdings.cash;
    s.holdings.cash = 0;
    const before = liquid(s);
    const got = buyWithSavings(s, "corp", 5 * W(s));
    expect(got).toBeCloseTo(5 * W(s), 6);
    expect(s.holdings.corp).toBeCloseTo(got * 0.998, 6);
    expect(liquid(s)).toBeCloseTo(before - got * 0.002, 6);
  });

  it("pays a fixed-rate bond's coupons every year and its face value at the end", () => {
    const s = investor("USA", 1981);
    const rate = bondYield(s, 2);
    expect(rate).toBeGreaterThan(0.12); // the high rates of 1981
    expect(buyBond(s, 2, 10 * W(s))).toBe(true);
    const lot = s.bondLots![0];
    expect(lot.matures).toBe(1982);
    year(s);
    expect(s.bondLots).toHaveLength(1);
    year(s);
    expect(s.bondLots).toHaveLength(0);
    expect(s.log.some((l) => /bond from 1981 is repaid/.test(l.text))).toBe(true);
  });

  it("prices a bond lower when rates rise and higher when they fall", () => {
    const par = bondPrice(100, 0.05, 8, 0.05);
    expect(par).toBeCloseTo(100, 6);
    expect(bondPrice(100, 0.05, 8, 0.08)).toBeLessThan(par);
    expect(bondPrice(100, 0.05, 8, 0.03)).toBeGreaterThan(par);
    const s = investor("USA", 2010);
    buyBond(s, 10, 5 * W(s));
    const id = s.bondLots![0].id;
    const value = s.bondLots![0].value;
    const back = sellBond(s, id);
    expect(back).toBeCloseTo(value * 0.995, 6);
    expect(s.bondLots).toHaveLength(0);
  });

  it("lists three companies a year that stay the same as you buy them, with dividends paid in cash", () => {
    const s = investor("USA", 1995);
    const first = listings(s).map((l) => l.stock.name);
    expect(first).toHaveLength(3);
    expect(buyListing(s, 1, 2 * W(s))).toBe(true);
    expect(listings(s).map((l) => l.stock.name)).toEqual(first);
    expect(buyListing(s, 1, W(s))).toBe(true);
    expect(s.stocks.filter((x) => x.name === first[1])).toHaveLength(1);
    const st = s.stocks.find((x) => x.name === first[1])!;
    expect(st.cost).toBeCloseTo(3 * W(s), 6);
    expect(st.payout).toBeGreaterThanOrEqual(0);
  });

  it("locks private equity for ten years and pays partners until they're bought out", () => {
    const s = investor("USA", 2000, 40);
    const pe = privateFund(s)!;
    expect(pe).not.toBeNull();
    expect(joinDeal(s, pe, pe.min)).toBe(true);
    const held = s.stocks.find((x) => x.kind === "pe")!;
    expect(held.illiquid).toBe(true);
    expect(held.exitYear).toBe(2010);
    expect(joinDeal(s, pe, pe.min)).toBe(false); // once a year
    // a partner's deal and a startup round turn up for someone this connected, in some years
    let partner = null;
    let startup = null;
    for (let y = 0; y < 6 && !(partner && startup); y++) {
      partner ??= partnerDeal(s);
      startup ??= startupDeal(s);
      if (!(partner && startup)) year(s);
    }
    expect(partner?.stock.kind).toBe("stake");
    expect(startup?.stock.kind).toBe("startup");
  });

  it("sells going businesses that you can run yourself or leave to a manager", () => {
    const s = investor("USA", 2000, 60);
    const [a] = businessesForSale(s);
    expect(a.price).toBeGreaterThan(a.profit);
    const job = s.job;
    expect(buyBusiness(s, a.id, true)).toBe(true);
    expect(s.business?.managed).toBe(true);
    expect(s.job).toBe(job); // a manager runs it; you keep your work
    expect(businessesForSale(s)).toHaveLength(0); // one business at a time
    const t = investor("USA", 2000, 60, 6);
    t.job ??= { occ: "teacher", title: "Teacher", mult: 1, years: 3, level: 0, formal: true };
    const [b] = businessesForSale(t);
    buyBusiness(t, b.id, b.type === "stall");
    if (b.type !== "stall") expect(t.job).toBeNull(); // running it is a full-time job
  });

  it("lets property of each kind, with shops empty in some slumps and a holiday home that costs upkeep", () => {
    const s = investor("USA", 2005, 60);
    for (const u of ["flat", "shop", "farm", "holiday"] as const) expect(propertyQuote(s, u).ok).toBe(true);
    expect(propertyQuote(s, "flat").price).toBeLessThan(propertyQuote(s, "shop").price);
    expect(propertyQuote(s, "shop").rent / propertyQuote(s, "shop").price).toBeGreaterThan(propertyQuote(s, "farm").rent / propertyQuote(s, "farm").price);
    expect(buyPropertyOf(s, "holiday")).toBe(true);
    const h = s.properties[s.properties.length - 1];
    expect(h.use).toBe("holiday");
    expect(s.recurring?.some((r) => r.key === `holiday${h.bought}`)).toBe(true);
    sellHome(s, h.id);
    expect(s.recurring?.some((r) => r.key === `holiday${h.bought}`)).toBe(false);
    // in a recession about a third of shop units stand empty
    const e = { ...econ("USA", s.macroSeed, 2009, 0), recession: true };
    const empty = Array.from({ length: 400 }, (_, i) => standsEmpty(s, `p${i}`, e)).filter(Boolean).length;
    expect(empty / 400).toBeGreaterThan(0.25);
    expect(empty / 400).toBeLessThan(0.45);
    expect(standsEmpty(s, "p1", { ...e, recession: false })).toBe(false);
  });

  it("brings a life saved before these options up to date", () => {
    const s = investor("USA", 2005);
    const old = JSON.parse(JSON.stringify(s)) as LifeState;
    for (const k of ["corp", "linkers", "ust", "reit"] as const) {
      delete (old.holdings as Partial<Record<string, number>>)[k];
      delete (old.allocation as Partial<Record<string, number>>)[k];
    }
    delete old.bondLots;
    upgradeLife(old);
    expect(Number.isFinite(netWorth(old))).toBe(true);
    expect(old.bondLots).toEqual([]);
    expect(() => runLife(old, typical, (t) => t.year > 2008)).not.toThrow();
  });
});
