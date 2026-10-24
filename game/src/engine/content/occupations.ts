import type { Edu, Field } from "../types";

export interface Occupation {
  id: string;
  title: string;
  minEdu: Edu;
  fields?: Field[]; // tertiary field required
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
  from?: number;
  minDev?: number;
  maxDev?: number;
  minExp?: number; // years of formal work
  needs?: string[]; // must have held one of these jobs
}

export const OCCUPATIONS: Occupation[] = [
  { id: "farmer", title: "Smallholder farmer", minEdu: "none", skill: 0, pay: 0.35, growth: 0.003, peak: 10, layoff: 0, cyclical: 0, stress: 5, formal: false, spread: 0.4, pool: "farm", maxDev: 0.8 },
  { id: "laborer", title: "Day laborer", minEdu: "none", skill: 0, pay: 0.45, growth: 0.005, peak: 5, layoff: 0.12, cyclical: 2, stress: 6, formal: false, spread: 0.25, pool: "informal" },
  { id: "vendor", title: "Street vendor", minEdu: "none", skill: 0, pay: 0.5, growth: 0.01, peak: 8, layoff: 0.05, cyclical: 1.5, stress: 5, formal: false, spread: 0.5, pool: "informal", maxDev: 0.85 },
  { id: "domestic", title: "Domestic worker", minEdu: "none", skill: 0, pay: 0.4, growth: 0.005, peak: 5, layoff: 0.08, cyclical: 1, stress: 5, formal: false, spread: 0.25, pool: "informal" },
  { id: "construction", title: "Construction worker", minEdu: "none", skill: 0, pay: 0.85, growth: 0.01, peak: 8, layoff: 0.08, cyclical: 2.5, stress: 6, formal: false, spread: 0.25, pool: "industry" },
  { id: "factory", title: "Factory worker", minEdu: "primary", skill: 10, pay: 0.8, growth: 0.012, peak: 10, layoff: 0.05, cyclical: 2, stress: 6, formal: true, spread: 0.2, pool: "industry", minDev: 0.1 },
  { id: "driver", title: "Driver", minEdu: "primary", skill: 5, pay: 0.8, growth: 0.008, peak: 8, layoff: 0.05, cyclical: 1.5, stress: 5, formal: true, spread: 0.2, pool: "services" },
  { id: "retail", title: "Shop assistant", minEdu: "primary", skill: 5, pay: 0.7, growth: 0.008, peak: 6, layoff: 0.05, cyclical: 1.3, stress: 4, formal: true, spread: 0.15, pool: "services" },
  { id: "clerk", title: "Office clerk", minEdu: "secondary", skill: 30, pay: 1.0, growth: 0.015, peak: 15, layoff: 0.03, cyclical: 1.2, stress: 4, formal: true, spread: 0.2, pool: "services" },
  { id: "sales", title: "Sales rep", minEdu: "secondary", skill: 25, pay: 1.1, growth: 0.03, peak: 15, layoff: 0.06, cyclical: 1.8, stress: 6, formal: true, spread: 0.45, pool: "services" },
  { id: "soldier", title: "Police officer", minEdu: "secondary", skill: 20, pay: 1.0, growth: 0.015, peak: 20, layoff: 0.01, cyclical: 0.2, stress: 7, formal: true, spread: 0.15, pool: "public" },
  { id: "civil", title: "Civil servant", minEdu: "secondary", skill: 45, pay: 1.15, growth: 0.015, peak: 25, layoff: 0.005, cyclical: 0, stress: 3, formal: true, spread: 0.15, pool: "public" },
  { id: "trades", title: "Electrician", minEdu: "vocational", skill: 30, pay: 1.2, growth: 0.02, peak: 15, layoff: 0.04, cyclical: 1.5, stress: 5, formal: true, spread: 0.25, pool: "industry" },
  { id: "nurse", title: "Nurse", minEdu: "vocational", skill: 40, pay: 1.25, growth: 0.015, peak: 20, layoff: 0.01, cyclical: 0.3, stress: 6, formal: true, spread: 0.15, pool: "public" },
  { id: "teacher", title: "Teacher", minEdu: "bachelor", skill: 40, pay: 1.15, growth: 0.015, peak: 25, layoff: 0.01, cyclical: 0.2, stress: 5, formal: true, spread: 0.15, pool: "public" },
  { id: "accountant", title: "Accountant", minEdu: "bachelor", fields: ["business", "general"], skill: 50, pay: 1.5, growth: 0.03, peak: 20, layoff: 0.03, cyclical: 1, stress: 5, formal: true, spread: 0.25, pool: "professional" },
  { id: "engineer", title: "Engineer", minEdu: "bachelor", fields: ["stem"], skill: 55, pay: 1.9, growth: 0.03, peak: 20, layoff: 0.04, cyclical: 1.5, stress: 5, formal: true, spread: 0.25, pool: "professional" },
  { id: "software", title: "Software developer", minEdu: "bachelor", fields: ["stem"], skill: 60, pay: 1.9, growth: 0.04, peak: 15, layoff: 0.05, cyclical: 1.8, stress: 6, formal: true, spread: 0.35, pool: "professional", from: 1972 },
  { id: "finance", title: "Investment banker", minEdu: "bachelor", fields: ["business", "stem"], skill: 65, pay: 2.3, growth: 0.05, peak: 15, layoff: 0.07, cyclical: 2.5, stress: 8, formal: true, spread: 0.5, pool: "professional", minDev: 0.3 },
  { id: "lawyer", title: "Lawyer", minEdu: "master", fields: ["law"], skill: 65, pay: 2.4, growth: 0.04, peak: 25, layoff: 0.02, cyclical: 0.8, stress: 8, formal: true, spread: 0.5, pool: "professional" },
  { id: "doctor", title: "Doctor", minEdu: "doctorate", fields: ["medicine"], skill: 70, pay: 3.0, growth: 0.04, peak: 25, layoff: 0.005, cyclical: 0.1, stress: 8, formal: true, spread: 0.35, pool: "professional" },
  { id: "professor", title: "Professor", minEdu: "doctorate", skill: 70, pay: 1.7, growth: 0.02, peak: 25, layoff: 0.01, cyclical: 0.3, stress: 5, formal: true, spread: 0.25, pool: "professional" },
  { id: "manager", title: "Manager", minEdu: "secondary", skill: 55, pay: 2.2, growth: 0.035, peak: 20, layoff: 0.05, cyclical: 1.5, stress: 7, formal: true, spread: 0.35, pool: "senior", minExp: 5 },
  { id: "executive", title: "Executive", minEdu: "bachelor", skill: 75, pay: 5.0, growth: 0.04, peak: 15, layoff: 0.08, cyclical: 1.5, stress: 9, formal: true, spread: 0.6, pool: "senior", minExp: 12, needs: ["manager", "finance", "lawyer", "engineer", "software"] },
  { id: "creator", title: "Artist", minEdu: "none", skill: 30, pay: 0.6, growth: 0.02, peak: 15, layoff: 0.1, cyclical: 1.5, stress: 5, formal: false, spread: 1.1, pool: "informal" },
];

export const OCC: Record<string, Occupation> = Object.fromEntries(OCCUPATIONS.map((o) => [o.id, o]));

export const FIELD_NAMES: Record<string, string> = {
  stem: "Engineering & computing",
  business: "Business & economics",
  medicine: "Medicine",
  law: "Law",
  education: "Education",
  arts: "Arts & humanities",
  general: "General studies",
};
