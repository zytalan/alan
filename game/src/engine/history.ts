// Hand-curated historical record that the datasets don't carry: headline
// events shown in the life log, deposit freezes, wars before 1989 (World
// Bank battle-death data starts then), capital controls and pyramid-scheme
// waves. Dates are from the public record.

export interface HistoryNote {
  year: number;
  text: string;
  iso?: string[]; // omitted = worldwide
}

const EURO = ["DEU", "FRA", "ITA", "ESP", "NLD", "BEL", "AUT", "PRT", "FIN", "IRL", "GRC"];
const ASIA97 = ["THA", "IDN", "KOR", "MYS", "PHL"];
const LATAM82 = ["MEX", "ARG", "BRA", "CHL", "PER", "COL", "ECU", "BOL", "URY"];

export const HISTORY: HistoryNote[] = [
  { year: 1964, iso: ["JPN"], text: "Tokyo hosts the Olympics and the bullet train opens." },
  { year: 1966, iso: ["CHN"], text: "The Cultural Revolution begins. Universities close their doors." },
  { year: 1971, text: "Nixon ends the dollar's convertibility to gold. Gold begins to float." },
  { year: 1971, iso: ["BGD"], text: "Bangladesh wins independence after a brutal war." },
  { year: 1973, text: "The oil embargo quadruples oil prices. Inflation takes off worldwide." },
  { year: 1974, iso: ["BGD"], text: "Famine sweeps Bangladesh." },
  { year: 1975, iso: ["KHM"], text: "The Khmer Rouge take power and abolish money." },
  { year: 1975, iso: ["LBN"], text: "Civil war breaks out in Lebanon." },
  { year: 1976, iso: ["USA"], text: "Vanguard launches the first index fund for ordinary investors." },
  { year: 1977, iso: ["CHN"], text: "The national university entrance exam returns after 11 years." },
  { year: 1978, iso: ["CHN"], text: "Reform and opening-up begins." },
  { year: 1979, text: "A second oil shock hits." },
  { year: 1979, iso: ["IRN"], text: "The Islamic Revolution topples the Shah." },
  { year: 1979, iso: ["GBR"], text: "Britain abolishes exchange controls." },
  { year: 1980, text: "Gold spikes to $850 an ounce in January." },
  { year: 1980, iso: ["CHN"], text: "Shenzhen becomes a Special Economic Zone." },
  { year: 1980, iso: ["GBR"], text: "Right to Buy lets council tenants buy their homes." },
  { year: 1981, iso: ["USA"], text: "The Fed pushes interest rates toward 20% to break inflation." },
  { year: 1982, iso: LATAM82, text: "Mexico defaults. The Latin American debt crisis begins." },
  { year: 1984, iso: ["ETH"], text: "Famine devastates Ethiopia." },
  { year: 1985, text: "The Plaza Accord pushes the dollar down. The yen soars." },
  { year: 1986, iso: ["VNM"], text: "Đổi Mới reforms open Vietnam's economy." },
  { year: 1986, iso: ["GBR"], text: "The 'Big Bang' deregulates the City of London." },
  { year: 1987, text: "Black Monday: the Dow falls 22.6% in a single day." },
  { year: 1989, text: "The Berlin Wall falls." },
  { year: 1989, iso: ["JPN"], text: "The Nikkei peaks near 39,000. It won't see that level again for 34 years." },
  { year: 1989, iso: ["ARG"], text: "Hyperinflation: prices rise over 3,000% in a year." },
  { year: 1990, iso: ["CHN"], text: "The Shanghai Stock Exchange opens." },
  { year: 1990, iso: ["BRA"], text: "Plano Collor freezes most bank savings for 18 months." },
  { year: 1990, iso: ["DEU"], text: "Germany reunifies." },
  { year: 1991, iso: ["IND"], text: "A currency crisis forces India to open up its economy." },
  { year: 1991, iso: ["ARG"], text: "The peso is pegged one-to-one to the dollar." },
  { year: 1991, iso: ["RUS", "UKR", "KAZ", "BLR", "UZB", "GEO", "ARM", "AZE"], text: "The Soviet Union dissolves." },
  { year: 1992, iso: ["CHN"], text: "Deng Xiaoping's southern tour reignites reform." },
  { year: 1992, iso: ["GBR"], text: "Black Wednesday: the pound crashes out of Europe's exchange-rate mechanism." },
  { year: 1992, iso: ["IND"], text: "The Harshad Mehta scam bursts India's stock bubble." },
  { year: 1992, iso: ["RUS"], text: "Prices are freed. Russian inflation tops 2,000%." },
  { year: 1993, iso: ["USA"], text: "The first US exchange-traded fund, SPY, starts trading." },
  { year: 1994, iso: ["MEX"], text: "The Tequila crisis: the peso loses half its value." },
  { year: 1994, iso: ["BRA"], text: "The Real Plan ends hyperinflation." },
  { year: 1994, iso: ["ZAF"], text: "Apartheid ends. Nelson Mandela becomes president." },
  { year: 1994, iso: ["RWA"], text: "Genocide in Rwanda." },
  { year: 1995, text: "The web goes mainstream. Netscape's IPO kicks off the dot-com era." },
  { year: 1997, iso: ASIA97, text: "The Asian financial crisis: currencies collapse across the region." },
  { year: 1997, iso: ["JPN"], text: "Yamaichi Securities, one of Japan's big four brokers, collapses." },
  { year: 1997, iso: ["ALB"], text: "Pyramid schemes that swallowed most of Albania's savings collapse." },
  { year: 1998, iso: ["RUS"], text: "Russia defaults on its debt. The ruble collapses." },
  { year: 1998, iso: ["IDN"], text: "The rupiah has lost about 80% of its value. Suharto falls." },
  { year: 1998, iso: ["KOR"], text: "Koreans donate their gold jewelry to help repay the IMF." },
  { year: 1998, iso: ["CHN"], text: "Housing reform: homes become something you can buy." },
  { year: 1999, iso: EURO, text: "The euro is born." },
  { year: 2000, text: "The dot-com bubble bursts. The Nasdaq will fall 78% from its peak." },
  { year: 2001, iso: ["CHN"], text: "China joins the World Trade Organization." },
  { year: 2001, iso: ["ARG"], text: "The corralito: Argentina freezes bank deposits. The dollar peg breaks weeks later." },
  { year: 2001, iso: ["TUR"], text: "A banking crisis sends the lira into free fall." },
  { year: 2002, iso: EURO, text: "Euro notes and coins go into circulation." },
  { year: 2003, iso: ["IRQ"], text: "War in Iraq." },
  { year: 2007, text: "The iPhone launches. US subprime mortgages start to default." },
  { year: 2008, text: "Lehman Brothers collapses. Global markets crash." },
  { year: 2008, iso: ["CHN"], text: "A ¥4 trillion stimulus floods the economy." },
  { year: 2008, iso: ["ISL"], text: "Iceland's three big banks collapse within a week." },
  { year: 2008, iso: ["ZWE"], text: "Zimbabwe's inflation reaches an estimated 89.7 sextillion percent." },
  { year: 2009, text: "Bitcoin's first block is mined." },
  { year: 2009, iso: ["ZWE"], text: "Zimbabwe abandons its own currency for the US dollar." },
  { year: 2010, text: "Someone pays 10,000 bitcoins for two pizzas." },
  { year: 2010, iso: ["GRC", "IRL", "PRT", "ESP", "ITA"], text: "Greece needs a bailout. The euro crisis begins." },
  { year: 2011, text: "Gold peaks above $1,900." },
  { year: 2011, iso: ["SYR"], text: "Civil war begins in Syria." },
  { year: 2012, iso: EURO, text: "\"Whatever it takes\": the ECB promises to save the euro." },
  { year: 2013, iso: ["CYP"], text: "Cyprus seizes part of large bank deposits to rescue its banks." },
  { year: 2013, iso: ["JPN"], text: "Abenomics: the Bank of Japan starts printing money." },
  { year: 2014, text: "Mt. Gox, the biggest Bitcoin exchange, collapses. 850,000 bitcoins are missing." },
  { year: 2014, iso: ["RUS"], text: "Sanctions and an oil crash halve the ruble." },
  { year: 2014, iso: ["UKR"], text: "War comes to eastern Ukraine." },
  { year: 2015, iso: ["CHN"], text: "China's stock bubble bursts: Shanghai falls over 40% in two months." },
  { year: 2015, iso: ["GRC"], text: "Greece closes its banks and caps ATM withdrawals at €60 a day." },
  { year: 2016, iso: ["IND"], text: "Demonetisation: 86% of India's cash becomes invalid overnight." },
  { year: 2016, iso: ["GBR"], text: "Britain votes to leave the EU. The pound falls to a 31-year low." },
  { year: 2016, iso: ["EGY"], text: "Egypt floats the pound. It halves overnight." },
  { year: 2016, iso: ["NGA"], text: "Oil prices collapse and the naira loses a third of its value." },
  { year: 2017, text: "Bitcoin rises from $1,000 to nearly $20,000 in a year." },
  { year: 2018, iso: ["TUR"], text: "Currency crisis: the lira loses nearly 30% of its value." },
  { year: 2018, iso: ["IRN"], text: "Sanctions return. The rial collapses." },
  { year: 2019, iso: ["LBN"], text: "Lebanon's banks freeze dollar withdrawals. Savings become 'lollars'." },
  { year: 2019, iso: ["ARG"], text: "Capital controls return to Argentina." },
  { year: 2020, text: "COVID-19 shuts down the world. Markets crash 34% in a month, then roar back." },
  { year: 2021, text: "Meme stocks and crypto mania. Bitcoin passes $60,000." },
  { year: 2021, iso: ["CHN"], text: "Evergrande defaults. China's property boom is over." },
  { year: 2021, iso: ["TUR"], text: "The lira loses 44% in a year as inflation soars." },
  { year: 2021, iso: ["AFG"], text: "The Taliban retake Kabul." },
  { year: 2021, iso: ["MMR"], text: "A military coup in Myanmar." },
  { year: 2022, text: "Inflation hits 40-year highs. Russia invades Ukraine. The crypto exchange FTX collapses." },
  { year: 2022, iso: ["LKA"], text: "Sri Lanka defaults. Fuel queues stretch for miles." },
  { year: 2023, text: "Silicon Valley Bank fails in a 48-hour bank run." },
  { year: 2023, iso: ["ARG"], text: "Inflation passes 200%." },
  { year: 2023, iso: ["NGA"], text: "The naira is floated and loses over half its value." },
  { year: 2023, iso: ["SDN"], text: "War breaks out in Sudan." },
  { year: 2024, text: "Bitcoin passes $100,000." },
  { year: 2024, iso: ["JPN"], text: "The Nikkei finally beats its 1989 record." },
  { year: 2025, text: "Gold passes $4,000 an ounce." },
];

export function notesFor(iso: string, year: number): HistoryNote[] {
  return HISTORY.filter((h) => h.year === year && (!h.iso || h.iso.includes(iso)));
}

export interface DepositShock {
  iso: string;
  year: number;
  haircut: number; // share of bank cash lost
  frozenYears: number; // the rest is locked for this long
  text: string;
}

export const DEPOSIT_SHOCKS: DepositShock[] = [
  { iso: "BRA", year: 1990, haircut: 0.35, frozenYears: 2, text: "Plano Collor freezes your savings. By the time they're released, inflation has eaten a third." },
  { iso: "IDN", year: 1997, haircut: 0.1, frozenYears: 0, text: "Your bank is one of 16 closed overnight. You recover most, not all, of your money." },
  { iso: "RUS", year: 1998, haircut: 0.3, frozenYears: 1, text: "Your bank fails in the default. Part of your savings is gone for good." },
  { iso: "ECU", year: 1999, haircut: 0.4, frozenYears: 1, text: "Deposits are frozen. When they're released, the sucre is nearly worthless." },
  { iso: "ARG", year: 2001, haircut: 0.3, frozenYears: 1, text: "The corralito locks your account. Your savings come back 'pesified' at a fraction of their value." },
  { iso: "URY", year: 2002, haircut: 0.1, frozenYears: 1, text: "A bank holiday freezes your account for weeks." },
  { iso: "CYP", year: 2013, haircut: 0.2, frozenYears: 0, text: "The bail-in takes a slice of your deposits." },
  { iso: "LBN", year: 2019, haircut: 0.7, frozenYears: 3, text: "Your dollars are trapped. Withdrawals come at a fraction of their worth." },
];

/** Wars before 1989 (later years come from World Bank battle deaths). Intensity ≈ battle deaths per million people per year. */
export const WARS: { iso: string; from: number; to: number; intensity: number }[] = [
  { iso: "VNM", from: 1960, to: 1975, intensity: 2500 },
  { iso: "LAO", from: 1963, to: 1975, intensity: 800 },
  { iso: "KHM", from: 1970, to: 1979, intensity: 3000 },
  { iso: "DZA", from: 1960, to: 1962, intensity: 1500 },
  { iso: "NGA", from: 1967, to: 1970, intensity: 1200 },
  { iso: "BGD", from: 1971, to: 1971, intensity: 3000 },
  { iso: "PAK", from: 1971, to: 1971, intensity: 200 },
  { iso: "ZWE", from: 1972, to: 1979, intensity: 300 },
  { iso: "ETH", from: 1974, to: 1988, intensity: 300 },
  { iso: "AGO", from: 1975, to: 1988, intensity: 600 },
  { iso: "LBN", from: 1975, to: 1988, intensity: 2500 },
  { iso: "MOZ", from: 1977, to: 1988, intensity: 700 },
  { iso: "NIC", from: 1978, to: 1988, intensity: 900 },
  { iso: "AFG", from: 1979, to: 1988, intensity: 3000 },
  { iso: "UGA", from: 1979, to: 1986, intensity: 600 },
  { iso: "SLV", from: 1980, to: 1988, intensity: 1000 },
  { iso: "IRN", from: 1980, to: 1988, intensity: 1500 },
  { iso: "IRQ", from: 1980, to: 1988, intensity: 2500 },
  { iso: "GTM", from: 1978, to: 1988, intensity: 300 },
  { iso: "PER", from: 1982, to: 1988, intensity: 100 },
  { iso: "SDN", from: 1983, to: 1988, intensity: 500 },
  { iso: "LKA", from: 1983, to: 1988, intensity: 150 },
  { iso: "SOM", from: 1988, to: 1988, intensity: 1000 },
];

/** Years universities were closed. */
export const UNIVERSITY_CLOSED: { iso: string; from: number; to: number }[] = [
  { iso: "CHN", from: 1966, to: 1976 },
  { iso: "KHM", from: 1975, to: 1979 },
];

/** Waves of pyramid/Ponzi schemes that drew in ordinary savers. */
export const PONZI_WAVES: { iso: string; from: number; to: number; text: string }[] = [
  { iso: "ROU", from: 1992, to: 1994, text: "Caritas promises to multiply your money eightfold in three months." },
  { iso: "RUS", from: 1993, to: 1994, text: "MMM's TV ads are everywhere. Shares only ever go up." },
  { iso: "ALB", from: 1995, to: 1997, text: "Half your street has put their savings into an 'investment fund' paying 30% a month." },
  { iso: "COL", from: 2007, to: 2008, text: "DMG pays 150% returns in prepaid cards. The lines go around the block." },
  { iso: "IND", from: 2011, to: 2013, text: "A chit fund agent promises double your money in two years." },
  { iso: "CHN", from: 2014, to: 2018, text: "A peer-to-peer lending app offers 15% a year, 'guaranteed'." },
  { iso: "NGA", from: 2016, to: 2016, text: "MMM Nigeria promises 30% a month. Millions have joined." },
];

/** Capital controls on buying foreign assets: 'closed' or 'quota' (allowed, with friction). */
export const CAPITAL_CONTROLS: { iso: string; from: number; to: number; kind: "closed" | "quota" }[] = [
  { iso: "CHN", from: 1950, to: 2006, kind: "closed" },
  { iso: "CHN", from: 2007, to: 2200, kind: "quota" },
  { iso: "IND", from: 1950, to: 2003, kind: "closed" },
  { iso: "IND", from: 2004, to: 2200, kind: "quota" },
  { iso: "ARG", from: 2011, to: 2015, kind: "closed" },
  { iso: "ARG", from: 2019, to: 2024, kind: "closed" },
  { iso: "NGA", from: 2015, to: 2023, kind: "quota" },
  { iso: "EGY", from: 2012, to: 2024, kind: "quota" },
  { iso: "IRN", from: 1979, to: 2200, kind: "closed" },
  { iso: "RUS", from: 2022, to: 2200, kind: "closed" },
  { iso: "VNM", from: 1950, to: 2200, kind: "quota" },
];

export function capitalControl(iso: string, year: number): "open" | "closed" | "quota" {
  const c = CAPITAL_CONTROLS.find((x) => x.iso === iso && year >= x.from && year <= x.to);
  return c ? c.kind : "open";
}

/** Bitcoin exchange failures: share of coins held on exchanges that were lost. */
export const EXCHANGE_FAILURES: { year: number; name: string; exposure: number }[] = [
  { year: 2014, name: "Mt. Gox", exposure: 0.7 },
  { year: 2022, name: "FTX", exposure: 0.15 },
];
