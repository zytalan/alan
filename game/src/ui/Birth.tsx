import { useState } from "react";
import {
  birthShares, country, countryIn, countryName, FIELD_NAMES, localUnitsReadable, memories, money, nearest, oneIn, pct,
  toToday, topPercent, usd, W, type LifeState,
} from "../engine";
import { Lottery } from "./Lottery";
import { Rosette } from "./Rosette";

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
  // the certificate prints once the draw has landed
  const [landed, setLanded] = useState(travel);
  const born = Math.round(birthShares(s.birthYear).total / 1e6);
  const micro = `LOT IN LIFE · ${travel ? "ARRIVAL" : "CERTIFICATE OF BIRTH"} · ONE OF ${born} MILLION BORN IN ${s.birthYear} · `.repeat(4);

  return (
    <main className="wrap birth">
      <section className="card birth-map" aria-label={travel ? "Where you land" : "The birth lottery"}>
        <span className="eyebrow">{travel ? `You land in ${countryName(s.country)}, ${s.year}` : `The lottery · ${s.birthYear}`}</span>
        <Lottery year={s.birthYear} chosen={s.birthCountry} draw={!travel} onDone={() => setLanded(true)} />
        {travel && mem.length > 0 && (
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
      </section>
      <article className={`cert${landed ? "" : " printing"}`} aria-labelledby="cert-name" aria-live="polite">
        <div className="cert-rosette" aria-hidden="true">
          <Rosette />
        </div>
        <div className="cert-micro top" aria-hidden="true">
          {micro}
        </div>
        <div className="cert-micro bottom" aria-hidden="true">
          {micro}
        </div>
        <div className="cert-top">
          <span className="eyebrow">{travel ? `Arrival · age ${s.age}` : "Certificate of birth"}</span>
          <span className="cert-year">{travel ? s.year : s.birthYear}</span>
        </div>
        <h1 id="cert-name">{s.name}</h1>
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
          <dd>
            They {s.parents.occ}
            {s.siblings ? `. ${s.siblings} ${s.siblings === 1 ? "sibling" : "siblings"}` : ""}.
          </dd>
          {!travel && le != null && (
            <>
              <dt>Life expectancy</dt>
              <dd>{le.toFixed(0)} years, at the time you were born</dd>
            </>
          )}
          {travel && (
            <>
              <dt>Schooling</dt>
              <dd>
                {s.school ? `${EDU_LABEL[s.school.kind]} (in progress)` : EDU_LABEL[s.edu]}
                {s.field ? `, ${FIELD_NAMES[s.field]}` : ""}
              </dd>
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
        <div className="cert-foot">
          <span className="serial" title="Life code: replay this exact birth from the start screen">
            Nº {String(s.seed).padStart(10, "0")}
          </span>
          <span className="seal" aria-hidden="true">
            {c.i2}
          </span>
        </div>
        <div className="row">
          <button className="btn primary" onClick={onBegin} autoFocus={landed}>
            {travel ? "Open your eyes" : "Live it"}
          </button>
        </div>
      </article>
    </main>
  );
}
