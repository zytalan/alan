import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { log } from "../src/engine/ops";
import { newGame, runLife, typical } from "../src/engine/policy";
import { climateOf, sceneOf, stageOf, type Scene } from "../src/engine/scene";
import type { LifeState } from "../src/engine/types";
import { setWorld, type WorldData } from "../src/engine/world";
import { paintScene, SCENE_H } from "../src/ui/pixel/paint";

beforeAll(() => {
  setWorld(JSON.parse(readFileSync(new URL("../public/data/world.json", import.meta.url), "utf8")) as WorldData);
});

/** Every year's scene of one life, with the state's age and year when it was taken. */
function scenes(s: LifeState): { age: number; year: number; homeId: string | null; sc: Scene }[] {
  const out: { age: number; year: number; homeId: string | null; sc: Scene }[] = [];
  runLife(s, typical, (t) => {
    out.push({ age: t.age, year: t.year, homeId: t.properties.find((p) => p.kind === "home")?.id ?? null, sc: sceneOf(t) });
    return false;
  });
  return out;
}

describe("the picture of a life", () => {
  it("ages with you, from a pram in the morning to dusk", () => {
    expect([0, 2, 3, 12, 13, 17, 18, 39, 40, 64, 65].map(stageOf)).toEqual(["baby", "baby", "child", "child", "teen", "teen", "adult", "adult", "middle", "middle", "elder"]);
    const order = ["morning", "day", "afternoon", "golden", "dusk"];
    for (const seed of [4, 19, 63]) {
      const all = scenes(newGame({ mode: "random", seed }));
      for (let i = 1; i < all.length; i++) expect(order.indexOf(all[i].sc.hour)).toBeGreaterThanOrEqual(order.indexOf(all[i - 1].sc.hour));
      const born = all[0].sc;
      expect(born.hour).toBe("morning");
      expect(born.figures.find((f) => f.role === "you")?.stage).toBe("baby");
      expect(born.caption).toMatch(/^You, just born, outside your family's home in /);
    }
  });

  it("always has you in it once, at most three children, and a sentence that says so", () => {
    for (const seed of [2, 8, 31, 77, 140]) {
      for (const { age, sc } of scenes(newGame({ mode: "random", seed }))) {
        expect(sc.figures.filter((f) => f.role === "you")).toHaveLength(1);
        expect(sc.figures.filter((f) => f.role === "child").length).toBeLessThanOrEqual(3);
        expect(sc.figures.filter((f) => f.role === "parent").length).toBeLessThanOrEqual(age < 18 ? 2 : 0);
        expect(sc.caption).toMatch(/^You(, just born,| at \d+,) outside .+[a-z]\.$/);
        expect(sc.caption).not.toMatch(/a parent|undefined|NaN/);
      }
    }
  });

  it("keeps a home you own the same until you move", () => {
    for (const seed of [5, 21, 106, 141]) {
      const all = scenes(newGame({ mode: "random", seed }));
      for (let i = 1; i < all.length; i++) {
        const [a, b] = [all[i - 1], all[i]];
        if (a.homeId && a.homeId === b.homeId) expect(b.sc.home.kind).toBe(a.sc.home.kind);
      }
    }
  });

  it("rains on the hard years and marks the big ones", () => {
    const s = newGame({ mode: "random", seed: 12, country: "BRA", birthYear: 1980 });
    runLife(s, typical, (t) => t.age >= 30);
    log(s, "You're out of work.", "bad");
    expect(sceneOf(s).weather).toBe("rain");
    log(s, "You marry Ana Souza.", "milestone");
    expect(sceneOf(s).props).toContain("bunting");
  });

  it("sets the land by the country", () => {
    expect(climateOf("NOR")).toBe("cold");
    expect(climateOf("BRA")).toBe("tropical");
    expect(climateOf("EGY")).toBe("arid");
    expect(climateOf("ESP")).toBe("temperate");
  });

  it("paints the same picture every time, at any width it's given", () => {
    const s = newGame({ mode: "random", seed: 9 });
    runLife(s, typical, (t) => t.age >= 40);
    const sc = sceneOf(s);
    for (const w of [140, 179, 208, 260]) {
      const a = paintScene(sc, w);
      expect(a.data.length).toBe(w * SCENE_H * 4);
      expect(Buffer.from(paintScene(sc, w).data).equals(Buffer.from(a.data))).toBe(true);
    }
    const dusk = paintScene({ ...sc, hour: "dusk" }, 200);
    expect(Buffer.from(dusk.data).equals(Buffer.from(paintScene(sc, 200).data))).toBe(false);
  });

  it("paints every year of many lives without fault", () => {
    for (let seed = 300; seed < 330; seed++)
      for (const { sc } of scenes(newGame({ mode: "random", seed }))) {
        const b = paintScene(sc, 140 + (seed % 5) * 30);
        expect(b.data[3]).toBe(255);
      }
  });
});
