import { useMemo, useRef, useState } from "react";
import { usd } from "../engine";

export interface Series {
  key: string;
  label: string;
  color: string; // CSS var reference
  points: { x: number; y: number }[];
}

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

/** Single-series sparkline: area wash, 2px line, emphasized endpoint. */
export function Sparkline({ points, label }: { points: { x: number; y: number }[]; label: string }) {
  const w = 320;
  const h = 64;
  if (points.length < 2) return <div className="note">Your balance will chart here as the years go by.</div>;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const yMin = Math.min(0, ...ys);
  const yMax = Math.max(...ys, yMin + 1);
  const sx = (x: number) => 4 + ((x - x0) / Math.max(1, x1 - x0)) * (w - 8);
  const sy = (y: number) => h - 6 - ((y - yMin) / (yMax - yMin)) * (h - 12);
  const d = points.map((p, i) => `${i ? "L" : "M"}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join("");
  const area = `${d}L${sx(x1)},${sy(Math.max(yMin, 0))}L${sx(x0)},${sy(Math.max(yMin, 0))}Z`;
  const last = points[points.length - 1];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label} preserveAspectRatio="none" style={{ width: "100%", height: 64 }}>
      {yMin < 0 && <line x1={0} x2={w} y1={sy(0)} y2={sy(0)} stroke="var(--grid)" strokeWidth={1} />}
      <path d={area} fill="var(--series-1)" opacity={0.1} />
      <path d={d} fill="none" stroke="var(--series-1)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={sx(last.x)} cy={sy(last.y)} r={4} fill="var(--series-1)" stroke="var(--sheet)" strokeWidth={2} />
    </svg>
  );
}

/** Net worth by age, several series, crosshair tooltip and a table view. */
export function LifeChart({ series, title }: { series: Series[]; title: string }) {
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const W = 720;
  const H = 300;
  const pad = { l: 64, r: 150, t: 16, b: 32 };
  const all = series.flatMap((s) => s.points);
  const xMin = Math.min(...all.map((p) => p.x));
  const xMax = Math.max(...all.map((p) => p.x));
  const rawLo = Math.min(0, ...all.map((p) => p.y));
  const yHi = niceMax(Math.max(...all.map((p) => p.y), 1));
  const step = yHi / 4;
  // ticks are clean multiples of the step; a sliver below zero doesn't earn its own tick
  const yLo = rawLo < -0.08 * yHi ? -Math.ceil(-rawLo / step) * step : rawLo;
  const sx = (x: number) => pad.l + ((x - xMin) / Math.max(1, xMax - xMin)) * (W - pad.l - pad.r);
  const sy = (y: number) => pad.t + (1 - (y - yLo) / (yHi - yLo)) * (H - pad.t - pad.b);
  const yt: number[] = [];
  for (let t = yLo < -0.08 * yHi ? yLo : 0; t <= yHi + 1e-9; t += step) yt.push(t);
  const xStep = xMax - xMin > 40 ? 10 : 5;
  const xt: number[] = [];
  for (let t = Math.ceil(xMin / xStep) * xStep; t <= xMax; t += xStep) xt.push(t);
  const ages = useMemo(() => [...new Set(all.map((p) => p.x))].sort((a, b) => a - b), [all]);

  // end labels; skip ones that would collide (legend and tooltip still carry them)
  const ends = series
    .map((s) => ({ s, p: s.points[s.points.length - 1] }))
    .filter((e) => e.p)
    .sort((a, b) => sy(a.p.y) - sy(b.p.y));
  const placed: number[] = [];
  const endLabels = ends.filter((e) => {
    const y = sy(e.p.y);
    if (placed.some((py) => Math.abs(py - y) < 16)) return false;
    placed.push(y);
    return true;
  });

  const onMove = (ev: React.PointerEvent<SVGSVGElement>) => {
    const svg = ref.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const x = ((ev.clientX - rect.left) / rect.width) * W;
    const age = xMin + ((x - pad.l) / (W - pad.l - pad.r)) * (xMax - xMin);
    let best = ages[0];
    for (const a of ages) if (Math.abs(a - age) < Math.abs(best - age)) best = a;
    setHover(best);
  };
  const at = (s: Series, age: number) => s.points.find((p) => p.x === age);
  const hoverX = hover != null ? sx(hover) : 0;

  return (
    <div className="chart-wrap">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div className="legend" aria-hidden={table}>
          {series.map((s) => (
            <span key={s.key}>
              <i style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
        <button className="btn small ghost" onClick={() => setTable((t) => !t)} aria-pressed={table}>
          {table ? "Show chart" : "Show as table"}
        </button>
      </div>
      {table ? (
        <div className="table-scroll">
          <table className="data">
            <caption className="eyebrow" style={{ textAlign: "left", padding: "6px 0" }}>{title}</caption>
            <thead>
              <tr>
                <th>Age</th>
                {series.map((s) => (
                  <th key={s.key}>{s.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ages.filter((a) => a % 5 === 0 || a === ages[ages.length - 1]).map((a) => (
                <tr key={a}>
                  <td>{a}</td>
                  {series.map((s) => (
                    <td key={s.key} className="num">{at(s, a) ? usd(at(s, a)!.y) : "—"}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <svg
            ref={ref}
            viewBox={`0 0 ${W} ${H}`}
            role="img"
            aria-label={title}
            onPointerMove={onMove}
            onPointerLeave={() => setHover(null)}
            style={{ touchAction: "pan-y" }}
          >
            {yt.map((t) => (
              <g key={t}>
                <line x1={pad.l} x2={W - pad.r} y1={sy(t)} y2={sy(t)} stroke="var(--grid)" strokeWidth={1} />
                <text x={pad.l - 8} y={sy(t) + 4} textAnchor="end" fontSize={11} fill="var(--muted)" className="num">
                  {usd(t)}
                </text>
              </g>
            ))}
            {xt.map((t) => (
              <text key={t} x={sx(t)} y={H - 10} textAnchor="middle" fontSize={11} fill="var(--muted)">
                {t}
              </text>
            ))}
            {series.map((s) => {
              const d = s.points.map((p, i) => `${i ? "L" : "M"}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join("");
              return <path key={s.key} d={d} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />;
            })}
            {ends.map((e) => (
              <circle key={e.s.key} cx={sx(e.p.x)} cy={sy(e.p.y)} r={4} fill={e.s.color} stroke="var(--sheet)" strokeWidth={2} />
            ))}
            {endLabels.map((e) => (
              <text key={e.s.key} x={sx(e.p.x) + 10} y={sy(e.p.y) + 4} fontSize={12} fill="var(--ink-2)">
                {e.s.label} · <tspan className="num">{usd(e.p.y)}</tspan>
              </text>
            ))}
            {hover != null && (
              <g>
                <line x1={hoverX} x2={hoverX} y1={pad.t} y2={H - pad.b} stroke="var(--rule-strong)" strokeWidth={1} />
                {series.map((s) => {
                  const p = at(s, hover);
                  return p ? <circle key={s.key} cx={sx(p.x)} cy={sy(p.y)} r={4} fill={s.color} stroke="var(--sheet)" strokeWidth={2} /> : null;
                })}
              </g>
            )}
          </svg>
          {hover != null && (
            <div className="tip" style={{ left: `min(calc(${(hoverX / W) * 100}% + 12px), calc(100% - 170px))`, top: 36 }}>
              <span className="eyebrow">Age {hover}</span>
              {series.map((s) => {
                const p = at(s, hover);
                return (
                  <span key={s.key} className="r">
                    <i style={{ background: s.color }} />
                    <span>{s.label}</span>
                    <b>{p ? usd(p.y) : "—"}</b>
                  </span>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Diverging bars on a log scale centered on ×1. */
export function LuckBars({ rows }: { rows: { label: string; value: number; note: string }[] }) {
  const maxLog = Math.max(Math.log(4), ...rows.map((r) => Math.abs(Math.log(Math.max(r.value, 1e-6)))));
  return (
    <div className="luck" role="list">
      {rows.map((r) => {
        const lv = Math.log(Math.max(r.value, 1e-6));
        const width = Math.min(50, (Math.abs(lv) / maxLog) * 50);
        const pos = lv >= 0;
        return (
          <div key={r.label} className="luck-row" role="listitem" title={r.note}>
            <div>
              <div style={{ fontWeight: 600 }}>{r.label}</div>
              <div className="why">{r.note}</div>
            </div>
            <div className="track" aria-hidden="true">
              <div className="mid" />
              <div className={`fill ${pos ? "pos" : "neg"}`} style={pos ? { left: "50%", width: `${width}%` } : { right: "50%", width: `${width}%` }} />
            </div>
            <div className="x">{formatMult(r.value)}</div>
          </div>
        );
      })}
    </div>
  );
}

export function formatMult(v: number): string {
  if (v >= 100) return `×${Math.round(v)}`;
  if (v >= 10) return `×${v.toFixed(0)}`;
  if (v >= 1) return `×${v.toFixed(1)}`;
  return `×${v.toFixed(2)}`;
}
