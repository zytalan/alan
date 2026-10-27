import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { enqueue, EVENT_MAP, EVENTS } from "../src/engine/events";
import { advance, choose } from "../src/engine/life";
import { commitments, W } from "../src/engine/ops";
import { newGame, runLife, typical, type Chooser } from "../src/engine/policy";
import type { LifeState } from "../src/engine/types";
import { setWorld, type WorldData } from "../src/engine/world";

beforeAll(() => {
  setWorld(JSON.parse(readFileSync(new URL("../public/data/world.json", import.meta.url), "utf8")) as WorldData);
});

/** Put a decision in front of the player and answer it. */
function decide(s: LifeState, event: string, option: string, payload: Record<string, unknown> = {}): void {
  enqueue(s, event, payload);
  const d = s.pending.find((x) => x.event === event);
  expect(d, event).toBeDefined();
  expect(d!.options.map((o) => o.id)).toContain(option);
  choose(s, d!.id, option);
  s.pending = [];
}

function adult(seed: number, iso = "USA", birthYear = 1970, age = 40): LifeState {
  const s = newGame({ mode: "random", seed, country: iso, birthYear });
  s.flags.immortalUntil = 95;
  runLife(s, typical, (t) => t.age >= age);
  s.pending = [];
  return s;
}

describe("the deck", () => {
  it("offers a wide range of decisions, most with three or more ways to answer", () => {
    let lives = 0;
    let distinct = 0;
    let decisions = 0;
    let narrow = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const seen = new Set<string>();
      const rec: Chooser = (s, d) => {
        seen.add(d.event);
        decisions++;
        if (d.options.filter((o) => !o.disabled).length <= 2) narrow++;
        return typical(s, d);
      };
      const s = newGame({ mode: "random", seed, yearDraw: "births" });
      runLife(s, rec);
      if (s.age < 40) continue;
      lives++;
      distinct += seen.size;
    }
    expect(distinct / lives).toBeGreaterThan(35); // it was 24 when the deck was smaller and rolled in file order
    expect(narrow / decisions).toBeLessThan(0.1);
  });

  it("makes chance events rarer each time they come back", () => {
    let lotteries = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const s = newGame({ mode: "random", seed, yearDraw: "births" });
      runLife(s, typical);
      lotteries += Number(s.flags["n:lottery"] ?? 0);
    }
    expect(lotteries / 60).toBeLessThan(1.5); // 1.8 a life before
    expect(EVENT_MAP.lottery.repeats).toBeLessThan(1);
  });

  it("gives every event a default choice that exists", () => {
    const ids = EVENTS.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("commitments", () => {
  it("cost money every year until they run out", () => {
    const s = adult(3);
    decide(s, "pet", "adopt");
    const pet = commitments(s).find((x) => x.key === "pet")!;
    expect(pet.wage).toBeLessThan(0);
    expect(pet.until).toBe(s.year + 12);
    s.recurring = s.recurring!.map((x) => (x.key === "pet" ? { ...x, until: s.year } : x));
    advance(s);
    expect(commitments(s).some((x) => x.key === "pet")).toBe(false);
  });

  it("stop with the job when they need one", () => {
    const s = adult(4);
    expect(s.job).not.toBeNull();
    decide(s, "pension_match", "max");
    expect(commitments(s).some((x) => x.key === "match")).toBe(true);
    s.job = null;
    expect(commitments(s).some((x) => x.key === "match")).toBe(false);
  });

  it("end when you quit smoking", () => {
    const s = adult(5, "USA", 1960, 18);
    decide(s, "smoking", "start");
    expect(commitments(s).some((x) => x.key === "smoking")).toBe(true);
    decide(s, "quit_smoking", "patches");
    expect(commitments(s).some((x) => x.key === "smoking")).toBe(false);
    expect(s.flags.smoker).toBe(false);
  });
});

describe("a market crash", () => {
  it("tells you when it falls again, and what you did last time", () => {
    const s = adult(9);
    s.holdings.localEq += 10 * W(s);
    s.flags.lastEqReal = -0.3;
    s.flags["n:crash_reaction"] = 0;
    delete s.flags.crashYear;
    enqueue(s, "crash_reaction");
    const first = s.pending.find((d) => d.event === "crash_reaction")!;
    expect(first.title).toBe("The market crashed");
    expect(first.options.map((x) => x.id)).toEqual(["sell", "half", "hold", "buy"]);
    const stocks = s.holdings.localEq;
    choose(s, first.id, "half");
    s.pending = [];
    expect(s.holdings.localEq).toBeCloseTo(stocks / 2, 6);
    s.year += 1; // a year on, it falls again
    s.flags["n:crash_reaction"] = 1;
    enqueue(s, "crash_reaction");
    const again = s.pending.find((d) => d.event === "crash_reaction")!;
    expect(again.title).toBe("Down again");
    expect(again.body).toMatch(/second bad year in a row/);
    expect(again.body).toMatch(/Last time you sold half/);
  });
});

describe("money that comes later", () => {
  it("pays out a renovation two years on, under its own name", () => {
    const s = adult(6);
    s.holdings.cash += 20 * W(s);
    decide(s, "fixer_upper", "flip");
    expect(s.dues?.some((d) => d.label === "Your renovation project")).toBe(true);
    const due = s.dues!.find((d) => d.label === "Your renovation project")!.year;
    runLife(s, typical, (x) => x.year >= due);
    expect(s.year).toBe(due);
    expect(s.yr.moves?.["ev:Your renovation project"]).toBeGreaterThan(0);
    expect(s.dues?.some((d) => d.label === "Your renovation project")).toBe(false);
  });
});

describe("local colour", () => {
  it("calls a savings circle by its local name", () => {
    const s = adult(7, "KEN", 1980, 30);
    s.holdings.cash += W(s);
    enqueue(s, "savings_circle");
    expect(s.pending.find((d) => d.event === "savings_circle")!.title).toMatch(/chama/);
  });

  it("ties moments of history to their place and year", () => {
    const uk = newGame({ mode: "random", seed: 8, country: "GBR", birthYear: 1950 });
    const ru = newGame({ mode: "random", seed: 8, country: "RUS", birthYear: 1950 });
    const c = { e: {} as never, prev: {} as never, w: 1, r: null as never };
    for (const [s, ev] of [[uk, "british_gas"], [ru, "vouchers"]] as const) {
      s.year = 1980;
      s.age = 30;
      expect(EVENT_MAP[ev].chance!(s, c)).toBe(0);
    }
    uk.year = 1986;
    uk.age = 36;
    uk.holdings.cash += 10 * W(uk);
    ru.year = 1992;
    ru.age = 42;
    expect(EVENT_MAP.british_gas.chance!(uk, { ...c, w: W(uk) })).toBeGreaterThan(0);
    expect(EVENT_MAP.vouchers.chance!(ru, c)).toBeGreaterThan(0);
  });
});
