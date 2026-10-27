import type { Industry } from "../labour";
import type { Edu, Field } from "../types";

export interface Occupation {
  id: string;
  title: string;
  industry: Industry; // where its jobs are counted: their booms and busts are this job's
  minEdu: Edu;
  fields?: Field[]; // tertiary field required
  vocationalOk?: boolean; // a vocational diploma also qualifies, instead of a degree in one of `fields`
  prefers?: Field[]; // majors that usually lead here, without being required
  home?: Field; // the major that trains people for this work: most of its graduates start here
  common?: number; // how many such jobs there are next to the others in its pool (default 1)
  selfTaught?: { from: number; skill: number }; // from this year, people with this much skill get in without the degree
  skill: number; // minimum skill
  pay: number; // multiple of the typical wage
  growth: number; // real raise per year of experience
  peak: number; // years until pay plateaus
  layoff: number; // base yearly risk of losing the job
  cyclical: number; // layoff multiplier in recessions
  stress: number; // 0..10
  formal: boolean;
  spread: number; // pay dispersion between people (log sd)
  pool: "farm" | "informal" | "industry" | "services" | "public" | "professional" | "senior";
  ladder?: string[]; // titles rung by rung, as promotions come
  from?: number;
  fades?: number; // the year the work starts disappearing: hiring dries up, layoffs come
  fadeWhy?: string;
  related?: string; // where people in a fading job usually go
  onlyIn?: string[]; // countries where the work exists at any scale
  minDev?: number;
  maxDev?: number;
  minExp?: number; // years of formal work
  needs?: string[]; // must have held one of these jobs
}

// countries that produce oil and gas, and that mine coal or metals, at any scale
const OIL = ["USA", "CAN", "NOR", "GBR", "SAU", "ARE", "KWT", "QAT", "OMN", "IRN", "IRQ", "RUS", "KAZ", "AZE", "NGA", "AGO", "DZA", "LBY", "EGY", "VEN", "MEX", "BRA", "COL", "ECU", "ARG", "IDN", "MYS", "CHN", "AUS", "BRN", "TTO"];
const MINING = ["USA", "CAN", "AUS", "GBR", "DEU", "POL", "CZE", "UKR", "RUS", "KAZ", "CHN", "IND", "IDN", "ZAF", "ZMB", "COD", "BWA", "GHA", "CHL", "PER", "BOL", "BRA", "MEX", "COL", "MNG", "PNG", "PHL"];

export const OCCUPATIONS: Occupation[] = [
  { id: "farmer", title: "Smallholder farmer", industry: "agriculture", minEdu: "none", skill: 0, pay: 0.35, growth: 0.003, peak: 10, layoff: 0, cyclical: 0, stress: 5, formal: false, spread: 0.4, pool: "farm", maxDev: 0.8 },
  { id: "laborer", title: "Day laborer", industry: "construction", minEdu: "none", skill: 0, pay: 0.45, growth: 0.005, peak: 5, layoff: 0.12, cyclical: 2, stress: 6, formal: false, spread: 0.25, pool: "informal" },
  { id: "vendor", title: "Street vendor", industry: "retail", minEdu: "none", skill: 0, pay: 0.5, growth: 0.01, peak: 8, layoff: 0.05, cyclical: 1.5, stress: 5, formal: false, spread: 0.5, pool: "informal", maxDev: 0.85 },
  { id: "domestic", title: "Domestic worker", industry: "services", minEdu: "none", skill: 0, pay: 0.4, growth: 0.005, peak: 5, layoff: 0.08, cyclical: 1, stress: 5, formal: false, spread: 0.25, pool: "informal" },
  { id: "construction", title: "Construction worker", industry: "construction", minEdu: "none", skill: 0, pay: 0.85, growth: 0.01, peak: 8, layoff: 0.08, cyclical: 2.5, stress: 6, formal: false, spread: 0.25, pool: "industry" },
  {
    id: "factory", title: "Factory worker", industry: "manufacturing", minEdu: "primary", skill: 10, pay: 0.8, growth: 0.012, peak: 10, layoff: 0.05, cyclical: 2, stress: 6, formal: true, spread: 0.2, pool: "industry", minDev: 0.1,
    ladder: ["Factory worker", "Machine operator", "Line supervisor", "Shift manager", "Plant manager"],
  },
  {
    id: "miner", title: "Miner", industry: "energy", minEdu: "primary", skill: 10, pay: 1.0, growth: 0.012, peak: 12, layoff: 0.05, cyclical: 1.5, stress: 8, formal: true, spread: 0.2, pool: "industry", onlyIn: MINING,
    ladder: ["Miner", "Experienced miner", "Shift supervisor", "Mine manager", "Mine director"],
  },
  {
    id: "cook", title: "Cook", industry: "hospitality", minEdu: "none", skill: 10, pay: 0.7, growth: 0.015, peak: 10, layoff: 0.08, cyclical: 2, stress: 6, formal: true, spread: 0.3, pool: "services",
    ladder: ["Kitchen porter", "Cook", "Chef", "Head chef", "Restaurant manager"],
  },
  {
    id: "driver", title: "Driver", industry: "transport", minEdu: "primary", skill: 5, pay: 0.8, growth: 0.008, peak: 8, layoff: 0.05, cyclical: 1.5, stress: 5, formal: true, spread: 0.2, pool: "services",
    ladder: ["Driver", "Senior driver", "Dispatcher", "Fleet supervisor", "Transport manager"],
  },
  {
    id: "retail", title: "Shop assistant", industry: "retail", minEdu: "primary", skill: 5, pay: 0.7, growth: 0.008, peak: 6, layoff: 0.05, cyclical: 1.3, stress: 4, formal: true, spread: 0.15, pool: "services",
    ladder: ["Shop assistant", "Senior sales assistant", "Assistant manager", "Store manager", "Area manager"],
  },
  {
    id: "typist", title: "Typist", industry: "business", minEdu: "secondary", skill: 15, pay: 0.75, growth: 0.01, peak: 10, layoff: 0.03, cyclical: 1.2, stress: 4, formal: true, spread: 0.15, pool: "services",
    fades: 1988, fadeWhy: "Personal computers now do most of what typists did.", related: "clerk",
    ladder: ["Typist", "Senior typist", "Typing pool supervisor", "Office supervisor", "Office manager"],
  },
  {
    id: "teller", title: "Bank teller", industry: "finance", minEdu: "secondary", skill: 20, pay: 0.85, growth: 0.012, peak: 12, layoff: 0.03, cyclical: 1, stress: 4, formal: true, spread: 0.15, pool: "services", minDev: 0.3,
    fades: 2008, fadeWhy: "Cash machines and banking apps now do most of what tellers did.", related: "clerk",
    ladder: ["Bank teller", "Senior teller", "Head teller", "Branch supervisor", "Branch manager"],
  },
  {
    id: "clerk", title: "Office clerk", industry: "business", minEdu: "secondary", skill: 30, pay: 1.0, growth: 0.015, peak: 15, layoff: 0.03, cyclical: 1.2, stress: 4, formal: true, spread: 0.2, pool: "services",
    ladder: ["Office clerk", "Senior clerk", "Office supervisor", "Office manager", "Head of administration"],
  },
  {
    id: "sales", title: "Sales rep", industry: "business", minEdu: "secondary", skill: 25, pay: 1.1, growth: 0.03, peak: 15, layoff: 0.06, cyclical: 1.8, stress: 6, formal: true, spread: 0.45, pool: "services", prefers: ["business"],
    ladder: ["Sales rep", "Senior sales rep", "Account manager", "Sales manager", "Head of sales"],
  },
  {
    id: "itsupport", title: "IT support technician", industry: "tech", minEdu: "vocational", fields: ["cs", "stem"], vocationalOk: true, skill: 35, pay: 1.0, growth: 0.02, peak: 15, layoff: 0.04, cyclical: 1.3, stress: 5, formal: true, spread: 0.2, pool: "services", from: 1985, prefers: ["cs"],
    selfTaught: { from: 1990, skill: 50 },
    ladder: ["IT support technician", "IT technician", "Systems administrator", "IT manager", "Head of IT"],
  },
  {
    id: "soldier", title: "Police officer", industry: "public", minEdu: "secondary", skill: 20, pay: 1.0, growth: 0.015, peak: 20, layoff: 0.01, cyclical: 0.2, stress: 7, formal: true, spread: 0.15, pool: "public",
    ladder: ["Police officer", "Sergeant", "Inspector", "Superintendent", "Chief of police"],
  },
  {
    id: "civil", title: "Civil servant", industry: "public", minEdu: "secondary", skill: 45, pay: 1.15, growth: 0.015, peak: 25, layoff: 0.005, cyclical: 0, stress: 3, formal: true, spread: 0.15, pool: "public", prefers: ["law", "business"],
    ladder: ["Civil servant", "Senior officer", "Department head", "Deputy director", "Director"],
  },
  {
    id: "trades", title: "Electrician", industry: "construction", minEdu: "vocational", fields: ["stem"], vocationalOk: true, skill: 30, pay: 1.2, growth: 0.02, peak: 15, layoff: 0.04, cyclical: 1.5, stress: 5, formal: true, spread: 0.25, pool: "industry",
    ladder: ["Apprentice electrician", "Electrician", "Master electrician", "Site supervisor", "Electrical contractor"],
  },
  {
    id: "nurse", title: "Nurse", industry: "health", minEdu: "vocational", fields: ["medicine"], vocationalOk: true, skill: 40, pay: 1.25, growth: 0.015, peak: 20, layoff: 0.01, cyclical: 0.3, stress: 6, formal: true, spread: 0.15, pool: "public", prefers: ["medicine"],
    ladder: ["Nurse", "Senior nurse", "Charge nurse", "Nurse manager", "Director of nursing"],
  },
  {
    id: "designer", title: "Graphic designer", industry: "media", home: "arts", minEdu: "vocational", fields: ["arts", "cs"], vocationalOk: true, skill: 40, pay: 1.0, growth: 0.02, peak: 15, layoff: 0.05, cyclical: 1.4, stress: 5, formal: true, spread: 0.35, pool: "professional",
    ladder: ["Junior designer", "Graphic designer", "Senior designer", "Art director", "Creative director"],
  },
  {
    id: "teacher", title: "Teacher", industry: "education", home: "education", minEdu: "bachelor", skill: 40, pay: 1.15, growth: 0.015, peak: 25, layoff: 0.01, cyclical: 0.2, stress: 5, formal: true, spread: 0.15, pool: "public",
    ladder: ["Teacher", "Senior teacher", "Head of department", "Deputy head", "Head teacher"],
  },
  {
    id: "journalist", title: "Journalist", industry: "media", home: "arts", minEdu: "bachelor", fields: ["arts", "law", "business"], skill: 45, pay: 1.1, growth: 0.025, peak: 20, layoff: 0.04, cyclical: 1.2, stress: 7, formal: true, spread: 0.35, pool: "professional", common: 0.5,
    fades: 2005, fadeWhy: "Newspapers are losing their readers and their advertisers to the internet.", related: "sales",
    ladder: ["Junior reporter", "Reporter", "Senior reporter", "Editor", "Editor-in-chief"],
  },
  {
    id: "accountant", title: "Accountant", industry: "business", home: "business", minEdu: "bachelor", fields: ["business", "general"], skill: 50, pay: 1.5, growth: 0.03, peak: 20, layoff: 0.03, cyclical: 1, stress: 5, formal: true, spread: 0.25, pool: "professional",
    ladder: ["Junior accountant", "Accountant", "Senior accountant", "Finance manager", "Finance director"],
  },
  {
    id: "analyst", title: "Financial analyst", industry: "finance", home: "business", minEdu: "bachelor", fields: ["business", "cs", "stem"], skill: 55, pay: 1.7, growth: 0.04, peak: 18, layoff: 0.05, cyclical: 1.8, stress: 6, formal: true, spread: 0.35, pool: "professional", common: 0.6, minDev: 0.35,
    ladder: ["Junior analyst", "Financial analyst", "Senior analyst", "Portfolio manager", "Chief investment officer"],
  },
  {
    id: "engineer", title: "Engineer", industry: "manufacturing", home: "stem", minEdu: "bachelor", fields: ["stem"], skill: 55, pay: 1.9, growth: 0.03, peak: 20, layoff: 0.04, cyclical: 1.5, stress: 5, formal: true, spread: 0.25, pool: "professional",
    ladder: ["Graduate engineer", "Engineer", "Senior engineer", "Principal engineer", "Chief engineer"],
  },
  {
    id: "civileng", title: "Civil engineer", industry: "construction", home: "stem", minEdu: "bachelor", fields: ["stem"], skill: 55, pay: 1.7, growth: 0.03, peak: 20, layoff: 0.04, cyclical: 1.8, stress: 6, formal: true, spread: 0.25, pool: "professional",
    ladder: ["Graduate civil engineer", "Civil engineer", "Senior civil engineer", "Project manager", "Engineering director"],
  },
  {
    id: "oileng", title: "Oil and gas engineer", industry: "energy", home: "stem", minEdu: "bachelor", fields: ["stem"], skill: 60, pay: 2.3, growth: 0.04, peak: 20, layoff: 0.05, cyclical: 1.5, stress: 7, formal: true, spread: 0.3, pool: "professional", common: 0.1, onlyIn: OIL,
    ladder: ["Graduate engineer", "Petroleum engineer", "Senior petroleum engineer", "Lead engineer", "Chief engineer"],
  },
  {
    id: "webdev", title: "Web developer", industry: "tech", home: "cs", minEdu: "bachelor", fields: ["cs", "stem"], skill: 50, pay: 1.4, growth: 0.035, peak: 12, layoff: 0.045, cyclical: 1.8, stress: 6, formal: true, spread: 0.35, pool: "professional", from: 1995,
    selfTaught: { from: 1995, skill: 70 },
    ladder: ["Junior web developer", "Web developer", "Senior web developer", "Lead web developer", "Head of digital"],
  },
  {
    id: "software", title: "Software developer", industry: "tech", home: "cs", minEdu: "bachelor", fields: ["cs", "stem"], skill: 60, pay: 1.9, growth: 0.04, peak: 15, layoff: 0.035, cyclical: 1.8, stress: 6, formal: true, spread: 0.35, pool: "professional", from: 1972,
    selfTaught: { from: 1995, skill: 80 },
    ladder: ["Junior developer", "Software developer", "Senior developer", "Lead developer", "Head of engineering"],
  },
  {
    id: "datasci", title: "Data scientist", industry: "tech", home: "cs", minEdu: "bachelor", fields: ["cs", "stem", "business"], skill: 65, pay: 2.0, growth: 0.04, peak: 15, layoff: 0.04, cyclical: 1.5, stress: 6, formal: true, spread: 0.35, pool: "professional", common: 0.5, from: 2012,
    ladder: ["Junior data analyst", "Data scientist", "Senior data scientist", "Lead data scientist", "Head of data"],
  },
  {
    id: "finance", title: "Investment banker", industry: "finance", home: "business", minEdu: "bachelor", fields: ["business", "stem", "cs"], skill: 65, pay: 2.3, growth: 0.05, peak: 15, layoff: 0.07, cyclical: 2.5, stress: 8, formal: true, spread: 0.5, pool: "professional", common: 0.12, minDev: 0.3,
    ladder: ["Analyst", "Associate", "Vice president", "Director", "Managing director"],
  },
  {
    id: "lawyer", title: "Lawyer", industry: "business", home: "law", minEdu: "bachelor", fields: ["law"], skill: 65, pay: 2.4, growth: 0.04, peak: 25, layoff: 0.02, cyclical: 0.8, stress: 8, formal: true, spread: 0.5, pool: "professional",
    ladder: ["Trainee lawyer", "Lawyer", "Senior associate", "Partner", "Senior partner"],
  },
  {
    id: "doctor", title: "Doctor", industry: "health", home: "medicine", minEdu: "doctorate", fields: ["medicine"], skill: 70, pay: 3.0, growth: 0.04, peak: 25, layoff: 0.005, cyclical: 0.1, stress: 8, formal: true, spread: 0.35, pool: "professional",
    ladder: ["Junior doctor", "Doctor", "Specialist", "Consultant", "Head of department"],
  },
  {
    id: "professor", title: "Professor", industry: "education", minEdu: "doctorate", skill: 70, pay: 1.7, growth: 0.02, peak: 25, layoff: 0.01, cyclical: 0.3, stress: 5, formal: true, spread: 0.25, pool: "professional",
    ladder: ["Lecturer", "Senior lecturer", "Associate professor", "Professor", "Dean"],
  },
  { id: "manager", title: "Manager", industry: "business", minEdu: "secondary", skill: 55, pay: 2.2, growth: 0.035, peak: 20, layoff: 0.05, cyclical: 1.5, stress: 7, formal: true, spread: 0.35, pool: "senior", minExp: 5 },
  {
    id: "executive", title: "Executive", industry: "business", minEdu: "bachelor", skill: 75, pay: 5.0, growth: 0.04, peak: 15, layoff: 0.08, cyclical: 1.5, stress: 9, formal: true, spread: 0.6, pool: "senior", minExp: 12,
    needs: ["manager", "finance", "lawyer", "engineer", "software", "analyst", "datasci", "civileng", "oileng"],
  },
  { id: "creator", title: "Artist", industry: "services", minEdu: "none", skill: 30, pay: 0.6, growth: 0.02, peak: 15, layoff: 0.1, cyclical: 1.5, stress: 5, formal: false, spread: 1.1, pool: "informal", prefers: ["arts"] },
];

export const OCC: Record<string, Occupation> = Object.fromEntries(OCCUPATIONS.map((o) => [o.id, o]));

export const FIELD_NAMES: Record<string, string> = {
  cs: "Computer science",
  stem: "Engineering",
  business: "Business & finance",
  medicine: "Medicine",
  law: "Law",
  education: "Education",
  arts: "Arts & humanities",
  general: "General studies",
};

/** The majors you can choose, the job most of their graduates go into, and the skill admission asks for. */
export const MAJORS: { field: Field; job: string; need: number }[] = [
  { field: "cs", job: "software", need: 45 },
  { field: "stem", job: "engineer", need: 45 },
  { field: "business", job: "accountant", need: 0 },
  { field: "medicine", job: "doctor", need: 62 },
  { field: "law", job: "lawyer", need: 52 },
  { field: "education", job: "teacher", need: 0 },
  { field: "arts", job: "designer", need: 0 },
];

/** When a major was taught widely enough to choose: computer science spread from the richest countries outward. */
export function majorOpen(field: Field, year: number, dev: number): boolean {
  if (field !== "cs") return true;
  return year >= (dev >= 0.6 ? 1970 : dev >= 0.3 ? 1985 : 1995);
}

/** A job's title on the rung you're on. */
export function titleAt(occ: Occupation, level: number): string {
  return occ.ladder ? occ.ladder[Math.min(level, occ.ladder.length - 1)] : occ.title;
}
