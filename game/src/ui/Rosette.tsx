import { useEffect, useRef } from "react";

/** A banknote-style guilloché rosette, drawn once (and again when the theme changes). */
export function Rosette() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const draw = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const size = canvas.clientWidth || 420;
      canvas.width = size * dpr;
      canvas.height = size * dpr;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const css = getComputedStyle(document.documentElement);
      const ink = css.getPropertyValue("--accent").trim() || "#1d5a86";
      const gold = css.getPropertyValue("--gold").trim() || "#7d5f0e";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);
      const c = size / 2;
      const rings = [
        { R: 0.46, r: 0.13, d: 0.22, color: ink, alpha: 0.3 },
        { R: 0.36, r: 0.09, d: 0.16, color: gold, alpha: 0.28 },
        { R: 0.26, r: 0.07, d: 0.12, color: ink, alpha: 0.22 },
      ];
      for (const ring of rings) {
        const R = ring.R * size;
        const r = ring.r * size;
        const d = ring.d * size;
        ctx.beginPath();
        for (let t = 0; t <= Math.PI * 26; t += 0.01) {
          const x = c + (R - r) * Math.cos(t) + d * Math.cos(((R - r) / r) * t);
          const y = c + (R - r) * Math.sin(t) - d * Math.sin(((R - r) / r) * t);
          if (t === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = ring.color;
        ctx.globalAlpha = ring.alpha;
        ctx.lineWidth = 0.6;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    };
    draw();
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", draw);
    const obs = new MutationObserver(draw);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      mq.removeEventListener("change", draw);
      obs.disconnect();
    };
  }, []);
  return <canvas ref={ref} aria-hidden="true" />;
}
