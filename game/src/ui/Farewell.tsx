import { useEffect, useRef, useState, type RefObject } from "react";
import type { Farewell as Told, LifeState } from "../engine";
import { StoneImage } from "./ShareCard";

type Step = "death" | "montage" | "funeral";

const stillness = () => {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
};

/** How long a moment stays up: long enough to read it. */
const dwell = (text: string) => Math.min(4200, Math.max(1800, 1400 + 28 * text.length));
const when = (year: number, age: number) => (age > 0 ? `${year} · age ${age}` : String(year));

/** The end of a life, before its statement: how it ended, the life flashing past, and the goodbye. */
export function Farewell({ s, f, onDone }: { s: LifeState; f: Told; onDone: () => void }) {
  const [step, setStep] = useState<Step>("death");
  const head = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    window.scrollTo(0, 0);
    head.current?.focus();
  }, [step]);

  return (
    <main className="wrap farewell">
      {step === "death" && (
        <section className="farewell-card" key="death">
          <span className="eyebrow">{when(f.year, f.age)}</span>
          <h1 ref={head} tabIndex={-1}>
            {f.died}
          </h1>
          <p className="lede">{f.where}</p>
          {f.lastYear.length > 0 && (
            <div className="last-year">
              <span className="eyebrow">Your last year</span>
              <ul>
                {f.lastYear.slice(-5).map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </div>
          )}
          {f.outlived && <p className="note" style={{ margin: 0 }}>{f.outlived}</p>}
          <div className="actions">
            <button className="btn primary" onClick={() => setStep(f.moments.length ? "montage" : "funeral")}>
              Look back
            </button>
            <button className="btn ghost" onClick={onDone}>
              Skip to your statement
            </button>
          </div>
        </section>
      )}
      {step === "montage" && <Montage f={f} head={head} onEnd={() => setStep("funeral")} onSkip={onDone} />}
      {step === "funeral" && (
        <section className="farewell-card" key="funeral">
          <span className="eyebrow">The funeral</span>
          <h1 ref={head} tabIndex={-1}>
            {s.name}, {s.birthYear}–{f.year}
          </h1>
          <p className="lede">{f.mourners}</p>
          {f.estate && <p style={{ margin: 0 }}>{f.estate}</p>}
          <StoneImage s={s} f={f} />
          <div className="actions">
            <button className="btn primary" onClick={onDone}>
              See your statement
            </button>
          </div>
        </section>
      )}
    </main>
  );
}

/** The life's moments, one after another, or all at once for anyone who'd rather nothing moved. */
function Montage({ f, head, onEnd, onSkip }: { f: Told; head: RefObject<HTMLHeadingElement>; onEnd: () => void; onSkip: () => void }) {
  const [still] = useState(stillness);
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const m = f.moments[i];
  const last = i === f.moments.length - 1;
  const next = () => (last ? onEnd() : setI(i + 1));

  useEffect(() => {
    if (still || paused) return;
    const t = setTimeout(next, dwell(m.text) + (last ? 800 : 0));
    return () => clearTimeout(t);
    // the timer restarts with each moment
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, paused, still]);

  if (still) {
    return (
      <section className="farewell-card" key="montage">
        <h1 ref={head} tabIndex={-1} className="eyebrow">
          Your life, looking back
        </h1>
        <ol className="moment-list">
          {f.moments.map((x, k) => (
            <li key={k}>
              <span className="moment-year">{when(x.year, x.age)}</span>
              <span>{x.text}</span>
            </li>
          ))}
        </ol>
        <div className="actions">
          <button className="btn primary" onClick={onEnd}>
            Continue
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="farewell-card" key="montage">
      <h1 ref={head} tabIndex={-1} className="eyebrow">
        Your life, looking back
      </h1>
      <div aria-live="polite">
        <button className="moment" key={i} onClick={next}>
          <span className="moment-year">{when(m.year, m.age)}</span>
          <span className="moment-text">{m.text}</span>
        </button>
      </div>
      <div className="moment-dots" aria-hidden="true">
        {f.moments.map((_, k) => (
          <i key={k} className={k <= i ? "on" : ""} />
        ))}
      </div>
      <div className="actions">
        <button className="btn small" onClick={() => setPaused((p) => !p)} aria-pressed={paused}>
          {paused ? "Play" : "Pause"}
        </button>
        <button className="btn small" onClick={next}>
          {last ? "To the funeral" : "Next"}
        </button>
        <button className="btn small ghost" onClick={onSkip}>
          Skip to your statement
        </button>
      </div>
    </section>
  );
}
