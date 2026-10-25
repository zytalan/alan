import { country, econ, hasMarkets, indexLevel, MONTHS, monthNewsFor, signedPct, tOf, type LifeState } from "../engine";
import { useWidth } from "./charts";

interface Edition {
  year: number;
  iso: string;
  headline: string;
  deck: string[];
  market: string | null;
  mine: string[];
  markMonth: number | null;
  markText: string | null;
}

/** The year just finished, as a New Year's Eve front page: its biggest story, the market move, your own news. */
export function edition(s: LifeState): Edition | null {
  const year = s.year - 1;
  const rec = s.history.find((h) => h.year === year);
  if (!rec) return null;
  const iso = rec.country;
  const notes = s.log.filter((l) => l.year === year && l.tone === "history").map((l) => l.text);
  const mine = s.log.filter((l) => l.year === year && l.tone === "milestone").map((l) => l.text);
  const e = econ(iso, s.macroSeed, year, s.marketVariant);
  const mkt = country(iso).mkt;
  const hasMarket = mkt != null && year >= mkt;
  const realEq = (1 + e.eq) / (1 + e.infl) - 1;
  const marketStory =
    hasMarket && Math.abs(realEq) >= 0.2
      ? realEq < 0
        ? `Stocks crash ${Math.round(-realEq * 100)}% after inflation`
        : `Stocks soar ${Math.round(realEq * 100)}% after inflation`
      : null;
  // a huge year on the local market leads; otherwise the world's biggest story does
  const marketLeads = marketStory != null && (Math.abs(realEq) >= 0.4 || !notes.length);
  const headline = marketLeads ? marketStory : notes[0];
  const deck = marketLeads ? notes.slice(0, 2) : notes.slice(1, 3);
  if (!headline) return null;
  const market = hasMarket
    ? `Stocks here: ${signedPct(e.eq, 1)} in ${year}, dividends included. Prices: ${signedPct(e.infl, 1)}.`
    : `Prices: ${signedPct(e.infl, 1)} in ${year}.`;
  const news = monthNewsFor(iso, year);
  const mark = news.find((n) => n.major) ?? news[0];
  return { year, iso, headline, deck, market, mine: mine.slice(0, 2), markMonth: mark?.m ?? null, markText: mark?.text ?? null };
}

function MarketChart({ s, ed }: { s: LifeState; ed: Edition }) {
  const pts: number[] = [];
  for (let m = 0; m <= 12; m++) pts.push(indexLevel(ed.iso, s.macroSeed, tOf(ed.year, 1) - 1 + m));
  const [box, W] = useWidth<HTMLElement>(320);
  const H = 104;
  const lo = Math.min(...pts) * 0.97;
  const hi = Math.max(...pts) * 1.03;
  const x = (i: number) => 44 + (i / 12) * (W - 92);
  const y = (v: number) => 8 + (H - 30) * (1 - (v - lo) / (hi - lo || 1));
  const d = pts.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const fmtLevel = (v: number) => (v >= 1000 ? Math.round(v).toLocaleString("en") : v >= 1 ? v.toFixed(v >= 100 ? 0 : 1) : v.toPrecision(2));
  const mk = ed.markMonth;
  return (
    <figure className="fp-chart" ref={box}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`The stock index month by month through ${ed.year}`}>
        <line x1={44} x2={W - 48} y1={H - 22} y2={H - 22} stroke="var(--rule-strong)" strokeWidth={1} />
        <path d={`${d} L${x(12)} ${H - 22} L${x(0)} ${H - 22} Z`} fill="var(--accent)" fillOpacity={0.1} />
        <path d={d} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {mk != null && (
          <g>
            <line x1={x(mk)} x2={x(mk)} y1={6} y2={H - 22} stroke="var(--stamp)" strokeWidth={1} />
            <circle cx={x(mk)} cy={y(pts[mk])} r={4} fill="var(--stamp)" stroke="var(--news)" strokeWidth={2} />
          </g>
        )}
        <text x={x(0) - 6} y={y(pts[0]) + 4} textAnchor="end" className="fp-tick">
          {fmtLevel(pts[0])}
        </text>
        <text x={x(12) + 6} y={y(pts[12]) + 4} className="fp-tick">
          {fmtLevel(pts[12])}
        </text>
        <text x={x(0)} y={H - 6} className="fp-tick">
          Jan
        </text>
        {mk != null && mk > 1 && mk < 11 && (
          <text x={x(mk)} y={H - 6} textAnchor="middle" className="fp-tick">
            {MONTHS[mk - 1]}
          </text>
        )}
        <text x={x(12)} y={H - 6} textAnchor="end" className="fp-tick">
          Dec
        </text>
      </svg>
      <figcaption>
        {ed.markText && (
          <span className="fp-note">
            <i aria-hidden="true" />
            {ed.markText}
          </span>
        )}
        Stock index, monthly averages, {ed.year}
      </figcaption>
    </figure>
  );
}

export function FrontPage({ s }: { s: LifeState }) {
  const ed = edition(s);
  if (!ed) return null;
  const mkt = country(ed.iso).mkt;
  const chart = hasMarkets() && mkt != null && ed.year >= mkt;
  return (
    <article className="front" aria-label={`The year in review: ${ed.year}`}>
      <header className="fp-mast">
        <b>The Daily Ledger</b>
        <span>31 December {ed.year} · The year in review</span>
      </header>
      <div className={`fp-body${chart ? "" : " solo"}`}>
        <div className="fp-story">
          <h3>{ed.headline}</h3>
          {ed.deck.map((t, i) => (
            <p key={i} className="fp-deck">
              {t}
            </p>
          ))}
          {ed.market && <p className="fp-market">{ed.market}</p>}
          {ed.mine.length > 0 && (
            <p className="fp-mine">
              <span className="eyebrow">Your year</span> {ed.mine.join(" ")}
            </p>
          )}
        </div>
        {chart && <MarketChart s={s} ed={ed} />}
      </div>
    </article>
  );
}
