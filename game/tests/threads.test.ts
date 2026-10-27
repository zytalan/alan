import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { enqueue, EVENT_MAP } from "../src/engine/events";
import { advance, choose, resolveYear } from "../src/engine/life";
import { careCost, commitments, creditLimit, log, makeStock, netWorth, W } from "../src/engine/ops";
import { newGame, runLife, typical } from "../src/engine/policy";
import { stream } from "../src/engine/rng";
import type { Decision, LifeState, Property } from "../src/engine/types";
import { setWorld, type WorldData } from "../src/engine/world";

beforeAll(() => {
  setWorld(JSON.parse(readFileSync(new URL("../public/data/world.json", import.meta.url), "utf8")) as WorldData);
});

const clone = (s: LifeState) => JSON.parse(JSON.stringify(s)) as LifeState;
const ids = (d: Decision) => d.options.map((o) => o.id);

function adult(seed: number, iso = "USA", birthYear = 1970, age = 40): LifeState {
  const s = newGame({ mode: "random", seed, country: iso, birthYear });
  s.flags.immortalUntil = 95;
  runLife(s, typical, (t) => t.age >= age);
  s.pending = [];
  s.followUps = [];
  return s;
}

/** Put a decision in front of the player, without answering it. */
function ask(s: LifeState, event: string, payload: Record<string, unknown> = {}): Decision {
  enqueue(s, event, payload);
  const d = s.pending.find((x) => x.event === event);
  expect(d, event).toBeDefined();
  return d!;
}

/** Ask until a random draw in the build comes out the way the test needs. */
function askUntil(s: LifeState, event: string, ok: (d: Decision) => boolean, payload: Record<string, unknown> = {}): Decision {
  for (let i = 0; i < 40; i++) {
    const d = ask(s, event, payload);
    if (ok(d)) return d;
    s.pending = [];
    log(s, "(another draw)"); // the build's random stream depends on the log's length
  }
  throw new Error(`${event} never came out as needed`);
}

function answer(s: LifeState, d: Decision, option: string): void {
  expect(ids(d)).toContain(option);
  choose(s, d.id, option);
  s.pending = [];
}

function flat(s: LifeState, value: number, mortgage: number): Property {
  const p: Property = { id: `p-test-${s.properties.length}`, kind: "rental", value, price: value / 0.7, mortgage, rate: 0.05, payment: 0, bought: s.year - 2 };
  s.properties.push(p);
  return p;
}

describe("choices that come back", () => {
  it("return in the year they're due, in place of a chance event", () => {
    const s = adult(11);
    answer(s, ask(s, "pet"), "adopt");
    const due = s.followUps!.find((f) => f.event === "pet_sick")!;
    expect(due.year - s.year).toBeGreaterThanOrEqual(5);
    s.followUps = [{ ...due, year: s.year + 1 }];
    advance(s);
    expect(s.pending.some((d) => d.event === "pet_sick")).toBe(true);
    expect(s.followUps).toEqual([]);
    const chance = s.pending.filter((d) => {
      const def = EVENT_MAP[d.event];
      return def.chance && !def.forced && !def.core && !def.followUp;
    });
    expect(chance.length).toBeLessThanOrEqual(1);
  });

  it("don't come back once what they were about has gone", () => {
    const s = adult(11);
    s.recurring = [];
    enqueue(s, "pet_sick", { pet: "dog" });
    expect(s.pending.some((d) => d.event === "pet_sick")).toBe(false);
  });

  it("make a co-signer pay, one way or another", () => {
    const s = adult(12);
    const d = ask(s, "cosign_default", { amt: 0.8, what: "car loan" });
    expect(d.body).toMatch(/car loan you co-signed/);
    expect(ids(d)).toEqual(["pay", "spread", "rescue", "refuse"]);
    const debt = s.consumerDebt;
    answer(s, d, "refuse");
    expect(s.consumerDebt).toBeGreaterThan(debt);
    expect(creditLimit(s)).toBe(0);
  });

  it("turn a startup's big sale into a choice", () => {
    const s = adult(13);
    const st = makeStock(s, stream(1, "test"), true);
    Object.assign(st, { value: 5 * W(s), cost: W(s), exitYear: s.year + 1, hazard: 0, vol: 0.001, drift: 0, beta: 0 });
    s.stocks.push(st);
    advance(s);
    const d = s.pending.find((x) => x.event === "startup_exit")!;
    expect(d).toBeDefined();
    const value = s.stocks.find((x) => x.id === st.id)!.value;
    s.pending = [d];
    answer(s, d, "shares");
    expect(s.stocks.some((x) => x.id === st.id)).toBe(false);
    const paid = s.stocks.find((x) => !x.illiquid)!;
    expect(paid.value).toBeCloseTo(value * 1.2, 6);
  });

  it("let an underwater landlord hand back the keys only where the bank can't chase the rest", () => {
    const us = adult(14);
    const a = flat(us, 2 * W(us), 2.4 * W(us));
    const d = ask(us, "rental_trouble", { id: a.id, boom: true });
    expect(d.title).toBe("The boom is over");
    expect(d.options.find((o) => o.id === "keys")!.disabled).toBeUndefined();
    answer(us, d, "keys");
    expect(us.properties.some((x) => x.id === a.id)).toBe(false);
    expect(creditLimit(us)).toBe(0);

    const es = adult(15, "ESP");
    const b = flat(es, 2 * W(es), 2.4 * W(es));
    expect(ask(es, "rental_trouble", { id: b.id, boom: true }).options.find((o) => o.id === "keys")!.disabled).toMatch(/chase you/);
  });

  it("bring back a repair that was only patched", () => {
    const s = adult(16);
    const a = flat(s, 3 * W(s), 0);
    const d = ask(s, "rental_trouble", { id: a.id, again: "roof" });
    expect(d.title).toBe("The roof again");
    expect(ids(d)).toEqual(["fix", "patch", "sell"]);
  });

  it("let a side hustle become a business", () => {
    const s = adult(17, "USA", 1980, 35);
    s.stats.skill = 70;
    s.holdings.cash += 10 * W(s);
    const offer = ask(s, "side_hustle");
    const hustle = ids(offer).find((x) => x !== "no")!;
    answer(s, offer, hustle);
    expect(commitments(s).some((x) => x.key === "hustle")).toBe(true);
    const d = ask(s, "hustle_grows", { id: hustle });
    answer(s, d, "full");
    expect(s.business).not.toBeNull();
    expect(commitments(s).some((x) => x.key === "hustle")).toBe(false);
  });

  it("change a parent's care as they decline, and what it costs", () => {
    // an American at 50 whose mother, 78, has no savings left
    const mother = (): LifeState => {
      const s = newGame({ mode: "random", seed: 31, country: "USA", birthYear: 1960 });
      s.flags.immortalUntil = 90;
      runLife(s, typical, (t) => t.age >= 50);
      s.pending = [];
      s.parents.alive = [true, false];
      s.parents.ageAtBirth = [28, 30];
      s.parents.wealthMult = 0;
      s.holdings.cash += 10 * careCost(s);
      return s;
    };
    const bill = (s: LifeState) => -(s.yr.moves?.["ev:Your mother's care"] ?? 0);
    const home = mother();
    answer(home, ask(home, "parent_care"), "home");
    expect(home.followUps!.some((f) => f.event === "care_change")).toBe(true);
    home.followUps = [];

    const livein = mother();
    answer(livein, ask(livein, "parent_care"), "together");
    livein.followUps = [];
    const worse = ask(livein, "care_change", { i: 0, n: 1 });
    expect(worse.title).toBe("Your mother is getting worse");
    answer(livein, worse, "livein");

    const fees = mother();
    answer(fees, ask(fees, "parent_care"), "home");
    fees.followUps = [];
    const rise = ask(fees, "care_change", { i: 0, n: 1 });
    expect(rise.title).toBe("The care home raises its fees");
    answer(fees, rise, "payfee");

    for (const s of [home, livein, fees]) advance(s);
    expect(bill(home)).toBeGreaterThan(0);
    expect(bill(livein) / bill(home)).toBeCloseTo(0.6, 9);
    expect(bill(fees) / bill(home)).toBeCloseTo(1.2, 9);
  });

  it("let a child who drops out stop the fees", () => {
    const s = adult(18, "USA", 1960, 45);
    s.kids = [{ name: "Ana", born: s.year - 18, sex: "F" }];
    const d = ask(s, "kid_college");
    expect(ids(d)).toEqual(["pay", "half", "loans", "no"]);
    answer(s, d, "pay");
    expect(commitments(s).find((x) => x.key === "college:Ana")?.until).toBe(s.year + 3);
    answer(s, ask(s, "kid_dropout", { name: "Ana", opt: "pay" }), "cut");
    expect(commitments(s).some((x) => x.key === "college:Ana")).toBe(false);
  });

  it("make the people you brought into a Ponzi scheme turn on you", () => {
    const quiet = adult(19);
    quiet.stats.network = 60;
    quiet.flags.ponziAmt = W(quiet);
    quiet.flags.ponziEnd = quiet.year + 1;
    const loud = clone(quiet);
    answer(quiet, ask(quiet, "ponzi_more"), "stay");
    answer(loud, ask(loud, "ponzi_more"), "recruit");
    advance(quiet);
    advance(loud);
    expect(loud.stats.network).toBeLessThan(quiet.stats.network - 10);
  });

  it("pay a card off faster on a cheaper loan", () => {
    const a = adult(20);
    a.holdings.cash += 10 * W(a);
    a.consumerDebt = 2 * W(a);
    const b = clone(a);
    answer(b, ask(b, "card_debt"), "loan");
    resolveYear(a);
    resolveYear(b);
    expect(b.consumerDebt).toBeLessThan(a.consumerDebt * 0.85);
  });
});

describe("decisions that change when they come back", () => {
  it("move a career up a ladder, a different question at each rung", () => {
    const s = adult(21);
    s.job = { occ: "accountant", title: "Accountant", mult: 1.2, years: 5, level: 0, formal: true };
    s.stats.skill = 30;
    s.formalYears = 2;
    const rungs: [string[], string][] = [
      [["yes", "more", "no"], "yes"],
      [["yes", "flex", "train", "no"], "train"],
      [["apply", "back", "stay"], "stay"],
      [["run", "share", "mentor"], "mentor"],
    ];
    rungs.forEach(([options, pick], stage) => {
      s.flags["n:promotion"] = stage;
      const d = ask(s, "promotion");
      expect(ids(d)).toEqual(options);
      answer(s, d, pick);
    });
    expect(s.job.level).toBe(4); // mentoring the next one is as high as this job goes

    const lead = adult(22);
    lead.job = { occ: "accountant", title: "Accountant", mult: 1.2, years: 5, level: 0, formal: true };
    lead.stats.skill = 80;
    lead.formalYears = 10;
    expect(ids(ask(lead, "promotion"))).toEqual(["yes", "coach", "no"]);
  });

  it("bring back an illness that was skipped, worse", () => {
    const s = adult(23);
    s.flags.illName = "pneumonia";
    s.flags.illOpt = "skip";
    s.flags.illYear = s.year - 2;
    const d = askUntil(s, "illness", (x) => x.title === "It's back");
    expect(d.body).toMatch(/pneumonia you never had treated/);
    expect(ids(d)).toEqual(["best", "manage", "change", "skip"]);
  });

  it("treat an injury differently from a disease", () => {
    const s = adult(24, "USA", 1940, 70);
    delete s.flags.illName;
    const d = askUntil(s, "illness", (x) => ids(x).includes("rest"));
    expect(ids(d)).toEqual(["best", "rest", "skip"]);
  });

  it("offer different ways out after a second and third layoff", () => {
    const s = adult(25);
    s.job = { occ: "clerk", title: "Office clerk", mult: 1, years: 4, level: 0, formal: true };
    s.flags["n:layoff"] = 1;
    const second = ask(s, "layoff");
    expect(second.title).not.toBe("Laid off");
    expect(ids(second)).toContain("safe");
    expect(ids(second)).not.toContain("search");
    s.pending = [];
    s.flags["n:layoff"] = 2;
    expect(ids(ask(s, "layoff"))).toContain("move");
  });

  it("ask about space and childcare with a second baby", () => {
    const s = adult(26, "USA", 1980, 30);
    s.job = { occ: "clerk", title: "Office clerk", mult: 1, years: 4, level: 0, formal: true };
    s.partner = { name: "Sam", edu: "bachelor", mult: 1, working: true, since: s.year - 3 };
    s.kids = [{ name: "Ana", born: s.year - 2, sex: "F" }];
    s.recurring = [];
    const d = ask(s, "baby");
    expect(ids(d)).toEqual(["yes", "bigger", "later", "never"]);
    choose(s, d.id, "yes");
    expect(s.pending.some((x) => x.event === "childcare")).toBe(true);
  });

  it("measure a second child's university against the first's", () => {
    const s = adult(27, "USA", 1960, 50);
    s.kids = [
      { name: "Ana", born: s.year - 20, sex: "F" },
      { name: "Ben", born: s.year - 18, sex: "M" },
    ];
    s.flags["college:Ana"] = "pay";
    const d = ask(s, "kid_college");
    expect(d.body).toMatch(/When Ana went, you paid for all of it/);
    expect(ids(d)).toEqual(["pay", "half", "local", "loans", "gap", "no"]);
    answer(s, d, "loans");
    expect(s.log.some((l) => l.text === "Ben notices that Ana got more.")).toBe(true);
  });

  it("close the door on a second bankruptcy, and open one to selling the house", () => {
    const s = adult(28);
    s.consumerDebt = 5 * W(s);
    s.flags.debtLast = "bankrupt";
    s.flags.debtYear = s.year - 3;
    s.properties = [{ id: "home-test", kind: "home", value: 8 * W(s), price: 8 * W(s), mortgage: 0, rate: 0, payment: 0, bought: s.year - 10 }];
    const d = ask(s, "debt_crisis");
    expect(d.options.find((o) => o.id === "bankrupt")!.disabled).toMatch(/Too soon/);
    answer(s, d, "home");
    expect(s.consumerDebt).toBe(0);
    expect(s.properties.some((x) => x.kind === "home")).toBe(false);
  });

  it("let someone whose marriage ended protect what they have", () => {
    const s = adult(29);
    s.partner = null;
    s.dating = false;
    s.flags.wasMarried = true;
    answer(s, ask(s, "romance"), "prenup");
    const wedding = ask(s, "wedding");
    expect(wedding.body).toMatch(/prenup/);
    answer(s, wedding, "small");
    const without = clone(s);
    delete without.flags.prenup;
    answer(s, ask(s, "divorce"), "split");
    answer(without, ask(without, "divorce"), "split");
    expect(netWorth(s)).toBeGreaterThan(netWorth(without));
  });
});
