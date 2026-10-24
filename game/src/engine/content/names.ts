import type { Rng } from "../rng";
import type { Sex } from "../types";

interface NameGroup {
  m: string[];
  f: string[];
  last: string[];
  familyFirst?: boolean;
}

const G: Record<string, NameGroup> = {
  cn: { m: ["Wei", "Jun", "Hao", "Lei", "Jie", "Yang", "Tao", "Ming", "Bo", "Chen"], f: ["Fang", "Li", "Na", "Min", "Jing", "Xiu", "Yan", "Ying", "Hui", "Mei"], last: ["Wang", "Li", "Zhang", "Liu", "Chen", "Yang", "Huang", "Zhao", "Wu", "Zhou"], familyFirst: true },
  jp: { m: ["Hiroshi", "Takashi", "Kenji", "Daisuke", "Yuki", "Haruto", "Ren", "Sota"], f: ["Yoko", "Keiko", "Yumi", "Aiko", "Haruka", "Yui", "Mio", "Sakura"], last: ["Sato", "Suzuki", "Takahashi", "Tanaka", "Watanabe", "Ito", "Yamamoto", "Nakamura"], familyFirst: true },
  kr: { m: ["Min-jun", "Ji-ho", "Seo-jun", "Hyun-woo", "Jae-won", "Dong-hyun"], f: ["Seo-yeon", "Ji-woo", "Min-seo", "Su-bin", "Ha-eun", "Ji-min"], last: ["Kim", "Lee", "Park", "Choi", "Jung", "Kang"], familyFirst: true },
  vn: { m: ["Minh", "Tuan", "Duc", "Hung", "Quang", "Nam"], f: ["Linh", "Huong", "Thao", "Mai", "Lan", "Trang"], last: ["Nguyen", "Tran", "Le", "Pham", "Hoang", "Vu"], familyFirst: true },
  in: { m: ["Rahul", "Amit", "Arjun", "Vikram", "Rohan", "Suresh", "Ravi", "Arun", "Sanjay", "Aditya"], f: ["Priya", "Anjali", "Pooja", "Sunita", "Kavya", "Neha", "Lakshmi", "Divya", "Meera", "Asha"], last: ["Kumar", "Sharma", "Singh", "Patel", "Reddy", "Gupta", "Das", "Iyer", "Nair", "Yadav"] },
  sam: { m: ["Muhammad", "Ali", "Ahmed", "Hassan", "Imran", "Bilal", "Faisal", "Rahim"], f: ["Ayesha", "Fatima", "Sana", "Nadia", "Zainab", "Rukhsana", "Farzana", "Amina"], last: ["Khan", "Ahmed", "Hossain", "Rahman", "Malik", "Chowdhury", "Siddiqui", "Islam"] },
  arab: { m: ["Mohammed", "Ahmed", "Omar", "Youssef", "Khaled", "Karim", "Hassan", "Tariq"], f: ["Fatima", "Mariam", "Nour", "Layla", "Sara", "Huda", "Amira", "Rania"], last: ["Haddad", "Mansour", "Saleh", "Hassan", "Ibrahim", "Nasser", "Khalil", "Aziz"] },
  tr: { m: ["Mehmet", "Emre", "Reza", "Amir", "Burak", "Arash"], f: ["Zeynep", "Elif", "Maryam", "Shirin", "Ayşe", "Leyla"], last: ["Yılmaz", "Kaya", "Demir", "Hosseini", "Ahmadi", "Karimi"] },
  il: { m: ["David", "Yosef", "Noam", "Ariel", "Itai"], f: ["Noa", "Tamar", "Yael", "Maya", "Shira"], last: ["Cohen", "Levi", "Mizrahi", "Peretz", "Biton"] },
  afe: { m: ["Chinedu", "Emeka", "Kwame", "Tunde", "Samuel", "Joseph", "Kofi", "David", "Musa", "Ibrahim"], f: ["Ngozi", "Amara", "Ama", "Grace", "Blessing", "Adaeze", "Esther", "Wanjiru", "Zanele", "Halima"], last: ["Okafor", "Mensah", "Adeyemi", "Mwangi", "Okeke", "Banda", "Kamau", "Abubakar", "Nkosi", "Otieno"] },
  afw: { m: ["Jean", "Moussa", "Mamadou", "Pierre", "Ibrahima", "Joseph", "Patrice"], f: ["Aminata", "Marie", "Fatou", "Grace", "Mariam", "Awa", "Christelle"], last: ["Diallo", "Traoré", "Koné", "Ndiaye", "Ouédraogo", "Sow", "Camara", "Mukendi"] },
  eth: { m: ["Abebe", "Dawit", "Tesfaye", "Yohannes", "Bereket"], f: ["Tigist", "Hiwot", "Selam", "Meron", "Bethlehem"], last: ["Bekele", "Tadesse", "Girma", "Haile", "Alemu"] },
  es: { m: ["José", "Luis", "Carlos", "Juan", "Diego", "Miguel", "Jorge", "Andrés"], f: ["María", "Ana", "Lucía", "Sofía", "Carmen", "Valentina", "Gabriela", "Rosa"], last: ["García", "Rodríguez", "Martínez", "López", "González", "Hernández", "Pérez", "Sánchez", "Ramírez", "Torres"] },
  pt: { m: ["João", "Pedro", "Lucas", "Gabriel", "Rafael", "Tiago", "Mateus"], f: ["Ana", "Beatriz", "Juliana", "Fernanda", "Larissa", "Mariana", "Camila"], last: ["Silva", "Santos", "Oliveira", "Souza", "Pereira", "Costa", "Ferreira", "Almeida"] },
  en: { m: ["James", "John", "Michael", "David", "Robert", "Daniel", "Chris", "Matthew"], f: ["Mary", "Jennifer", "Sarah", "Emily", "Jessica", "Emma", "Laura", "Linda"], last: ["Smith", "Johnson", "Williams", "Brown", "Jones", "Miller", "Davis", "Wilson", "Taylor", "Clark"] },
  de: { m: ["Thomas", "Michael", "Andreas", "Stefan", "Lukas", "Jonas"], f: ["Anna", "Julia", "Katrin", "Sabine", "Lena", "Laura"], last: ["Müller", "Schmidt", "Schneider", "Fischer", "Weber", "Meyer", "Wagner", "Becker"] },
  fr: { m: ["Jean", "Pierre", "Nicolas", "Julien", "Thomas", "Antoine"], f: ["Marie", "Camille", "Julie", "Sophie", "Léa", "Chloé"], last: ["Martin", "Bernard", "Dubois", "Durand", "Lefebvre", "Moreau", "Laurent", "Simon"] },
  it: { m: ["Marco", "Giuseppe", "Luca", "Alessandro", "Matteo", "Andrea"], f: ["Giulia", "Francesca", "Chiara", "Sara", "Elena", "Martina"], last: ["Rossi", "Russo", "Ferrari", "Esposito", "Bianchi", "Romano"] },
  sl: { m: ["Alexei", "Dmitri", "Sergei", "Ivan", "Andriy", "Piotr", "Nikolai", "Pavel"], f: ["Olga", "Natalia", "Elena", "Anna", "Irina", "Katarzyna", "Svetlana", "Yulia"], last: ["Ivanov", "Petrov", "Smirnov", "Kovalenko", "Nowak", "Novak", "Popov", "Kuznetsov"] },
  no: { m: ["Lars", "Erik", "Anders", "Jan", "Mikko", "Daan"], f: ["Anna", "Ingrid", "Sofie", "Emma", "Eva", "Sanne"], last: ["Johansson", "Hansen", "Nielsen", "Larsen", "Virtanen", "de Jong", "Andersson", "Berg"] },
  id: { m: ["Budi", "Agus", "Ahmad", "Rizky", "Hafiz", "Dedi"], f: ["Siti", "Dewi", "Nur", "Putri", "Aisyah", "Rina"], last: ["Santoso", "Wijaya", "Hidayat", "Abdullah", "Rahman", "Saputra"] },
  ph: { m: ["Jose", "Mark", "John Paul", "Christian", "Joel"], f: ["Maria", "Angelica", "Kristine", "Joy", "Mary Grace"], last: ["Santos", "Reyes", "Cruz", "Bautista", "Garcia", "Mendoza"] },
  th: { m: ["Somchai", "Anan", "Kittisak", "Prasert", "Niran"], f: ["Malee", "Siriporn", "Kanya", "Ploy", "Nok"], last: ["Saetang", "Srisuk", "Wongsa", "Chaiyaporn", "Boonmee"] },
};

const BY_ISO: Record<string, string> = {
  CHN: "cn", HKG: "cn", MAC: "cn", SGP: "cn", JPN: "jp", KOR: "kr", PRK: "kr", VNM: "vn",
  PAK: "sam", BGD: "sam", AFG: "sam", IRN: "tr", TUR: "tr", AZE: "tr", TKM: "tr", UZB: "tr", KAZ: "tr", KGZ: "tr", TJK: "tr", ISR: "il",
  ETH: "eth", ERI: "eth", BRA: "pt", PRT: "pt", AGO: "pt", MOZ: "pt", GNB: "pt",
  USA: "en", GBR: "en", CAN: "en", AUS: "en", NZL: "en", IRL: "en", JAM: "en", TTO: "en", PNG: "en",
  DEU: "de", AUT: "de", CHE: "de", FRA: "fr", BEL: "fr", LUX: "fr", HTI: "fr", ITA: "it", ESP: "es",
  SWE: "no", NOR: "no", DNK: "no", FIN: "no", NLD: "no", ISL: "no",
  IDN: "id", MYS: "id", BRN: "id", PHL: "ph", THA: "th", LAO: "th", KHM: "th", MMR: "th",
  COD: "afw", COG: "afw", CIV: "afw", CMR: "afw", SEN: "afw", MLI: "afw", BFA: "afw", NER: "afw", GIN: "afw", TCD: "afw", BEN: "afw", TGO: "afw", MDG: "afw", RWA: "afw", BDI: "afw", GAB: "afw", CAF: "afw", MRT: "afw",
};

const BY_REGION: Record<string, string> = { SAS: "in", MEA: "arab", ECS: "sl", LCN: "es", NAC: "en", SSF: "afe", EAS: "cn" };

export function nameGroup(iso: string, region: string): NameGroup {
  return G[BY_ISO[iso] ?? BY_REGION[region] ?? "en"];
}

export function makeName(iso: string, region: string, sex: Sex, rng: Rng, family?: string): { full: string; given: string; family: string } {
  const g = nameGroup(iso, region);
  const given = rng.pick(sex === "M" ? g.m : g.f);
  const last = family ?? rng.pick(g.last);
  return { full: g.familyFirst ? `${last} ${given}` : `${given} ${last}`, given, family: last };
}

export function givenName(iso: string, region: string, sex: Sex, rng: Rng): string {
  const g = nameGroup(iso, region);
  return rng.pick(sex === "M" ? g.m : g.f);
}
