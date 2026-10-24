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

export function DecisionCard({ d, year, age, onChoose }: { d: Decision; year: number; age: number; onChoose: (id: string) => void }) {
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    first.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      const n = Number(e.key);
      if (n >= 1 && n <= d.options.length) {
        const o = d.options[n - 1];
        if (!o.disabled) onChoose(o.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [d, onChoose]);

  return (
    <div className="scrim">
      <section className={`decision tag-${d.tag}`} role="dialog" aria-modal="true" aria-labelledby={`t-${d.id}`}>
        <span className="eyebrow">
          {TAG_LABEL[d.tag]} · {year} · age {age}
        </span>
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
