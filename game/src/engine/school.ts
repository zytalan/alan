import { FIELD_NAMES, TRADE_COURSE } from "./content/occupations";
import { UNIVERSITY_CLOSED } from "./history";
import { bump, clamp, dev, ec, eduAtLeast, log, W } from "./ops";
import { econ } from "./macro";
import type { Edu, Field, LifeState, Trade } from "./types";
import { nearest } from "./world";

const TUITION: Record<string, number> = { USA: 0.35, AUS: 0.15, CAN: 0.15, NZL: 0.15, JPN: 0.2, KOR: 0.18, CHN: 0.08, IND: 0.15, CHL: 0.25, PHL: 0.15 };

export function tuitionPerYear(s: LifeState, kind: Edu, abroad = false, trade?: Trade): number {
  if (kind === "primary" || kind === "secondary") return 0;
  // flying lessons are priced in dollars everywhere: about $45,000 a year in the US in 2020
  if (trade === "flying") return 0.93 * econ("USA", s.macroSeed, s.year).wage * ec(s).fx;
  let f = TUITION[s.country] ?? (dev(s) >= 0.75 ? 0.03 : 0.12);
  if (s.country === "GBR") f = s.year >= 2012 ? 0.3 : s.year >= 1998 ? 0.1 : 0.02;
  if (kind === "vocational") f *= 0.5;
  if (abroad) f = 0.9;
  return f * W(s);
}

export function universityClosed(s: LifeState): boolean {
  return UNIVERSITY_CLOSED.some((u) => u.iso === s.country && s.year >= u.from && s.year <= u.to);
}

export function admissionChance(s: LifeState, kind: Edu, field?: Field): number {
  if (universityClosed(s) && kind !== "vocational") return 0;
  const ter = nearest(s.country, "ter", s.year) ?? 20;
  const base = 88 - 0.55 * ter;
  const bump_ = kind === "master" ? 10 : kind === "doctorate" ? 18 : kind === "vocational" ? -25 : 0;
  const fieldBump = field === "medicine" ? 12 : field === "law" ? 5 : 0;
  const eff = s.stats.skill + 12 * s.familyPct;
  return clamp(1 / (1 + Math.exp(-(eff - base - bump_ - fieldBump) / 6)), 0.01, 0.98);
}

export function schoolYears(kind: Edu, field?: Field): number {
  if (kind === "vocational") return 2;
  if (kind === "bachelor") return field === "medicine" ? 6 : 4;
  if (kind === "master") return 2;
  if (kind === "doctorate") return 4;
  return 6;
}

export function startSchool(s: LifeState, kind: Edu, field?: Field, abroad = false, trade?: Trade): void {
  s.school = { kind, yearsLeft: schoolYears(kind, field), cost: tuitionPerYear(s, kind, abroad, trade), field, trade };
  if (field) s.field = field;
  if (abroad) s.flags.studiedAbroad = true;
}

/** Finish the current stage. Returns the level reached. */
export function graduate(s: LifeState): Edu {
  const sc = s.school!;
  let reached: Edu = sc.kind;
  if (sc.kind === "bachelor" && sc.field === "medicine") reached = "doctorate";
  if (!eduAtLeast(s.edu, reached)) s.edu = reached; // retraining never takes away a degree you already have
  if (sc.trade) s.trade = sc.trade;
  delete s.flags.abroad; // the next course is priced at home unless you go abroad again
  s.school = null;
  const gain: Partial<Record<Edu, number>> = { vocational: 6, bachelor: 10, master: 8, doctorate: 10 };
  bump(s, "skill", gain[reached] ?? 3);
  if (reached === "bachelor" || reached === "doctorate" || reached === "master") bump(s, "network", 6);
  const what: Partial<Record<Edu, string>> = {
    primary: "You finish primary school.",
    secondary: "You finish secondary school.",
    vocational: sc.trade ? `You finish ${TRADE_COURSE[sc.trade]}.` : "You finish your vocational training.",
    bachelor: `You graduate in ${FIELD_NAMES[s.field ?? "general"]}.`,
    master: "You earn a master's degree.",
    doctorate: sc.field === "medicine" ? "You qualify as a doctor." : "You earn a doctorate.",
  };
  log(s, what[reached] ?? "You finish school.", "milestone");
  return reached;
}
