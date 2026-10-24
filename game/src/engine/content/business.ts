import type { BizType } from "../types";

export interface BizDef {
  type: BizType;
  title: string;
  blurb: string;
  cost: number; // startup cost, multiple of the typical wage
  profit: number; // expected yearly profit at scale 1, multiple of the typical wage
  vol: number; // log sd of yearly profit
  hazard: [number, number]; // yearly failure risk: first year, later years
  multiple: number; // sale price as a multiple of profit
  minSkill: number;
  stress: number;
  from?: number;
  minDev?: number;
  names: string[];
}

export const BUSINESSES: BizDef[] = [
  {
    type: "stall", title: "Street stall", blurb: "Cheap to start. Long hours, thin margins.",
    cost: 0.2, profit: 0.75, vol: 0.5, hazard: [0.2, 0.1], multiple: 0.5, minSkill: 0, stress: 5,
    names: ["Corner Snacks", "Morning Tea Stand", "Fresh Fruit Cart", "Phone Repair Booth", "Noodle Stall"],
  },
  {
    type: "shop", title: "Shop or café", blurb: "A real storefront. Rent is due whether customers come or not.",
    cost: 1.5, profit: 1.3, vol: 0.45, hazard: [0.2, 0.08], multiple: 1.5, minSkill: 20, stress: 6,
    names: ["Corner Café", "Family Grocery", "Sunrise Bakery", "Neighbourhood Pharmacy", "Style Salon"],
  },
  {
    type: "trading", title: "Import/export trading", blurb: "Buy abroad, sell at home. Currency swings make or break you.",
    cost: 2.5, profit: 1.9, vol: 0.6, hazard: [0.2, 0.1], multiple: 2, minSkill: 35, stress: 7,
    names: ["Silk Road Trading", "Harbour Imports", "Pacific Goods Co.", "Meridian Supply"],
  },
  {
    type: "workshop", title: "Workshop / small factory", blurb: "Capital heavy, but it can scale.",
    cost: 5, profit: 2.8, vol: 0.5, hazard: [0.15, 0.07], multiple: 3, minSkill: 40, stress: 7,
    names: ["Precision Parts Ltd.", "Golden Thread Garments", "Ironworks & Sons", "Bright Plastics"],
  },
  {
    type: "agency", title: "Services firm", blurb: "Consulting, design, IT services. You are the product.",
    cost: 0.8, profit: 1.8, vol: 0.45, hazard: [0.18, 0.08], multiple: 1.5, minSkill: 55, stress: 6,
    names: ["Northstar Consulting", "Blue Door Studio", "Keystone Advisory", "Pixel & Code"],
  },
  {
    type: "tech", title: "Tech startup", blurb: "Most die. A few become worth more than everything else combined.",
    cost: 1.5, profit: -0.4, vol: 0.6, hazard: [0.3, 0.22], multiple: 0, minSkill: 65, stress: 9, from: 1985, minDev: 0.35,
    names: ["Loopwise", "Paperkite", "Brightgrid", "Nimbly", "Quantia", "Tandem Labs", "Orbital"],
  },
];

export const BIZ: Record<BizType, BizDef> = Object.fromEntries(BUSINESSES.map((b) => [b.type, b])) as Record<BizType, BizDef>;

/** Tech startup valuations by stage, as multiples of the typical wage. */
export const TECH_STAGES = [
  { name: "idea", valuation: 1.5 },
  { name: "seed round", valuation: 10 },
  { name: "Series A", valuation: 45 },
  { name: "Series B", valuation: 160 },
  { name: "growth stage", valuation: 600 },
];

/** Fictional listed companies for stock tips, by sector. */
export const STOCK_IDEAS: { sector: string; names: string[]; pitch: string[] }[] = [
  { sector: "Tech", names: ["Quantum Leap Systems", "Netbridge", "Cloudvine", "Helix Micro", "Datapond"], pitch: ["Everyone at work is talking about their new product.", "Analysts call it 'the next big platform'.", "Revenue doubled last year."] },
  { sector: "Energy", names: ["Northern Petroleum", "SunHarvest Power", "Coastal Gas", "Atlas Mining"], pitch: ["Oil prices are rising and they own the fields.", "A huge new discovery was just announced.", "Pays a fat dividend."] },
  { sector: "Banking", names: ["First Union Bank", "Capital Trust", "Peoples' Savings Bank"], pitch: ["Boring, but they make money in every economy.", "Loan growth is booming."] },
  { sector: "Property", names: ["Skyline Developers", "Evergreen Estates", "Harbour Towers Group"], pitch: ["They can't build apartments fast enough.", "Pre-sales are sold out for two years."] },
  { sector: "Consumer", names: ["Golden Noodle Foods", "Starlight Cosmetics", "UrbanWear", "Happy Cola"], pitch: ["Every family buys their products.", "Expanding into every city in the country."] },
  { sector: "Pharma", names: ["Vitalis Pharma", "GenoCure", "Meridian Health"], pitch: ["A cancer drug in final trials.", "An ageing population needs their pills."] },
  { sector: "Auto", names: ["Velocity Motors", "Voltaic EV", "Ironhorse Auto"], pitch: ["Their electric car has a two-year waiting list.", "Exports are surging."] },
];
