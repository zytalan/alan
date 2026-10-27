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

/** Dated market headlines for the trading desk. `major` ones stop "run until something happens". */
export interface MonthNews {
  y: number;
  m: number;
  text: string;
  iso?: string[];
  major?: boolean;
  crypto?: boolean; // shown to people who hold coins, and kept off the stock charts
  metal?: boolean; // likewise, for gold and silver
}

/** A year's dated headlines for a country (worldwide ones included), in calendar order. */
export function monthNewsFor(iso: string, year: number): MonthNews[] {
  return MONTH_NEWS.filter((n) => n.y === year && !n.crypto && !n.metal && (!n.iso || n.iso.includes(iso))).sort((a, b) => a.m - b.m);
}

export const MONTH_NEWS: MonthNews[] = [
  // gold and silver, checked against the World Bank's monthly prices
  { y: 1968, m: 3, text: "Mar · The London Gold Pool collapses. Gold gets a free-market price beside the official $35.", metal: true },
  { y: 1980, m: 3, text: "27 Mar · Silver Thursday: the Hunt brothers' bet on silver collapses. Silver has lost more than half since January.", metal: true },
  { y: 1999, m: 7, text: "Jul · Gold sinks to about $250, a 20-year low, as Britain starts selling more than half its gold reserves.", metal: true },
  { y: 2004, m: 11, text: "18 Nov · The first US gold fund (an ETF) starts trading. Owning gold gets cheap.", metal: true },
  { y: 2008, m: 3, text: "13 Mar · Gold passes $1,000 an ounce.", metal: true },
  { y: 2011, m: 4, text: "Apr · Silver nears $50, its 1980 peak.", metal: true },
  { y: 2011, m: 9, text: "6 Sep · Gold peaks near $1,920, then falls for four years.", metal: true },
  { y: 2013, m: 4, text: "12–15 Apr · Gold drops 13% in two trading days, its worst fall in 30 years.", metal: true },
  { y: 2020, m: 8, text: "4 Aug · Gold passes $2,000 an ounce for the first time.", metal: true },
  { y: 2025, m: 10, text: "Oct · Gold passes $4,000 an ounce.", metal: true },
  // crypto, checked against blockchain.com's daily prices and Kraken's weekly ones
  { y: 2013, m: 11, text: "30 Nov · Bitcoin passes $1,000 for the first time.", crypto: true },
  { y: 2014, m: 2, text: "Feb · Mt. Gox, the biggest Bitcoin exchange, halts withdrawals and goes bankrupt.", crypto: true },
  { y: 2017, m: 9, text: "Sep · China orders its crypto exchanges to close.", iso: ["CHN"], crypto: true },
  { y: 2017, m: 12, text: "17 Dec · Bitcoin nears $20,000, then starts to fall.", crypto: true },
  { y: 2018, m: 12, text: "Dec · Bitcoin sinks to about $3,200, more than 80% below its peak a year earlier.", crypto: true },
  { y: 2019, m: 1, text: "Jan · QuadrigaCX, Canada's largest crypto exchange, collapses after its founder's death.", iso: ["CAN"], crypto: true },
  { y: 2021, m: 4, text: "14 Apr · Bitcoin peaks near $64,000 as Coinbase lists its shares.", crypto: true },
  { y: 2021, m: 4, text: "Apr · Thodex, a Turkish crypto exchange, shuts down and its founder flees.", iso: ["TUR"], crypto: true },
  { y: 2021, m: 5, text: "May · China moves against crypto mining. Bitcoin falls almost by half from its April peak.", crypto: true },
  { y: 2021, m: 9, text: "24 Sep · China bans all crypto transactions.", crypto: true },
  { y: 2021, m: 11, text: "9 Nov · Bitcoin peaks near $68,000.", crypto: true },
  { y: 2022, m: 5, text: "May · TerraUSD loses its dollar peg. LUNA falls from about $86 to a fraction of a cent within a week.", crypto: true },
  { y: 2022, m: 11, text: "Nov · FTX, one of the biggest crypto exchanges, freezes withdrawals and collapses.", crypto: true },
  { y: 2024, m: 1, text: "10 Jan · US regulators approve the first exchange-traded funds that hold bitcoin.", crypto: true },
  { y: 2024, m: 12, text: "5 Dec · Bitcoin passes $100,000.", crypto: true },
  { y: 2025, m: 10, text: "Oct · Bitcoin tops $124,000, a new high.", crypto: true },
  { y: 1971, m: 8, text: "15 Aug · Nixon closes the gold window. The dollar floats.", major: true },
  { y: 1973, m: 10, text: "17 Oct · Arab oil producers announce an embargo. Oil prices quadruple.", major: true },
  { y: 1974, m: 8, text: "9 Aug · Nixon resigns." },
  { y: 1979, m: 10, text: "6 Oct · Volcker's Fed turns to crushing inflation. Rates head for 20%.", major: true },
  { y: 1980, m: 1, text: "21 Jan · Gold hits $850 an ounce." },
  { y: 1982, m: 8, text: "12 Aug · Mexico says it can't pay its debts.", iso: LATAM82, major: true },
  { y: 1982, m: 8, text: "12 Aug · US stocks bottom. A long bull market begins.", iso: ["USA"] },
  { y: 1985, m: 9, text: "22 Sep · The Plaza Accord: the dollar is pushed down, the yen soars." },
  { y: 1987, m: 10, text: "19 Oct · Black Monday: the Dow falls 22.6% in a single day.", major: true },
  { y: 1989, m: 11, text: "9 Nov · The Berlin Wall falls." },
  { y: 1989, m: 12, text: "29 Dec · The Nikkei closes at a record 38,916.", iso: ["JPN"] },
  { y: 1990, m: 8, text: "2 Aug · Iraq invades Kuwait. Oil spikes.", major: true },
  { y: 1992, m: 9, text: "16 Sep · Black Wednesday: the pound crashes out of the European exchange rate system.", iso: ["GBR"], major: true },
  { y: 1994, m: 12, text: "20 Dec · Mexico devalues the peso. The 'tequila crisis' begins.", iso: ["MEX"], major: true },
  { y: 1997, m: 7, text: "2 Jul · Thailand floats the baht. The Asian financial crisis begins.", iso: ASIA97, major: true },
  { y: 1997, m: 10, text: "27 Oct · Hong Kong's crash spreads: the Dow falls 7% in a day." },
  { y: 1998, m: 8, text: "17 Aug · Russia defaults on its debt and devalues the ruble.", major: true },
  { y: 1998, m: 9, text: "23 Sep · Wall Street banks rescue the hedge fund LTCM." },
  { y: 2000, m: 3, text: "10 Mar · The Nasdaq peaks. The dot-com bust begins.", major: true },
  { y: 2001, m: 9, text: "11 Sep · Terrorist attacks on New York and Washington. US markets close for four days.", major: true },
  { y: 2001, m: 12, text: "1 Dec · Argentina freezes bank deposits: the corralito.", iso: ["ARG"], major: true },
  { y: 2007, m: 8, text: "9 Aug · BNP Paribas freezes three funds. Credit markets seize up." },
  { y: 2008, m: 3, text: "16 Mar · Bear Stearns is rescued in a fire sale." },
  { y: 2008, m: 9, text: "15 Sep · Lehman Brothers collapses. Panic spreads to every market.", major: true },
  { y: 2008, m: 10, text: "3 Oct · Congress passes a $700 billion bank bailout. Markets keep falling." },
  { y: 2009, m: 3, text: "9 Mar · US stocks hit their lowest close since 1996. The recovery starts the next day." },
  { y: 2010, m: 5, text: "6 May · Flash Crash: the Dow drops nearly 1,000 points in minutes.", major: true },
  { y: 2011, m: 8, text: "5 Aug · S&P strips the United States of its AAA rating.", major: true },
  { y: 2015, m: 6, text: "12 Jun · China's stock bubble peaks. Shanghai falls 40% in two months.", iso: ["CHN"], major: true },
  { y: 2015, m: 8, text: "11 Aug · China devalues the yuan." },
  { y: 2016, m: 6, text: "23 Jun · Britain votes to leave the European Union.", major: true },
  { y: 2020, m: 3, text: "Mar · COVID-19: the fastest crash in history. Central banks flood markets with money.", major: true },
  { y: 2022, m: 2, text: "24 Feb · Russia invades Ukraine.", major: true },
  { y: 2023, m: 3, text: "10 Mar · Silicon Valley Bank fails in a two-day bank run." },
];

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
const SOVIET = ["RUS", "UKR", "BLR", "KAZ", "UZB", "TKM", "KGZ", "TJK", "AZE", "ARM", "GEO", "MDA", "LTU", "LVA", "EST"];
const EASTERN_BLOC = ["POL", "HUN", "CZE", "SVK", "ROU", "BGR", "ALB", "MNG"];

export const CAPITAL_CONTROLS: { iso: string; from: number; to: number; kind: "closed" | "quota" }[] = [
  ...SOVIET.map((iso) => ({ iso, from: 1950, to: 1991, kind: "closed" as const })),
  ...EASTERN_BLOC.map((iso) => ({ iso, from: 1950, to: 1990, kind: "closed" as const })),
  { iso: "LAO", from: 1975, to: 1990, kind: "closed" },
  { iso: "KHM", from: 1975, to: 1990, kind: "closed" },
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

/**
 * Where crypto trading was banned outright, or cut off from the banks so that only
 * person-to-person deals and exchanges abroad were left. Simplified to the start and end months.
 */
export const CRYPTO_BANS: { iso: string; from: [number, number]; to?: [number, number]; kind: "closed" | "p2p"; text: string }[] = [
  { iso: "CHN", from: [2017, 9], to: [2021, 8], kind: "p2p", text: "China orders its crypto exchanges to close. Trading moves to person-to-person deals and exchanges abroad." },
  { iso: "CHN", from: [2021, 9], kind: "closed", text: "China bans all crypto transactions." },
  { iso: "IND", from: [2018, 4], to: [2020, 2], kind: "p2p", text: "India's central bank bars banks from serving crypto exchanges." },
  { iso: "NGA", from: [2021, 2], to: [2023, 12], kind: "p2p", text: "Nigeria's central bank orders banks to close crypto exchanges' accounts." },
  { iso: "BGD", from: [2014, 9], kind: "closed", text: "Bangladesh's central bank warns that dealing in bitcoin can be punished by law." },
  { iso: "BOL", from: [2014, 5], to: [2024, 6], kind: "closed", text: "Bolivia's central bank bans bitcoin." },
  { iso: "NPL", from: [2017, 8], kind: "closed", text: "Nepal's central bank declares crypto trading illegal." },
  { iso: "MAR", from: [2017, 11], kind: "closed", text: "Morocco bans crypto transactions." },
  { iso: "IRQ", from: [2017, 12], kind: "closed", text: "Iraq's central bank bans crypto trading." },
  { iso: "DZA", from: [2018, 1], kind: "closed", text: "Algeria outlaws buying, selling and holding crypto." },
  { iso: "QAT", from: [2018, 2], kind: "closed", text: "Qatar's central bank bans crypto trading." },
  { iso: "EGY", from: [2020, 9], kind: "closed", text: "Egypt bans crypto trading without a central bank licence." },
  { iso: "AFG", from: [2022, 8], kind: "closed", text: "Afghanistan bans crypto trading." },
];

/** The crypto ban in force in a country in a month, if any. */
export function cryptoBan(iso: string, year: number, month: number): (typeof CRYPTO_BANS)[number] | null {
  const k = year * 12 + month;
  return CRYPTO_BANS.find((b) => b.iso === iso && k >= b.from[0] * 12 + b.from[1] && (!b.to || k <= b.to[0] * 12 + b.to[1])) ?? null;
}

/**
 * Where private gold was restricted. "closed": no bars or coins (sell what you hold); "jewellery":
 * no bars or coins, but gold jewellery, the way most families kept gold; "coins": no bars, so
 * gold is bought as coins at a premium. `end` is the news when the rule lifts.
 */
export const GOLD_RULES: { iso: string; from: [number, number]; to: [number, number]; kind: "closed" | "jewellery" | "coins"; text: string; end?: string }[] = [
  {
    iso: "USA", from: [1933, 4], to: [1974, 12], kind: "closed",
    text: "Americans may not own gold bars or coins (Executive Order 6102, 1933).",
    end: "31 Dec 1974 · Americans may own gold again, for the first time since 1933.",
  },
  {
    iso: "IND", from: [1963, 1], to: [1990, 5], kind: "jewellery",
    text: "Gold control: Indians may not hold gold bars or coins, only jewellery.",
    end: "Jun 1990 · India repeals the Gold (Control) Act. Gold bars and coins are legal again.",
  },
  { iso: "GBR", from: [1947, 1], to: [1966, 3], kind: "coins", text: "Exchange controls keep gold bars off limits. Gold coins can be bought, at a premium." },
  { iso: "GBR", from: [1966, 4], to: [1971, 3], kind: "closed", text: "Apr 1966 · UK residents may keep at most four gold coins and can't buy more." },
  {
    iso: "GBR", from: [1971, 4], to: [1979, 10], kind: "coins",
    text: "Apr 1971 · Gold coins can be bought again, at a premium. Gold bars stay off limits.",
    end: "Oct 1979 · Exchange controls end. Gold bars are free to buy.",
  },
];

/** The gold rule in force in a country in a month, if any. */
export function goldRule(iso: string, year: number, month: number): (typeof GOLD_RULES)[number] | null {
  const k = year * 12 + month;
  return GOLD_RULES.find((b) => b.iso === iso && k >= b.from[0] * 12 + b.from[1] && k <= b.to[0] * 12 + b.to[1]) ?? null;
}

/**
 * Crypto exchanges that failed with customers' coins inside. `exposure` is the chance a trader's
 * account was there (in `where` only, when set); some creditors were repaid years later.
 */
export const CRYPTO_FAILURES: {
  at: [number, number];
  name: string;
  where?: string[];
  exposure: number;
  text: string;
  repay?: { at: [number, number]; share: number; kind: "coins" | "cash"; text: string };
}[] = [
  {
    at: [2014, 2],
    name: "Mt. Gox",
    exposure: 0.6,
    text: "Mt. Gox halts withdrawals and goes bankrupt with your coins inside.",
    repay: { at: [2024, 7], share: 0.2, kind: "coins", text: "Ten years on, Mt. Gox's trustee hands back about a fifth of the coins you lost." },
  },
  { at: [2019, 1], name: "QuadrigaCX", where: ["CAN"], exposure: 0.35, text: "QuadrigaCX collapses after its founder's death with your coins inside. Most of the money is never found." },
  { at: [2021, 4], name: "Thodex", where: ["TUR"], exposure: 0.2, text: "Thodex shuts down and its founder flees with your coins." },
  {
    at: [2022, 11],
    name: "FTX",
    exposure: 0.12,
    text: "FTX freezes withdrawals and collapses with your coins inside.",
    repay: { at: [2025, 2], share: 1.19, kind: "cash", text: "FTX's estate repays you in cash: 119% of what your coins were worth in November 2022." },
  },
];

