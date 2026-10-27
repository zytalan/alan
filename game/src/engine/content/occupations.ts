import type { Industry } from "../labour";
import type { Edu, Field, Trade } from "../types";

export interface Occupation {
  id: string;
  title: string;
  industry: Industry; // where its jobs are counted: their booms and busts are this job's
  minEdu: Edu;
  fields?: Field[]; // degrees that qualify
  trades?: Trade[]; // vocational trades that qualify, as well as a degree in one of `fields`
  prefers?: Field[]; // majors that usually lead here, without being required
  home?: Field | Trade; // the major or trade that trains people for this work: most of them start here
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
    id: "cook", title: "Cook", industry: "hospitality", home: "hospitality", minEdu: "none", skill: 10, pay: 0.7, growth: 0.015, peak: 10, layoff: 0.08, cyclical: 2, stress: 6, formal: true, spread: 0.3, pool: "services",
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
    id: "itsupport", title: "IT support technician", industry: "tech", home: "it", minEdu: "vocational", fields: ["cs", "stem"], trades: ["it"], skill: 35, pay: 1.0, growth: 0.02, peak: 15, layoff: 0.04, cyclical: 1.3, stress: 5, formal: true, spread: 0.2, pool: "services", from: 1985, prefers: ["cs"],
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
    id: "trades", title: "Electrician", industry: "construction", home: "electrical", minEdu: "vocational", fields: ["stem"], trades: ["electrical"], skill: 30, pay: 1.2, growth: 0.02, peak: 15, layoff: 0.04, cyclical: 1.5, stress: 5, formal: true, spread: 0.25, pool: "industry",
    ladder: ["Apprentice electrician", "Electrician", "Master electrician", "Site supervisor", "Electrical contractor"],
  },
  {
    id: "nurse", title: "Nurse", industry: "health", home: "nursing", minEdu: "vocational", fields: ["medicine"], trades: ["nursing"], skill: 40, pay: 1.25, growth: 0.015, peak: 20, layoff: 0.01, cyclical: 0.3, stress: 6, formal: true, spread: 0.15, pool: "public", prefers: ["medicine"],
    ladder: ["Nurse", "Senior nurse", "Charge nurse", "Nurse manager", "Director of nursing"],
  },
  {
    id: "designer", title: "Graphic designer", industry: "media", home: "arts", minEdu: "vocational", fields: ["arts", "cs"], trades: ["design"], skill: 40, pay: 1.0, growth: 0.02, peak: 15, layoff: 0.05, cyclical: 1.4, stress: 5, formal: true, spread: 0.35, pool: "professional",
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
    id: "oileng", title: "Oil and gas engineer", industry: "energy", home: "stem", minEdu: "bachelor", fields: ["stem"], skill: 60, pay: 2.3, growth: 0.04, peak: 20, layoff: 0.05, cyclical: 1.5, stress: 7, formal: true, spread: 0.3, pool: "professional", common: 0.05, onlyIn: OIL,
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
    id: "finance", title: "Investment banker", industry: "finance", home: "business", minEdu: "bachelor", fields: ["business", "stem", "cs"], skill: 65, pay: 2.3, growth: 0.05, peak: 15, layoff: 0.07, cyclical: 2.5, stress: 8, formal: true, spread: 0.5, pool: "professional", common: 0.06, minDev: 0.3,
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
  // technology
  {
    id: "tester", title: "Software tester", industry: "tech", minEdu: "vocational", fields: ["cs", "stem"], trades: ["it"], prefers: ["cs"], skill: 35, pay: 1.45, growth: 0.03, peak: 12, layoff: 0.05, cyclical: 1.8, stress: 5, formal: true, spread: 0.3, pool: "professional", common: 0.5, from: 1990,
    ladder: ["Junior tester", "Software tester", "Senior tester", "Test lead", "Head of quality"],
  },
  {
    id: "security", title: "Cybersecurity analyst", industry: "tech", home: "cs", minEdu: "bachelor", fields: ["cs", "stem"], skill: 60, pay: 2.0, growth: 0.04, peak: 15, layoff: 0.025, cyclical: 0.8, stress: 6, formal: true, spread: 0.3, pool: "professional", common: 0.3, from: 2005,
    selfTaught: { from: 2008, skill: 82 },
    ladder: ["Security analyst", "Cybersecurity analyst", "Senior security engineer", "Security architect", "Chief information security officer"],
  },
  // finance and business
  {
    id: "insurance", title: "Insurance agent", industry: "finance", minEdu: "secondary", skill: 20, pay: 1.0, growth: 0.025, peak: 15, layoff: 0.06, cyclical: 1.2, stress: 6, formal: true, spread: 0.45, pool: "services", common: 0.6, prefers: ["business"], minDev: 0.2,
    ladder: ["Trainee insurance agent", "Insurance agent", "Senior insurance agent", "Agency manager", "Regional director"],
  },
  {
    id: "loans", title: "Loan officer", industry: "finance", minEdu: "bachelor", skill: 40, pay: 1.2, growth: 0.03, peak: 15, layoff: 0.05, cyclical: 2, stress: 5, formal: true, spread: 0.35, pool: "professional", common: 0.5, prefers: ["business"], minDev: 0.3,
    ladder: ["Loan processor", "Loan officer", "Senior loan officer", "Lending manager", "Head of lending"],
  },
  {
    id: "hr", title: "HR specialist", industry: "business", minEdu: "bachelor", skill: 40, pay: 1.15, growth: 0.03, peak: 18, layoff: 0.04, cyclical: 1.2, stress: 5, formal: true, spread: 0.25, pool: "professional", common: 0.7, prefers: ["business", "arts", "education"], minDev: 0.3,
    ladder: ["HR assistant", "HR specialist", "HR manager", "HR director", "Chief people officer"],
  },
  {
    // US job counts put real estate with finance and insurance
    id: "realestate", title: "Real estate agent", industry: "finance", minEdu: "secondary", skill: 20, pay: 0.95, growth: 0.03, peak: 15, layoff: 0.06, cyclical: 2.5, stress: 6, formal: true, spread: 0.6, pool: "services", common: 0.5, prefers: ["business"], minDev: 0.3,
    ladder: ["Trainee real estate agent", "Real estate agent", "Senior real estate agent", "Branch manager", "Agency owner"],
  },
  // engineering and industry
  {
    id: "technician", title: "Machine technician", industry: "manufacturing", home: "mechanics", minEdu: "vocational", fields: ["stem"], trades: ["mechanics", "electrical"], skill: 30, pay: 1.05, growth: 0.02, peak: 15, layoff: 0.04, cyclical: 1.6, stress: 5, formal: true, spread: 0.2, pool: "industry", minDev: 0.15,
    ladder: ["Apprentice technician", "Machine technician", "Senior technician", "Maintenance supervisor", "Maintenance manager"],
  },
  {
    id: "architect", title: "Architect", industry: "construction", minEdu: "bachelor", fields: ["stem", "arts"], prefers: ["stem", "arts"], skill: 55, pay: 1.55, growth: 0.03, peak: 22, layoff: 0.04, cyclical: 2.2, stress: 6, formal: true, spread: 0.35, pool: "professional", common: 0.3,
    ladder: ["Architectural assistant", "Architect", "Senior architect", "Associate", "Partner"],
  },
  {
    id: "solar", title: "Solar and wind technician", industry: "energy", home: "electrical", minEdu: "vocational", fields: ["stem"], trades: ["electrical"], skill: 30, pay: 1.0, growth: 0.02, peak: 12, layoff: 0.05, cyclical: 1.2, stress: 5, formal: true, spread: 0.2, pool: "industry", common: 0.5, from: 2010, minDev: 0.25,
    ladder: ["Trainee installer", "Solar and wind technician", "Senior technician", "Site supervisor", "Operations manager"],
  },
  // health and care
  {
    id: "carer", title: "Care worker", industry: "health", home: "care", minEdu: "none", skill: 5, pay: 0.6, growth: 0.01, peak: 10, layoff: 0.03, cyclical: 0.3, stress: 6, formal: true, spread: 0.15, pool: "services", minDev: 0.25,
    ladder: ["Care assistant", "Care worker", "Senior care worker", "Care team leader", "Care home manager"],
  },
  {
    id: "paramedic", title: "Paramedic", industry: "health", minEdu: "vocational", fields: ["medicine"], trades: ["nursing"], skill: 35, pay: 0.9, growth: 0.02, peak: 15, layoff: 0.01, cyclical: 0.2, stress: 8, formal: true, spread: 0.15, pool: "public", common: 0.4, minDev: 0.3,
    ladder: ["Emergency medical technician", "Paramedic", "Senior paramedic", "Paramedic team leader", "Ambulance service manager"],
  },
  {
    id: "pharmacist", title: "Pharmacist", industry: "health", minEdu: "bachelor", fields: ["medicine"], skill: 60, pay: 2.2, growth: 0.025, peak: 15, layoff: 0.01, cyclical: 0.1, stress: 5, formal: true, spread: 0.2, pool: "professional", common: 0.4,
    ladder: ["Trainee pharmacist", "Pharmacist", "Senior pharmacist", "Pharmacy manager", "Chief pharmacist"],
  },
  // education and government
  {
    id: "assistant", title: "Teaching assistant", industry: "education", home: "care", minEdu: "secondary", skill: 15, pay: 0.6, growth: 0.01, peak: 10, layoff: 0.03, cyclical: 0.3, stress: 4, formal: true, spread: 0.15, pool: "public", common: 0.6, minDev: 0.3,
    ladder: ["Teaching assistant", "Senior teaching assistant", "Higher-level teaching assistant", "Learning support manager", "Head of learning support"],
  },
  {
    id: "socialwork", title: "Social worker", industry: "public", minEdu: "bachelor", skill: 40, pay: 1.0, growth: 0.02, peak: 20, layoff: 0.02, cyclical: 0.3, stress: 8, formal: true, spread: 0.15, pool: "public", common: 0.5, prefers: ["education", "arts"], minDev: 0.35,
    ladder: ["Social work assistant", "Social worker", "Senior social worker", "Team manager", "Head of social services"],
  },
  {
    id: "firefighter", title: "Firefighter", industry: "public", minEdu: "secondary", skill: 25, pay: 0.95, growth: 0.015, peak: 20, layoff: 0.005, cyclical: 0.1, stress: 7, formal: true, spread: 0.15, pool: "public", common: 0.3, minDev: 0.2,
    ladder: ["Firefighter", "Crew manager", "Watch manager", "Station manager", "Fire chief"],
  },
  // media and design
  {
    id: "marketing", title: "Marketing specialist", industry: "media", minEdu: "bachelor", skill: 45, pay: 1.25, growth: 0.035, peak: 18, layoff: 0.05, cyclical: 1.6, stress: 6, formal: true, spread: 0.35, pool: "professional", common: 0.7, prefers: ["business", "arts"],
    ladder: ["Marketing assistant", "Marketing specialist", "Marketing manager", "Head of marketing", "Chief marketing officer"],
  },
  {
    id: "socialmedia", title: "Social media manager", industry: "media", minEdu: "bachelor", skill: 35, pay: 1.0, growth: 0.03, peak: 12, layoff: 0.06, cyclical: 1.5, stress: 6, formal: true, spread: 0.35, pool: "professional", common: 0.4, prefers: ["arts", "business"], from: 2010,
    selfTaught: { from: 2012, skill: 60 },
    ladder: ["Social media assistant", "Social media manager", "Senior social media manager", "Head of social media", "Head of digital marketing"],
  },
  // shops, hotels, transport and services
  {
    id: "waiter", title: "Waiter", industry: "hospitality", home: "hospitality", minEdu: "none", skill: 0, pay: 0.6, growth: 0.01, peak: 8, layoff: 0.09, cyclical: 2.2, stress: 5, formal: true, spread: 0.3, pool: "services",
    ladder: ["Waiter", "Senior waiter", "Head waiter", "Restaurant supervisor", "Restaurant manager"],
  },
  {
    id: "reception", title: "Hotel receptionist", industry: "hospitality", home: "hospitality", minEdu: "secondary", skill: 15, pay: 0.65, growth: 0.015, peak: 10, layoff: 0.07, cyclical: 2, stress: 4, formal: true, spread: 0.2, pool: "services", common: 0.5, minDev: 0.2,
    ladder: ["Receptionist", "Senior receptionist", "Front office supervisor", "Front office manager", "Hotel manager"],
  },
  {
    // the job counts put car repair with the motor trade
    id: "mechanic", title: "Mechanic", industry: "retail", home: "mechanics", minEdu: "primary", skill: 20, pay: 0.85, growth: 0.015, peak: 15, layoff: 0.04, cyclical: 1.2, stress: 5, formal: true, spread: 0.25, pool: "industry", common: 0.8,
    ladder: ["Apprentice mechanic", "Mechanic", "Senior mechanic", "Workshop supervisor", "Garage owner"],
  },
  {
    id: "hairdresser", title: "Hairdresser", industry: "services", home: "beauty", minEdu: "primary", skill: 10, pay: 0.6, growth: 0.015, peak: 12, layoff: 0.04, cyclical: 1, stress: 4, formal: true, spread: 0.35, pool: "services", common: 0.6,
    ladder: ["Junior stylist", "Hairdresser", "Senior stylist", "Salon manager", "Salon owner"],
  },
  {
    id: "pilot", title: "Pilot", industry: "transport", home: "flying", minEdu: "vocational", trades: ["flying"], skill: 55, pay: 2.0, growth: 0.04, peak: 20, layoff: 0.03, cyclical: 2.5, stress: 7, formal: true, spread: 0.3, pool: "professional", common: 0.15, minDev: 0.2,
    ladder: ["First officer", "Senior first officer", "Captain", "Senior captain", "Chief pilot"],
  },
  { id: "delivery", title: "Delivery rider", industry: "transport", minEdu: "none", skill: 0, pay: 0.6, growth: 0.005, peak: 3, layoff: 0.08, cyclical: 1, stress: 6, formal: false, spread: 0.3, pool: "informal", common: 0.6, from: 2012 },
  // farming
  { id: "farmhand", title: "Farm worker", industry: "agriculture", minEdu: "none", skill: 0, pay: 0.45, growth: 0.005, peak: 6, layoff: 0.08, cyclical: 0.5, stress: 6, formal: false, spread: 0.25, pool: "farm" },
  {
    id: "agronomist", title: "Agronomist", industry: "agriculture", minEdu: "bachelor", skill: 45, pay: 1.25, growth: 0.025, peak: 20, layoff: 0.02, cyclical: 0.4, stress: 4, formal: true, spread: 0.25, pool: "professional", common: 0.3, prefers: ["stem"],
    ladder: ["Junior agronomist", "Agronomist", "Senior agronomist", "Head agronomist", "Director of agronomy"],
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

/** The trades vocational training offers, the job most trainees go into, and the skill it asks for. */
export const TRADES: { trade: Trade; job: string; need: number }[] = [
  { trade: "nursing", job: "nurse", need: 35 },
  { trade: "electrical", job: "trades", need: 25 },
  { trade: "it", job: "itsupport", need: 30 },
  { trade: "hospitality", job: "cook", need: 0 },
  { trade: "mechanics", job: "mechanic", need: 15 },
  { trade: "beauty", job: "hairdresser", need: 0 },
  { trade: "care", job: "carer", need: 0 },
  { trade: "design", job: "designer", need: 30 },
  { trade: "flying", job: "pilot", need: 55 },
];

export const TRADE_NAMES: Record<Trade, string> = {
  nursing: "Nursing",
  electrical: "Electrician",
  it: "IT support",
  hospitality: "Cooking and hospitality",
  mechanics: "Mechanics",
  beauty: "Hairdressing and beauty",
  care: "Care and childcare",
  design: "Graphic design",
  flying: "Flight school",
};

/** The course each trade means, as you'd say it: "you start a nursing course". */
export const TRADE_COURSE: Record<Trade, string> = {
  nursing: "a nursing course",
  electrical: "an electrician's course",
  it: "an IT support course",
  hospitality: "a catering course",
  mechanics: "a mechanics course",
  beauty: "a hairdressing course",
  care: "a care course",
  design: "a graphic design course",
  flying: "flight school",
};

/** When a major was taught widely enough to choose: computer science spread from the richest countries outward. */
export function majorOpen(field: Field, year: number, dev: number): boolean {
  if (field !== "cs") return true;
  return year >= (dev >= 0.6 ? 1970 : dev >= 0.3 ? 1985 : 1995);
}

/** Whether a trade is taught here and now: only once its work exists. */
export function tradeOpen(trade: Trade, year: number, dev: number): boolean {
  if (trade === "it") return year >= (dev >= 0.6 ? 1985 : dev >= 0.3 ? 1990 : 1998);
  const job = OCC[TRADES.find((t) => t.trade === trade)!.job];
  return (job.minDev == null || dev >= job.minDev) && (job.from == null || year >= job.from);
}

/** A job's title on the rung you're on. */
export function titleAt(occ: Occupation, level: number): string {
  return occ.ladder ? occ.ladder[Math.min(level, occ.ladder.length - 1)] : occ.title;
}
