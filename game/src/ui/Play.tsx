import { useCallback, useEffect, useMemo, useState } from "react";
import {
  advance, ASSET_KEYS, ASSET_LABEL, availableAssets, BIZ, buyHome, careerAction, careerOptions, choose, closeBusiness,
  consumerRate, country, countryIn, countryName, creditLimit, deskAccess, deskValue, ec, econ, ensureDesk, FIELD_NAMES, flagEmoji, fmt,
  fmtIn, hasMarkets, homePrice, liquid, listBusiness, localUnitsReadable, mortgageQuote, netWorth, payRank, pct, repayDebt,
  retirementAge, salary, sellHolding, sellHome, setAllocation, setLifestyle, setMarkets, signedPct, stageName, steady, toToday,
  tradeAsset, usd, W,
  wageYears, type AssetKey, type Decision, type Lifestyle, type LifeState, type MarketsData, type YearRecord,
} from "../engine";
import { Sparkline } from "./charts";
import { Coin, currencySymbol, METAL_LABEL, metalFor } from "./Coin";
import { Counter } from "./Counter";
import { DecisionCard, DecisionWaiting } from "./Decision";
import { Desk } from "./Desk";
import { FrontPage } from "./FrontPage";
import { LifeStrip } from "./LifeStrip";

/** Scroll the ledger to a year (or the nearest year it has a line for) and flash it. */
function jumpToYear(year: number): void {
  let el: HTMLElement | null = null;
  for (let d = 0; d < 200 && !el; d++) el = document.getElementById(`y-${year - d}`) ?? document.getElementById(`y-${year + d}`);
  if (!el) return;
  const smooth = !matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "center" });
  el.classList.remove("flash");
  void el.offsetWidth;
  el.classList.add("flash");
}

type Speed = 0 | 1 | 3 | 10;
const SPEED_MS: Record<Exclude<Speed, 0>, number> = { 1: 1500, 3: 600, 10: 160 };

const EDU_LABEL: Record<string, string> = {
  none: "No schooling",
  primary: "Primary school",
  secondary: "Secondary school",
  vocational: "Vocational training",
  bachelor: "Bachelor's degree",
  master: "Master's degree",
  doctorate: "Doctorate",
};

const LIFESTYLES: { id: Lifestyle; label: string; hint: string }[] = [
  { id: "frugal", label: "Frugal", hint: "You bank most of every raise." },
  { id: "modest", label: "Modest", hint: "You spend most raises, save a little." },
  { id: "comfortable", label: "Comfortable", hint: "Nice things, little saving." },
  { id: "lavish", label: "Lavish", hint: "You live large — on credit if needed." },
];

export function Play({ s, version, refresh, onDeath }: { s: LifeState; version: number; refresh: () => void; onDeath: () => void }) {
  const [speed, setSpeed] = useState<Speed>(0);
  const [auto, setAuto] = useState(false);
  // a decision put aside to use the rest of the screen; the year waits for it
  const [aside, setAside] = useState<Decision | null>(null);
  const [deskOpen, setDeskOpen] = useState(false);
  const [deskState, setDeskState] = useState<"idle" | "loading" | "error">("idle");
  const pending = s.pending[0];
  const asking = !!pending && s.alive && !auto;
  const waiting = asking && pending === aside;
  const access = deskAccess(s);

  const openDesk = useCallback(async () => {
    setSpeed(0);
    if (!hasMarkets()) {
      setDeskState("loading");
      try {
        const r = await fetch("./data/markets.json");
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        setMarkets((await r.json()) as MarketsData);
      } catch {
        setDeskState("error");
        return;
      }
    }
    setDeskState("idle");
    ensureDesk(s);
    setDeskOpen(true);
    refresh();
  }, [s, refresh]);

  const step = useCallback(() => {
    if (!s.alive) return;
    // the year can't move on past an open question: bring it back instead
    if (s.pending.length) return setAside(null);
    advance(s);
    refresh();
  }, [s, refresh]);

  /** Set the clock. Asking it to run brings back a decision that was put aside. */
  const run = useCallback((v: Speed) => {
    setSpeed(v);
    if (v > 0) setAside(null);
  }, []);

  // the clock: one year per tick, pausing for decisions
  useEffect(() => {
    if (!s.alive) {
      const t = setTimeout(onDeath, 900);
      return () => clearTimeout(t);
    }
    if (pending) {
      if (!auto) return;
      const t = setTimeout(() => {
        choose(s, pending.id, steady(s, pending));
        refresh();
      }, 700);
      return () => clearTimeout(t);
    }
    if (speed === 0) return;
    const t = setTimeout(step, SPEED_MS[speed]);
    return () => clearTimeout(t);
  }, [s, version, pending, speed, auto, step, refresh, onDeath]);

  useEffect(() => {
    if (deskOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === " ") {
        e.preventDefault();
        run(speed === 0 ? 1 : 0);
      } else if (e.key === "n" || e.key === "N") step();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, run, speed, deskOpen]);

  const decision = asking && (
    waiting ? (
      <DecisionWaiting d={pending} onOpen={() => setAside(null)} />
    ) : (
      <DecisionCard
        d={pending}
        year={s.year}
        age={s.age}
        onChoose={(id) => {
          choose(s, pending.id, id);
          refresh();
        }}
        onClose={() => setAside(pending)}
      />
    )
  );

  const c = country(s.country);
  if (deskOpen && s.desk && s.alive) {
    return (
      <>
        <Desk s={s} version={version} refresh={refresh} onClose={() => setDeskOpen(false)} onFinishYear={step} />
        {decision}
      </>
    );
  }
  return (
    <>
      <header className="topbar">
        <div className="wrap">
          <div className="who">
            <span className="name">{s.name}</span>
            <span className="meta">
              {flagEmoji(c.i2)} {countryName(s.country)} · <span className="num">{s.year}</span> · age <span className="num">{s.age}</span>
            </span>
          </div>
          <div className="controls">
            <div className="seg" role="group" aria-label="Speed">
              <button aria-pressed={speed === 0} onClick={() => run(0)} title="Pause (space)">
                Pause
              </button>
              {([1, 3, 10] as const).map((v) => (
                <button key={v} aria-pressed={speed === v} onClick={() => run(v)}>
                  {v}×
                </button>
              ))}
            </div>
            <button className="btn small" onClick={openDesk} disabled={!access.ok || deskState === "loading"} title={access.ok ? "Trade month by month" : access.reason}>
              {deskState === "loading" ? "Loading markets…" : "Trading desk"}
            </button>
            <button className="btn small primary" onClick={step} disabled={!s.alive} title={pending ? "A decision is waiting" : "Next year (N)"}>
              Next year
            </button>
            <label className="toggle">
              <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Auto-decide
            </label>
          </div>
        </div>
      </header>
      {deskState === "error" && (
        <div className="wrap">
          <p className="note" role="alert">
            The market history didn't load. Check your connection and press Trading desk again.
          </p>
        </div>
      )}
      <div className="wrap strip-row">
        <LifeStrip s={s} onPick={jumpToYear} />
      </div>
      <main className="wrap board">
        <div className="ledger-col">
          <FrontPage s={s} />
          <Ledger s={s} version={version} />
        </div>
        <aside className="side">
          <Summary s={s} />
          <Panels s={s} refresh={refresh} onDesk={openDesk} />
        </aside>
      </main>
      {decision}
    </>
  );
}

// ------------------------------------------------------------------ ledger

function Ledger({ s, version }: { s: LifeState; version: number }) {
  const years = useMemo(() => {
    const byYear = new Map<number, { age: number; entries: LifeState["log"] }>();
    for (const l of s.log) {
      const g = byYear.get(l.year) ?? { age: l.age, entries: [] };
      g.entries.push(l);
      byYear.set(l.year, g);
    }
    const bal = new Map(s.history.map((h) => [h.year, h.netWorth]));
    return [...byYear.entries()].sort((a, b) => b[0] - a[0]).map(([year, g]) => ({ year, ...g, bal: bal.get(year) }));
    // version changes whenever the life does
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s, version, s.log.length]);
  return (
    <section className="ledger" aria-label="Your life, year by year">
      <div className="ledger-head eyebrow">
        <span>Year</span>
        <span>Entry</span>
        <span>Net worth</span>
      </div>
      {years.length === 0 && <div className="ledger-empty">Your life will be written here.</div>}
      {years.map((y) => (
        <div key={y.year} id={`y-${y.year}`} className="year">
          <div>
            <div className="y">{y.year}</div>
            <div className="a">age {y.age}</div>
          </div>
          <div className="entries">
            {y.entries.map((e, i) => (
              <div key={i} className={`entry ${e.tone}`}>
                <span>{e.text}</span>
              </div>
            ))}
          </div>
          <div className={`bal ${y.bal != null && y.bal < 0 ? "neg" : ""}`}>{y.bal != null ? fmt(s, y.bal) : ""}</div>
        </div>
      ))}
    </section>
  );
}

// ------------------------------------------------------------------ summary

function Summary({ s }: { s: LifeState }) {
  const nw = netWorth(s);
  const wy = wageYears(s, nw);
  const metal = metalFor(wy);
  const last = s.history[s.history.length - 1];
  const points = s.history.filter((h) => h.age >= Math.max(0, s.startAge - 1)).map((h) => ({ x: h.age, y: h.realNW }));
  const meters: { k: keyof LifeState["stats"]; label: string }[] = [
    { k: "health", label: "Health" },
    { k: "happiness", label: "Happiness" },
    { k: "skill", label: "Skill" },
    { k: "network", label: "Network" },
  ];
  return (
    <section className="card balance" aria-label="Your account">
      <div className="balance-top">
        <Coin
          metal={metal}
          legend={`${s.name} · ${countryName(s.birthCountry)} · ${s.birthYear} ·`}
          symbol={localUnitsReadable(s) ? currencySymbol(country(s.country).cur) : "$"}
          age={s.age}
        />
        <div className="balance-figure">
          <span className="eyebrow">Net worth</span>
          <Counter className={`big ${nw < 0 ? "neg" : ""}`} text={fmt(s, nw)} />
          <span className="tier">
            <b>{METAL_LABEL[metal]}</b> ·{" "}
            {wy < 0 ? `debts of ${Math.abs(wy).toFixed(1)} years' typical wage` : `${wy.toFixed(1)} years of a typical wage here`}
          </span>
        </div>
      </div>
      <div className="muted" style={{ fontSize: 14 }}>
        {localUnitsReadable(s)
          ? `≈ ${usd(toToday(s, nw))} in today's US dollars, adjusted for prices here`
          : `In today's US dollars: the ${country(s.country).cur} of ${s.year} has been redenominated so often since that its amounts would read as zero`}
      </div>
      <Sparkline points={points} label="Net worth over your life, in today's dollars" />
      <div className="flows">
        <div>
          <span className="eyebrow">Income</span>
          <span className="num">{last ? fmt(s, last.income) : "—"}</span>
        </div>
        <div title="Tax, living costs and interest">
          <span className="eyebrow">Tax &amp; costs</span>
          <span className="num">{last ? fmt(s, last.income - last.saved) : "—"}</span>
        </div>
        <div>
          <span className="eyebrow">Kept</span>
          <span className="num">{last ? fmt(s, last.saved) : "—"}</span>
        </div>
      </div>
      <PayRank s={s} />
      {last && <YearMoves s={s} rec={last} prev={s.history[s.history.length - 2]} />}
      <div className="meters">
        {meters.map((m) => (
          <div key={m.k} className={`meter ${(m.k === "health" || m.k === "happiness") && s.stats[m.k] < 30 ? "low" : ""}`}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span>{m.label}</span>
              <span className="num">{Math.round(s.stats[m.k])}</span>
            </div>
            <div className="bar">
              <span style={{ width: `${s.stats[m.k]}%` }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/** "Top 18%" for the upper half, "bottom 30%" for the lower. */
function rankText(share: number): string {
  return share >= 0.5 ? `top ${Math.max(1, Math.round((1 - share) * 100))}%` : `bottom ${Math.max(1, Math.round(share * 100))}%`;
}

/** Where your pay ranks among earners at home and in the world. */
function PayRank({ s }: { s: LifeState }) {
  const mult = s.job && !s.retired ? s.job.mult : 0;
  const r = useMemo(() => (mult > 0 ? payRank(s.country, s.year, mult) : null), [s.country, s.year, mult]);
  if (!r) return null;
  return (
    <p className="rank">
      Your pay: <b>{rankText(r.country)}</b> in {countryIn(s.country)} · <b>{rankText(r.world)}</b> worldwide
    </p>
  );
}

const MOVE_LABEL: Record<string, string> = {
  interest: "Interest on debts",
  cash: "Interest on savings",
  usd: "US dollars",
  bonds: "Bonds",
  localEq: "Local stock index",
  globalEq: "Global stock index",
  gold: "Gold",
  crypto: "Bitcoin",
  picks: "Shares you picked",
  desk: "Trading account",
  home: "Home and property value",
  business: "Your business",
  bank: "Lost in a banking crisis",
  writeoff: "Debts written off",
  inherit: "Inheritance",
  gainsTax: "Tax on investment gains",
  other: "Other",
};

function moveLabel(key: string, amount: number): string {
  if (key === "pay") return amount >= 0 ? "Saved from income" : "Spent more than you earned";
  if (key.startsWith("ev:")) return key.slice(3).replace(/\?$/, ""); // decision titles, without their question mark
  return MOVE_LABEL[key] ?? key;
}

/** What moved net worth last year, biggest causes first, then what prices took. */
function YearMoves({ s, rec, prev }: { s: LifeState; rec: YearRecord; prev?: YearRecord }) {
  if (!rec.moves || !prev) return null;
  const e = econ(rec.country, s.macroSeed, rec.year, s.marketVariant);
  const small = 0.002 * e.wage;
  const money = (v: number) => `${v >= 0 ? "+" : "−"}${fmtIn(s, Math.abs(v), rec.year, rec.country)}`;
  const parts = Object.entries(rec.moves).filter(([k]) => k !== "other").sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  const shown = parts.slice(0, 5).filter(([, v]) => Math.abs(v) >= small);
  const rest = Object.values(rec.moves).reduce((a, v) => a + v, 0) - shown.reduce((a, [, v]) => a + v, 0);
  const change = rec.netWorth - prev.netWorth;
  if (!shown.length && Math.abs(change) < small) return null;
  const prices = -prev.netWorth * e.infl;
  const tone = (v: number) => (v > 0 ? "up" : v < 0 ? "down" : "");
  return (
    <div className="moves">
      <div className="moves-head">
        <span className="eyebrow">What moved it in {rec.year}</span>
        <b className={`num ${tone(change)}`}>{money(change)}</b>
      </div>
      <ul>
        {shown.map(([k, v]) => (
          <li key={k}>
            <span>{moveLabel(k, v)}</span>
            <b className={`num ${tone(v)}`}>{money(v)}</b>
          </li>
        ))}
        {Math.abs(rest) >= small && (
          <li>
            <span>Other</span>
            <b className={`num ${tone(rest)}`}>{money(rest)}</b>
          </li>
        )}
        {Math.abs(prices) >= small && (
          <li className="prices">
            <span>
              {e.infl >= 0 ? "Rising" : "Falling"} prices ({signedPct(e.infl, 1)})
            </span>
            <b className={`num ${tone(prices)}`}>{money(prices)}</b>
          </li>
        )}
        <li className="total">
          <span>After inflation</span>
          <b className={`num ${tone(change + prices)}`}>{money(change + prices)}</b>
        </li>
      </ul>
    </div>
  );
}

// ------------------------------------------------------------------ panels

type Tab = "money" | "work" | "invest" | "home" | "business";

function Panels({ s, refresh, onDesk }: { s: LifeState; refresh: () => void; onDesk: () => void }) {
  const [tab, setTab] = useState<Tab>("money");
  const tabs: { id: Tab; label: string }[] = [
    { id: "money", label: "Money" },
    { id: "work", label: "Work" },
    { id: "invest", label: "Invest" },
    { id: "home", label: "Property" },
    { id: "business", label: "Business" },
  ];
  const minor = s.age < 16;
  return (
    <section className="card" aria-label="Manage your life">
      <div className="tabs" role="tablist">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      {minor ? (
        <p className="note">You're {s.age}. Your parents run the money for now — your decisions so far are about growing up.</p>
      ) : tab === "money" ? (
        <MoneyPanel s={s} refresh={refresh} />
      ) : tab === "work" ? (
        <WorkPanel s={s} refresh={refresh} />
      ) : tab === "invest" ? (
        <InvestPanel s={s} refresh={refresh} onDesk={onDesk} />
      ) : tab === "home" ? (
        <HomePanel s={s} refresh={refresh} />
      ) : (
        <BusinessPanel s={s} refresh={refresh} />
      )}
    </section>
  );
}

function accessNotes(s: LifeState): string[] {
  const out: string[] = [];
  const mkt = country(s.country).mkt;
  if (!s.access.bank) out.push("No bank account yet — savings sit as cash at home, gold or dollars.");
  if (!s.access.localEq) out.push(mkt == null ? "There's no stock market here." : s.year < mkt ? `The local stock market opens in ${mkt}.` : s.access.bank ? "You need to be 18 to buy stocks." : "Stocks need a bank account.");
  if (!s.access.globalEq) out.push("Global funds aren't open to you yet.");
  else if (s.access.globalFriction > 0.01) out.push("Capital controls: buying abroad costs extra every year.");
  if (s.year < 2011) out.push("Bitcoin doesn't trade until 2011.");
  return out;
}

function MoneyPanel({ s, refresh }: { s: LifeState; refresh: () => void }) {
  const allowed = availableAssets(s);
  const total = ASSET_KEYS.reduce((a, k) => a + s.holdings[k], 0) + s.cashHome;
  const style = LIFESTYLES.find((l) => l.id === s.lifestyle)!;
  const setWeight = (k: AssetKey, v: number) => {
    const next = { ...s.allocation, [k]: v / 100 };
    const sum = ASSET_KEYS.reduce((a, x) => a + (allowed.includes(x) ? next[x] : 0), 0);
    if (sum <= 0) return;
    setAllocation(s, next, false);
    refresh();
  };
  const shown = allowed.reduce((a, k) => a + s.allocation[k], 0) || 1;
  return (
    <div className="list">
      <div className="field">
        <label id="ls">Lifestyle</label>
        <div className="seg" role="group" aria-labelledby="ls">
          {LIFESTYLES.map((l) => (
            <button key={l.id} aria-pressed={s.lifestyle === l.id} onClick={() => (setLifestyle(s, l.id), refresh())}>
              {l.label}
            </button>
          ))}
        </div>
        <span className="note">{style.hint}</span>
      </div>
      <div className="alloc">
        <span className="eyebrow">Where new savings go</span>
        {allowed.map((k) => (
          <div key={k} className="alloc-row">
            <label htmlFor={`al-${k}`}>{ASSET_LABEL[k]}</label>
            <input id={`al-${k}`} type="range" min={0} max={100} step={5} value={Math.round((s.allocation[k] / shown) * 100)} onChange={(e) => setWeight(k, Number(e.target.value))} />
            <span className="num" style={{ textAlign: "right" }}>
              {pct(s.allocation[k] / shown)}
            </span>
          </div>
        ))}
        <div className="actions">
          <button className="btn small" disabled={!s.access.bank} onClick={() => (setAllocation(s, s.allocation, true), refresh())}>
            Rebalance what I hold to match
          </button>
        </div>
      </div>
      <div>
        <span className="eyebrow">What you hold</span>
        <div className="kv" style={{ marginTop: 8 }}>
          {ASSET_KEYS.filter((k) => s.holdings[k] > 0.5).map((k) => (
            <Row key={k} label={ASSET_LABEL[k]} value={fmt(s, s.holdings[k])} share={total ? s.holdings[k] / total : 0} />
          ))}
          {s.cashHome > 0.5 && <Row label="Cash at home" value={fmt(s, s.cashHome)} share={total ? s.cashHome / total : 0} />}
          {s.desk && deskValue(s) > 0.5 && <Row label="Trading account" value={fmt(s, deskValue(s))} />}
          {s.frozen && <Row label={`Frozen until ${s.frozen.until}`} value={fmt(s, s.frozen.amount)} />}
          {total <= 0.5 && !s.frozen && <span className="muted">Nothing saved yet.</span>}
        </div>
      </div>
      <div>
        <span className="eyebrow">What you owe</span>
        <div className="kv" style={{ marginTop: 8 }}>
          {s.consumerDebt > 0.5 && <Row label={`Loans at ${pct(consumerRate(s))}`} value={fmt(s, s.consumerDebt)} />}
          {s.studentDebt > 0.5 && <Row label="Student loans" value={fmt(s, s.studentDebt)} />}
          {s.properties.filter((p) => p.mortgage > 0.5).map((p) => (
            <Row key={p.id} label={`Mortgage at ${pct(p.rate, 1)}`} value={fmt(s, p.mortgage)} />
          ))}
          {s.consumerDebt + s.studentDebt + s.properties.reduce((a, p) => a + p.mortgage, 0) <= 0.5 && <span className="muted">No debts.</span>}
        </div>
        {s.consumerDebt > 0.5 && (
          <div className="actions" style={{ marginTop: 8 }}>
            <button className="btn small" disabled={liquid(s) <= 0} onClick={() => (repayDebt(s, s.consumerDebt), refresh())}>
              Pay off loans from savings
            </button>
          </div>
        )}
        {creditLimit(s) <= 0 && s.year < s.creditLockUntil && <p className="note">After your bankruptcy, no one will lend to you until {s.creditLockUntil}.</p>}
      </div>
      {accessNotes(s).map((n) => (
        <p key={n} className="note" style={{ margin: 0 }}>
          {n}
        </p>
      ))}
    </div>
  );
}

function Row({ label, value, share }: { label: string; value: string; share?: number }) {
  return (
    <>
      <span>{label}</span>
      <span className="num">
        {value}
        {share != null && <span className="muted"> · {pct(share)}</span>}
      </span>
    </>
  );
}

function WorkPanel({ s, refresh }: { s: LifeState; refresh: () => void }) {
  const opts = careerOptions(s);
  const kidsHome = s.kids.filter((k) => s.year - k.born < 22).length;
  return (
    <div className="list">
      <div className="kv">
        <span>Now</span>
        <span>
          {s.job
            ? `${s.job.title}, year ${s.job.years + 1}`
            : s.school
              ? `Studying (${EDU_LABEL[s.school.kind].toLowerCase()}, ${s.school.yearsLeft} yr left)`
              : s.retired
                ? "Retired"
                : s.business
                  ? `Running ${s.business.name}`
                  : "Out of work"}
        </span>
        {s.job && (
          <>
            <span>Pay</span>
            <span className="num">
              {fmt(s, salary(s))}/yr · {(s.job.mult).toFixed(1)}× typical
            </span>
          </>
        )}
        {s.retired && s.pension > 0 && (
          <>
            <span>Pension</span>
            <span className="num">{fmt(s, s.pension * W(s))}/yr</span>
          </>
        )}
        <span>Education</span>
        <span>
          {EDU_LABEL[s.edu]}
          {s.field && s.edu !== "secondary" && s.edu !== "primary" ? `, ${FIELD_NAMES[s.field]}` : ""}
        </span>
        <span>Typical wage here</span>
        <span className="num">{fmt(s, W(s))}</span>
        <span>Family</span>
        <span>
          {s.partner ? `Married to ${s.partner.name}${s.partner.working ? "" : " (not working)"}` : s.dating ? `Dating ${s.flags.datingName}` : "Single"}
          {s.kids.length ? ` · ${s.kids.length} ${s.kids.length === 1 ? "child" : "children"}${kidsHome ? ` (${kidsHome} at home)` : ""}` : ""}
        </span>
        {!s.retired && s.age >= 30 && (
          <>
            <span>Retirement age</span>
            <span className="num">{retirementAge(s)}</span>
          </>
        )}
      </div>
      <div>
        <span className="eyebrow">Make a move</span>
        <div className="actions" style={{ marginTop: 8 }}>
          {opts.map((o) => (
            <button key={o.id} className="btn small" disabled={!!o.disabled} title={o.disabled} onClick={() => (careerAction(s, o.id), refresh())}>
              {o.label}
            </button>
          ))}
        </div>
        <p className="note">One career move per year. {opts.find((o) => o.disabled)?.disabled ? "" : ""}</p>
      </div>
    </div>
  );
}

function InvestPanel({ s, refresh, onDesk }: { s: LifeState; refresh: () => void; onDesk: () => void }) {
  const allowed = availableAssets(s).filter((k) => k !== "cash");
  const cash = s.holdings.cash + s.cashHome;
  const access = deskAccess(s);
  const prev = ec(s, s.year - 1);
  const [amountPct, setAmountPct] = useState(10);
  const amt = (liquid(s) * amountPct) / 100;
  return (
    <div className="list">
      <div className="field">
        <label id="amt">Trade size: {amountPct}% of your savings ({fmt(s, amt)})</label>
        <div className="seg" role="group" aria-labelledby="amt">
          {[5, 10, 25, 50].map((p) => (
            <button key={p} aria-pressed={amountPct === p} onClick={() => setAmountPct(p)}>
              {p}%
            </button>
          ))}
        </div>
      </div>
      <div>
        <span className="eyebrow">Buy and sell</span>
        {allowed.map((k) => (
          <div key={k} className="item">
            <span className="t">{ASSET_LABEL[k]}</span>
            <span className="actions">
              <button className="btn small" disabled={cash < 1 || amt < 1} onClick={() => (tradeAsset(s, k, Math.min(cash, amt)), refresh())}>
                Buy
              </button>
              <button className="btn small ghost" disabled={s.holdings[k] < 1} onClick={() => (tradeAsset(s, k, -s.holdings[k]), refresh())}>
                Sell all
              </button>
            </span>
            <span className="d">
              You hold {fmt(s, s.holdings[k])}
              {k === "crypto" && prev.btc ? ` · 1 BTC was ${usd(prev.btc)} at the end of ${s.year - 1}` : ""}
              {k === "localEq" ? ` · last year ${pct((1 + prev.eq) / (1 + prev.infl) - 1)} after inflation` : ""}
            </span>
          </div>
        ))}
        {allowed.length === 0 && <p className="note">Nothing to invest in yet.</p>}
      </div>
      <div className="item">
        <span className="t">Trading desk</span>
        <button className="btn small" disabled={!access.ok} title={access.reason} onClick={onDesk}>
          Open
        </button>
        <span className="d">
          {access.ok
            ? `Index funds and listed companies, month by month.${s.desk ? ` Your account: ${fmt(s, deskValue(s))}.` : ""}`
            : `${access.reason}.`}
        </span>
      </div>
      {s.stocks.length > 0 && (
        <div>
          <span className="eyebrow">Your stocks and stakes</span>
          {s.stocks.map((st) => (
            <div key={st.id} className="item">
              <span className="t">{st.name}</span>
              {st.illiquid ? (
                <span className="note">Locked until an exit</span>
              ) : (
                <button className="btn small ghost" onClick={() => (sellHolding(s, st.id, 1), refresh())}>
                  Sell
                </button>
              )}
              <span className="d">
                {fmt(s, st.value)} · {st.cost > 0 ? `${st.value >= st.cost ? "+" : "−"}${pct(Math.abs(st.value / st.cost - 1))}` : ""} since {st.bought}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function HomePanel({ s, refresh }: { s: LifeState; refresh: () => void }) {
  const price = homePrice(s);
  const q = mortgageQuote(s, price);
  const hasHome = s.properties.some((p) => p.kind === "home");
  const e = ec(s);
  return (
    <div className="list">
      <div className="kv">
        <span>A typical home here</span>
        <span className="num">{fmt(s, price)}</span>
        <span>Price ÷ typical wage</span>
        <span className="num">{(price / W(s)).toFixed(1)} years</span>
        <span>Mortgage</span>
        <span className="num">{q.loan > 0 ? `${fmt(s, q.down)} down · ${fmt(s, q.payment)}/yr` : "Not available — cash only"}</span>
        <span>Rent it out for</span>
        <span className="num">{fmt(s, price * e.rentYield)}/yr gross</span>
      </div>
      <div className="actions">
        <button className="btn small" disabled={!q.ok || hasHome} title={hasHome ? "You already own a home" : q.reason} onClick={() => (buyHome(s, "home"), refresh())}>
          Buy a home to live in
        </button>
        <button className="btn small" disabled={!q.ok} title={q.reason} onClick={() => (buyHome(s, "rental"), refresh())}>
          Buy one to rent out
        </button>
      </div>
      {!q.ok && q.reason && <p className="note">{q.reason}.</p>}
      {s.properties.map((p) => (
        <div key={p.id} className="item">
          <span className="t">{p.kind === "home" ? "Your home" : "Rental property"}</span>
          <button className="btn small ghost" onClick={() => (sellHome(s, p.id), refresh())}>
            Sell
          </button>
          <span className="d">
            Worth {fmt(s, p.value)} · bought {p.bought} for {fmt(s, p.price)}
            {p.mortgage > 0.5 ? ` · owe ${fmt(s, p.mortgage)}` : " · paid off"}
          </span>
        </div>
      ))}
    </div>
  );
}

function BusinessPanel({ s, refresh }: { s: LifeState; refresh: () => void }) {
  const b = s.business;
  const start = careerOptions(s).find((o) => o.id === "business");
  return (
    <div className="list">
      {b ? (
        <>
          <div className="kv">
            <span>Business</span>
            <span>
              {b.name} · {BIZ[b.type].title}
            </span>
            <span>Founded</span>
            <span className="num">{b.founded}</span>
            {b.type === "tech" ? (
              <>
                <span>Stage</span>
                <span>{stageName(b.stage)}</span>
                <span>You own</span>
                <span className="num">{pct(b.equity)}</span>
              </>
            ) : (
              <>
                <span>Size</span>
                <span className="num">{b.scale.toFixed(1)}× where you started</span>
              </>
            )}
            <span>Last year's profit</span>
            <span className="num">{fmt(s, b.profit)}</span>
            <span>Worth to a buyer</span>
            <span className="num">{fmt(s, b.valuation)}</span>
          </div>
          <div className="actions">
            <button className="btn small" disabled={b.forSale} onClick={() => (listBusiness(s), refresh())}>
              {b.forSale ? "Up for sale" : "Put it up for sale"}
            </button>
            <button className="btn small ghost" onClick={() => (closeBusiness(s), refresh())}>
              Close it
            </button>
          </div>
          <p className="note">Buyers make offers; a listed business draws them faster.</p>
        </>
      ) : (
        <>
          <p className="note" style={{ margin: 0 }}>
            Street stall, shop, trading company, workshop, services firm or a tech startup. Most small businesses close within five
            years; the ones that survive can be sold.
          </p>
          <div className="actions">
            <button className="btn small" disabled={!!start?.disabled} title={start?.disabled} onClick={() => (careerAction(s, "business"), refresh())}>
              Start a business
            </button>
          </div>
        </>
      )}
      {s.pastBusinesses.map((p, i) => (
        <div key={i} className="item">
          <span className="t">{p.name}</span>
          <span className="num">{p.value > 0 ? fmt(s, p.value) : ""}</span>
          <span className="d">
            {BIZ[p.type].title} · {p.outcome} in {p.year}
          </span>
        </div>
      ))}
    </div>
  );
}
