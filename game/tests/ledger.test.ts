import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { CHOICE_KEYS } from "../src/engine/content/choices";
import { EVENT_MAP } from "../src/engine/events";
import { advance, choose } from "../src/engine/life";
import { W } from "../src/engine/ops";
import { newGame, runLife, typical } from "../src/engine/policy";
import { yearLine } from "../src/engine/story";
import type { LifeState, YearRecord } from "../src/engine/types";
import { setWorld, type WorldData } from "../src/engine/world";

beforeAll(() => {
  setWorld(JSON.parse(readFileSync(new URL("../public/data/world.json", import.meta.url), "utf8")) as WorldData);
});

const lives = (n: number, first = 1) =>
  Array.from({ length: n }, (_, i) => {
    const s = newGame({ mode: "random", seed: first + i * 13, yearDraw: "births" });
    runLife(s, typical);
    return s;
  });

/** A year's record with just the parts the line reads. */
function rec(s: LifeState, over: Partial<YearRecord>): YearRecord {
  return { year: s.year, age: s.age, netWorth: 0, realNW: 0, income: 0, spending: 0, saved: 0, invested: 0, liquid: 0, property: 0, business: 0, debt: 0, health: 70, happiness: 60, country: s.country, moves: {}, ...over };
}

describe("the ledger", () => {
  it("writes up every choice it has a line for, for events that exist", () => {
    for (const key of CHOICE_KEYS) expect(EVENT_MAP[key.split(":")[0]], key).toBeDefined();
  });

  it("records most decisions, leaving out only plain refusals", () => {
    let decisions = 0;
    let silent = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const s = newGame({ mode: "random", seed: 500 + seed * 7, yearDraw: "births" });
      for (let guard = 0; guard < 5000 && s.alive; guard++) {
        if (!s.pending.length) {
          advance(s);
          continue;
        }
        const d = s.pending[0];
        const before = s.log.length;
        choose(s, d.id, typical(s, d));
        decisions++;
        if (s.log.length === before) silent++;
      }
    }
    expect(silent / decisions).toBeLessThan(0.2); // more than half went unrecorded before
  });

  it("has something about your own life in nearly every adult year", () => {
    let years = 0;
    let told = 0;
    for (const s of lives(30)) {
      for (const h of s.history) {
        if (h.age < 18) continue;
        years++;
        if (s.log.some((l) => l.year === h.year && l.tone !== "history")) told++;
      }
    }
    expect(told / years).toBeGreaterThan(0.9);
  });

  it("doesn't repeat an industry's boom or bust every year", () => {
    const kind = (text: string) => text.replace(/\d+%/g, "");
    for (const s of lives(30, 7)) {
      const notes = s.log.filter((l) => /is booming here|here fell/.test(l.text));
      for (let i = 1; i < notes.length; i++)
        if (notes[i].year - notes[i - 1].year === 1) expect(kind(notes[i].text), notes[i].text).not.toBe(kind(notes[i - 1].text));
    }
  });

  it("tells a crash, a milestone and a loss that prices hid", () => {
    const s = newGame({ mode: "random", seed: 3, country: "USA", birthYear: 1970 });
    runLife(s, typical, (t) => t.age >= 38);
    const w = W(s);
    const before = rec(s, { netWorth: 2 * w, liquid: 2 * w });
    const crash = yearLine(s, rec(s, { income: w, saved: 0.1 * w, netWorth: 1.4 * w, liquid: 1.3 * w, moves: { pay: 0.1 * w, globalEq: -0.7 * w } }), before, w, w, 0.02);
    expect(crash?.[0]).toMatch(/^(You earn|Your household earns) .+ Markets crash: your investments lose .+, more than you saved\.$/);
    expect(crash?.[1]).toBe("bad");
    const coin = yearLine(s, rec(s, { income: w, saved: 0.2 * w, netWorth: 2.6 * w, moves: { pay: 0.2 * w, home: 0.4 * w } }), before, w, w, 0.02);
    expect(coin?.[0]).toMatch(/your coin turns gold\.$/);
    const eaten = yearLine(s, rec(s, { income: w, saved: 0.02 * w, netWorth: 2.02 * w, moves: { pay: 0.02 * w } }), before, w, w, 0.06);
    expect(eaten?.[0]).toMatch(/But prices rose 6\.0%, so you're .+ worse off than a year ago\.$/);
  });
});
