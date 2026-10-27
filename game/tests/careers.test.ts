import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { OCC, titleAt } from "../src/engine/content/occupations";
import { enqueue, EVENT_MAP } from "../src/engine/events";
import { industryGrowth } from "../src/engine/labour";
import { ec, makeOffers, payMultiple, takeJob } from "../src/engine/ops";
import { newGame, runLife, typical } from "../src/engine/policy";
import { stream } from "../src/engine/rng";
import type { Decision, Field, LifeState } from "../src/engine/types";
import { setWorld, type WorldData } from "../src/engine/world";

beforeAll(() => {
  setWorld(JSON.parse(readFileSync(new URL("../public/data/world.json", import.meta.url), "utf8")) as WorldData);
});

/** Someone of 23 in `year`, with a degree and a job of their own choosing. */
function worker(iso: string, year: number, job: string, field: Field, seed = 1): LifeState {
  const s = newGame({ mode: "random", seed, country: iso, birthYear: year - 23 });
  s.flags.immortalUntil = 95;
  runLife(s, typical, (t) => t.year >= year);
  s.pending = [];
  Object.assign(s, { edu: "bachelor", field, school: null, retired: false, business: null });
  s.stats.skill = 65;
  const o = OCC[job];
  takeJob(s, { occ: job, title: titleAt(o, 0), mult: payMultiple(s, o, stream(seed, "test")), employer: "a test employer", level: 0 });
  return s;
}

const ctx = (s: LifeState) => ({ e: ec(s), prev: ec(s, s.year - 1), w: ec(s).wage, r: stream(1, "ctx") });

describe("jobs by industry", () => {
  it("follow the real numbers: the dot-com bust, Spain's building collapse, the oil busts", () => {
    expect(industryGrowth("USA", 1998, "tech", 1)).toBeGreaterThan(0.15);
    expect(industryGrowth("USA", 2002, "tech", 1)).toBeLessThan(-0.08);
    expect(industryGrowth("ESP", 2009, "construction", 1)).toBeLessThan(-0.2);
    expect(industryGrowth("USA", 1986, "energy", 1)).toBeLessThan(-0.15);
    expect(industryGrowth("USA", 2020, "hospitality", 1)).toBeLessThan(-0.2);
    expect(industryGrowth("USA", 2009, "health", 1)).toBeGreaterThan(0);
  });

  it("fill the years without numbers from the US pattern and the country's own economy", () => {
    for (const [iso, year] of [["BRA", 1975], ["NGA", 1985], ["KEN", 2040], ["USA", 2035]] as const) {
      const g = industryGrowth(iso, year, "tech", 7);
      expect(Number.isFinite(g)).toBe(true);
      expect(Math.abs(g)).toBeLessThan(0.4);
    }
    // the UK's pits closed through the 1980s, before the ILO's numbers begin
    expect(industryGrowth("GBR", 1985, "energy", 1)).toBeLessThan(-0.1);
  });
});

describe("choosing a major", () => {
  it("shows what graduates earn now and how hiring has gone lately, never what comes next", () => {
    const s = newGame({ mode: "random", seed: 3, country: "USA", birthYear: 1981 });
    s.flags.immortalUntil = 95;
    runLife(s, typical, (t) => t.year >= 1999);
    s.pending = [];
    s.stats.skill = 70;
    enqueue(s, "choose_field");
    const d = s.pending.find((x) => x.event === "choose_field") as Decision;
    expect(d.options.map((o) => o.id)).toEqual(["cs", "stem", "business", "medicine", "law", "education", "arts"]);
    const cs = d.options.find((o) => o.id === "cs")!;
    expect(cs.hint).toMatch(/new software developers earn about/);
    expect(cs.hint).toMatch(/technology jobs \+1[5-9]\.?\d*% a year lately/); // 1996-98: the boom, not the bust to come
  });

  it("only offers computer science once it's taught widely there", () => {
    const s = newGame({ mode: "random", seed: 4, country: "NGA", birthYear: 1962 });
    s.flags.immortalUntil = 95;
    runLife(s, typical, (t) => t.year >= 1980);
    s.pending = [];
    enqueue(s, "choose_field");
    expect(s.pending.find((x) => x.event === "choose_field")!.options.map((o) => o.id)).not.toContain("cs");
  });
});

describe("a career", () => {
  it("lays developers off far more often in the bust than in the boom, the newest first", () => {
    const odds = (year: number, years: number) => {
      const s = worker("USA", year, "software", "cs");
      s.job!.years = years;
      return EVENT_MAP.layoff.chance!(s, ctx(s));
    };
    expect(odds(2002, 1)).toBeGreaterThan(2 * odds(1997, 1));
    expect(odds(2002, 1)).toBeGreaterThan(odds(2002, 12));
  });

  it("tells you nobody in your field is hiring when you're laid off in a bust", () => {
    const s = worker("USA", 2002, "software", "cs");
    enqueue(s, "layoff");
    const d = s.pending.find((x) => x.event === "layoff")!;
    expect(d.title + d.body).toMatch(/technology/);
    expect(d.options.map((o) => o.id)).toEqual(["outside", "wait", "study", "freelance"]);
  });

  it("brings bidding wars in a boom and hiring freezes in a bust", () => {
    const boom = worker("USA", 1998, "software", "cs");
    boom.job!.years = 3;
    const bust = worker("USA", 2002, "software", "cs");
    bust.job!.years = 3;
    expect(EVENT_MAP.bidding_war.chance!(boom, ctx(boom))).toBeGreaterThan(0);
    expect(EVENT_MAP.bidding_war.chance!(bust, ctx(bust))).toBe(0);
    expect(EVENT_MAP.industry_trouble.chance!(bust, ctx(bust))).toBeGreaterThan(0);
    expect(EVENT_MAP.industry_trouble.chance!(boom, ctx(boom))).toBe(0);
  });

  it("offers only the jobs that exist in that year", () => {
    const s = worker("USA", 1990, "software", "cs");
    for (let i = 0; i < 60; i++) {
      for (const of of makeOffers(s, stream(i, "offers"), 3)) {
        expect(of.occ).not.toBe("webdev");
        expect(of.occ).not.toBe("datasci");
      }
    }
  });

  it("pays for years in the same field more than years elsewhere", () => {
    const stayer = worker("USA", 2005, "software", "cs");
    const switcher = worker("USA", 2005, "software", "cs");
    stayer.workYears = switcher.workYears = 10;
    stayer.indYears = { tech: 10 };
    switcher.indYears = { finance: 10 };
    const r = () => stream(9, "pay");
    expect(payMultiple(stayer, OCC.software, r())).toBeGreaterThan(payMultiple(switcher, OCC.software, r()));
  });

  it("lets a dying trade go, with somewhere to move", () => {
    const s = worker("USA", 1995, "typist", "general");
    expect(EVENT_MAP.dying_trade.chance!(s, ctx(s))).toBeGreaterThan(0);
    enqueue(s, "dying_trade");
    const d = s.pending.find((x) => x.event === "dying_trade")!;
    expect(d.title).toBe("Fewer people need typists");
    expect(d.options.map((o) => o.id)).toContain("move");
  });

  it("offers graduates mostly the work their major trains them for", () => {
    const homes: [Field, string[]][] = [["stem", ["engineer", "civileng", "oileng"]], ["business", ["accountant", "analyst", "finance"]], ["law", ["lawyer"]], ["education", ["teacher"]]];
    for (const [field, jobs] of homes) {
      const s = worker("USA", 1999, "teacher", field);
      s.job = null;
      let hit = 0;
      for (let i = 0; i < 100; i++) if (makeOffers(s, stream(i, "first"), 3).some((of) => jobs.includes(of.occ))) hit++;
      expect(hit, field).toBeGreaterThan(70);
    }
  });

  it("keeps most graduates in the field they studied", () => {
    let n = 0;
    let inField = 0;
    for (let i = 0; i < 40; i++) {
      const s = newGame({ mode: "random", seed: 700 + i, country: "USA", birthYear: 1975, familyPct: 0.75 });
      s.flags.immortalUntil = 95;
      runLife(
        s,
        (t, d) => {
          if (d.event === "after_school" && d.options.some((o) => o.id === "uni" && !o.disabled)) return "uni";
          if (d.event === "choose_field" && d.options.some((o) => o.id === "cs" && !o.disabled)) return "cs";
          return typical(t, d);
        },
        (t) => t.age >= 35,
      );
      if (s.field !== "cs" || !s.job) continue;
      n++;
      if (OCC[s.job.occ].home === "cs") inField++;
    }
    expect(n).toBeGreaterThan(20);
    expect(inField / n).toBeGreaterThan(0.7);
  });
});
