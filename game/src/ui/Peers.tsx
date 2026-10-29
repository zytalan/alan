import { useState } from "react";
import { countryIn, intlToUsd, rankLabel, usd, type Cohort, type LifeState, type Report } from "../engine";
import { AgeChart, type AgeScale } from "./charts";

// each comparison keeps its colour in both charts: the world, where you were born, where you moved
const HUE: Record<Cohort["key"], string> = { world: "var(--series-1)", home: "var(--series-2)", abroad: "var(--series-3)" };

const C = 1000; // dollars where the wealth axis turns from linear to logarithmic
const symlog = (v: number) => Math.sign(v) * Math.log10(1 + Math.abs(v) / C);

/** A wealth axis that shows debts, modest savings and fortunes at once: zero, then each power of ten. */
function wealthScale(values: number[]): AgeScale {
  const lo = Math.min(0, ...values);
  const hi = Math.max(C, ...values);
  const decade = (v: number) => 10 ** Math.ceil(Math.log10(Math.max(C, Math.abs(v))));
  const top = decade(hi);
  const bottom = lo < -C / 2 ? -decade(lo) : 0;
  // a thousand sits close to zero on this axis; it gets a gridline only when the amounts are small
  const first = Math.max(top, -bottom) >= 100 * C ? 10 * C : C;
  const ticks = [0];
  for (let p = first; p <= top; p *= 10) ticks.push(p);
  for (let p = first; p <= -bottom; p *= 10) ticks.push(-p);
  // past six gridlines, every other power of ten
  const sorted = ticks.sort((a, b) => a - b);
  const thin = sorted.length > 7 ? sorted.filter((t) => t === 0 || Math.round(Math.log10(Math.abs(t))) % 2 === Math.round(Math.log10(top)) % 2) : sorted;
  return { lo: bottom, hi: top, map: symlog, ticks: thin, tick: (v) => (v === 0 ? "$0" : usd(v)) };
}

/** Where you stood among everyone born the same year: tiles chosen for this life, and two charts. */
export function Peers({ s, r }: { s: LifeState; r: Report }) {
  const sd = r.standing;
  const abroad = sd.cohorts.find((c) => c.key === "abroad");
  const [view, setView] = useState<"rank" | "wealth">("rank");
  const [against, setAgainst] = useState<Cohort["key"]>(abroad ? "abroad" : "home");
  if (!sd.ranks.length) return null;
  const toUsd = (intl: number) => intlToUsd(s.macroSeed, intl);
  const where = (c: Cohort) => (c.key === "world" ? "World" : c.name);
  const born = countryIn(s.birthCountry);

  // the rank chart: one line per comparison, as the share of people your age you were richer than
  const rankLines = sd.cohorts
    .map((c) => ({
      key: c.key,
      label: where(c),
      color: HUE[c.key],
      points: sd.ranks.filter((p) => p[c.key] != null).map((p) => ({ x: p.age, y: p[c.key]! * 100 })),
    }))
    .filter((l) => l.points.length);
  const rankTable = {
    columns: ["Age", "Year", ...rankLines.map((l) => l.label)],
    rows: sd.ranks.map((p) => [String(p.age), String(p.year), ...rankLines.map((l) => (p[l.key as Cohort["key"]] != null ? rankLabel(p[l.key as Cohort["key"]]!) : "—"))]),
  };

  // the wealth chart: your net worth against the spread of people your age in one place
  const cohort = sd.cohorts.find((c) => c.key === against) ?? sd.cohorts[0];
  const from = cohort.bands[0]?.age ?? 18;
  const mine = s.history.filter((h) => h.age >= from && h.age <= (cohort.bands[cohort.bands.length - 1]?.age ?? h.age)).map((h) => ({ x: h.age, y: toUsd(h.realNW) }));
  const bands = cohort.bands.map((b) => ({ ...b, p10: toUsd(b.p10), p25: toUsd(b.p25), p50: toUsd(b.p50), p75: toUsd(b.p75), p90: toUsd(b.p90) }));
  const scale = wealthScale([...mine.map((p) => p.y), ...bands.flatMap((b) => [b.p10, b.p90])]);
  const rankAt = (age: number) => sd.ranks.find((p) => p.age === age)?.[cohort.key];
  const wealthTable = {
    columns: ["Age", "You", "10th percentile", "25th", "Median", "75th", "90th"],
    rows: bands.map((b) => [String(b.age), usd(mine.find((p) => p.x === b.age)?.y ?? NaN), usd(b.p10), usd(b.p25), usd(b.p50), usd(b.p75), usd(b.p90)]),
  };

  const placeName = cohort.key === "world" ? "everyone born that year" : `people born in ${countryIn(cohort.iso!)} that year`;

  return (
    <section className="card peers">
      <span className="eyebrow">Among people your age</span>
      <p style={{ margin: 0 }}>
        Everyone born in {s.birthYear}, ranked at each age by what they owned: in the world
        {abroad ? `, in ${born}, and in ${countryIn(abroad.iso!)} from the year you moved there` : ` and in ${born}`}. Only the people
        still alive at each age count.
      </p>
      <div className="tiles">
        {sd.stats.map((t) => (
          <div className="tile" key={t.key}>
            <span className="tile-label">{t.label}</span>
            <span className="tile-value">{t.value}</span>
            <span className="note">{t.note}</span>
          </div>
        ))}
      </div>
      <div className="row peers-controls">
        <div className="seg" role="group" aria-label="Chart">
          <button aria-pressed={view === "rank"} onClick={() => setView("rank")}>
            Your rank
          </button>
          <button aria-pressed={view === "wealth"} onClick={() => setView("wealth")}>
            Your wealth
          </button>
        </div>
        {view === "wealth" && (
          <div className="seg" role="group" aria-label="Compared with">
            {sd.cohorts.map((c) => (
              <button key={c.key} aria-pressed={cohort.key === c.key} onClick={() => setAgainst(c.key)}>
                {where(c)}
              </button>
            ))}
          </div>
        )}
      </div>
      {view === "rank" ? (
        <>
          <span className="eyebrow">The share of people your age you were richer than</span>
          <AgeChart
            title={`Your rank by age among people born in ${s.birthYear}`}
            lines={rankLines}
            y={{ lo: 0, hi: 100, ticks: [0, 25, 50, 75, 100], tick: (v) => `${v}%` }}
            value={(v) => rankLabel(v / 100)}
            table={rankTable}
          />
          <p className="note" style={{ margin: 0 }}>
            Before about 30 most people own next to nothing, so a small debt or a little saved moves a rank a long way.
          </p>
        </>
      ) : (
        <>
          <span className="eyebrow">Your net worth and {placeName}, in today's US dollars</span>
          <AgeChart
            title={`Your net worth by age against ${placeName}`}
            lines={[
              { key: "you", label: "You", color: "var(--ink)", points: mine },
              { key: "typical", label: "The typical person", short: "Typical", color: HUE[cohort.key], points: bands.map((b) => ({ x: b.age, y: b.p50 })) },
            ]}
            bands={[
              { key: "p80", label: "Middle 80%", color: HUE[cohort.key], opacity: 0.1, points: bands.map((b) => ({ x: b.age, lo: b.p10, hi: b.p90 })) },
              { key: "p50", label: "Middle half", color: HUE[cohort.key], opacity: 0.16, points: bands.map((b) => ({ x: b.age, lo: b.p25, hi: b.p75 })) },
            ]}
            y={scale}
            value={(v) => usd(v)}
            extra={(age) => {
              const b = bands.find((x) => x.age === age);
              const rank = rankAt(age);
              return [
                ...(b ? [{ label: "Middle half", value: `${usd(b.p25)} to ${usd(b.p75)}` }] : []),
                ...(rank != null ? [{ label: "Your rank", value: rankLabel(rank) }] : []),
              ];
            }}
            table={wealthTable}
          />
          <p className="note" style={{ margin: 0 }}>
            The typical person is the one in the middle: half had more, half less. Each gridline is ten times the one before it.
          </p>
        </>
      )}
    </section>
  );
}
