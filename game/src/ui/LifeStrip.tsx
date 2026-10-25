import { useRef, useState } from "react";
import { fmtIn, toIntl2021, intlToUsd, usd, wageYears, type LifeState } from "../engine";
import { useWidth } from "./charts";

// Net worth in years of the typical local wage, on a debt-to-wealth scale.
const BINS: { max: number; token: string; label: string }[] = [
  { max: -1, token: "--w-neg2", label: "Debt over a year's wage" },
  { max: -0.1, token: "--w-neg1", label: "Some debt" },
  { max: 0.1, token: "--w-mid", label: "About zero" },
  { max: 1, token: "--w-pos1", label: "Under a year's wage" },
  { max: 2.5, token: "--w-pos2", label: "1–2.5 years' wage" },
  { max: 10, token: "--w-pos3", label: "2.5–10 years" },
  { max: Infinity, token: "--w-pos4", label: "Over 10 years" },
];
const binOf = (x: number) => BINS.find((b) => x < b.max) ?? BINS[BINS.length - 1];

interface Cell {
  year: number;
  age: number;
  wy: number | null; // null: not lived yet (the year in progress)
  nw: number;
  iso: string;
  life: string[];
  world: string[];
}

/** Every year of a life as one cell, coloured by wealth, with marks for your life above and the world below. */
export function LifeStrip({ s, onPick, title = "Your life so far" }: { s: LifeState; onPick?: (year: number) => void; title?: string }) {
  const svg = useRef<SVGSVGElement>(null);
  const [box, boxW] = useWidth<HTMLDivElement>(640);
  const [focus, setFocus] = useState<number | null>(null);
  const byYear = new Map<number, { life: string[]; world: string[] }>();
  for (const l of s.log) {
    const g = byYear.get(l.year) ?? { life: [], world: [] };
    if (l.tone === "history") g.world.push(l.text);
    else if (l.tone === "milestone") g.life.push(l.text);
    byYear.set(l.year, g);
  }
  const cells: Cell[] = s.history.map((h) => ({
    year: h.year,
    age: h.age,
    wy: wageYears(s, h.netWorth, h.year, h.country),
    nw: h.netWorth,
    iso: h.country,
    life: byYear.get(h.year)?.life ?? [],
    world: byYear.get(h.year)?.world ?? [],
  }));
  if (s.alive && (!cells.length || cells[cells.length - 1].year < s.year)) {
    cells.push({ year: s.year, age: s.age, wy: null, nw: 0, iso: s.country, life: byYear.get(s.year)?.life ?? [], world: byYear.get(s.year)?.world ?? [] });
  }
  if (cells.length < 2) return null;

  const W = 1000;
  const H = 30;
  const n = cells.length;
  const gap = n > 70 ? 1 : 2;
  const cw = (W - gap * (n - 1)) / n;
  const x = (i: number) => i * (cw + gap);
  const centre = (i: number) => ((x(i) + cw / 2) / W) * 100;
  // year labels: the first and last year and each decade, dropping any that would touch at this width
  const LABEL = 30;
  const span = (i: number) => {
    const c = (centre(i) / 100) * boxW;
    return i === 0 ? [c, c + LABEL] : i === n - 1 ? [c - LABEL, c] : [c - LABEL / 2, c + LABEL / 2];
  };
  const labels: number[] = [];
  cells.forEach((c, i) => {
    if (i !== 0 && i !== n - 1 && c.year % 10 !== 0) return;
    while (labels.length > 1 && i === n - 1 && span(labels[labels.length - 1])[1] + 8 > span(i)[0]) labels.pop();
    if (!labels.length || span(labels[labels.length - 1])[1] + 8 <= span(i)[0]) labels.push(i);
  });
  const cur = focus != null ? cells[focus] : null;

  const inToday = (c: Cell) => {
    const local = fmtIn(s, c.nw, c.year, c.iso);
    // redenominated currencies are already shown in today's dollars
    if (local.startsWith("≈")) return `${local} today`;
    return `${local} · ≈${usd(intlToUsd(s.macroSeed, toIntl2021(c.iso, s.macroSeed, c.year, c.nw)))} today`;
  };

  const indexAt = (clientX: number) => {
    const r = svg.current?.getBoundingClientRect();
    if (!r) return null;
    const i = Math.floor((((clientX - r.left) / r.width) * W) / (cw + gap));
    return i >= 0 && i < n ? i : null;
  };

  return (
    <section className="card strip" aria-label={title}>
      <div className="strip-head">
        <span className="eyebrow">{title}</span>
        <div className="strip-legend" aria-hidden="true">
          {BINS.map((b) => (
            <span key={b.token}>
              <i style={{ background: `var(${b.token})` }} />
              {b.label}
            </span>
          ))}
          <span>
            <svg width="10" height="10">
              <circle cx="5" cy="5" r="4" fill="var(--ink)" />
            </svg>
            Your life
          </span>
          <span>
            <svg width="10" height="10">
              <path d="M5 1 L9.5 9 L0.5 9 Z" fill="var(--stamp)" />
            </svg>
            The world
          </span>
        </div>
      </div>
      <div className="strip-box" ref={box}>
        <div className="strip-marks" aria-hidden="true">
          {cells.map((c, i) =>
            c.life.length > 0 ? <i key={c.year} className="mk-life" style={{ left: `${centre(i)}%` }} /> : null,
          )}
        </div>
        <svg
          ref={svg}
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          role="img"
          tabIndex={0}
          aria-label={`${title}: one cell per year, from ${cells[0].year} to ${cells[n - 1].year}. Use the arrow keys to read each year${onPick ? ", Enter to jump to it" : ""}.`}
          onPointerMove={(e) => setFocus(indexAt(e.clientX))}
          onPointerDown={(e) => setFocus(indexAt(e.clientX))}
          onPointerLeave={() => setFocus(null)}
          onClick={(e) => {
            const i = indexAt(e.clientX);
            if (i != null && onPick) onPick(cells[i].year);
          }}
          onFocus={() => setFocus(n - 1)}
          onBlur={() => setFocus(null)}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
              e.preventDefault();
              setFocus((f) => Math.max(0, Math.min(n - 1, (f ?? n - 1) + (e.key === "ArrowLeft" ? -1 : 1))));
            } else if (e.key === "Enter" && focus != null && onPick) onPick(cells[focus].year);
          }}
        >
          {cells.map((c, i) =>
            c.wy == null ? (
              <rect key={c.year} x={x(i) + 0.5} y={1.5} width={Math.max(0.5, cw - 1)} height={27} fill="none" stroke="var(--rule-strong)" vectorEffect="non-scaling-stroke" />
            ) : (
              <rect key={c.year} x={x(i)} y={1} width={cw} height={28} fill={`var(${binOf(c.wy).token})`} />
            ),
          )}
          {focus != null && (
            <rect x={x(focus) - 1} y={0.5} width={cw + 2} height={29} fill="none" stroke="var(--ink)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
          )}
        </svg>
        {/* marks are HTML so they stay round however wide the strip is */}
        <div className="strip-marks" aria-hidden="true">
          {cells.map((c, i) =>
            c.world.length > 0 ? <i key={c.year} className="mk-world" style={{ left: `${centre(i)}%` }} /> : null,
          )}
        </div>
        <div className="strip-years" aria-hidden="true">
          {labels.map((i) => (
            <span key={cells[i].year} className={i === 0 ? "first" : i === n - 1 ? "last" : undefined} style={{ left: `${centre(i)}%` }}>
              {cells[i].year}
            </span>
          ))}
        </div>
        {cur && (
          <div className="tip strip-tip" style={{ left: `clamp(0px, calc(${centre(focus!)}% - 130px), calc(100% - min(260px, 100%)))` }}>
            <b>
              {cur.year} · age {cur.age}
            </b>
            {cur.wy == null ? (
              <span>This year, still being lived.</span>
            ) : (
              <>
                <span className="num">{inToday(cur)}</span>
                <span className="muted">{binOf(cur.wy).label}</span>
              </>
            )}
            {cur.life.slice(0, 3).map((t, k) => (
              <span key={`l${k}`}>● {t}</span>
            ))}
            {cur.world.slice(0, 2).map((t, k) => (
              <span key={`w${k}`}>▲ {t}</span>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
