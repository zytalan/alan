import { useEffect, useState } from "react";
import {
  buildReport, country, countryIn, countryName, flagEmoji, intlToUsd, nearest, oneIn, pct, toIntl2021, usd, type LifeState, type Report,
} from "../engine";
import { formatMult, LifeChart, LuckBars } from "./charts";

const MONEY_FOR: Record<string, string> = {
  security: "security",
  freedom: "freedom",
  family: "your family",
  status: "status",
  impact: "changing something",
};

export function End({ s, onAgain, onReplay, onReport }: { s: LifeState; onAgain: () => void; onReplay: () => void; onReport: (r: Report) => void }) {
  const [report, setReport] = useState<Report | null>(null);
  const [progress, setProgress] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let live = true;
    buildReport(s, { onProgress: (d, t) => live && setProgress(d / t) }).then((r) => {
      if (!live) return;
      setReport(r);
      onReport(r);
    });
    return () => {
      live = false;
    };
    // a report is built once per finished life
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s]);

  if (!report) {
    return (
      <main className="wrap loading" aria-live="polite">
        <div style={{ display: "grid", gap: 12, width: "min(420px, 100%)" }}>
          <span className="eyebrow">Statement of a life</span>
          <p style={{ margin: 0 }}>Living 250 other lives born in {s.birthYear} to see where you stand…</p>
          <div className="progress">
            <span style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
        </div>
      </main>
    );
  }

  const r = report;
  if (r.age < 18) return <ShortLife s={s} r={r} onAgain={onAgain} onReplay={onReplay} />;
  const usdNow = (intl: number) => intlToUsd(s.macroSeed, intl);
  const c = country(s.birthCountry);
  const here = countryIn(s.birthCountry);
  const beat = (p: number) => (p >= 0.999 ? "99.9%" : pct(p));
  const captured = (x: number) => (x < 0.01 ? `${(x * 100).toFixed(2)}%` : pct(Math.min(x, 9.99)));
  const series = [
    { key: "you", label: "You", color: "var(--series-1)", points: r.you.map((p) => ({ x: p.age, y: usdNow(p.real) })) },
    { key: "twin", label: "Default you", color: "var(--series-2)", points: r.twin.map((p) => ({ x: p.age, y: usdNow(p.real) })) },
    { key: "steady", label: "Index-fund you", color: "var(--series-3)", points: r.steady.map((p) => ({ x: p.age, y: usdNow(p.real) })) },
  ].map((ser) => ({ ...ser, points: ser.points.filter((p) => p.x >= Math.max(15, s.startAge)) }));

  const luckRows = [
    { label: "Where you were born", value: r.luck.country, note: `A typical life in ${here} vs. a typical life on Earth` },
    { label: "Family & fortune", value: r.luck.family, note: "Default-you vs. a typical life here: family, health, events" },
    { label: "Your choices", value: r.luck.choices, note: "You vs. default-you: same birth, same luck" },
  ];

  const share = [
    `Lot in Life — ${r.name}`,
    `Born ${r.birthYear} in ${here} (${oneIn(Number(s.flags.birthShare ?? 0))} babies that year)`,
    `Died at ${r.age}${r.cause ? `, of ${r.cause}` : ""}`,
    `Peak wealth ≈ ${usd(r.peakUsd)} in today's money; richer over a lifetime than ${beat(r.worldPct)} of people born that year`,
    `Birth ${formatMult(r.luck.country)} · Fortune ${formatMult(r.luck.family)} · Choices ${formatMult(r.luck.choices)} (grade ${r.grade})`,
    r.hindsight ? `Time travel: captured ${captured(r.hindsight.captured)} of perfect hindsight` : "",
    `Life code #${s.seed}`,
  ]
    .filter(Boolean)
    .join("\n");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(share);
      setCopied(true);
    } catch {
      const el = document.getElementById("share-text");
      if (el) {
        const range = document.createRange();
        range.selectNodeContents(el);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
    }
  };

  return (
    <main className="wrap statement">
      <header>
        <span className="eyebrow">Statement of a life</span>
        <h1>
          {r.name} <span aria-hidden="true">{flagEmoji(c.i2)}</span>
        </h1>
        <p style={{ margin: 0, color: "var(--ink-2)" }}>
          {r.birthYear}–{r.deathYear} · {countryName(s.birthCountry)}
          {s.country !== s.birthCountry ? ` → ${countryName(s.country)}` : ""} · died at {r.age}
          {r.cause ? `, of ${r.cause}` : ""}
        </p>
      </header>

      <section className="headline">
        <div className="stamp" aria-label={`Grade for your choices: ${r.grade}`}>
          <div>
            <b>{r.grade}</b>
            <small>choices</small>
          </div>
        </div>
        <div className="figure">
          <span className="eyebrow">Your peak wealth, in today's US dollars</span>
          <div className="v">{usd(r.peakUsd)}</div>
          <p>
            Across your adult life you held {usd(r.lifeAvgUsd)} on average — more than {beat(r.worldPct)} of people born in {r.birthYear}{" "}
            worldwide, and {beat(r.countryPct)} of those born in {here}.
            {r.finalUsd > 0 ? ` You left ${usd(r.finalUsd)} behind.` : r.finalUsd < 0 ? ` You died owing ${usd(-r.finalUsd)}.` : ""}
          </p>
        </div>
      </section>

      <section className="grid2">
        <div className="card">
          <span className="eyebrow">How much was luck</span>
          <LuckBars rows={luckRows} />
          <p className="note" style={{ margin: 0 }}>
            Multipliers on average adult wealth. Your grade measures only the last one: what your choices did with the hand you
            were dealt. Market timing: the real markets of your lifetime left default-you with {formatMult(r.luck.market)} what an
            average re-roll of history would have.
          </p>
        </div>
        <div className="card">
          <span className="eyebrow">Your life, in numbers</span>
          <div className="kv">
            <span>Born</span>
            <span>
              {oneIn(Number(s.flags.birthShare ?? 0))} babies in {r.birthYear}
            </span>
            <span>Average happiness</span>
            <span className="num">{Math.round(r.avgHappiness)} / 100</span>
            <span>Your average adult wealth</span>
            <span className="num">{usd(r.lifeAvgUsd)}</span>
            <span>Median, everyone born that year</span>
            <span className="num">{usd(usdNow(r.worldMedian))}</span>
            <span>Median, born in {here}</span>
            <span className="num">{usd(usdNow(r.countryMedian))}</span>
            <span>Default-you</span>
            <span className="num">{usd(usdNow(r.twinPeak))}</span>
            <span>Index-fund you</span>
            <span className="num">{usd(usdNow(r.steadyPeak))}</span>
          </div>
          {r.hindsight && (
            <p style={{ margin: 0 }}>
              Perfect hindsight would have turned the same savings into about{" "}
              <b>{usd(usdNow(toIntl2021(s.birthCountry, s.macroSeed, r.hindsight.evalYear, r.hindsight.oracle)))}</b> by {r.hindsight.evalYear}, mostly
              in {r.hindsight.bestAsset}. You captured <b>{captured(r.hindsight.captured)}</b> of that.
            </p>
          )}
          {s.answers.money && <p className="note" style={{ margin: 0 }}>At 30 you said money was for {MONEY_FOR[s.answers.money]}.</p>}
          <div className="facts">
            {r.facts.map((f) => (
              <span key={f}>{f}</span>
            ))}
          </div>
        </div>
      </section>

      <section className="card">
        <span className="eyebrow">Net worth by age, in today's US dollars</span>
        <LifeChart series={series} title="Net worth by age: you, default-you and index-fund you" />
        <p className="note" style={{ margin: 0 }}>
          Default-you made the most common choices at every turn. Index-fund you made them too, but saved into a broad index and never
          sold in a panic.
        </p>
      </section>

      <section className="grid2">
        <div className="card share">
          <span className="eyebrow">Share this life</span>
          <pre id="share-text">{share}</pre>
          <div className="actions">
            <button className="btn small" onClick={copy}>
              {copied ? "Copied" : "Copy text"}
            </button>
          </div>
        </div>
        <div className="card">
          <span className="eyebrow">Again</span>
          <p style={{ margin: 0 }}>Another birth, another country, another century. Or the same start, different choices.</p>
          <div className="actions">
            <button className="btn primary" onClick={onAgain}>
              Live another life
            </button>
            <button className="btn" onClick={onReplay}>
              Replay this birth
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}

function ShortLife({ s, r, onAgain, onReplay }: { s: LifeState; r: Report; onAgain: () => void; onReplay: () => void }) {
  const c = country(s.birthCountry);
  const here = countryIn(s.birthCountry);
  const u5 = nearest(s.birthCountry, "u5", Math.min(r.birthYear, 2025));
  const le = nearest(s.birthCountry, s.sex === "F" ? "leF" : "leM", Math.min(r.birthYear, 2025));
  const best = nearest("JPN", "u5", Math.min(r.birthYear, 2025));
  return (
    <main className="wrap statement">
      <header>
        <span className="eyebrow">A short life</span>
        <h1>
          {r.name} <span aria-hidden="true">{flagEmoji(c.i2)}</span>
        </h1>
        <p style={{ margin: 0, color: "var(--ink-2)" }}>
          {r.birthYear}–{r.deathYear} · {countryName(s.birthCountry)} · died at {r.age}
          {r.cause ? `, of ${r.cause}` : ""}
        </p>
      </header>
      <section className="card" style={{ maxWidth: 720 }}>
        <p className="odds" style={{ margin: 0 }}>
          {u5 != null ? `${Math.round(u5)} of every 1,000 children born in ${here} in ${r.birthYear} died before turning five.` : "Many children here never reach adulthood."}
        </p>
        <p style={{ margin: 0, color: "var(--ink-2)" }}>
          {le != null ? `Life expectancy at birth was ${Math.round(le)} years. ` : ""}
          {best != null && u5 != null && u5 > best * 2 ? `In Japan that year, it was ${Math.round(best)} in 1,000. ` : ""}
          {r.name} never got to make a money decision. That's part of the lottery too.
        </p>
      </section>
      <div className="actions">
        <button className="btn primary" onClick={onAgain}>
          Live another life
        </button>
        <button className="btn" onClick={onReplay}>
          Replay this birth
        </button>
      </div>
    </main>
  );
}
