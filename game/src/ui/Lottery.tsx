import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { birthShares, countryName, oneIn } from "../engine";
import { CENTROIDS, MAP } from "./geo";

// Equal Earth, the projection the map grid was cut with (d3-geo's formula).
const A1 = 1.340264;
const A2 = -0.081106;
const A3 = 0.000893;
const A4 = 0.003796;
const M = Math.sqrt(3) / 2;
function project(lon: number, lat: number): [number, number] {
  const lam = (lon * Math.PI) / 180;
  const phi = (lat * Math.PI) / 180;
  const l = Math.asin(M * Math.sin(phi));
  const l2 = l * l;
  const l6 = l2 * l2 * l2;
  const x = (lam * Math.cos(l)) / (M * (A1 + 3 * A2 * l2 + l6 * (7 * A3 + 9 * A4 * l2)));
  const y = l * (A1 + A2 * l2 + l6 * (A3 + A4 * l2));
  return [MAP.translate[0] + MAP.scale * x, MAP.translate[1] - MAP.scale * y];
}

const LAND: [number, number][] = (() => {
  const bytes = Uint8Array.from(atob(MAP.mask), (c) => c.charCodeAt(0));
  const out: [number, number][] = [];
  for (let r = 0; r < MAP.rows; r++) {
    for (let c = 0; c < MAP.cols; c++) {
      const k = r * MAP.cols + c;
      if (bytes[k >> 3] & (128 >> (k & 7))) out.push(project(MAP.lon0 + c * MAP.step, MAP.lat0 - r * MAP.step));
    }
  }
  return out;
})();
const POINTS: Record<string, [number, number]> = Object.fromEntries(Object.entries(CENTROIDS).map(([k, [lon, lat]]) => [k, project(lon, lat)]));

const radius = (share: number) => Math.max(1.3, 70 * Math.sqrt(share));
const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const reduceMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Redraw whenever the theme changes, whether from the system or the viewer's toggle. */
function useThemeVersion(): number {
  const [v, setV] = useState(0);
  useEffect(() => {
    const bump = () => setV((x) => x + 1);
    const mq = matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", bump);
    const mo = new MutationObserver(bump);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      mq.removeEventListener("change", bump);
      mo.disconnect();
    };
  }, []);
  return v;
}

/**
 * The birth lottery: every dot is land, every circle a country sized by its share of the
 * year's births. With `draw`, a marker hops across the map, weighted by those odds, and
 * lands on `chosen`.
 */
export function Lottery({ year, chosen, draw, onDone }: { year: number; chosen: string; draw: boolean; onDone?: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const label = useRef<HTMLSpanElement>(null);
  const ring = useRef<{ x: number; y: number } | null>(null);
  const theme = useThemeVersion();
  const births = useMemo(() => birthShares(year), [year]);
  const bubbles = useMemo(
    () => Object.entries(births.share).filter(([k, v]) => v > 0 && POINTS[k]).sort((a, b) => b[1] - a[1]),
    [births],
  );
  const top = bubbles.slice(0, 6);
  const [drawing, setDrawing] = useState(false);

  const paint = useCallback(() => {
    const cv = canvas.current;
    if (!cv) return;
    const w = cv.clientWidth || 600;
    const h = (w * MAP.H) / MAP.W;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const s = w / MAP.W;
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr * s, 0, 0, dpr * s, 0, 0);
    ctx.clearRect(0, 0, MAP.W, MAP.H);
    ctx.fillStyle = css("--rule-strong");
    for (const [x, y] of LAND) {
      ctx.beginPath();
      ctx.arc(x, y, 0.95, 0, 2 * Math.PI);
      ctx.fill();
    }
    const accent = css("--accent");
    for (const [iso, share] of bubbles) {
      const [x, y] = POINTS[iso];
      ctx.beginPath();
      ctx.arc(x, y, radius(share), 0, 2 * Math.PI);
      ctx.globalAlpha = 0.14;
      ctx.fillStyle = accent;
      ctx.fill();
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 0.6;
      ctx.strokeStyle = accent;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    const stamp = css("--stamp");
    const home = POINTS[chosen];
    const p = ring.current ?? (home ? { x: home[0], y: home[1] } : null);
    if (p) {
      const r = ring.current ? 10 : radius(births.share[chosen] ?? 0) + 4;
      ctx.strokeStyle = stamp;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, 2 * Math.PI);
      ctx.stroke();
      ctx.fillStyle = stamp;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1.9, 0, 2 * Math.PI);
      ctx.fill();
    }
    const lab = label.current;
    if (lab && home) {
      lab.hidden = !!ring.current;
      if (!ring.current) {
        const r = radius(births.share[chosen] ?? 0) + 6;
        const lw = lab.offsetWidth || 120;
        const right = (home[0] + r) * s;
        lab.style.left = `${Math.max(4, right + lw > w - 4 ? (home[0] - r) * s - lw : right)}px`;
        lab.style.top = `${home[1] * s}px`;
      }
    }
  }, [bubbles, births, chosen]);

  useEffect(() => {
    paint();
  }, [paint, theme]);

  useEffect(() => {
    const cv = canvas.current;
    if (!cv) return;
    const ro = new ResizeObserver(() => paint());
    ro.observe(cv);
    return () => ro.disconnect();
  }, [paint]);

  const run = useCallback(() => {
    const home = POINTS[chosen];
    if (!home || reduceMotion()) {
      onDone?.();
      return;
    }
    setDrawing(true);
    const pick = () => {
      let u = Math.random();
      for (const [iso, share] of bubbles) {
        u -= share;
        if (u <= 0) return iso;
      }
      return bubbles[0][0];
    };
    const hops = Array.from({ length: 7 }, pick).filter((k) => POINTS[k]).concat(chosen);
    let from = POINTS[hops[0]];
    let hop = 1;
    let t0 = performance.now();
    ring.current = { x: from[0], y: from[1] };
    let raf = 0;
    const frame = (now: number) => {
      const to = POINTS[hops[hop]];
      const dur = 130 + hop * 45;
      const t = Math.min(1, (now - t0) / dur);
      const e = 1 - (1 - t) ** 3;
      ring.current = { x: from[0] + (to[0] - from[0]) * e, y: from[1] + (to[1] - from[1]) * e };
      paint();
      if (t >= 1) {
        from = to;
        hop++;
        t0 = now;
        if (hop >= hops.length) {
          ring.current = null;
          paint();
          setDrawing(false);
          onDone?.();
          return;
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [bubbles, chosen, onDone, paint]);

  useEffect(() => {
    if (!draw) return;
    const stop = run();
    return () => {
      if (typeof stop === "function") stop();
      ring.current = null;
    };
    // the draw plays once per birth
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draw, chosen, year]);

  return (
    <div className="lottery">
      <div className="lottery-map">
        <canvas
          ref={canvas}
          role="img"
          aria-label={`World map of births in ${year}. Circles are sized by each country's share of the world's babies; ${countryName(chosen)} is marked.`}
        />
        <span className="lottery-label" ref={label}>
          {countryName(chosen)} · {oneIn(births.share[chosen] ?? 0)}
        </span>
      </div>
      <div className="row lottery-bar">
        {draw && (
          <button className="btn small" onClick={run} disabled={drawing}>
            {drawing ? "Drawing…" : "Replay the draw"}
          </button>
        )}
        <span className="note">
          Circle area = share of the world's {Math.round(births.total / 1e6)} million births in {year} (World Bank).
        </span>
      </div>
      <ol className="odds-list" aria-label={`Most babies in ${year}`}>
        {top.map(([iso, share]) => (
          <li key={iso} className={iso === chosen ? "here" : undefined}>
            <span>{countryName(iso)}</span>
            <span className="num">{oneIn(share)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
