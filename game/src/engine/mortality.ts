// Death follows the real period life tables: for each country, year and sex we
// fit a Gompertz–Makeham curve whose life expectancy, infant mortality and
// under-5 mortality match the World Bank figures for that year.

import type { Rng } from "./rng";
import type { Sex } from "./types";
import { lastObsYear, nearest, obs, onWorldChange, world } from "./world";

const THETA = 0.085;
const MAX_AGE = 115;
const tableCache = new Map<string, Float64Array>();
onWorldChange(() => tableCache.clear());

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

// The Gompertz hazard over each year of age, per unit of b/θ: e^θ(x+1) − e^θx.
const STEP = Float64Array.from({ length: MAX_AGE + 1 }, (_, x) => Math.exp(THETA * (x + 1)) - Math.exp(THETA * x));

function buildTable(e0: number, imr: number, u5: number): Float64Array {
  const q0 = clamp(imr / 1000, 0.001, 0.3);
  const q14 = clamp(1 - ((1 - clamp(u5 / 1000, q0, 0.45)) / (1 - q0)) ** 0.25, 0.0001, 0.1);
  const makeham = 0.0004 + 0.02 * clamp(u5 / 1000, 0, 0.3);
  // The first five years don't depend on b, so the search starts from age 5.
  let l5 = 1;
  let e5 = 0;
  for (let x = 0; x <= 4; x++) {
    const next = l5 * (1 - (x === 0 ? q0 : q14));
    e5 += (l5 + next) / 2;
    l5 = next;
  }
  const lifeExp = (b: number) => {
    const c = b / THETA;
    let l = l5;
    let e = e5;
    for (let x = 5; x < MAX_AGE; x++) {
      const next = l * Math.exp(-(makeham + c * STEP[x]));
      e += (l + next) / 2;
      l = next;
    }
    return e + l / 2;
  };
  // 20 halvings pin b to within 0.002% — far finer than the quarter-year e0 is rounded to.
  let lo = Math.log(1e-8);
  let hi = Math.log(0.3);
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    if (lifeExp(Math.exp(mid)) > e0) lo = mid;
    else hi = mid;
  }
  const c = Math.exp((lo + hi) / 2) / THETA;
  const q = new Float64Array(MAX_AGE + 1);
  q[0] = q0;
  for (let x = 1; x <= 4; x++) q[x] = q14;
  for (let x = 5; x < MAX_AGE; x++) q[x] = 1 - Math.exp(-(makeham + c * STEP[x]));
  q[MAX_AGE] = 1;
  return q;
}

export function lifeTable(e0: number, imr: number, u5: number): Float64Array {
  const key = `${Math.round(e0 * 4)}|${Math.round(imr)}|${Math.round(u5)}`;
  let t = tableCache.get(key);
  if (!t) {
    t = buildTable(Math.round(e0 * 4) / 4, Math.round(imr), Math.round(u5));
    tableCache.set(key, t);
  }
  return t;
}

/** Life expectancy, infant and under-5 mortality for a calendar year, projected past the data. */
export function mortalityInputs(iso: string, year: number, sex: Sex): { e0: number; imr: number; u5: number } {
  const key = sex === "F" ? "leF" : "leM";
  const w = world();
  const last = lastObsYear(iso, key) ?? w.y1;
  let e0 = nearest(iso, key, year) ?? 65;
  let imr = nearest(iso, "imr", year) ?? 40;
  let u5 = nearest(iso, "u5", year) ?? 55;
  if (year > last) {
    const past = obs(iso, key, last - 15) ?? e0;
    const slope = clamp((e0 - past) / 15, 0.05, 0.3);
    const cap = sex === "F" ? 93 : 90;
    const gap = Math.max(0.5, cap - e0);
    e0 = cap - gap * Math.exp((-slope / gap) * (year - last));
    const decay = 0.97 ** (year - last);
    imr = Math.max(1.5, imr * decay);
    u5 = Math.max(2, u5 * decay);
  }
  return { e0, imr, u5 };
}

/** Expected health for an average person of this age (0-100). */
export function referenceHealth(age: number): number {
  return clamp(92 - 0.25 * Math.max(0, age - 20) - 0.012 * Math.max(0, age - 45) ** 2, 5, 92);
}

export function deathProbability(iso: string, year: number, sex: Sex, age: number, health: number): number {
  const { e0, imr, u5 } = mortalityInputs(iso, year, sex);
  const q = lifeTable(e0, imr, u5)[Math.min(age, MAX_AGE)];
  const mult = Math.exp(-0.03 * (health - referenceHealth(age)));
  return clamp(q * mult, 0, 1);
}

export function causeOfDeath(age: number, dev: number, rng: Rng, war: boolean): string {
  if (war && age >= 15 && rng.chance(0.5)) return "killed in the fighting";
  if (age < 1) return rng.pick(dev < 0.4 ? ["complications at birth", "an infection", "pneumonia"] : ["complications at birth", "a congenital condition"]);
  if (age < 5) return rng.pick(dev < 0.4 ? ["malaria", "diarrhoeal disease", "pneumonia", "malnutrition"] : ["an accident", "an illness"]);
  if (age < 15) return rng.pick(["an accident", "an infection", "drowning"]);
  if (age < 40) return rng.pick(dev < 0.4 ? ["tuberculosis", "a road accident", "HIV/AIDS", "an infection", "violence"] : ["a road accident", "an overdose", "cancer", "an accident"]);
  if (age < 65) return rng.pick(["a heart attack", "cancer", "a stroke", dev < 0.4 ? "tuberculosis" : "liver disease", "diabetes"]);
  return rng.pick(["heart disease", "a stroke", "cancer", "pneumonia", "dementia", "old age, peacefully"]);
}
