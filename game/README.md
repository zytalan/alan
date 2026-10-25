# Lot in Life

A life simulator about money, built on real economic history. Inspired by
[1 in 8 Billion](https://1in8b.life/en/): you're born somewhere at random, the way
real babies are, and live one year at a time. The difference is what you decide. Here
the choices are financial — jobs, school, businesses, savings, stocks, property,
bitcoin, debt — and the end of the game tells you how much of the outcome was luck and
how much was you.

## Two ways to play

- **Be born.** Your country is drawn weighted by how many babies each country had that
  year (World Bank births), your family's place in the income distribution is random,
  and your era is 1950–1975, 1976–2000 or 2026. Every year up to 2025 replays real
  history for your country: wages, inflation, interest rates, exchange rates, stock and
  housing returns, crashes, bank freezes, wars.
- **Go back.** Pick a year (1960–2015), a country and a family background, and wake up
  at 18 knowing what's coming. The game shows the headlines and market moves you
  remember. The catch is the path: you start with little money, may not have a bank
  account or access to the stock market, capital controls can block foreign assets, life
  shocks force sales at the bottom, and exchanges like Mt. Gox can take your coins.

## The trading desk

From 18, with a bank account and a stock market to reach, you can open a brokerage
account and play any year month by month. Move money in from savings, buy and sell
your country's index fund, the S&P 500 (where capital controls allow) and listed
companies, set limit and stop-loss orders, and press "run until something happens" to
skip to the next fill, 10% move or major headline. Orders fill at the month's average
price plus a spread and the commission of the era (1.5% before 1975, 0.05% today);
index funds charge the fees of their day and pay dividends. There is no borrowing and
no short selling. Leave the desk and the rest of the year plays out on its own; gains
are taxed at year end and the account counts in your net worth.

Companies are fictional, but each belongs to a real US industry and moves with it
month by month (Kenneth French's 49 industry portfolios since 1926), on top of your
country's index and its own luck: listings, takeovers, breakout years and
bankruptcies, which come more often in crashes and, for banks, in banking crises.

Default-you never opens the desk, so trading skill and trading mistakes show up in
your grade.

## What you see

Birth starts with the lottery itself: a dot map of the world (Equal Earth projection)
with a circle for each country sized by its share of that year's births, hopping
between likely countries before it lands on yours, and a certificate with your odds.
While you live, your net worth sits on a coin whose metal shows how many years of a
typical local wage you own (copper under one, silver, gold, platinum from ten), its
digits roll as it changes, and a strip shows every year of your life coloured from debt
to wealth, with marks for your milestones and the world's headlines; pick a year to
jump to it in the ledger. Each New Year's Eve a front page sums up the year just gone:
its biggest story, what the stock market did month by month, and your own news. The
statement ends with your best coin and the whole strip.

Names follow the traditions of the 40 countries where most babies are born, including
the main communities inside a country (Hausa, Yoruba and Igbo in Nigeria; Hindu and
Muslim names in India), feminine forms of Russian and Polish family names, and
Myanmar's names without a family name. Partners and children usually share your
family's tradition.

## How a life is scored

When you die, the game replays your life three ways with the same seed (same birth,
same health draws, same markets):

- **Default you** makes the most common choice at every turn.
- **Index-fund you** makes those choices but saves into a broad index and never panics.
- **250 other people** born the same year — anywhere in the world, and in your country.

Average real net worth across adult life is split into three multipliers: where you were
born (your country's median vs. the world's), family and fortune (default-you vs. your
country's median) and your choices (you vs. default-you). The grade S–D measures only
the last one. Time travellers also see what perfect hindsight would have made from the
same savings.

## Run it

```
npm install
npm run dev        # play at http://localhost:5173
npm test           # engine tests (determinism, calibration, money rules)
npm run sim        # simulate 300 lives and print wealth and lifespan distributions
npm run build      # static site in dist/
```

Rebuilding the data needs Python 3 with `pandas`, `xlrd` and `babel`:

```
npm run data       # downloads raw sources to pipeline/raw/, writes public/data/world.json
```

## Data

| Source | Used for | License |
|---|---|---|
| World Bank, World Development Indicators | births, population, life expectancy, infant and child mortality, GDP per capita (PPP and local currency), inflation, exchange rates, deposit and lending rates, GDP growth, Gini, school enrollment, account ownership, employment structure, health spending, battle deaths | CC BY 4.0 |
| OECD Financial Market statistics | share prices, short and long interest rates, exchange rates for 49 countries | OECD terms, attribution |
| Jordà–Schularick–Taylor Macrohistory Database (R6) | stock, bond and housing total returns, rental yields and banking crises for 18 countries, 1870–2020 | CC BY-NC-SA 4.0 (non-commercial) |
| Aswath Damodaran, NYU Stern | US stocks, bills, bonds, home prices and gold, 1928–2025 | free with attribution |
| blockchain.com charts API | Bitcoin price from 2010 | check terms before commercial use |
| OECD Financial Market statistics, monthly | share price indices for 45 countries, for the trading desk | OECD terms, attribution |
| Robert J. Shiller, Irrational Exuberance data | monthly S&P 500 prices and dividends since 1871 | free, cite Shiller |
| Kenneth R. French Data Library | monthly returns of 49 US industry portfolios since 1926 | free, cite the library |
| Natural Earth 1:110m, via world-atlas | land and country shapes for the birth lottery map (`npm run geo` writes `src/ui/geo.ts`) | public domain |

`src/engine/history.ts` adds what the datasets don't carry: headline events, deposit
freezes (Brazil 1990, Argentina 2001, Cyprus 2013, Lebanon 2019…), wars before 1989,
capital controls, university closures and pyramid-scheme waves. The Shanghai Composite's
1990s closes are filled in by hand because the OECD series starts in 2000.

What is simulated rather than replayed: markets in countries with no stock-market data,
gaps in the data, and every year after 2025, drawn from each country's own history.
On the desk, simulated months are drawn so they compound exactly to the year's return
the life engine uses; real months replay the monthly averages in the data. Companies
are fictional; their returns are drawn so that most trail the index and a few carry it.

Where a currency was redenominated so often that old amounts read as zero (Brazil before
1993, the Soviet ruble), money is shown in today's US dollars, marked with ≈. Before a
country's income records begin, wages follow its real income per person, so values in
today's money stay comparable across countries. Taiwan, Venezuela, North Korea, Cuba, Yemen, South Sudan
and Eritrea are missing because the World Bank has no usable economic series for them.

## Layout

```
pipeline/   fetch.py, build.py — raw downloads → public/data/world.json and markets.json
            (monthly history, loaded the first time you open the desk)
src/engine/ the simulation (no UI): economy paths, mortality, careers, businesses,
            events, the yearly loop, automatic players, the end-of-life report;
            markets.ts (monthly prices, companies) and desk.ts (the trading account)
src/ui/     React screens: start, birth lottery and certificate, ledger, decisions,
            trading desk, statement; the coin, life strip and front page
scripts/    simulate.ts and trace.ts for balancing, geo.mjs for the map,
            artifact-page.mjs for publishing
tests/      vitest suite
```
