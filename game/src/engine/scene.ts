// What the picture of a life shows in a given year: who is in it and how old they are, where they
// live, how well off they are, the light of the hour (a life runs from morning to dusk), the weather
// of the year just lived, and props for its big moments. Only a description: the UI draws it.

import { dev, netWorth, W, wageYears } from "./ops";
import type { LifeState, Sex } from "./types";
import { country, countryIn } from "./world";

export type Stage = "baby" | "child" | "teen" | "adult" | "middle" | "elder";
export type Climate = "temperate" | "cold" | "tropical" | "arid";
export type Hour = "morning" | "day" | "afternoon" | "golden" | "dusk";
export type Weather = "clear" | "clouds" | "rain" | "snow";
export type HomeKind = "hut" | "simple" | "apartment" | "house" | "big" | "villa";
export type Outfit = "casual" | "school" | "student" | "office" | "suit" | "medical" | "work" | "farm" | "apron" | "uniform" | "retired";
export type Extra = "cane" | "glasses" | "backpack" | "hardhat" | "strawhat" | "cap" | "gradcap" | "bandage";
export type Prop = "bunting" | "boxes" | "confetti" | "flowers" | "toys";

export interface Figure {
  role: "you" | "partner" | "child" | "parent";
  stage: Stage;
  sex: Sex;
  skin: number; // 0 light to 3 deep
  hair: "black" | "brown" | "blond" | "red" | "gray" | "white";
  outfit: Outfit;
  shirt: number; // which colour of the outfit's set
  extras: Extra[];
}

export interface Scene {
  climate: Climate;
  hour: Hour;
  weather: Weather;
  home: { kind: HomeKind; owned: boolean; shabby: boolean };
  business: { type: string; name: string } | null;
  ride: "none" | "bike" | "moto" | "small" | "nice";
  figures: Figure[];
  props: Prop[];
  seed: number;
  caption: string;
}

/** A random draw that depends only on what it's about, so the same life always looks the same. */
function pick(seed: number, key: string): number {
  let h = 2166136261 ^ seed;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  h = Math.imul(h ^ (h >>> 15), 2246822507);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}

export function stageOf(age: number): Stage {
  return age < 3 ? "baby" : age < 13 ? "child" : age < 18 ? "teen" : age < 40 ? "adult" : age < 65 ? "middle" : "elder";
}

const ARID = new Set(["NER", "MLI", "TCD", "SDN", "MRT", "AFG", "PAK", "KAZ", "UZB", "TKM", "MNG", "AUS", "NAM", "BWA", "SOM", "DJI", "ERI"]);
const TEMPERATE = new Set(["AUS", "NZL", "ZAF", "ARG", "CHL", "URY", "PRT", "ESP", "ITA", "GRC", "TUR", "LSO", "SWZ"]);
const COLD_EAST = new Set(["CHN", "JPN", "KOR", "PRK", "MNG"]);

export function climateOf(iso: string): Climate {
  const r = country(iso).r;
  if (TEMPERATE.has(iso)) return "temperate";
  if (ARID.has(iso) || r === "MEA") return "arid";
  if (r === "ECS" || r === "NAC" || COLD_EAST.has(iso)) return "cold";
  return "tropical";
}

const SKIN_BY_REGION: Record<string, number[]> = {
  // shares of light, medium, brown and deep
  SSF: [0, 0.05, 0.35, 0.6],
  SAS: [0, 0.4, 0.55, 0.05],
  MEA: [0.3, 0.55, 0.15, 0],
  EAS: [0.55, 0.4, 0.05, 0],
  ECS: [0.85, 0.15, 0, 0],
  NAC: [0.55, 0.2, 0.15, 0.1],
  LCN: [0.25, 0.5, 0.2, 0.05],
};
const LIGHT_HAIR = new Set(["ECS", "NAC"]);

function looks(seed: number, iso: string, who: string): { skin: number; hair: Figure["hair"] } {
  const r = country(iso).r;
  const shares = SKIN_BY_REGION[r] ?? [0.25, 0.25, 0.25, 0.25];
  let u = pick(seed, `${who} skin`);
  let skin = 0;
  while (skin < 3 && u > shares[skin]) u -= shares[skin++];
  const v = pick(seed, `${who} hair`);
  const hair: Figure["hair"] = LIGHT_HAIR.has(r) ? (v < 0.4 ? "brown" : v < 0.65 ? "black" : v < 0.9 ? "blond" : "red") : v < 0.85 ? "black" : "brown";
  return { skin, hair };
}

const OUTFIT_OF: Record<string, Outfit> = {
  farmer: "farm", farmhand: "farm", agronomist: "farm",
  laborer: "work", construction: "work", factory: "work", miner: "work", trades: "work", solar: "work", technician: "work", mechanic: "work", civileng: "work", oileng: "work", engineer: "work",
  vendor: "apron", cook: "apron", waiter: "apron", retail: "apron", domestic: "apron", hairdresser: "apron",
  nurse: "medical", doctor: "medical", paramedic: "medical", pharmacist: "medical", carer: "medical",
  soldier: "uniform", security: "uniform", firefighter: "uniform", pilot: "uniform", driver: "uniform", delivery: "uniform",
  finance: "suit", lawyer: "suit", executive: "suit", manager: "suit", accountant: "suit", analyst: "suit", loans: "suit", insurance: "suit", realestate: "suit", hr: "suit",
  itsupport: "casual", webdev: "casual", software: "casual", datasci: "casual", tester: "casual", designer: "casual", socialmedia: "casual", creator: "casual",
};
const BIZ_OUTFIT: Record<string, Outfit> = { stall: "apron", shop: "apron", trading: "office", workshop: "work", agency: "suit", tech: "casual" };

function parentOutfit(occ: string): Outfit {
  if (/farm|field|herd|crop/i.test(occ)) return "farm";
  if (/factory|build|mine|construction|workshop/i.test(occ)) return "work";
  if (/shop|stall|market|sell|restaurant|cook/i.test(occ)) return "apron";
  if (/office|bank|teach|government|clerk|manage/i.test(occ)) return "office";
  if (/nurse|doctor|hospital/i.test(occ)) return "medical";
  return "casual";
}

/** The events of the latest year in the ledger. */
function latest(s: LifeState): string[] {
  const y = s.log.length ? s.log[s.log.length - 1].year : s.year;
  return s.log.filter((l) => l.year === y && l.tone !== "history").map((l) => l.text);
}

export function sceneOf(s: LifeState): Scene {
  const d = dev(s);
  const climate = climateOf(s.country);
  const age = s.age;
  const hour: Hour = age < 13 ? "morning" : age < 40 ? "day" : age < 65 ? "afternoon" : age < 80 ? "golden" : "dusk";
  const said = latest(s);
  const has = (re: RegExp) => said.some((t) => re.test(t));
  const bad = has(/^You're out of work|^You (declare bankruptcy|default on)|^You divorce|^(Stocks crash|Crypto crashes)|^Your (mother|father) dies| dies\.$/);
  const winter = climate === "cold" && pick(s.seed, `winter ${s.year}`) < 0.25;
  const weather: Weather = bad ? "rain" : winter ? "snow" : s.stats.happiness < 30 || pick(s.seed, `sky ${s.year}`) < 0.35 ? "clouds" : "clear";

  // where you live: your parents' home while you're young, then your own, rented or bought; a home
  // you own is drawn by what it cost when you bought it, so it doesn't change until you move
  const own = s.properties.find((p) => p.kind === "home");
  const atHome = !own && (age < 18 || s.livingWithParents);
  let kind: HomeKind;
  if (atHome) {
    const f = s.familyPct;
    kind = d < 0.4 ? (f < 0.5 ? "hut" : f < 0.88 ? "simple" : "house") : d < 0.7 ? (f < 0.3 ? "simple" : f < 0.7 ? "apartment" : f < 0.96 ? "house" : "big") : f < 0.35 ? "apartment" : f < 0.85 ? "house" : f < 0.97 ? "big" : "villa";
  } else if (own) {
    const v = own.price / Math.max(1e-9, W(s, own.bought));
    kind = s.flags.familyHome && v < 4 ? (d < 0.4 ? "hut" : "simple") : v < 3 ? (d < 0.45 ? "simple" : "apartment") : v < 9 ? "house" : v < 25 ? "big" : "villa";
  } else kind = d < 0.35 ? "simple" : "apartment";
  const nw = netWorth(s);
  // what you drive goes by your wealth over the last few years, so a car doesn't come and go with every swing
  const recent = [wageYears(s, nw), ...s.history.slice(-2).map((h) => wageYears(s, h.netWorth, h.year))].sort((a, b) => a - b);
  const wy = recent[Math.floor(recent.length / 2)];
  const shabby = !atHome && nw < 0;

  let ride: Scene["ride"];
  if (atHome) {
    const f = s.familyPct;
    ride = d >= 0.55 ? (f > 0.9 ? "nice" : f > 0.45 ? "small" : "bike") : f > 0.8 ? "moto" : f > 0.4 ? "bike" : "none";
  } else ride = d >= 0.55 ? (wy >= 6 ? "nice" : wy >= 1 ? "small" : "bike") : wy >= 4 ? "small" : wy >= 0.5 ? "moto" : wy >= 0 ? "bike" : "none";

  // who is in the picture
  const me = looks(s.seed, s.birthCountry, "you");
  const stage = stageOf(age);
  let outfit: Outfit = "casual";
  if (s.school && (s.school.kind === "primary" || s.school.kind === "secondary")) outfit = "school";
  else if (s.school) outfit = "student";
  else if (s.business) outfit = BIZ_OUTFIT[s.business.type] ?? "casual";
  else if (s.job) outfit = OUTFIT_OF[s.job.occ] ?? "office";
  else if (s.retired) outfit = "retired";
  const extras: Extra[] = [];
  if (age >= 75 || s.stats.health < 25) extras.push("cane");
  if (age >= 46 && pick(s.seed, "glasses") < 0.6) extras.push("glasses");
  if (outfit === "school" || outfit === "student") extras.push("backpack");
  if (outfit === "work") extras.push("hardhat");
  if (outfit === "farm") extras.push("strawhat");
  if (outfit === "uniform") extras.push("cap");
  if (has(/^You (graduate in|qualify as|earn a (master|doctor))/)) extras.push("gradcap");
  if (s.stats.health < 40 && age >= 18) extras.push("bandage");
  const grey = (a: number, hair: Figure["hair"]): Figure["hair"] => (a >= 72 ? "white" : a >= 58 ? "gray" : hair);
  const figures: Figure[] = [];
  const shirtOf = (who: string) => Math.floor(pick(s.seed, `${who} shirt`) * 6);
  // your parents, while you live with them as a child
  if (age < 18) {
    s.parents.alive.forEach((alive, i) => {
      if (!alive) return;
      const a = s.parents.ageAtBirth[i] + age;
      const l = looks(s.seed, s.birthCountry, `parent ${i}`);
      figures.push({ role: "parent", stage: stageOf(a), sex: i === 0 ? "F" : "M", skin: me.skin, hair: grey(a, l.hair), outfit: parentOutfit(s.parents.occ), shirt: shirtOf(`parent ${i}`), extras: a >= 75 ? ["cane"] : [] });
    });
  }
  if (s.partner) {
    const l = looks(s.seed, s.country, `partner ${s.partner.name}`);
    figures.push({ role: "partner", stage: stageOf(Math.max(18, age)), sex: s.sex === "M" ? "F" : "M", skin: l.skin, hair: grey(age, l.hair), outfit: age >= 66 ? "retired" : "casual", shirt: shirtOf(`partner ${s.partner.name}`), extras: age >= 77 ? ["cane"] : [] });
  }
  figures.push({ role: "you", stage, sex: s.sex, skin: me.skin, hair: grey(age, me.hair), outfit, shirt: shirtOf("you"), extras });
  for (const k of s.kids) {
    const a = s.year - k.born;
    if (a < 0 || a >= 18 || figures.filter((f) => f.role === "child").length >= 3) continue;
    figures.push({ role: "child", stage: stageOf(a), sex: k.sex, skin: me.skin, hair: me.hair, outfit: a >= 6 ? "school" : "casual", shirt: shirtOf(`kid ${k.name}`), extras: [] });
  }

  const props: Prop[] = [];
  if (has(/^You marry /)) props.push("bunting");
  if (has(/^You (buy a home|move into the family home|build a simple house)|^You (leave .+ for|flee to) /)) props.push("boxes");
  if (has(/^(Promoted to |You get your boss's job|You take charge|You take the corner office)|^You (graduate in|qualify as)/)) props.push("confetti");
  if (has(/ dies\.$|^Your (mother|father) dies/)) props.push("flowers");
  if (s.kids.some((k) => s.year - k.born >= 2 && s.year - k.born < 10)) props.push("toys");

  const where = countryIn(s.country);
  const place = { hut: "a hut", simple: "a simple house", apartment: "a flat in a block", house: "a house", big: "a big house", villa: "a villa" }[kind];
  const whose = atHome ? "your family's home" : own ? `your own home, ${place}` : `${place} you rent`;
  const company: string[] = [];
  const parents = figures.filter((f) => f.role === "parent");
  if (parents.length === 2) company.push("your mother and father");
  else if (parents.length) company.push(parents[0].sex === "F" ? "your mother" : "your father");
  if (s.partner) company.push(s.sex === "M" ? "your wife" : "your husband");
  const kids = figures.filter((f) => f.role === "child");
  if (kids.length === 1) company.push(kids[0].sex === "F" ? "your daughter" : "your son");
  else if (kids.length) company.push(`your ${kids.length === 2 ? "two" : "three"} children`);
  const sky = weather === "rain" ? "on a rainy day" : weather === "snow" ? "on a snowy day" : { morning: "on a bright morning", day: "on a fine day", afternoon: "in the afternoon sun", golden: "in the evening light", dusk: "at dusk" }[hour];
  const together = company.length > 1 ? `${company.slice(0, -1).join(", ")} and ${company[company.length - 1]}` : company[0];
  const caption = `${age === 0 ? "You, just born," : `You at ${age},`} outside ${whose} in ${where}${together ? `, with ${together}` : ""}, ${sky}.`;
  return { climate, hour, weather, home: { kind, owned: !!own, shabby }, business: s.business ? { type: s.business.type, name: s.business.name } : null, ride, figures, props, seed: s.seed, caption };
}
