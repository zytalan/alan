import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { OCC, OCCUPATIONS, titleAt } from "../src/engine/content/occupations";
import { enqueue, EVENT_MAP, lookForWork } from "../src/engine/events";
import { signedPct } from "../src/engine/format";
import { AREA_OF, AREAS, industryGrowth } from "../src/engine/labour";
import { careerAction, choose } from "../src/engine/life";
import { ec, makeOffers, occEligible, payMultiple, searchOffers, takeJob } from "../src/engine/ops";
import { newGame, runLife, typical } from "../src/engine/policy";
import { stream } from "../src/engine/rng";
import { graduate } from "../src/engine/school";
import type { Decision, Field, LifeState, Trade } from "../src/engine/types";
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

/** Someone just qualified in `year`, with a degree or a trade (or neither), who has never worked. */
function newcomer(iso: string, year: number, field?: Field, trade?: Trade, seed = 1): LifeState {
  const s = worker(iso, year, "teacher", field ?? "general", seed);
  Object.assign(s, { job: null, workYears: 0, formalYears: 0, indYears: {}, field, trade, edu: field ? "bachelor" : trade ? "vocational" : "secondary" });
  delete s.flags.lastInd;
  delete s.flags.pastJobs;
  return s;
}

const ctx = (s: LifeState) => ({ e: ec(s), prev: ec(s, s.year - 1), w: ec(s).wage, r: stream(1, "ctx") });
const ids = (d: Decision) => d.options.map((x) => x.id);
const opt = (d: Decision, id: string) => d.options.find((x) => x.id === id)!;
const pending = (s: LifeState, event: string) => {
  const d = s.pending.find((x) => x.event === event);
  expect(d, event).toBeDefined();
  return d!;
};

/** Answer a decision and return the one it leads to. */
function then(s: LifeState, d: Decision, option: string, event: string): Decision {
  choose(s, d.id, option);
  return pending(s, event);
}

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

  it("offers graduates looking in their field mostly the work their major trains them for", () => {
    const homes: [Field, string, string[]][] = [
      ["stem", "industry", ["engineer", "civileng", "oileng"]],
      ["business", "money", ["accountant", "analyst", "finance"]],
      ["law", "money", ["lawyer"]],
      ["education", "public", ["teacher"]],
    ];
    for (const [field, area, jobs] of homes) {
      let hit = 0;
      for (let seed = 1; seed <= 8; seed++) if (searchOffers(newcomer("USA", 1999, field, undefined, seed), area as never).some((of) => jobs.includes(of.occ))) hit++;
      expect(hit, field).toBeGreaterThanOrEqual(7);
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

describe("looking for work", () => {
  it("asks where to look first, with what you studied at the top", () => {
    const s = newcomer("USA", 1999, "cs");
    lookForWork(s);
    const d = pending(s, "job_area");
    expect(d.title).toBe("Your first job");
    expect(d.options[0].id).toBe("tech");
    expect(d.options[0].hint).toMatch(/^What you studied · .*junior developer.* · starts at about \$[\d.]+K.* · jobs \+\d+% last year$/);
    expect(ids(d).at(-1)).toBe("any");
    expect(ids(d)).toHaveLength(AREAS.length + 1);
  });

  it("says why an area is closed to you", () => {
    const s = newcomer("PAK", 2005);
    s.edu = "primary";
    lookForWork(s);
    const d = pending(s, "job_area");
    expect(opt(d, "tech").disabled).toBe("Needs IT training or a degree in computer science");
    expect(opt(d, "money").disabled).toBe("Needs secondary school");
    expect(opt(d, "farming").disabled).toBeFalsy();
  });

  it("only offers work in the area you chose, and the same openings if you look again that year", () => {
    const s = newcomer("USA", 1999, "cs");
    for (const area of ["tech", "money", "public", "services"] as const) {
      const offers = searchOffers(s, area);
      expect(offers.length, area).toBeGreaterThan(0);
      for (const of of offers) expect(AREA_OF[OCC[of.occ].industry]).toBe(area);
      expect(searchOffers(s, area)).toEqual(offers);
    }
  });

  it("has fewer openings in a bust, and none when an industry collapses", () => {
    expect(searchOffers(newcomer("USA", 2002, "cs"), "tech").length).toBeLessThan(searchOffers(newcomer("USA", 1998, "cs"), "tech").length);
    expect(searchOffers(newcomer("ESP", 2007, "stem"), "industry").length).toBeGreaterThan(2);
    expect(searchOffers(newcomer("ESP", 2009, "stem"), "industry")).toEqual([]);
  });

  it("lets you look somewhere else, shutting an area with nothing in it", () => {
    const s = newcomer("ESP", 2009, "stem");
    lookForWork(s);
    const offers = then(s, pending(s, "job_area"), "industry", "first_job");
    expect(offers.body).toBe("Nobody in engineering and industry is hiring right now.");
    expect(ids(offers)).toEqual(["back", "wait"]);
    const again = then(s, offers, "back", "job_area");
    expect(opt(again, "industry").disabled).toBe("Nobody in engineering and industry is hiring right now");
    const elsewhere = then(s, again, "money", "first_job");
    expect(elsewhere.options.length).toBeGreaterThan(2);
  });

  it("takes job hunting from the Work tab through the same steps, starting with where you work", () => {
    const s = worker("USA", 2005, "software", "cs");
    s.indYears = { tech: 6 };
    s.workYears = 6;
    careerAction(s, "jobhunt");
    const d = pending(s, "job_area");
    expect(d.body).toBe("You've worked in technology for 6 years. Where do you look?");
    expect(d.options[0].hint).toMatch(/^Where you work now/);
  });

  it("starts someone changing field lower than someone staying in it", () => {
    const s = worker("USA", 2005, "software", "cs");
    s.workYears = 10;
    s.indYears = { tech: 10 };
    const top = (area: "tech" | "money") => Math.max(...searchOffers(s, area).map((of) => of.level ?? 0));
    expect(top("tech")).toBe(2);
    expect(top("money")).toBeLessThan(2);
  });

  it("sends someone laid off in a bust looking outside their field", () => {
    const s = worker("USA", 2002, "software", "cs");
    s.indYears = { tech: 3 };
    enqueue(s, "layoff");
    const d = then(s, pending(s, "layoff"), "outside", "job_area");
    expect(d.title).toBe("Outside your field");
    expect(opt(d, "tech").disabled).toBe("Nobody in technology is hiring right now");
  });

  it("shows a change that rounds to nothing as +0%", () => {
    expect(signedPct(-0.004)).toBe("+0%");
    expect(signedPct(-0.04)).toBe("−4%");
  });
});

describe("vocational training", () => {
  it("starts with picking a trade, from the trades that exist then", () => {
    const early = newcomer("USA", 1980);
    enqueue(early, "choose_trade");
    expect(ids(pending(early, "choose_trade"))).not.toContain("it");
    const later = newcomer("USA", 1995);
    enqueue(later, "choose_trade");
    const d = pending(later, "choose_trade");
    expect(ids(d)).toEqual(["nursing", "electrical", "it", "hospitality", "mechanics", "beauty", "care", "design", "flying"]);
    expect(opt(d, "nursing").hint).toMatch(/^2 years · .*new nurses earn about/);
  });

  it("qualifies you for your trade's work and not another's", () => {
    const s = newcomer("USA", 2005);
    s.stats.skill = 60;
    enqueue(s, "choose_trade");
    choose(s, pending(s, "choose_trade").id, "nursing");
    expect(s.school?.trade).toBe("nursing");
    graduate(s);
    expect(s.trade).toBe("nursing");
    expect(occEligible(s, OCC.nurse)).toBe(true);
    expect(occEligible(s, OCC.paramedic)).toBe(true);
    expect(occEligible(s, OCC.trades)).toBe(false);
    lookForWork(s);
    expect(pending(s, "job_area").options[0].id).toBe("health");
    expect(searchOffers(s, "health").some((of) => of.occ === "nurse")).toBe(true);
  });

  it("prices flight school in dollars: within reach on an American loan, not for a poor family in Nigeria", () => {
    const us = newcomer("USA", 2010);
    us.stats.skill = 70;
    enqueue(us, "choose_trade");
    expect(opt(pending(us, "choose_trade"), "flying").disabled).toBeFalsy();
    const ng = newcomer("NGA", 2010);
    Object.assign(ng, { familyPct: 0.3 });
    ng.stats.skill = 70;
    ng.access.bank = false;
    enqueue(ng, "choose_trade");
    expect(opt(pending(ng, "choose_trade"), "flying").disabled).toMatch(/more than you can raise/);
  });
});

describe("the new jobs", () => {
  it("only exist once they did", () => {
    const s = newcomer("USA", 2003, "cs");
    s.stats.skill = 70;
    const at = (year: number, job: string) => occEligible({ ...s, year }, OCC[job]);
    expect([at(2003, "security"), at(2006, "security")]).toEqual([false, true]);
    expect([at(2008, "socialmedia"), at(2011, "socialmedia")]).toEqual([false, true]);
    expect([at(2009, "delivery"), at(2013, "delivery")]).toEqual([false, true]);
  });

  it("give every area at least three kinds of work", () => {
    for (const a of AREAS) expect(OCCUPATIONS.filter((o) => AREA_OF[o.industry] === a.id).length, a.id).toBeGreaterThanOrEqual(3);
    for (const o of OCCUPATIONS) if (o.formal && o.pool !== "senior") expect(o.ladder, o.id).toHaveLength(5);
  });
});
