import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { enqueue } from "../src/engine/events";
import { advance, choose, resolveYear } from "../src/engine/life";
import { econ } from "../src/engine/macro";
import { careCost, netWorth } from "../src/engine/ops";
import { newGame, runLife, typical } from "../src/engine/policy";
import type { LifeState } from "../src/engine/types";
import { setWorld, type WorldData } from "../src/engine/world";

beforeAll(() => {
  setWorld(JSON.parse(readFileSync(new URL("../public/data/world.json", import.meta.url), "utf8")) as WorldData);
});

const clone = (s: LifeState) => JSON.parse(JSON.stringify(s)) as LifeState;

/** An American at 50 whose mother, 78, is still alive. */
function middleAged(seed = 31): LifeState {
  const s = newGame({ mode: "random", seed, country: "USA", birthYear: 1960 });
  s.flags.immortalUntil = 90;
  runLife(s, typical, (t) => t.age >= 50);
  s.pending = [];
  s.parents.alive = [true, false];
  s.parents.ageAtBirth = [28, 30];
  s.holdings.cash += 10 * careCost(s);
  return s;
}

/** Put the care decision in front of the player and answer it. */
function decideCare(s: LifeState, option: string): void {
  enqueue(s, "parent_care");
  const d = s.pending.find((x) => x.event === "parent_care")!;
  expect(d.options.map((o) => o.id)).toContain(option);
  choose(s, d.id, option);
  s.pending = [];
}

describe("a parent who needs care", () => {
  it("is paid for from their savings first, then by the state, you and your siblings", () => {
    const s = middleAged();
    s.siblings = 1;
    s.parents.wealthMult = 0.5;
    decideCare(s, "home");
    const before = s.parents.wealthMult;
    advance(s);
    expect(s.parents.alive[0]).toBe(true);
    expect(s.parents.wealthMult).toBeLessThan(before);
    expect(s.parents.wealthMult).toBeCloseTo(0, 9); // half a wage of savings goes in the first year
    // the state pays 80% of the rest, and the sibling half of what's left: (1.2 wages - 0.5) x 0.2 / 2
    expect(-(s.yr.moves?.["ev:Your mother's care"] ?? 0)).toBeCloseTo(((0.7 * 0.2) / 2) * (careCost(s) / 1.2), 0);
  });

  it("costs a quarter of a care home, and some pay, if they move in with you", () => {
    const s = middleAged();
    s.job!.mult = 6;
    s.parents.wealthMult = 0;
    const home = clone(s);
    const together = clone(s);
    decideCare(home, "home");
    decideCare(together, "together");
    advance(home);
    advance(together);
    const bill = (x: LifeState) => -(x.yr.moves?.["ev:Your mother's care"] ?? 0);
    expect(bill(home)).toBeGreaterThan(0);
    expect(bill(together) / bill(home)).toBeCloseTo(0.25, 9);
    const a = clone(s);
    const b = clone(s);
    decideCare(a, "together");
    const pay = a.job!.mult * (careCost(a) / 1.2);
    resolveYear(a);
    resolveYear(b);
    const income = (x: LifeState) => x.history[x.history.length - 1].income;
    expect(income(b) - income(a)).toBeCloseTo(0.15 * pay, 0);
  });

  it("costs you pay if you look after them yourself", () => {
    const s = middleAged();
    expect(s.job).not.toBeNull();
    s.job!.mult = 6; // well clear of the welfare top-up, even with pay cut
    const a = clone(s);
    const b = clone(s);
    decideCare(a, "self");
    const pay = a.job!.mult * (careCost(a) / 1.2);
    resolveYear(a);
    resolveYear(b);
    const income = (x: LifeState) => x.history[x.history.length - 1].income;
    expect(income(b) - income(a)).toBeCloseTo(0.4 * pay, 0);
  });

  it("leaves you a smaller share of the estate if your siblings did the caring", () => {
    // what she leaves, in wages of the year she dies
    const inheritance = (left: boolean) => {
      const s = middleAged();
      s.siblings = 1;
      s.parents.wealthMult = 10;
      s.parents.ageAtBirth = [45, 30];
      decideCare(s, left ? "siblings" : "self"); // neither touches her savings
      runLife(s, typical, (x) => !x.parents.alive[0]); // stops in the year she dies, before it's written up
      return (s.yr.moves?.inherit ?? 0) / econ("USA", s.macroSeed, s.year).wage;
    };
    expect(inheritance(false)).toBeCloseTo(10 / 2, 6);
    expect(inheritance(true)).toBeCloseTo(10 / 2 / 2, 6);
  });
});

describe("a grown child buying a home", () => {
  it("can be given a deposit, filed under their name", () => {
    const s = middleAged();
    s.kids = [{ name: "Ana", born: s.year - 30, sex: "F" }];
    enqueue(s, "kid_deposit");
    const d = s.pending.find((x) => x.event === "kid_deposit")!;
    const nw = netWorth(s);
    choose(s, d.id, "all");
    expect(netWorth(s)).toBeLessThan(nw);
    expect(s.yr.moves?.["ev:A deposit for Ana"]).toBeCloseTo(netWorth(s) - nw, 6);
    s.pending = [];
    enqueue(s, "kid_deposit");
    expect(s.pending.some((x) => x.event === "kid_deposit")).toBe(false); // asked once
  });
});
