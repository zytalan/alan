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

`src/engine/history.ts` adds what the datasets don't carry: headline events, deposit
freezes (Brazil 1990, Argentina 2001, Cyprus 2013, Lebanon 2019…), wars before 1989,
capital controls, university closures and pyramid-scheme waves. The Shanghai Composite's
1990s closes are filled in by hand because the OECD series starts in 2000.

What is simulated rather than replayed: markets in countries with no stock-market data,
gaps in the data, and every year after 2025, drawn from each country's own history.
Companies you can buy are fictional; single-stock returns are drawn so that most trail
the index and a few carry it. Taiwan, Venezuela, North Korea, Cuba, Yemen, South Sudan
and Eritrea are missing because the World Bank has no usable economic series for them.

## Layout

```
pipeline/   fetch.py, build.py — raw downloads → public/data/world.json
src/engine/ the simulation (no UI): economy paths, mortality, careers, businesses,
            events, the yearly loop, automatic players, the end-of-life report
src/ui/     React screens: start, birth certificate, ledger, decisions, statement
scripts/    simulate.ts and trace.ts for balancing, artifact-page.mjs for publishing
tests/      vitest suite
```
