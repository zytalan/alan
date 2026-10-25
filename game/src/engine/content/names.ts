import { stream, type Rng } from "../rng";
import type { Sex } from "../types";

interface NameGroup {
  m: string[];
  f: string[];
  last: string[];
  lastF?: string[]; // women's family names where they differ (Begum, Nakato)
  familyFirst?: boolean;
  noFamily?: boolean; // a personal name of two parts and no family name (Myanmar)
  gendered?: "ru" | "pl"; // family names that take a feminine form
}

// Given names shared by Portuguese-speaking Africa.
const LUSO_M = ["João", "António", "Manuel", "José", "Carlos", "Armando", "Alberto", "Fernando"];
const LUSO_F = ["Maria", "Ana", "Joana", "Rosa", "Celeste", "Lúcia", "Graça", "Teresa"];

const G: Record<string, NameGroup> = {
  cn: { m: ["Wei", "Jun", "Hao", "Lei", "Jie", "Yang", "Tao", "Ming", "Bo", "Chen"], f: ["Fang", "Li", "Na", "Min", "Jing", "Xiu", "Yan", "Ying", "Hui", "Mei"], last: ["Wang", "Li", "Zhang", "Liu", "Chen", "Yang", "Huang", "Zhao", "Wu", "Zhou"], familyFirst: true },
  jp: { m: ["Hiroshi", "Takashi", "Kenji", "Daisuke", "Yuki", "Haruto", "Ren", "Sota"], f: ["Yoko", "Keiko", "Yumi", "Aiko", "Haruka", "Yui", "Mio", "Sakura"], last: ["Sato", "Suzuki", "Takahashi", "Tanaka", "Watanabe", "Ito", "Yamamoto", "Nakamura"], familyFirst: true },
  kr: { m: ["Min-jun", "Ji-ho", "Seo-jun", "Hyun-woo", "Jae-won", "Dong-hyun"], f: ["Seo-yeon", "Ji-woo", "Min-seo", "Su-bin", "Ha-eun", "Ji-min"], last: ["Kim", "Lee", "Park", "Choi", "Jung", "Kang"], familyFirst: true },
  vn: { m: ["Minh", "Tuan", "Duc", "Hung", "Quang", "Nam"], f: ["Linh", "Huong", "Thao", "Mai", "Lan", "Trang"], last: ["Nguyen", "Tran", "Le", "Pham", "Hoang", "Vu"], familyFirst: true },
  in: { m: ["Rahul", "Amit", "Arjun", "Vikram", "Rohan", "Suresh", "Ravi", "Arun", "Sanjay", "Aditya"], f: ["Priya", "Anjali", "Pooja", "Sunita", "Kavya", "Neha", "Lakshmi", "Divya", "Meera", "Asha"], last: ["Kumar", "Sharma", "Singh", "Patel", "Reddy", "Gupta", "Das", "Iyer", "Nair", "Yadav"] },
  inm: { m: ["Mohammed", "Imran", "Salman", "Aamir", "Irfan", "Shahid", "Faizan", "Arif"], f: ["Ayesha", "Fatima", "Nazia", "Shabana", "Rukhsar", "Sana", "Heena", "Farah"], last: ["Khan", "Ansari", "Shaikh", "Qureshi", "Siddiqui", "Sayyed", "Pathan", "Mirza"] },
  pk: { m: ["Muhammad", "Ali", "Ahmed", "Hassan", "Imran", "Bilal", "Usman", "Hamza", "Asif", "Faisal"], f: ["Ayesha", "Fatima", "Sana", "Hina", "Zainab", "Mehwish", "Sadia", "Amna", "Iqra", "Rabia"], last: ["Khan", "Malik", "Butt", "Qureshi", "Chaudhry", "Sheikh", "Awan", "Raja", "Shah", "Abbasi"] },
  bd: { m: ["Mohammad", "Abdul", "Rafiq", "Kamal", "Habib", "Shafiq", "Jahid", "Tanvir"], f: ["Fatema", "Nasrin", "Shirin", "Rokeya", "Taslima", "Sharmin", "Nusrat", "Ruma"], last: ["Rahman", "Hossain", "Islam", "Ahmed", "Chowdhury", "Uddin", "Miah", "Sarkar"], lastF: ["Akter", "Begum", "Khatun", "Sultana", "Rahman", "Islam"] },
  np: { m: ["Ram", "Krishna", "Bikash", "Suman", "Rajesh", "Prakash", "Sanjay", "Dipak"], f: ["Sita", "Gita", "Sunita", "Anita", "Sarita", "Kamala", "Pooja", "Laxmi"], last: ["Shrestha", "Gurung", "Tamang", "Thapa", "Rai", "Magar", "Adhikari", "Karki", "Sharma", "Poudel"] },
  lk: { m: ["Nimal", "Sunil", "Kamal", "Chaminda", "Ruwan", "Sampath", "Kasun", "Lahiru"], f: ["Kumari", "Nirmala", "Dilani", "Chamari", "Sanduni", "Nadeesha", "Ishara", "Malini"], last: ["Perera", "Fernando", "de Silva", "Bandara", "Jayasinghe", "Wickramasinghe", "Gunawardena", "Dissanayake", "Herath", "Kumara"] },
  af: { m: ["Ahmad", "Mohammad", "Abdul", "Hamid", "Farid", "Najib", "Rahmatullah", "Zabiullah"], f: ["Fatima", "Mariam", "Zarghona", "Parwana", "Roya", "Nargis", "Shabnam", "Malalai"], last: ["Ahmadzai", "Popal", "Stanikzai", "Hakimi", "Noori", "Rahimi", "Sultani", "Karimi", "Wardak", "Mohammadi"] },
  fa: { m: ["Mohammad", "Ali", "Reza", "Hossein", "Mehdi", "Amir", "Hamid", "Saeed", "Arash", "Behnam"], f: ["Fatemeh", "Zahra", "Maryam", "Narges", "Shirin", "Leila", "Mahsa", "Parisa", "Sara", "Niloufar"], last: ["Mohammadi", "Hosseini", "Ahmadi", "Rezaei", "Moradi", "Karimi", "Jafari", "Rahimi", "Hashemi", "Sadeghi"] },
  arab: { m: ["Mohammed", "Ahmed", "Omar", "Youssef", "Khaled", "Karim", "Hassan", "Tariq"], f: ["Fatima", "Mariam", "Nour", "Layla", "Sara", "Huda", "Amira", "Rania"], last: ["Haddad", "Mansour", "Saleh", "Hassan", "Ibrahim", "Nasser", "Khalil", "Aziz"] },
  eg: { m: ["Mohamed", "Ahmed", "Mahmoud", "Mostafa", "Hossam", "Amr", "Karim", "Tarek", "Youssef", "Omar"], f: ["Fatma", "Mona", "Heba", "Yasmin", "Aya", "Nourhan", "Dina", "Rania", "Salma", "Mariam"], last: ["Hassan", "Ibrahim", "Mahmoud", "Abdel Rahman", "El-Sayed", "Mostafa", "Fawzy", "Salem", "Farouk", "Shawky"] },
  maghreb: { m: ["Mohamed", "Ahmed", "Youcef", "Karim", "Mehdi", "Rachid", "Sofiane", "Amine", "Hamza", "Nabil"], f: ["Fatima", "Amina", "Nadia", "Samira", "Yasmina", "Khadija", "Meriem", "Imane", "Sara", "Nawal"], last: ["Benali", "Haddad", "Bensaid", "El Amrani", "Bouzid", "Mansouri", "Cherif", "Belkacem", "Ziani", "Alaoui"] },
  sd: { m: ["Mohamed", "Ahmed", "Osman", "Omer", "Abdelrahman", "Hassan", "Mustafa", "Babiker"], f: ["Fatima", "Amna", "Huda", "Sara", "Mariam", "Hawa", "Asma", "Nafisa"], last: ["Osman", "Mohamed", "Ahmed", "Abdalla", "Elhassan", "Babiker", "Elamin", "Hamid"] },
  so: { m: ["Mohamed", "Abdi", "Ahmed", "Hassan", "Abdullahi", "Omar", "Yusuf", "Ali"], f: ["Fadumo", "Hodan", "Asha", "Amina", "Halima", "Sahra", "Khadija", "Ifrah"], last: ["Abdi", "Mohamed", "Hassan", "Ali", "Farah", "Warsame", "Jama", "Abdullahi", "Osman", "Nur"] },
  tr: { m: ["Mehmet", "Mustafa", "Ahmet", "Ali", "Hüseyin", "Hasan", "Emre", "Burak", "Murat", "İbrahim"], f: ["Ayşe", "Fatma", "Emine", "Zeynep", "Elif", "Hatice", "Merve", "Özlem", "Esra", "Leyla"], last: ["Yılmaz", "Kaya", "Demir", "Şahin", "Çelik", "Yıldız", "Yıldırım", "Öztürk", "Aydın", "Özdemir", "Arslan", "Doğan"] },
  kz: { m: ["Nurlan", "Yerlan", "Askar", "Daniyar", "Bauyrzhan", "Timur", "Arman", "Serik", "Marat", "Aidos"], f: ["Aigerim", "Aliya", "Dinara", "Gulnara", "Saule", "Zhanna", "Madina", "Aizhan", "Asel", "Kamila"], last: ["Nurmagambetov", "Abenov", "Akhmetov", "Seitkali", "Zhakupov", "Omarov", "Sadykov", "Bekov", "Kassymov", "Iskakov"], gendered: "ru" },
  uz: { m: ["Rustam", "Jasur", "Bakhtiyor", "Sherzod", "Dilshod", "Farrukh", "Aziz", "Bekzod", "Otabek", "Akmal"], f: ["Dilnoza", "Nigora", "Gulnoza", "Malika", "Feruza", "Zarina", "Madina", "Shahnoza", "Mohira", "Nodira"], last: ["Karimov", "Rakhimov", "Yusupov", "Tursunov", "Abdullayev", "Nazarov", "Saidov", "Akhmedov", "Ismoilov", "Ergashev"], gendered: "ru" },
  il: { m: ["David", "Yosef", "Noam", "Ariel", "Itai"], f: ["Noa", "Tamar", "Yael", "Maya", "Shira"], last: ["Cohen", "Levi", "Mizrahi", "Peretz", "Biton"] },
  ha: { m: ["Musa", "Ibrahim", "Abubakar", "Usman", "Aliyu", "Sani", "Bello", "Yusuf"], f: ["Aisha", "Fatima", "Hauwa", "Zainab", "Amina", "Hadiza", "Maryam", "Halima"], last: ["Abubakar", "Bello", "Ibrahim", "Musa", "Usman", "Aliyu", "Garba", "Danjuma"] },
  yo: { m: ["Tunde", "Olumide", "Adewale", "Babatunde", "Segun", "Femi", "Kayode", "Samuel"], f: ["Folake", "Funmilayo", "Yetunde", "Bukola", "Adeola", "Titilayo", "Kemi", "Blessing"], last: ["Adeyemi", "Ogunleye", "Adebayo", "Olawale", "Ogunbiyi", "Afolabi", "Adeleke", "Oyelaran"] },
  ig: { m: ["Chinedu", "Emeka", "Obinna", "Chukwuemeka", "Ikenna", "Nnamdi", "Uchenna", "Kelechi"], f: ["Ngozi", "Chioma", "Adaeze", "Nkechi", "Amaka", "Ifeoma", "Chiamaka", "Grace"], last: ["Okafor", "Okeke", "Nwosu", "Eze", "Okonkwo", "Obi", "Nwachukwu", "Onyeka"] },
  gh: { m: ["Kwame", "Kofi", "Kwabena", "Yaw", "Kwaku", "Kojo", "Emmanuel", "Isaac"], f: ["Ama", "Akosua", "Abena", "Adwoa", "Afua", "Esi", "Efua", "Yaa"], last: ["Mensah", "Owusu", "Boateng", "Asante", "Osei", "Appiah", "Agyeman", "Addo", "Ofori", "Amoah"] },
  ke: { m: ["John", "Peter", "Joseph", "David", "Brian", "Kevin", "Dennis", "James"], f: ["Mary", "Grace", "Faith", "Mercy", "Esther", "Lucy", "Ann", "Joyce"], last: ["Kamau", "Mwangi", "Otieno", "Ochieng", "Wanjiku", "Kiprop", "Mutua", "Njoroge", "Kariuki", "Omondi", "Kibet", "Wafula"] },
  tz: { m: ["Juma", "Hamisi", "Baraka", "Emmanuel", "John", "Joseph", "Said", "Rashidi"], f: ["Neema", "Rehema", "Mwanaidi", "Grace", "Zawadi", "Upendo", "Amina", "Halima"], last: ["Mwakyusa", "Mushi", "Massawe", "Mollel", "Juma", "Mfinanga", "Kimaro", "Swai"] },
  ug: { m: ["John", "Moses", "Joseph", "Ronald", "Isaac", "Patrick", "Godfrey", "Emmanuel"], f: ["Sarah", "Grace", "Esther", "Florence", "Agnes", "Prossy", "Joan", "Harriet"], last: ["Okello", "Mugisha", "Kato", "Ssempala", "Tumusiime", "Byaruhanga", "Mukasa", "Odongo"], lastF: ["Nakato", "Namubiru", "Nansubuga", "Namutebi", "Akello", "Atim", "Kyomuhendo", "Tumusiime"] },
  za: { m: ["Sipho", "Thabo", "Bongani", "Mandla", "Themba", "Sibusiso", "Lwazi", "Kagiso"], f: ["Nomvula", "Thandeka", "Zanele", "Lerato", "Nokuthula", "Palesa", "Ayanda", "Busisiwe"], last: ["Nkosi", "Dlamini", "Ndlovu", "Khumalo", "Mokoena", "Mahlangu", "Zulu", "Mthembu", "Sithole", "Mabaso"] },
  zaa: { m: ["Johan", "Pieter", "Willem", "Hendrik", "Jacques", "Riaan"], f: ["Annelie", "Marietjie", "Elsa", "Liezel", "Anika", "Karin"], last: ["van der Merwe", "Botha", "Pretorius", "Nel", "du Plessis", "Venter", "Coetzee", "Steyn"] },
  // East and southern Africa, where a country has no list of its own
  afe: { m: ["John", "Joseph", "Peter", "Moses", "Emmanuel", "Charles", "Patrick", "Godfrey", "Blessings", "Chikondi"], f: ["Mary", "Grace", "Esther", "Ruth", "Chisomo", "Memory", "Precious", "Agnes", "Mercy", "Tendai"], last: ["Banda", "Phiri", "Mwale", "Tembo", "Zulu", "Moyo", "Ncube", "Chirwa", "Sibanda", "Mutasa"] },
  afw: { m: ["Jean", "Moussa", "Mamadou", "Pierre", "Ibrahima", "Joseph", "Patrice"], f: ["Aminata", "Marie", "Fatou", "Grace", "Mariam", "Awa", "Christelle"], last: ["Diallo", "Traoré", "Koné", "Ndiaye", "Ouédraogo", "Sow", "Camara", "Coulibaly"] },
  cd: { m: ["Jean", "Patrice", "Joseph", "Pierre", "Christian", "Didier", "Papy", "Héritier"], f: ["Marie", "Christelle", "Grâce", "Esther", "Nathalie", "Joséphine", "Ruth", "Rachel"], last: ["Mukendi", "Ilunga", "Kasongo", "Tshibangu", "Mbuyi", "Kalala", "Lukusa", "Kabongo", "Ngoy", "Mutombo"] },
  ao: { m: LUSO_M, f: LUSO_F, last: ["dos Santos", "Fernandes", "da Silva", "Neto", "Kiala", "Mbala", "Kassoma", "Domingos", "Sebastião", "Lourenço"] },
  mz: { m: LUSO_M, f: LUSO_F, last: ["Macuácua", "Cossa", "Sitoe", "Mondlane", "Machava", "Nhantumbo", "Mabunda", "Tembe", "Muianga", "Langa"] },
  mdg: { m: ["Hery", "Rivo", "Tiana", "Mamy", "Fidy", "Haja", "Solofo", "Andry"], f: ["Fanja", "Haingo", "Lalaina", "Nirina", "Voahangy", "Hanta", "Miora", "Tahina"], last: ["Rakotomalala", "Randrianarisoa", "Rasolofo", "Rakotondrabe", "Andriamampionona", "Razafindrakoto", "Ravelojaona", "Rajaonarison"] },
  eth: { m: ["Abebe", "Dawit", "Tesfaye", "Yohannes", "Bereket"], f: ["Tigist", "Hiwot", "Selam", "Meron", "Bethlehem"], last: ["Bekele", "Tadesse", "Girma", "Haile", "Alemu"] },
  es: { m: ["José", "Luis", "Carlos", "Juan", "Diego", "Miguel", "Jorge", "Andrés"], f: ["María", "Ana", "Lucía", "Sofía", "Carmen", "Valentina", "Gabriela", "Rosa"], last: ["García", "Rodríguez", "Martínez", "López", "González", "Hernández", "Pérez", "Sánchez", "Ramírez", "Torres"] },
  pt: { m: ["João", "Pedro", "Lucas", "Gabriel", "Rafael", "Tiago", "Mateus"], f: ["Ana", "Beatriz", "Juliana", "Fernanda", "Larissa", "Mariana", "Camila"], last: ["Silva", "Santos", "Oliveira", "Souza", "Pereira", "Costa", "Ferreira", "Almeida"] },
  en: { m: ["James", "John", "Michael", "David", "Robert", "Daniel", "Chris", "Matthew"], f: ["Mary", "Jennifer", "Sarah", "Emily", "Jessica", "Emma", "Laura", "Linda"], last: ["Smith", "Johnson", "Williams", "Brown", "Jones", "Miller", "Davis", "Wilson", "Taylor", "Clark"] },
  de: { m: ["Thomas", "Michael", "Andreas", "Stefan", "Lukas", "Jonas"], f: ["Anna", "Julia", "Katrin", "Sabine", "Lena", "Laura"], last: ["Müller", "Schmidt", "Schneider", "Fischer", "Weber", "Meyer", "Wagner", "Becker"] },
  fr: { m: ["Jean", "Pierre", "Nicolas", "Julien", "Thomas", "Antoine"], f: ["Marie", "Camille", "Julie", "Sophie", "Léa", "Chloé"], last: ["Martin", "Bernard", "Dubois", "Durand", "Lefebvre", "Moreau", "Laurent", "Simon"] },
  it: { m: ["Marco", "Giuseppe", "Luca", "Alessandro", "Matteo", "Andrea"], f: ["Giulia", "Francesca", "Chiara", "Sara", "Elena", "Martina"], last: ["Rossi", "Russo", "Ferrari", "Esposito", "Bianchi", "Romano"] },
  ru: { m: ["Alexander", "Sergei", "Dmitry", "Andrei", "Alexei", "Vladimir", "Mikhail", "Ivan", "Nikolai", "Yuri", "Maxim", "Pavel"], f: ["Elena", "Olga", "Tatiana", "Natalia", "Irina", "Svetlana", "Anna", "Maria", "Yulia", "Ekaterina", "Anastasia", "Lyudmila"], last: ["Ivanov", "Smirnov", "Kuznetsov", "Popov", "Vasiliev", "Petrov", "Sokolov", "Mikhailov", "Novikov", "Fedorov", "Morozov", "Volkov", "Lebedev", "Kozlov", "Pavlov", "Orlov"], gendered: "ru" },
  ua: { m: ["Oleksandr", "Andriy", "Serhiy", "Volodymyr", "Mykola", "Dmytro", "Yuriy", "Vasyl", "Ivan", "Taras"], f: ["Olena", "Natalia", "Tetiana", "Iryna", "Oksana", "Svitlana", "Yulia", "Halyna", "Kateryna", "Olha"], last: ["Melnyk", "Shevchenko", "Kovalenko", "Bondarenko", "Tkachenko", "Kravchenko", "Oliynyk", "Boyko", "Kovalchuk", "Lysenko", "Moroz", "Petrenko"] },
  pl: { m: ["Piotr", "Krzysztof", "Andrzej", "Tomasz", "Paweł", "Marcin", "Michał", "Jan", "Marek", "Jakub"], f: ["Anna", "Maria", "Katarzyna", "Małgorzata", "Agnieszka", "Barbara", "Ewa", "Magdalena", "Joanna", "Monika"], last: ["Nowak", "Kowalski", "Wiśniewski", "Wójcik", "Kowalczyk", "Kamiński", "Lewandowski", "Zieliński", "Szymański", "Woźniak", "Dąbrowski", "Kozłowski"], gendered: "pl" },
  // the rest of eastern Europe
  sl: { m: ["Alexei", "Dmitri", "Sergei", "Ivan", "Andrej", "Petr", "Nikola", "Pavel"], f: ["Olga", "Natalia", "Elena", "Anna", "Irina", "Marta", "Svetlana", "Jana"], last: ["Ivanov", "Petrov", "Popov", "Novak", "Horvat", "Kovač", "Dimitrov", "Marković"], gendered: "ru" },
  no: { m: ["Lars", "Erik", "Anders", "Jan", "Mikko", "Daan"], f: ["Anna", "Ingrid", "Sofie", "Emma", "Eva", "Sanne"], last: ["Johansson", "Hansen", "Nielsen", "Larsen", "Virtanen", "de Jong", "Andersson", "Berg"] },
  id: { m: ["Budi", "Agus", "Ahmad", "Rizky", "Hafiz", "Dedi"], f: ["Siti", "Dewi", "Nur", "Putri", "Aisyah", "Rina"], last: ["Santoso", "Wijaya", "Hidayat", "Abdullah", "Rahman", "Saputra"] },
  ph: { m: ["Jose", "Mark", "John Paul", "Christian", "Joel"], f: ["Maria", "Angelica", "Kristine", "Joy", "Mary Grace"], last: ["Santos", "Reyes", "Cruz", "Bautista", "Garcia", "Mendoza"] },
  th: { m: ["Somchai", "Anan", "Kittisak", "Prasert", "Niran"], f: ["Malee", "Siriporn", "Kanya", "Ploy", "Nok"], last: ["Saetang", "Srisuk", "Wongsa", "Chaiyaporn", "Boonmee"] },
  mm: { m: ["Aung", "Kyaw", "Zaw", "Min", "Htet", "Thant", "Soe", "Myo", "Naing", "Tun", "Thura", "Lin"], f: ["Thida", "Nilar", "Khin", "Su", "Aye", "Hnin", "Myat", "Ei", "Phyu", "Thandar", "Yadanar", "Nwe"], last: [], noFamily: true },
};

// A country's name tradition, or its traditions and their shares of births.
const BY_ISO: Record<string, string | [string, number][]> = {
  CHN: "cn", HKG: "cn", MAC: "cn", SGP: "cn", JPN: "jp", KOR: "kr", PRK: "kr", VNM: "vn",
  IND: [["in", 0.85], ["inm", 0.15]], PAK: "pk", BGD: "bd", NPL: "np", LKA: "lk", AFG: "af", IRN: "fa",
  EGY: "eg", DZA: "maghreb", MAR: "maghreb", TUN: "maghreb", LBY: "maghreb", SDN: "sd", SOM: "so",
  TUR: "tr", AZE: "tr", KAZ: "kz", KGZ: "kz", UZB: "uz", TJK: "uz", TKM: "uz", ISR: "il",
  NGA: [["ha", 0.45], ["yo", 0.28], ["ig", 0.27]], GHA: "gh", KEN: "ke", TZA: "tz", UGA: "ug",
  ZAF: [["za", 0.88], ["zaa", 0.12]], COD: "cd", COG: "cd", AGO: "ao", MOZ: "mz", MDG: "mdg",
  ETH: "eth", ERI: "eth", BRA: "pt", PRT: "pt", GNB: "pt",
  USA: [["en", 0.86], ["es", 0.14]], CAN: [["en", 0.78], ["fr", 0.22]],
  GBR: "en", AUS: "en", NZL: "en", IRL: "en", JAM: "en", TTO: "en", PNG: "en",
  DEU: "de", AUT: "de", CHE: "de", FRA: "fr", BEL: "fr", LUX: "fr", HTI: "fr", ITA: "it", ESP: "es",
  RUS: "ru", BLR: "ru", UKR: "ua", POL: "pl",
  SWE: "no", NOR: "no", DNK: "no", FIN: "no", NLD: "no", ISL: "no",
  IDN: "id", MYS: "id", BRN: "id", PHL: "ph", THA: "th", LAO: "th", KHM: "th", MMR: "mm",
  CIV: "afw", CMR: "afw", SEN: "afw", MLI: "afw", BFA: "afw", NER: "afw", GIN: "afw", TCD: "afw", BEN: "afw", TGO: "afw", RWA: "afw", BDI: "afw", GAB: "afw", CAF: "afw", MRT: "afw",
};

const BY_REGION: Record<string, string> = { SAS: "in", MEA: "arab", ECS: "sl", LCN: "es", NAC: "en", SSF: "afe", EAS: "cn" };

/**
 * The name tradition a family in this country follows. Where a country has several, the
 * choice comes from its own stream, so adding names never changes the rest of a life.
 */
export function nameGroupFor(iso: string, region: string, seed: number, ...keys: (string | number)[]): string {
  const m = BY_ISO[iso] ?? BY_REGION[region] ?? "en";
  if (typeof m === "string") return m;
  return stream(seed, "name-group", iso, ...keys).weighted(m, ([, w]) => w)[0];
}

function feminine(last: string, kind: NameGroup["gendered"]): string {
  if (kind === "pl") return last.replace(/(sk|ck|dzk)i$/, "$1a");
  if (kind === "ru") return /sky$/.test(last) ? last.replace(/sky$/, "skaya") : /(ov|ev|in|yn)$/.test(last) ? `${last}a` : last;
  return last;
}

/** Two different parts of a personal name from one draw, for traditions without family names. */
function twoPart(pool: string[], u: number): string {
  const k = Math.floor(u * pool.length * (pool.length - 1));
  const a = k % pool.length;
  const b = (a + 1 + Math.floor(k / pool.length)) % pool.length;
  return `${pool[a]} ${pool[b]}`;
}

/** A newborn's name. Always two draws from `rng`, whatever the tradition. */
export function makeName(group: string, sex: Sex, rng: Rng): { full: string; given: string; family: string } {
  const g = G[group] ?? G.en;
  const pool = sex === "M" ? g.m : g.f;
  if (g.noFamily) {
    const full = twoPart(pool, rng.next());
    rng.next();
    return { full, given: full, family: "" };
  }
  const given = rng.pick(pool);
  const lasts = sex === "F" && g.lastF ? g.lastF : g.last;
  let last = rng.pick(lasts);
  if (last === given) last = lasts[(lasts.indexOf(last) + 1) % lasts.length];
  if (sex === "F") last = feminine(last, g.gendered);
  return { full: g.familyFirst ? `${last} ${given}` : `${given} ${last}`, given, family: last };
}

/** A first name for a partner or a child. One draw from `rng`. */
export function givenName(group: string, sex: Sex, rng: Rng): string {
  const g = G[group] ?? G.en;
  const pool = sex === "M" ? g.m : g.f;
  return g.noFamily ? twoPart(pool, rng.next()) : rng.pick(pool);
}
