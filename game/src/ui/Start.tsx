import { useMemo, useState } from "react";
import { countryIsos, countryName, flagEmoji, country, randomSeed, usd, world, type Era, type Setup } from "../engine";
import { Rosette } from "./Rosette";
import type { PastLife, SavedLife } from "./storage";

const ERAS: { id: Era; label: string }[] = [
  { id: "any", label: "Any time" },
  { id: "past", label: "1950–75" },
  { id: "recent", label: "1976–2000" },
  { id: "now", label: "Born today" },
];

const ERA_HINT: Record<Era, string> = {
  any: "Drawn from 1950 to today.",
  past: "You'll live through the oil shocks, the Asian crisis and 2008.",
  recent: "Dot-com, the rise of China, Bitcoin.",
  now: "Born in 2026. Everything after this year is simulated.",
};

const FEATURED = ["USA", "CHN", "IND", "JPN", "GBR", "DEU", "KOR", "BRA", "NGA", "ARG", "TUR", "RUS", "IDN", "MEX", "ZAF"];

function hasMarketData(iso: string, year: number): boolean {
  const w = world();
  const m = w.markets[iso];
  if (!m) return false;
  return m.eq.slice(Math.max(0, year - w.m0)).some((v) => v != null);
}

export function Start({ onStart, lives, unfinished, onContinue }: { onStart: (s: Setup) => void; lives: PastLife[]; unfinished: SavedLife | null; onContinue: () => void }) {
  const [era, setEra] = useState<Era>("any");
  const [year, setYear] = useState(1995);
  const [iso, setIso] = useState("CHN");
  const [bg, setBg] = useState<"poor" | "middle" | "rich">("middle");
  const [code, setCode] = useState("");
  const isos = useMemo(() => countryIsos().sort((a, b) => countryName(a).localeCompare(countryName(b))), []);
  const featured = FEATURED.filter((i) => isos.includes(i));
  const marketNote = hasMarketData(iso, year)
    ? `Real stock-market history for ${countryName(iso)}.`
    : `No stock-market data for ${countryName(iso)} — its market is simulated from its economy.`;
  const codeSeed = Number(code.replace(/\D/g, ""));

  const u = unfinished?.life;
  return (
    <main className="wrap start">
      {u && (
        <section className="resume" aria-label="Your unfinished life">
          <div className="resume-who">
            <span className="eyebrow">{u.alive ? "Your unfinished life" : "Your last life ended"}</span>
            <b>
              <span aria-hidden="true">{flagEmoji(country(u.country).i2)}</span> {u.name}
            </b>
            <span className="muted">
              {countryName(u.country)} · {u.year} · age {u.age}
              {u.mode === "timetravel" ? " · time travel" : ""}
            </span>
          </div>
          <button className="btn primary" onClick={onContinue}>
            {u.alive ? "Continue" : "See the statement"}
          </button>
        </section>
      )}
      <section className="hero">
        <Rosette />
        <span className="eyebrow">A life simulator built on real economic history</span>
        <h1>Lot in Life</h1>
        <p className="lede">
          You don't choose where you're born, or when. You do choose what to do with the money. {isos.length} countries, every
          year from 1960 to 2025 replayed from real data: wages, inflation, interest rates, crashes, bubbles.
        </p>
      </section>

      <section className="modes" aria-label="Choose how to play">
        <article className="mode">
          <span className="eyebrow">The birth lottery</span>
          <h2>Be born</h2>
          <p>
            You're drawn the way real babies are: weighted by how many are born in each country that year. Your family, your era
            and your markets are luck. Your money decisions are yours.
          </p>
          <div className="field">
            <label id="era-label">When</label>
            <div className="seg" role="group" aria-labelledby="era-label">
              {ERAS.map((e) => (
                <button key={e.id} aria-pressed={era === e.id} onClick={() => setEra(e.id)}>
                  {e.label}
                </button>
              ))}
            </div>
            <span className="note">{ERA_HINT[era]}</span>
          </div>
          <div className="row">
            <button className="btn primary" onClick={() => onStart({ mode: "random", seed: randomSeed(), era })}>
              Be born
            </button>
          </div>
        </article>

        <article className="mode">
          <span className="eyebrow">Time travel</span>
          <h2>Go back</h2>
          <p>
            Wake up at 18 in a year you pick, knowing everything that's coming. Bitcoin, the dot-com crash, 2008. You still have to
            earn the money, get access to the markets, and survive the path.
          </p>
          <div className="row" style={{ alignItems: "end" }}>
            <div className="field" style={{ flex: "1 1 120px" }}>
              <label htmlFor="tt-year">Year</label>
              <select id="tt-year" value={year} onChange={(e) => setYear(Number(e.target.value))}>
                {Array.from({ length: 2015 - 1960 + 1 }, (_, i) => 2015 - i).map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ flex: "3 1 200px" }}>
              <label htmlFor="tt-country">Country</label>
              <select id="tt-country" value={iso} onChange={(e) => setIso(e.target.value)}>
                <optgroup label="Popular">
                  {featured.map((i) => (
                    <option key={`f${i}`} value={i}>
                      {flagEmoji(country(i).i2)} {countryName(i)}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="All countries">
                  {isos.map((i) => (
                    <option key={i} value={i}>
                      {flagEmoji(country(i).i2)} {countryName(i)}
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>
          </div>
          <div className="field">
            <label id="bg-label">Family</label>
            <div className="seg" role="group" aria-labelledby="bg-label">
              {(["poor", "middle", "rich"] as const).map((b) => (
                <button key={b} aria-pressed={bg === b} onClick={() => setBg(b)}>
                  {b === "poor" ? "Poor" : b === "middle" ? "Middle" : "Rich"}
                </button>
              ))}
            </div>
            <span className="note">{marketNote}</span>
          </div>
          <div className="row">
            <button className="btn primary" onClick={() => onStart({ mode: "timetravel", seed: randomSeed(), country: iso, year, startAge: 18, background: bg })}>
              Go back to {year}
            </button>
          </div>
        </article>
      </section>

      <section className="row" aria-label="Replay a life">
        <div className="field" style={{ flex: "0 1 260px" }}>
          <label htmlFor="code">Replay a life by its code</label>
          <input id="code" type="text" inputMode="numeric" placeholder="e.g. 1408823311" value={code} onChange={(e) => setCode(e.target.value)} />
        </div>
        <button className="btn" style={{ alignSelf: "end" }} disabled={!codeSeed} onClick={() => onStart({ mode: "random", seed: codeSeed, era: "any" })}>
          Replay
        </button>
      </section>

      {lives.length > 0 && (
        <section className="lives" aria-label="Your past lives">
          <h3>Your past lives</h3>
          {lives.map((l, i) => (
            <div key={i} className="life-row">
              <span className="grade-chip" title="Grade for your choices">{l.grade}</span>
              <span>
                {l.flag} {l.name} · {l.country} · {l.birthYear}–{l.deathYear}
                {l.mode === "timetravel" ? " · time travel" : ""}
              </span>
              <span className="num">{usd(l.peakUsd)}</span>
              <span className="num muted">#{l.seed}</span>
            </div>
          ))}
        </section>
      )}

      <p className="sources">
        Data: World Bank World Development Indicators (births, life expectancy, incomes, prices, rates, schooling), OECD share
        prices and interest rates, the Jordà–Schularick–Taylor Macrohistory Database (stocks, bonds and housing since 1870 for 18
        countries), Aswath Damodaran's US returns (NYU Stern), and Bitcoin prices from blockchain.com. Money is shown in local
        currency, with today's US dollars (PPP) alongside. Companies you can buy are fictional; their returns follow real patterns.
      </p>
    </main>
  );
}
