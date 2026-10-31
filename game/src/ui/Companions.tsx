import { useEffect, useMemo, useState } from "react";
import {
  companionAt, companionEvents, companions, companionStory, country, countryIn, countryName, firstName, flagEmoji, intlToUsd, pct, usd,
  type Companion, type LifeState,
} from "../engine";

/** The four born with you, worked out just after the screen first draws so it never waits on them. */
export function useCompanions(s: LifeState): Companion[] | null {
  const [list, setList] = useState<Companion[] | null>(null);
  useEffect(() => {
    let live = true;
    const t = setTimeout(() => live && setList(companions(s)), 0);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [s.seed, s.macroSeed, s.birthYear, s.birthCountry]); // eslint-disable-line react-hooks/exhaustive-deps
  return list;
}

const family = (p: number) => `a family richer than ${pct(p)} there`;

/** Where each of the four is in a given year of your life. */
export function BornWith({ s, cs, year, birth = false }: { s: LifeState; cs: Companion[] | null; year: number; birth?: boolean }) {
  return (
    <section className="card born-with" aria-label="Born the same year as you">
      <div className="born-head">
        <span className="eyebrow">Born the same year as you</span>
        {!birth && cs && <span className="note">{cs.filter((c) => companionAt(s, c, year).alive).length} of 4 alive</span>}
      </div>
      {birth && <p className="note" style={{ margin: 0 }}>Four people born in {s.birthYear} in other countries, by the same rules. You'll see how their lives go beside yours.</p>}
      {!cs ? (
        <p className="note" style={{ margin: 0 }}>Finding them…</p>
      ) : (
        <ul className="mates-list">
          {cs.map((c) => {
            const n = companionAt(s, c, year);
            const moved = n.where !== n.born;
            return (
              <li key={c.life.seed} className={n.alive ? "" : "gone"}>
                <span className="mate-flag" aria-hidden="true">
                  {flagEmoji(country(n.born).i2)}
                </span>
                <span className="mate-who">
                  <b>{n.name}</b>
                  <span className="note">
                    {birth ? `${countryName(n.born)} · ${family(n.familyPct)}` : `${n.doing}${moved && n.alive ? ` in ${countryName(n.where)}` : ""}`}
                  </span>
                </span>
                {!birth && n.age >= 18 && (
                  <span className="mate-money num" title={n.alive ? "Net worth, in today's US dollars" : "Net worth when they died, in today's US dollars"}>
                    {usd(n.usd)}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Each companion's lines, by year, for the ledger. */
export function useCompanionLines(cs: Companion[] | null, from: number, to: number): Map<number, { flag: string; where: string; text: string }[]> {
  return useMemo(() => {
    const out = new Map<number, { flag: string; where: string; text: string }[]>();
    if (!cs) return out;
    for (let y = from; y <= to; y++)
      for (const c of cs)
        for (const text of companionEvents(c, y))
          out.set(y, [...(out.get(y) ?? []), { flag: flagEmoji(country(c.life.birthCountry).i2), where: countryIn(c.life.birthCountry), text }]);
    return out;
  }, [cs, from, to]);
}

/** At the end: how each of the four lived, and their peaks against yours. */
export function CompanionsEnd({ s, cs }: { s: LifeState; cs: Companion[] | null }) {
  if (!cs) return null;
  const peak = (life: LifeState) => intlToUsd(s.macroSeed, Math.max(0, ...life.history.map((h) => h.realNW)));
  const rows = [
    { key: "you", name: "You", flag: flagEmoji(country(s.birthCountry).i2), peak: peak(s) },
    ...cs.map((c) => ({ key: String(c.life.seed), name: firstName(c.life), flag: flagEmoji(country(c.life.birthCountry).i2), peak: peak(c.life) })),
  ];
  const top = Math.max(1000, ...rows.map((r) => r.peak));
  const owned = rows.filter((r) => r.peak >= 100);
  const span = owned.length >= 2 ? Math.max(...owned.map((r) => r.peak)) / Math.min(...owned.map((r) => r.peak)) : 1;
  const never = rows.filter((r) => r.peak < 100 && r.key !== "you");
  // a log scale from $100, so a farmer's savings and a director's fortune both show
  const width = (v: number) => (v < 100 ? 0 : Math.max(2, ((Math.log10(v) - 2) / (Math.log10(top) - 2)) * 100));
  const alive = cs.filter((c) => !c.life.death || c.life.death.year > (s.death?.year ?? s.year));
  return (
    <section className="card">
      <span className="eyebrow">The four born the same year as you</span>
      <ul className="mates-end">
        {cs.map((c) => (
          <li key={c.life.seed}>
            <span className="mate-flag" aria-hidden="true">
              {flagEmoji(country(c.life.birthCountry).i2)}
            </span>
            <span>
              <b>{c.life.name}</b>
              <span className="mate-story">{companionStory(c)}</span>
            </span>
          </li>
        ))}
      </ul>
      <p style={{ margin: 0 }}>
        {alive.length === 0 ? "You outlived all four." : alive.length === 4 ? "All four outlived you." : `${["One", "Two", "Three"][alive.length - 1]} of the four outlived you.`}{" "}
        {span >= 2 ? `Born the same year, by the same rules, the richest of you peaked at ${span >= 100 ? Math.round(span).toLocaleString("en-US") : span.toFixed(0)} times what the poorest did.` : ""}
        {never.length ? ` ${never.map((r) => r.name).join(" and ")} never owned more than they owed.` : ""}
      </p>
      <div className="peaks" role="img" aria-label={`Peak net worth in today's US dollars: ${rows.map((r) => `${r.name} ${usd(r.peak)}`).join(", ")}`}>
        <span className="eyebrow">Peak net worth, in today's US dollars</span>
        {rows.map((r) => (
          <div key={r.key} className={`peak-row${r.key === "you" ? " you" : ""}`}>
            <span className="peak-name">
              <span aria-hidden="true">{r.flag}</span> {r.name}
            </span>
            <span className="peak-track">
              <span className="peak-bar" style={{ width: `${width(r.peak)}%` }} />
            </span>
            <span className="peak-value num">{usd(r.peak)}</span>
          </div>
        ))}
        <span className="note">The bars use a log scale: each step of the same length is ten times more.</span>
      </div>
    </section>
  );
}
