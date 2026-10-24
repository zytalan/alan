// What a time traveller remembers: the headlines and market moves still to come.

import { HISTORY } from "./history";
import { econ } from "./macro";
import type { LifeState } from "./types";
import { country, world } from "./world";

export interface Memory {
  year: number;
  text: string;
  kind: "history" | "up" | "down";
}

export function memories(s: LifeState, span = 45): Memory[] {
  const last = world().y1;
  const end = Math.min(last, s.year + span);
  const cur = country(s.country).cur;
  const out: Memory[] = HISTORY.filter((h) => h.year >= s.year && h.year <= end && (!h.iso || h.iso.includes(s.country))).map((h) => ({
    year: h.year,
    text: h.text,
    kind: "history" as const,
  }));
  for (let y = s.year; y <= end; y++) {
    const e = econ(s.country, s.macroSeed, y);
    const p = econ(s.country, s.macroSeed, y - 1);
    if (e.real.eq) {
      const realEq = (1 + e.eq) / (1 + e.infl) - 1;
      if (realEq > 0.5) out.push({ year: y, text: `Local stocks soar ${Math.round(realEq * 100)}% after inflation.`, kind: "up" });
      if (realEq < -0.3) out.push({ year: y, text: `Local stocks crash ${Math.round(-realEq * 100)}% after inflation.`, kind: "down" });
    }
    if (e.real.infl && e.infl > 0.4) out.push({ year: y, text: `Inflation hits ${Math.round(e.infl * 100)}%.`, kind: "down" });
    if (e.real.fx && p.fx > 0 && e.fx / p.fx > 1.4 && cur !== "USD") out.push({ year: y, text: `The ${cur} loses ${Math.round((1 - p.fx / e.fx) * 100)}% against the dollar.`, kind: "down" });
    if (e.real.btc && e.btc && p.btc && e.btc / p.btc > 4) out.push({ year: y, text: `Bitcoin goes from $${fmtUsd(p.btc)} to $${fmtUsd(e.btc)}.`, kind: "up" });
    if (e.real.house && (1 + e.house) / (1 + e.infl) - 1 > 0.15) out.push({ year: y, text: `House prices jump ${Math.round(((1 + e.house) / (1 + e.infl) - 1) * 100)}% after inflation.`, kind: "up" });
  }
  return out.sort((a, b) => a.year - b.year);
}

function fmtUsd(x: number): string {
  return x < 10 ? x.toFixed(2) : Math.round(x).toLocaleString("en");
}
