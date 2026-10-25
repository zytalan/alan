import { useRef } from "react";

const reduceMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * A figure whose digits roll to their new values, like a mechanical counter. When the
 * shape of the text changes (a new digit, K becoming M) it simply redraws.
 */
export function Counter({ text, className }: { text: string; className?: string }) {
  const prev = useRef(text);
  const shapeOf = (t: string) => t.replace(/\d/g, "0");
  const animate = !reduceMotion() && shapeOf(prev.current) === shapeOf(text);
  prev.current = text;
  const chars = [...text];
  return (
    <span className={`counter ${className ?? ""}`}>
      <span className="sr-only">{text}</span>
      {chars.map((ch, i) =>
        /\d/.test(ch) ? (
          <span key={`${chars.length}-${i}`} className="counter-digit" aria-hidden="true">
            <span className="counter-strip" style={{ transform: `translateY(${-Number(ch)}em)`, transition: animate ? undefined : "none" }}>
              {"0123456789".split("").map((d) => (
                <span key={d}>{d}</span>
              ))}
            </span>
          </span>
        ) : (
          <span key={`${chars.length}-${i}`} className="counter-sep" aria-hidden="true">
            {ch}
          </span>
        ),
      )}
    </span>
  );
}
