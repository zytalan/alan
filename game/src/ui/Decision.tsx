import { useEffect, useRef } from "react";
import type { Decision } from "../engine";

const TAG_LABEL: Record<Decision["tag"], string> = {
  life: "Life",
  money: "Money",
  career: "Work",
  market: "Markets",
  business: "Business",
  reflection: "A moment to look back",
  childhood: "Growing up",
};

/** A decision. With `onClose` it can be put aside: Esc, the close button or a click outside. */
export function DecisionCard({ d, year, age, onChoose, onClose }: { d: Decision; year: number; age: number; onChoose: (id: string) => void; onClose?: () => void }) {
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    first.current?.focus();
  }, [d]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && onClose) {
        e.preventDefault();
        onClose();
        return;
      }
      const n = Number(e.key);
      if (n >= 1 && n <= d.options.length) {
        const o = d.options[n - 1];
        if (!o.disabled) onChoose(o.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [d, onChoose, onClose]);

  return (
    <div className="scrim" onClick={(e) => e.target === e.currentTarget && onClose?.()}>
      <section className={`decision tag-${d.tag}`} role="dialog" aria-modal="true" aria-labelledby={`t-${d.id}`}>
        <div className="decision-head">
          <span className="eyebrow">
            {TAG_LABEL[d.tag]} · {year} · age {age}
          </span>
          {onClose && (
            <button type="button" className="decision-close" onClick={onClose} aria-label="Close for now" title="Close for now (Esc). The year waits until you decide.">
              ×
            </button>
          )}
        </div>
        <h2 id={`t-${d.id}`}>{d.title}</h2>
        <p className="body">{d.body}</p>
        <div className="choices">
          {d.options.map((o, i) => (
            <button key={o.id} ref={i === 0 ? first : undefined} className="choice" disabled={!!o.disabled} onClick={() => onChoose(o.id)}>
              <span className="k">{i + 1}</span>
              <span className="l">{o.label}</span>
              <span className="h">{o.disabled ?? o.hint ?? ""}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

/** The bar that stands in for a decision put aside, so the rest of the screen stays usable. */
export function DecisionWaiting({ d, onOpen }: { d: Decision; onOpen: () => void }) {
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    btn.current?.focus();
  }, [d]);
  return (
    <div className="waiting" role="status">
      <span className="eyebrow">Decision waiting</span>
      <span className="t">{d.title}</span>
      <button ref={btn} type="button" className="btn small primary" onClick={onOpen}>
        Decide
      </button>
    </div>
  );
}
