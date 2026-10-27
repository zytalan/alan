import { useMemo, useRef, useState } from "react";
import {
  buy, cancelOrder, companyById, deposit, deskAccess, deskValue, deskYearEnd, feeRate, fmt, fmtPrice, fmtUnits,
  headlines, instrumentName, isRealMonth, liquid, memories, metalDef, metalFee, monthLabel, monthsPlayed, pct, placeOrder, priceOf, quote,
  quoteBuy, quoteSell, runUntilSomething, sectorLabel, sell, setCustody, spreadOf, stepMonth, tradable, WALLET_FEE, withdraw,
  yearOfT, yearStartT, type LifeState,
} from "../engine";
import { useWidth } from "./charts";

const RED_IS_UP = new Set(["CHN", "KOR"]); // local custom on trading screens

type Side = "buy" | "sell";
type Kind = "now" | "limit" | "stop";

function signed(x: number, digits = 1): string {
  const v = (x * 100).toFixed(digits);
  return x > 0 ? `+${v}%` : `${v.replace("-", "−")}%`;
}

/** "Start of 2008" for the opening state of a year, otherwise the month. */
function deskDate(s: LifeState, t: number): string {
  return t === yearStartT(s.year) ? `Start of ${s.year}` : monthLabel(t);
}

export function Desk({ s, version, refresh, onClose, onFinishYear }: {
  s: LifeState;
  version: number;
  refresh: () => void;
  onClose: () => void;
  onFinishYear: () => void;
}) {
  const d = s.desk!;
  const access = deskAccess(s);
  const list = tradable(s);
  const held = Object.keys(d.pos).filter((id) => !list.some((i) => i.id === id));
  const [sel, setSel] = useState<string>(() => list[0]?.id ?? Object.keys(d.pos)[0] ?? "");
  const [notice, setNotice] = useState<string[]>([]);
  const selected = list.some((i) => i.id === sel) || d.pos[sel] ? sel : (list[0]?.id ?? "");
  const value = deskValue(s);
  const yearDone = d.t >= deskYearEnd(s);
  const played = monthsPlayed(s);
  const swap = RED_IS_UP.has(s.country);

  const step = () => {
    const ev = stepMonth(s);
    setNotice(ev);
    refresh();
  };
  const run = () => {
    const r = runUntilSomething(s);
    setNotice(r.events.length ? r.events : [`Nothing needed you. ${r.months} month${r.months === 1 ? "" : "s"} went by.`]);
    refresh();
  };

  return (
    <div className={`dk${swap ? " dk-swap" : ""}`} data-version={version}>
      <header className="topbar dk-top">
        <div className="wrap">
          <div className="who">
            <span className="name">Trading desk</span>
            <span className="meta">
              <b className="num">{deskDate(s, d.t)}</b> · {played} of 12 months
            </span>
          </div>
          <div className="controls">
            {yearDone ? (
              <button className="btn small primary" onClick={onFinishYear} disabled={!!s.pending.length} title={s.pending.length ? "Answer the open decision first" : undefined}>
                Close the year
              </button>
            ) : (
              <>
                <button className="btn small primary" onClick={step}>
                  Next month
                </button>
                <button className="btn small" onClick={run}>
                  Run until something happens
                </button>
              </>
            )}
            <button className="btn small ghost" onClick={onClose}>
              Back to your life
            </button>
          </div>
        </div>
      </header>
      <main className="wrap dk-main">
        <section className="dk-summary" aria-label="Account">
          <div>
            <span className="eyebrow">Account value</span>
            <b className="num">{fmt(s, value)}</b>
          </div>
          <div>
            <span className="eyebrow">Cash in the account</span>
            <b className="num">{fmt(s, d.cash)}</b>
          </div>
          <div>
            <span className="eyebrow">Savings outside</span>
            <b className="num">{fmt(s, liquid(s))}</b>
          </div>
          <div>
            {selected.startsWith("mt:") ? (
              <>
                <span className="eyebrow">Spread now</span>
                <b className="num">{pct(spreadOf(selected, yearOfT(d.t)), 1)}</b>
              </>
            ) : (
              <>
                <span className="eyebrow">{selected.startsWith("cc:") ? "Exchange fee now" : "Commission now"}</span>
                <b className="num">{pct(feeRate(selected, yearOfT(d.t)), feeRate(selected, yearOfT(d.t)) < 0.01 ? 2 : 1)}</b>
              </>
            )}
          </div>
        </section>
        {notice.length > 0 && (
          <div className="dk-notice" role="status">
            {notice.map((n, i) => (
              <span key={i}>{n}</span>
            ))}
          </div>
        )}
        {!access.ok && <p className="note">{access.reason}.</p>}
        {access.metalNote && <p className="note">{access.metalNote}</p>}
        {access.cryptoNote && <p className="note">{access.cryptoNote}.</p>}
        <div className="dk-grid">
          <Watchlist s={s} list={list} held={held} sel={selected} onSelect={setSel} />
          <section className="card dk-chart-card" aria-label="Price chart">
            {selected ? <PriceChart s={s} id={selected} /> : <p className="note">Nothing to show yet.</p>}
          </section>
          <Ticket s={s} id={selected} refresh={refresh} onNotice={setNotice} />
        </div>
        <Positions s={s} refresh={refresh} onSelect={setSel} />
        <Ticker s={s} />
      </main>
    </div>
  );
}

// ------------------------------------------------------------------ watchlist

function Spark({ values }: { values: number[] }) {
  if (values.length < 2) return <svg className="dk-spark" aria-hidden="true" />;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const x = (k: number) => 1 + (k / (values.length - 1)) * 50;
  const y = (v: number) => 2 + 16 * (1 - (v - lo) / span);
  const d = values.map((v, k) => `${k ? "L" : "M"}${x(k).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  return (
    <svg className="dk-spark" viewBox="0 0 54 20" aria-hidden="true">
      <path d={d} fill="none" stroke="var(--muted)" strokeWidth={1.5} strokeLinejoin="round" />
      <circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r={2.5} fill="var(--ink)" />
    </svg>
  );
}

function Change({ x }: { x: number }) {
  return (
    <span className="dk-chg">
      <span className={x >= 0 ? "up" : "dn"} aria-hidden="true">
        {x >= 0 ? "▲" : "▼"}
      </span>
      {signed(x)}
    </span>
  );
}

const GROUPS = ["Funds", "Metals", "Crypto", "Companies"]; // the few before the many

function Watchlist({ s, list, held, sel, onSelect }: { s: LifeState; list: ReturnType<typeof tradable>; held: string[]; sel: string; onSelect: (id: string) => void }) {
  const t = s.desk!.t;
  const group = (id: string) => (id.startsWith("cc:") ? "Crypto" : id.startsWith("mt:") ? "Metals" : id.startsWith("co:") ? "Companies" : "Funds");
  const rows = [...list.map((i) => ({ id: i.id, name: i.name, sub: i.sub })), ...held.map((id) => ({ id, name: instrumentName(s, id), sub: "Can't be bought here now" }))]
    .map((r, k) => ({ ...r, k, g: group(r.id) }))
    .sort((a, b) => GROUPS.indexOf(a.g) - GROUPS.indexOf(b.g) || a.k - b.k);
  return (
    <section className="card dk-watch" aria-label="What you can trade">
      <span className="eyebrow">What you can trade</span>
      {rows.length === 0 && <p className="note">Nothing yet.</p>}
      <ul>
        {rows.map((r, i) => {
          const px = priceOf(r.id, s.macroSeed, t, s.country);
          const prev = priceOf(r.id, s.macroSeed, t - 1, s.country);
          const hist: number[] = [];
          for (let k = t - 11; k <= t; k++) {
            const v = priceOf(r.id, s.macroSeed, k, s.country);
            if (v != null) hist.push(v);
          }
          return (
            <li key={r.id}>
              {(i === 0 || rows[i - 1].g !== r.g) && <span className="dk-group">{r.g}</span>}
              <button className={`dk-row${r.id === sel ? " sel" : ""}`} aria-pressed={r.id === sel} onClick={() => onSelect(r.id)}>
                <span className="dk-nm">
                  <span>{r.name}</span>
                  <small>{r.sub}</small>
                </span>
                <span className="dk-px num">
                  {px != null ? fmtPrice(px) : "—"}
                  {px != null && prev != null && prev > 0 && <Change x={px / prev - 1} />}
                </span>
                <Spark values={hist} />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ------------------------------------------------------------------ chart

function niceTicks(lo: number, hi: number, n = 5): number[] {
  const span = hi - lo;
  if (!(span > 0)) return [lo];
  const raw = span / n;
  const p = 10 ** Math.floor(Math.log10(raw));
  const stepSize = [1, 2, 2.5, 5, 10].map((m) => m * p).find((m) => m >= raw) ?? 10 * p;
  const out: number[] = [];
  for (let v = Math.ceil(lo / stepSize) * stepSize; v <= hi + 1e-9; v += stepSize) out.push(v);
  return out;
}

const hash = (i: number, k: number) => {
  const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

/** Width of an element, kept current as the layout changes. */
const tickLabel = (v: number) => (Math.abs(v) >= 1 && Math.abs(v - Math.round(v)) < 1e-9 ? Math.round(v).toLocaleString("en") : fmtPrice(v));

function PriceChart({ s, id }: { s: LifeState; id: string }) {
  const ref = useRef<SVGSVGElement>(null);
  const [box, boxW] = useWidth<HTMLDivElement>(640);
  const [hover, setHover] = useState<number | null>(null);
  const [range, setRange] = useState<"5y" | "all">("5y");
  const [table, setTable] = useState(false);
  const t = s.desk!.t;
  const company = id.startsWith("co:") ? companyById(id, s.macroSeed) : null;
  const first = company ? company.listT : yearStartT(1950);
  const start = Math.max(first, range === "5y" ? t - 59 : t - 12 * 40);
  const months = useMemo(() => {
    const out: { t: number; o: number; c: number }[] = [];
    for (let k = start; k <= t; k++) {
      const c = priceOf(id, s.macroSeed, k, s.country);
      const o = k > first ? priceOf(id, s.macroSeed, k - 1, s.country) : c;
      if (c != null && o != null) out.push({ t: k, o, c });
    }
    return out;
  }, [id, s.macroSeed, s.country, start, t, first]);
  if (months.length < 2) return <p className="note">Not enough history yet.</p>;

  const vol = company ? company.vol / Math.sqrt(12) : 0.045;
  const bars = months.map((m, i) => {
    const hi = Math.max(m.o, m.c) * (1 + vol * (0.15 + 0.4 * hash(m.t, 1)));
    const lo = Math.min(m.o, m.c) * (1 - vol * (0.15 + 0.4 * hash(m.t, 2)));
    return { ...m, hi, lo, i };
  });
  const W = Math.max(300, boxW);
  const H = W < 480 ? 220 : 280;
  const pad = { l: 8, r: 64, t: 12, b: 28 };
  const lo = Math.min(...bars.map((b) => b.lo));
  const hi = Math.max(...bars.map((b) => b.hi));
  const logScale = hi / Math.max(lo, 1e-12) > 25;
  const f = (v: number) => (logScale ? Math.log(v) : v);
  const fl = f(lo);
  const fh = f(hi);
  const y = (v: number) => pad.t + (1 - (f(v) - fl) / (fh - fl || 1)) * (H - pad.t - pad.b);
  const band = (W - pad.l - pad.r) / bars.length;
  const x = (i: number) => pad.l + band * (i + 0.5);
  const bw = Math.max(1.5, Math.min(10, band * 0.62));
  const ticks = logScale
    ? [lo, Math.sqrt(lo * hi), hi].map((v) => Number(v.toPrecision(2)))
    : niceTicks(lo, hi, 4);
  const years = bars.filter((b) => ((b.t % 12) + 12) % 12 === 0);
  const yearStep = years.length > 8 ? Math.ceil(years.length / 8) : 1;
  const name = instrumentName(s, id);
  const realShare = bars.filter((b) => isRealMonth(id, s.macroSeed, b.t)).length / bars.length;

  const onMove = (ev: React.PointerEvent<SVGSVGElement>) => {
    const svg = ref.current;
    if (!svg) return;
    const r = svg.getBoundingClientRect();
    const px = ((ev.clientX - r.left) / r.width) * W;
    const i = Math.floor((px - pad.l) / band);
    setHover(i >= 0 && i < bars.length ? i : null);
  };
  const onKey = (ev: React.KeyboardEvent) => {
    if (ev.key !== "ArrowLeft" && ev.key !== "ArrowRight") return;
    ev.preventDefault();
    const cur = hover ?? bars.length - 1;
    setHover(Math.max(0, Math.min(bars.length - 1, cur + (ev.key === "ArrowLeft" ? -1 : 1))));
  };
  const hb = hover != null ? bars[hover] : null;

  return (
    <div className="dk-chart">
      <div className="dk-chart-head">
        <div>
          <span className="eyebrow">{company ? sectorLabel(company.sector) : id === "spx" ? "US stocks, priced in your currency" : id.startsWith("cc:") ? "Crypto, priced in your currency" : id.startsWith("mt:") ? "Per troy ounce, priced in your currency" : "Index fund"}</span>
          <h3>{name}</h3>
        </div>
        <div className="seg" role="group" aria-label="Range">
          <button aria-pressed={range === "5y"} onClick={() => setRange("5y")}>
            5 years
          </button>
          <button aria-pressed={range === "all"} onClick={() => setRange("all")}>
            All
          </button>
        </div>
      </div>
      <div className="dk-legend" aria-hidden="true">
        <span>
          <svg width="12" height="14">
            <rect x="2" y="2" width="8" height="10" className="dk-up-hollow" />
          </svg>
          Up month
        </span>
        <span>
          <svg width="12" height="14">
            <rect x="2" y="2" width="8" height="10" className="dk-down-fill" />
          </svg>
          Down month
        </span>
        {logScale && <span>Log scale</span>}
      </div>
      {table ? (
        <div className="table-scroll">
          <table className="data">
            <thead>
              <tr>
                <th>Month</th>
                <th>Price</th>
                <th>Change</th>
              </tr>
            </thead>
            <tbody>
              {[...bars].reverse().map((b) => (
                <tr key={b.t}>
                  <td>{monthLabel(b.t)}</td>
                  <td>{fmtPrice(b.c)}</td>
                  <td>{b.o > 0 ? signed(b.c / b.o - 1) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="chart-wrap" ref={box}>
          <svg
            ref={ref}
            viewBox={`0 0 ${W} ${H}`}
            role="img"
            aria-label={`${name}: monthly prices, ${monthLabel(bars[0].t)} to ${monthLabel(bars[bars.length - 1].t)}. Use the arrow keys to read each month.`}
            tabIndex={0}
            onPointerMove={onMove}
            onPointerLeave={() => setHover(null)}
            onKeyDown={onKey}
            onBlur={() => setHover(null)}
            style={{ touchAction: "pan-y" }}
          >
            {ticks.map((v) => (
              <g key={v}>
                <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="var(--grid)" strokeWidth={1} />
                <text x={W - pad.r + 6} y={y(v) + 4} className="dk-tick">
                  {tickLabel(v)}
                </text>
              </g>
            ))}
            {bars.map((b) => {
              const up = b.c >= b.o;
              const top = y(Math.max(b.o, b.c));
              const h = Math.max(1.5, y(Math.min(b.o, b.c)) - top);
              return (
                <g key={b.t} className={up ? "dk-candle up" : "dk-candle dn"}>
                  <line x1={x(b.i)} x2={x(b.i)} y1={y(b.hi)} y2={y(b.lo)} strokeWidth={1} />
                  {up ? (
                    <rect x={x(b.i) - bw / 2 + 0.75} y={top + 0.75} width={Math.max(0.5, bw - 1.5)} height={Math.max(0.5, h - 1.5)} strokeWidth={1.5} className="dk-up-hollow" />
                  ) : (
                    <rect x={x(b.i) - bw / 2} y={top} width={bw} height={h} className="dk-down-fill" />
                  )}
                </g>
              );
            })}
            {years.map((b, k) =>
              k % yearStep === 0 ? (
                <text key={b.t} x={x(b.i)} y={H - 8} textAnchor="middle" className="dk-tick">
                  {yearOfT(b.t)}
                </text>
              ) : null,
            )}
            {hb && (
              <g pointerEvents="none">
                <line x1={x(hb.i)} x2={x(hb.i)} y1={pad.t - 4} y2={H - pad.b} stroke="var(--ink-2)" strokeWidth={1} opacity={0.5} />
                <circle cx={x(hb.i)} cy={y(hb.c)} r={4} fill="var(--ink)" stroke="var(--sheet)" strokeWidth={2} />
              </g>
            )}
          </svg>
          {hb && (
            <div className="tip dk-tip" style={{ left: `${Math.min(70, Math.max(2, (x(hb.i) / W) * 100 + 2))}%`, top: 8 }}>
              <b>{monthLabel(hb.t)}</b>
              <div className="r2">
                <span>Price</span>
                <b>{fmtPrice(hb.c)}</b>
              </div>
              <div className="r2">
                <span>On the month</span>
                <b>{hb.o > 0 ? signed(hb.c / hb.o - 1) : "—"}</b>
              </div>
              <span className="muted">{isRealMonth(id, s.macroSeed, hb.t) ? "Recorded history" : "Simulated"}</span>
            </div>
          )}
        </div>
      )}
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="note">
          Monthly average prices; wicks are estimated.{" "}
          {company ? "Fictional company, moving with its real industry." : realShare > 0.99 ? "Recorded history." : realShare > 0 ? "Recorded where the data exists, simulated elsewhere." : "Simulated from this country's history."}
        </span>
        <button className="btn small ghost" onClick={() => setTable((v) => !v)} aria-pressed={table}>
          {table ? "Show chart" : "Show as table"}
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ ticket

function Ticket({ s, id, refresh, onNotice }: { s: LifeState; id: string; refresh: () => void; onNotice: (n: string[]) => void }) {
  const d = s.desk!;
  const [side, setSide] = useState<Side>("buy");
  const [kind, setKind] = useState<Kind>("now");
  const [amount, setAmount] = useState("");
  const [limit, setLimit] = useState("");
  const [move, setMove] = useState("");
  const px = id ? quote(s, id) : null;
  const pos = id ? d.pos[id] : undefined;
  const canTrade = !!id && tradable(s).some((i) => i.id === id);
  const num = (v: string) => {
    const n = Number(v.replace(/,/g, ""));
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  const amt = num(amount);
  const lim = num(limit);
  const effSide: Side = kind === "stop" ? "sell" : side;
  const q = effSide === "buy" ? quoteBuy(s, id, Math.min(amt, d.cash)) : quoteSell(s, id, Math.min(amt, pos?.units ?? 0));
  const reason =
    !id ? "Pick something to trade" : effSide === "buy" && !canTrade ? (id.startsWith("cc:") ? "Coins can't be bought here now" : id.startsWith("mt:") ? `${instrumentName(s, id)} can't be bought here now` : "This doesn't trade here any more") : effSide === "buy" && d.cash <= 0 ? "Move money into the account first" : effSide === "sell" && !pos ? "You don't own any" : amt <= 0 ? (effSide === "buy" ? "Enter an amount to spend" : "Enter how many to sell") : kind !== "now" && lim <= 0 ? "Enter a price" : null;

  const submit = () => {
    if (reason) return;
    let ok = false;
    if (kind === "now") ok = effSide === "buy" ? buy(s, id, Math.min(amt, d.cash)) : sell(s, id, Math.min(amt, pos!.units));
    else ok = !!placeOrder(s, { inst: id, side: effSide, kind: kind === "stop" ? "stop" : "limit", price: lim, amount: effSide === "buy" ? Math.min(amt, d.cash) : Math.min(amt, pos!.units) });
    onNotice(ok ? [d.trades[0]?.text ?? "Done."] : ["That didn't go through."]);
    setAmount("");
    refresh();
  };
  const quick = (share: number) => {
    if (effSide === "buy") setAmount(String(Math.floor(d.cash * share * 100) / 100));
    else if (pos) setAmount(String(pos.units * share));
  };
  const moveAmt = num(move);

  return (
    <section className="card dk-ticket" aria-label="Order ticket">
      <span className="eyebrow">Order</span>
      <div className="dk-ticket-name">
        <b>{id ? instrumentName(s, id) : "—"}</b>
        <span className="num">{px != null ? fmtPrice(px) : "—"}</span>
      </div>
      <div className="seg dk-seg" role="group" aria-label="Buy or sell">
        <button aria-pressed={effSide === "buy"} onClick={() => (setSide("buy"), kind === "stop" && setKind("now"))}>
          Buy
        </button>
        <button aria-pressed={effSide === "sell"} onClick={() => setSide("sell")}>
          Sell
        </button>
      </div>
      <div className="seg dk-seg" role="group" aria-label="Order type">
        <button aria-pressed={kind === "now"} onClick={() => setKind("now")} title="Fills at this month's price">
          Now
        </button>
        <button aria-pressed={kind === "limit"} onClick={() => (setKind("limit"), px && setLimit(fmtPrice(px * (effSide === "buy" ? 0.95 : 1.05)).replace(/,/g, "")))}>
          Limit
        </button>
        <button aria-pressed={kind === "stop"} onClick={() => (setKind("stop"), setSide("sell"), px && setLimit(fmtPrice(px * 0.9).replace(/,/g, "")))} disabled={!pos} title={pos ? "Sell automatically if the price falls to a level" : "You need to own it first"}>
          Stop-loss
        </button>
      </div>
      <div className="field">
        <label htmlFor="dk-amt">{effSide === "buy" ? `Amount to spend (cash: ${fmt(s, d.cash)})` : `Units to sell (you own ${fmtUnits(pos?.units ?? 0)})`}</label>
        <input id="dk-amt" type="text" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
        <div className="actions">
          {[0.25, 0.5, 1].map((p) => (
            <button key={p} className="btn small ghost" onClick={() => quick(p)}>
              {p === 1 ? "All" : `${p * 100}%`}
            </button>
          ))}
        </div>
      </div>
      {kind !== "now" && (
        <div className="field">
          <label htmlFor="dk-lim">{kind === "stop" ? "Sell if the price falls to" : effSide === "buy" ? "Buy if the price falls to" : "Sell if the price rises to"}</label>
          <input id="dk-lim" type="text" inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value)} />
          <span className="note">Checked once a month against the monthly price.</span>
        </div>
      )}
      {q && kind === "now" && (
        <dl className="dk-quote">
          <dt>{effSide === "buy" ? "You get" : "You sell"}</dt>
          <dd className="num">{fmtUnits(q.units)} at {fmtPrice(q.price)}</dd>
          <dt>{id.startsWith("cc:") ? "Exchange fee" : "Commission"}</dt>
          <dd className="num">{fmt(s, q.commission)}</dd>
          <dt>{effSide === "buy" ? "Cash out" : "Cash in"}</dt>
          <dd className="num">{fmt(s, q.net)}</dd>
        </dl>
      )}
      <button className="btn primary" onClick={submit} disabled={!!reason} title={reason ?? undefined}>
        {reason ?? (kind === "now" ? (effSide === "buy" ? `Buy for ${fmt(s, Math.min(amt, d.cash))}` : `Sell ${fmtUnits(Math.min(amt, pos?.units ?? 0))}`) : "Place the order")}
      </button>
      {id.startsWith("mt:") && (
        <span className="note">
          {yearOfT(d.t) >= (metalDef(id.slice(3))?.etf ?? 2005)
            ? `Held through a fund that charges ${pct(metalFee(id, yearOfT(d.t)), 1)} a year.`
            : `Bars and coins from a dealer, kept in a vault for ${pct(metalFee(id, yearOfT(d.t)), 1)} a year.`}
        </span>
      )}
      {id.startsWith("cc:") && pos && (
        <div className="dk-custody">
          <span className="eyebrow" id="dk-custody-label">
            Where your coins are
          </span>
          <div className="seg dk-seg" role="group" aria-labelledby="dk-custody-label">
            {(["exchange", "wallet"] as const).map((where) => (
              <button
                key={where}
                aria-pressed={(pos.custody ?? "exchange") === where}
                onClick={() => {
                  if (setCustody(s, id, where)) onNotice([d.trades[0]?.text ?? "Moved."]);
                  refresh();
                }}
              >
                {where === "exchange" ? "On the exchange" : "In your own wallet"}
              </button>
            ))}
          </div>
          <span className="note">
            {pos.custody === "wallet"
              ? "Safe if an exchange fails, but lose the keys and the coins are gone. Selling sends them back to the exchange first."
              : "Exchanges can freeze or fail with your coins inside, as Mt. Gox did in 2014 and FTX in 2022."}{" "}
            Moving costs a {pct(WALLET_FEE, 1)} network fee.
          </span>
        </div>
      )}
      <div className="dk-move">
        <span className="eyebrow">Move money</span>
        <input id="dk-move" type="text" inputMode="decimal" value={move} onChange={(e) => setMove(e.target.value)} placeholder="Amount" aria-label="Amount to move" />
        <div className="actions">
          <button
            className="btn small"
            disabled={moveAmt <= 0 || liquid(s) <= 0 || !deskAccess(s).ok}
            onClick={() => {
              const got = deposit(s, moveAmt);
              onNotice([got > 0 ? `Moved ${fmt(s, got)} in from savings.` : "Nothing to move."]);
              setMove("");
              refresh();
            }}
          >
            Into the account
          </button>
          <button
            className="btn small"
            disabled={moveAmt <= 0 || d.cash <= 0}
            onClick={() => {
              const got = withdraw(s, moveAmt);
              onNotice([got > 0 ? `Moved ${fmt(s, got)} back to savings.` : "Nothing to move."]);
              setMove("");
              refresh();
            }}
          >
            Back to savings
          </button>
        </div>
        <span className="note">Savings you can move: {fmt(s, liquid(s))}. Money back in savings follows your savings plan.</span>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ positions, orders, history

function Positions({ s, refresh, onSelect }: { s: LifeState; refresh: () => void; onSelect: (id: string) => void }) {
  const d = s.desk!;
  const rows = Object.values(d.pos);
  return (
    <section className="dk-lower">
      <div className="card">
        <span className="eyebrow">What you own</span>
        {rows.length === 0 ? (
          <p className="note">Nothing yet. Move money in, pick something on the left and buy.</p>
        ) : (
          <div className="table-scroll">
            <table className="data dk-pos">
              <thead>
                <tr>
                  <th>Holding</th>
                  <th>Units</th>
                  <th className="dk-hide-s">Paid</th>
                  <th>Value</th>
                  <th>Gain</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const px = priceOf(p.id, s.macroSeed, d.t, s.country) ?? p.lastPrice;
                  const v = p.units * px;
                  const gain = v - p.cost;
                  return (
                    <tr key={p.id}>
                      <td>
                        <button className="dk-link" onClick={() => onSelect(p.id)}>
                          {instrumentName(s, p.id)}
                        </button>
                        {p.custody === "wallet" && <small className="dk-tag">wallet</small>}
                      </td>
                      <td>{fmtUnits(p.units)}</td>
                      <td className="dk-hide-s">{fmt(s, p.cost)}</td>
                      <td>{fmt(s, v)}</td>
                      <td>
                        <Change x={p.cost > 0 ? gain / p.cost : 0} />
                      </td>
                      <td>
                        <button className="btn small ghost" onClick={() => (sell(s, p.id, p.units), refresh())}>
                          Sell all
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {d.orders.length > 0 && (
          <>
            <span className="eyebrow">Waiting orders</span>
            <ul className="dk-orders">
              {d.orders.map((o) => (
                <li key={o.id}>
                  <span>
                    {o.kind === "stop" ? "Stop-loss" : o.side === "buy" ? "Buy" : "Sell"} {instrumentName(s, o.inst)} at {fmtPrice(o.price)} ·{" "}
                    {o.side === "buy" ? fmt(s, o.amount) : `${fmtUnits(o.amount)} units`}
                  </span>
                  <button className="btn small ghost" onClick={() => (cancelOrder(s, o.id), refresh())}>
                    Cancel
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
      <div className="card">
        <span className="eyebrow">History</span>
        {d.trades.length === 0 ? (
          <p className="note">Your trades will be listed here.</p>
        ) : (
          <ul className="dk-hist">
            {d.trades.slice(0, 40).map((tr, i) => (
              <li key={i}>
                <span className="num">{tr.y != null && tr.t === yearStartT(tr.y) ? `Start ${tr.y}` : monthLabel(tr.t)}</span>
                <span>
                  {tr.text}
                  {tr.pnl != null && Math.abs(tr.pnl) > 0.005 && <span className={tr.pnl >= 0 ? "dk-gain" : "dk-loss"}> ({tr.pnl >= 0 ? "+" : "−"}{fmt(s, Math.abs(tr.pnl))})</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="kv dk-stats">
          <span>Fees paid so far</span>
          <span className="num">{fmt(s, d.stats.fees)}</span>
          <span>Dividends received</span>
          <span className="num">{fmt(s, d.stats.dividends)}</span>
          <span>Tax on gains</span>
          <span className="num">{fmt(s, d.stats.taxes)}</span>
        </div>
      </div>
    </section>
  );
}

function Ticker({ s }: { s: LifeState }) {
  const t = s.desk!.t;
  const items: string[] = [];
  for (let k = t; k > t - 3; k--) items.push(...headlines(s, k));
  items.push(...s.log.filter((l) => l.year === s.year && l.tone === "history").map((l) => l.text));
  const mem = s.mode === "timetravel" ? memories(s, 3).filter((m) => m.year >= s.year).slice(0, 4) : [];
  if (!items.length && !mem.length) return null;
  return (
    <section className="card dk-news" aria-label="Headlines">
      {items.length > 0 && (
        <>
          <span className="eyebrow">In the news</span>
          <ul>
            {items.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </>
      )}
      {mem.length > 0 && (
        <>
          <span className="eyebrow">What you remember</span>
          <ul>
            {mem.map((m, i) => (
              <li key={i}>
                <span className="num">{m.year}</span> {m.text}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
