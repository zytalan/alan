import {
  country, countryIn, countryName, flagEmoji, FIELD_NAMES, localUnitsReadable, memories, money, nearest, oneIn, pct, toToday,
  topPercent, usd, W, type LifeState,
} from "../engine";

const EDU_LABEL: Record<string, string> = {
  none: "No schooling",
  primary: "Primary school",
  secondary: "Secondary school",
  vocational: "Vocational training",
  bachelor: "Bachelor's degree",
  master: "Master's degree",
  doctorate: "Doctorate",
};

export function Birth({ s, onBegin }: { s: LifeState; onBegin: () => void }) {
  const c = country(s.birthCountry);
  const share = Number(s.flags.birthShare ?? 0);
  const worldPct = Number(s.flags.worldPct ?? 0.5);
  const le = nearest(s.birthCountry, s.sex === "F" ? "leF" : "leM", Math.min(s.birthYear, 2025));
  const w = W(s);
  const travel = s.mode === "timetravel";
  const mem = travel ? memories(s) : [];

  return (
    <main className="wrap">
      <article className="cert" aria-labelledby="cert-name">
        <span className="eyebrow">{travel ? `Arrival · ${s.year}` : "Certificate of birth"}</span>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "start" }}>
          <h1 id="cert-name">{s.name}</h1>
          <span className="flag" aria-hidden="true">{flagEmoji(c.i2)}</span>
        </div>
        {travel ? (
          <p className="odds">
            It's {s.year}. You're {s.age} in {countryIn(s.country)}, and you remember everything that's coming.
          </p>
        ) : (
          <p className="odds">
            {oneIn(share)} babies born in {s.birthYear} were born in {countryIn(s.birthCountry)}.
          </p>
        )}
        <dl>
          <dt>Born</dt>
          <dd>
            {s.birthYear}, {countryName(s.birthCountry)} · {s.sex === "F" ? "girl" : "boy"}
          </dd>
          <dt>Family</dt>
          <dd>
            Richer than {pct(s.familyPct)} of families here · {topPercent(worldPct)} of the world
          </dd>
          <dt>Parents</dt>
          <dd>They {s.parents.occ}{s.siblings ? `. ${s.siblings} ${s.siblings === 1 ? "sibling" : "siblings"}` : ""}.</dd>
          {!travel && le != null && (
            <>
              <dt>Life expectancy</dt>
              <dd>{le.toFixed(0)} years, at the time you were born</dd>
            </>
          )}
          {travel && (
            <>
              <dt>Schooling</dt>
              <dd>{s.school ? `${EDU_LABEL[s.school.kind]} (in progress)` : EDU_LABEL[s.edu]}{s.field ? `, ${FIELD_NAMES[s.field]}` : ""}</dd>
            </>
          )}
          <dt>A typical wage here</dt>
          <dd>
            {localUnitsReadable(s) ? (
              <>
                <span className="num">{money(w, c.cur)}</span> a year <span className="muted">≈ {usd(toToday(s, w))} today</span>
              </>
            ) : (
              <>
                <span className="num">{usd(toToday(s, w))}</span> a year in today's dollars
              </>
            )}
          </dd>
        </dl>
        {travel && (
          <div>
            <span className="eyebrow">What you remember</span>
            <div className="memories">
              {mem.map((m, i) => (
                <div key={i} className={`m ${m.kind === "history" ? "" : m.kind}`}>
                  <span className="num">{m.year}</span>
                  <span>{m.text}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="row">
          <button className="btn primary" onClick={onBegin} autoFocus>
            {travel ? "Open your eyes" : "Live it"}
          </button>
          <span className="note">Life code #{s.seed}</span>
        </div>
      </article>
    </main>
  );
}
