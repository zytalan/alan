// The Invest, Property and Business tabs: funds of every kind, fixed-rate bonds, companies listed and
// private, homes and land to let, businesses to buy or back.

import { useState } from "react";
import {
  ASSET_LABEL, availableAssets, BIZ, BOND_TERMS, bondYield, businessesForSale, buyBond, buyBusiness, buyHome, buyListing, buyPropertyOf, buyWithSavings,
  canBuyBonds, careerAction, careerOptions, closeBusiness, deskAccess, deskValue, ec, fmt, homePrice, joinDeal, lastYearReturns, listBusiness,
  listings, liquid, managedProfit, mortgageQuote, partnerDeal, pct, privateFund, PROPERTY_USES, propertyQuote, sellBond, sellHolding, sellHome,
  setManaged, signedPct, stageName, startupDeal, tradeAsset, usd, W, type AssetKey, type Deal, type LifeState, type PropUse, type Stock,
} from "../engine";

const ABOUT: Partial<Record<AssetKey, string>> = {
  usd: "Dollars in the bank or under the mattress, safe from the local currency.",
  bonds: "Lend to the government. Prices fall when interest rates rise.",
  corp: "Lend to companies: more interest, and some don't pay back in a slump.",
  linkers: "Pays what prices rise by, plus a little. A shield when inflation runs away.",
  ust: "Lend to the US government, in dollars.",
  localEq: "A slice of every company on the local stock market.",
  globalEq: "A slice of companies around the world, in dollars.",
  reit: "Shares in landlords: rents and property prices, bought and sold like stocks.",
  gold: "Keeps its value over the centuries and pays nothing.",
  crypto: "Can double or halve in months.",
};

const GROUPS: [string, AssetKey[]][] = [
  ["Bonds", ["bonds", "corp", "linkers", "ust"]],
  ["Shares and property", ["localEq", "globalEq", "reit"]],
  ["Other", ["usd", "gold", "crypto"]],
];

export function InvestPanel({ s, refresh, onDesk }: { s: LifeState; refresh: () => void; onDesk: () => void }) {
  const allowed = new Set(availableAssets(s));
  const access = deskAccess(s);
  const [amountPct, setAmountPct] = useState(10);
  const amt = (liquid(s) * amountPct) / 100;
  const spend = amt;
  const last = lastYearReturns(s);
  const prevBtc = ec(s, s.year - 1).btc;
  const noBonds = canBuyBonds(s);
  const ls = listings(s);
  const deals = [startupDeal(s), privateFund(s)].filter((d): d is Deal => d != null);
  const act = (f: () => unknown) => {
    f();
    refresh();
  };
  return (
    <div className="list">
      <div className="field">
        <label id="amt">
          Trade size: {amountPct}% of your savings ({fmt(s, amt)}). Buying spends your cash first, then sells other savings.
        </label>
        <div className="seg" role="group" aria-labelledby="amt">
          {[5, 10, 25, 50].map((p) => (
            <button key={p} aria-pressed={amountPct === p} onClick={() => setAmountPct(p)}>
              {p}%
            </button>
          ))}
        </div>
      </div>

      {GROUPS.map(([title, keys]) => {
        // dollars are just cash to someone who lives in dollars
        const shown = keys.filter((k) => (allowed.has(k) || s.holdings[k] >= 1) && !(k === "usd" && s.country === "USA" && s.holdings.usd < 1));
        if (!shown.length) return null;
        return (
          <div key={title}>
            <span className="eyebrow">{title}</span>
            {shown.map((k) => (
              <div key={k} className="item">
                <span className="t">{ASSET_LABEL[k]}</span>
                <span className="actions">
                  <button className="btn small" disabled={!allowed.has(k) || Math.min(spend, liquid(s) - s.holdings[k]) < 1} onClick={() => act(() => buyWithSavings(s, k, Math.min(spend, liquid(s) - s.holdings[k])))}>
                    Buy
                  </button>
                  <button className="btn small ghost" disabled={s.holdings[k] < 1} onClick={() => act(() => tradeAsset(s, k, -s.holdings[k]))}>
                    Sell all
                  </button>
                </span>
                <span className="d">
                  {ABOUT[k]} You hold {fmt(s, s.holdings[k])}
                  {last[k] != null ? ` · ${signedPct(last[k] as number)} last year` : ""}
                  {k === "crypto" && prevBtc ? ` · 1 BTC was ${usd(prevBtc)}` : ""}.
                </span>
              </div>
            ))}
          </div>
        );
      })}

      <div>
        <span className="eyebrow">Fixed-rate government bonds</span>
        <p className="note" style={{ margin: "6px 0" }}>
          Interest every year at today's rate, and your money back at the end. Sell early and you get what the bond is worth then: less if rates have
          risen, more if they've fallen.
        </p>
        <div className="actions">
          {BOND_TERMS.map((n) => (
            <button key={n} className="btn small" disabled={!!noBonds || spend < 1} title={noBonds ?? undefined} onClick={() => act(() => buyBond(s, n, spend))}>
              {n} years at {pct(bondYield(s, n), 1)}
            </button>
          ))}
        </div>
        {(s.bondLots ?? []).map((b) => (
          <div key={b.id} className="item">
            <span className="t">
              {b.years}-year bond at {pct(b.rate, 1)}
            </span>
            <button className="btn small ghost" onClick={() => act(() => sellBond(s, b.id))}>
              Sell
            </button>
            <span className="d">
              {fmt(s, b.face)} back at the end of {b.matures} · {fmt(s, b.face * b.rate)} interest a year · worth {fmt(s, b.value)} today
            </span>
          </div>
        ))}
      </div>

      {ls.length > 0 && (
        <div>
          <span className="eyebrow">Companies on the stock market</span>
          {ls.map((l, i) => (
            <div key={l.stock.id} className="item">
              <span className="t">
                {l.stock.name} <span className="muted">· {l.stock.sector}</span>
              </span>
              <button className="btn small" disabled={spend < 1} onClick={() => act(() => buyListing(s, i, spend))}>
                Buy
              </button>
              <span className="d">
                {l.stock.pitch} Dividend {pct(l.dividend, 1)} · priced at {l.pe}× its yearly profit · {signedPct(l.last)} last year.
              </span>
            </div>
          ))}
          <p className="note" style={{ margin: "6px 0 0" }}>
            Most single companies do worse than the whole market over ten years, and a few do far better. Cheaper ones have done a little better on
            average.
          </p>
        </div>
      )}

      {deals.length > 0 && (
        <div>
          <span className="eyebrow">Private deals</span>
          {deals.map((d) => (
            <DealRow key={d.stock.id} s={s} d={d} act={act} />
          ))}
        </div>
      )}

      <div className="item">
        <span className="t">Trading desk</span>
        <button className="btn small" disabled={!access.ok} title={access.reason} onClick={onDesk}>
          Open
        </button>
        <span className="d">
          {access.ok ? `Index funds and listed companies, month by month.${s.desk ? ` Your account: ${fmt(s, deskValue(s))}.` : ""}` : `${access.reason}.`}
        </span>
      </div>

      {s.stocks.length > 0 && (
        <div>
          <span className="eyebrow">Your shares and stakes</span>
          {s.stocks.map((st) => (
            <StakeRow key={st.id} s={s} st={st} act={act} />
          ))}
        </div>
      )}
    </div>
  );
}

function DealRow({ s, d, act }: { s: LifeState; d: Deal; act: (f: () => unknown) => void }) {
  const joined = s.stocks.some((x) => x.id === d.stock.id);
  const sizes = [d.min, ...(d.max > 2 * d.min ? [d.max] : [])];
  const pe = d.stock.kind === "pe";
  return (
    <div className={`item${sizes.length > 1 ? " stack" : ""}`}>
      <span className="t">{d.stock.name}</span>
      {joined ? (
        <span className="note">You're in</span>
      ) : (
        <span className="actions">
          {sizes.map((a) => (
            <button key={a} className="btn small" disabled={liquid(s) < a} onClick={() => act(() => joinDeal(s, d, a))}>
              Put in {fmt(s, a)}
            </button>
          ))}
        </span>
      )}
      <span className="d">
        {d.what}
        {pe
          ? " Locked for ten years; funds like it have usually beaten the stock market by a little, and rarely lost money."
          : d.stock.kind === "startup"
            ? " Most startups fail and their backers lose everything; a few pay many times over when they're sold."
            : ""}
      </span>
    </div>
  );
}

function StakeRow({ s, st, act }: { s: LifeState; st: Stock; act: (f: () => unknown) => void }) {
  const change = st.cost > 0 && Math.abs(st.value / st.cost - 1) >= 0.005 ? `${st.value >= st.cost ? "+" : "−"}${pct(Math.abs(st.value / st.cost - 1))} since ${st.bought}` : `bought ${st.bought}`;
  const what =
    st.kind === "pe"
      ? `Private equity · returns your money in ${st.exitYear}`
      : st.kind === "stake"
        ? `Partner · ${pct(st.payout ?? 0)} of its value paid out a year · bought out by ${st.exitYear}`
        : st.illiquid
          ? "Private startup · locked until it's sold or closes"
          : `${st.sector}${st.payout ? ` · dividend ${pct(st.payout, 1)}` : ""}`;
  return (
    <div className="item">
      <span className="t">{st.name}</span>
      {st.illiquid ? (
        <span className="note">Locked</span>
      ) : (
        <button className="btn small ghost" onClick={() => act(() => sellHolding(s, st.id, 1))}>
          Sell
        </button>
      )}
      <span className="d">
        {fmt(s, st.value)} · {change} · {what}
      </span>
    </div>
  );
}

// ------------------------------------------------------------------ property

export function PropertyPanel({ s, refresh }: { s: LifeState; refresh: () => void }) {
  const price = homePrice(s);
  const q = mortgageQuote(s, price);
  const hasHome = s.properties.some((p) => p.kind === "home");
  const e = ec(s);
  const reit = availableAssets(s).includes("reit");
  const act = (f: () => unknown) => {
    f();
    refresh();
  };
  return (
    <div className="list">
      <div className="kv">
        <span>A typical home here</span>
        <span className="num">{fmt(s, price)}</span>
        <span>Price ÷ typical wage</span>
        <span className="num">{(price / W(s)).toFixed(1)} years</span>
        <span>Mortgage</span>
        <span className="num">{q.loan > 0 ? `${fmt(s, q.down)} down · ${fmt(s, q.payment)}/yr` : "Not available: cash only"}</span>
        <span>Rents here</span>
        <span className="num">{pct(e.rentYield, 1)} of a home's price a year</span>
      </div>
      <div className="actions">
        <button className="btn small" disabled={!q.ok || hasHome} title={hasHome ? "You already own a home" : q.reason} onClick={() => act(() => buyHome(s, "home"))}>
          Buy a home to live in
        </button>
      </div>
      {!q.ok && q.reason && !hasHome && <p className="note">{q.reason}.</p>}
      <div>
        <span className="eyebrow">Buy to let, or to keep</span>
        {(Object.keys(PROPERTY_USES) as PropUse[]).map((u) => {
          const pq = propertyQuote(s, u);
          const def = PROPERTY_USES[u];
          return (
            <div key={u} className="item">
              <span className="t">{def.label}</span>
              <button className="btn small" disabled={!pq.ok} title={pq.reason} onClick={() => act(() => buyPropertyOf(s, u))}>
                Buy
              </button>
              <span className="d">
                {fmt(s, pq.price)} · {pq.loan > 0 ? `${fmt(s, pq.down)} down` : "cash only"} ·{" "}
                {u === "holiday" ? `upkeep about ${fmt(s, pq.price * 0.015)} a year` : `rent about ${fmt(s, pq.rent)} a year before costs`}. {def.blurb}.
                {!pq.ok && pq.reason ? ` ${pq.reason}.` : ""}
              </span>
            </div>
          );
        })}
        {reit && <p className="note" style={{ margin: "6px 0 0" }}>Or own a slice of many buildings through the property fund in Invest.</p>}
      </div>
      {s.properties.length > 0 && (
        <div>
          <span className="eyebrow">What you own</span>
          {s.properties.map((p) => (
            <div key={p.id} className="item">
              <span className="t">
                {p.kind === "home" ? "Your home" : p.personal || p.use === "holiday" ? "Holiday home" : p.use ? PROPERTY_USES[p.use].label.replace(/^A |^An /, "").replace(/^small /, "Small ").replace(/^./, (c) => c.toUpperCase()) : "House to let"}
              </span>
              <button className="btn small ghost" onClick={() => act(() => sellHome(s, p.id))}>
                Sell
              </button>
              <span className="d">
                Worth {fmt(s, p.value)} · bought {p.bought} for {fmt(s, p.price)}
                {p.mortgage > 0.5 ? ` · owe ${fmt(s, p.mortgage)}` : " · paid off"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ business

export function BusinessPanel({ s, refresh }: { s: LifeState; refresh: () => void }) {
  const b = s.business;
  const start = careerOptions(s).find((o) => o.id === "business");
  const forSale = businessesForSale(s);
  const partner = partnerDeal(s);
  const w = W(s);
  const act = (f: () => unknown) => {
    f();
    refresh();
  };
  return (
    <div className="list">
      {b ? (
        <>
          <div className="kv">
            <span>Business</span>
            <span>
              {b.name} · {BIZ[b.type].title}
            </span>
            <span>{b.bought ? "Bought" : "Founded"}</span>
            <span className="num">{b.bought ?? b.founded}</span>
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
                <span className="num">{b.scale.toFixed(1)}× a new one</span>
                <span>Run by</span>
                <span>{b.managed ? "A manager you pay" : "You"}</span>
              </>
            )}
            <span>Last year's profit</span>
            <span className="num">{fmt(s, b.profit)}</span>
            <span>Worth to a buyer</span>
            <span className="num">{fmt(s, b.valuation)}</span>
          </div>
          <div className="actions">
            {b.type !== "tech" &&
              (b.managed ? (
                <button className="btn small" onClick={() => act(() => setManaged(s, false))} title={s.job ? "You'd leave your job" : undefined}>
                  Run it yourself
                </button>
              ) : (
                <button className="btn small" onClick={() => act(() => setManaged(s, true))}>
                  Hire a manager
                </button>
              ))}
            <button className="btn small" disabled={b.forSale} onClick={() => act(() => listBusiness(s))}>
              {b.forSale ? "Up for sale" : "Put it up for sale"}
            </button>
            <button className="btn small ghost" onClick={() => act(() => closeBusiness(s))}>
              Close it
            </button>
          </div>
          <p className="note">
            {b.managed
              ? "A manager runs it as an average owner would, takes a wage and a share of the profit, and you keep your own work."
              : "It does as well as your skill and contacts. Buyers make offers; a listed business draws them faster."}
          </p>
        </>
      ) : (
        <>
          <p className="note" style={{ margin: 0 }}>
            Street stall, shop, trading company, workshop, services firm or a tech startup. Most new businesses close within five years; one you buy
            has already lasted, and costs more.
          </p>
          <div className="actions">
            <button className="btn small" disabled={!!start?.disabled} title={start?.disabled} onClick={() => act(() => careerAction(s, "business"))}>
              Start a business
            </button>
          </div>
          {forSale.length > 0 && (
            <div>
              <span className="eyebrow">For sale this year</span>
              {forSale.map((f) => (
                <div key={f.id} className="item stack">
                  <span className="t">
                    {f.name} <span className="muted">· {BIZ[f.type].title.toLowerCase()}</span>
                  </span>
                  <span className="actions">
                    <button className="btn small" disabled={liquid(s) < f.price} onClick={() => act(() => buyBusiness(s, f.id, false))} title={s.job && f.type !== "stall" ? "You'd leave your job to run it" : undefined}>
                      Buy and run it
                    </button>
                    <button className="btn small" disabled={liquid(s) < f.price} onClick={() => act(() => buyBusiness(s, f.id, true))}>
                      Buy, hire a manager
                    </button>
                  </span>
                  <span className="d">
                    {fmt(s, f.price)} · open since {f.founded} · made {fmt(s, f.profit)} last year; about {fmt(s, Math.max(0, managedProfit(f.profit, w)))} with a
                    manager's pay taken out.{liquid(s) < f.price ? ` You'd need ${fmt(s, f.price - liquid(s))} more.` : ""}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
      {partner && (
        <div>
          <span className="eyebrow">Back someone else's business</span>
          <DealRow s={s} d={partner} act={act} />
          <p className="note" style={{ margin: "6px 0 0" }}>
            As a partner you get a share of the profit each year and are bought out later. If the business fails, the money is gone.
          </p>
        </div>
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
