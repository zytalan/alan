import { useId } from "react";

export type Metal = "copper" | "silver" | "gold" | "platinum";

/** Net worth in years of a typical local wage → the coin's metal. */
export function metalFor(wageYears: number): Metal {
  return wageYears < 1 ? "copper" : wageYears < 2.5 ? "silver" : wageYears < 10 ? "gold" : "platinum";
}

export const METAL_LABEL: Record<Metal, string> = { copper: "Copper", silver: "Silver", gold: "Gold", platinum: "Platinum" };

// A coin is an object, so its colours are its own in both themes.
export const METALS: Record<Metal, { hi: string; base: string; lo: string; edge: string; ink: string }> = {
  copper: { hi: "#f3bd98", base: "#c47a4a", lo: "#7a4322", edge: "#5f341a", ink: "#43200e" },
  silver: { hi: "#f7f9fa", base: "#c5cbd1", lo: "#7d858e", edge: "#666e77", ink: "#323a43" },
  gold: { hi: "#fcebab", base: "#d8ab40", lo: "#8a681b", edge: "#715515", ink: "#4a370a" },
  platinum: { hi: "#ffffff", base: "#dde3e8", lo: "#97a2ab", edge: "#808b95", ink: "#34404b" },
};

/** Your portrait as a coin: the rim carries your name, country and birth year; the face your currency and age. */
export function Coin({ metal, legend, symbol, age, size = 88 }: { metal: Metal; legend: string; symbol: string; age: number; size?: number }) {
  const id = useId().replace(/:/g, "");
  const m = METALS[metal];
  const ticks = [];
  for (let i = 0; i < 120; i++) {
    const a = (i / 120) * 2 * Math.PI;
    ticks.push(
      <line key={i} x1={60 + 55 * Math.cos(a)} y1={60 + 55 * Math.sin(a)} x2={60 + 58.6 * Math.cos(a)} y2={60 + 58.6 * Math.sin(a)} stroke={m.edge} strokeWidth={0.9} />,
    );
  }
  const symSize = symbol.length <= 1 ? 38 : symbol.length === 2 ? 28 : 18;
  return (
    <svg className="coin" width={size} height={size} viewBox="0 0 120 120" role="img" aria-label={`Your coin: ${METAL_LABEL[metal].toLowerCase()}, age ${age}`}>
      <defs>
        <radialGradient id={`g${id}`} cx="36%" cy="30%" r="78%">
          <stop offset="0%" stopColor={m.hi} />
          <stop offset="55%" stopColor={m.base} />
          <stop offset="100%" stopColor={m.lo} />
        </radialGradient>
        <path id={`a${id}`} d="M 13 60 A 47 47 0 1 1 107 60 A 47 47 0 1 1 13 60" fill="none" />
      </defs>
      <circle cx={60} cy={60} r={59} fill={m.lo} />
      {ticks}
      <circle cx={60} cy={60} r={54.5} fill={`url(#g${id})`} />
      <circle cx={60} cy={60} r={40} fill="none" stroke={m.ink} strokeOpacity={0.35} strokeWidth={0.8} />
      <text fontSize={7} letterSpacing={1.4} fill={m.ink} fontFamily="IBM Plex Mono, monospace" fontWeight={600}>
        <textPath href={`#a${id}`} startOffset="2%">
          {legend.toUpperCase()}
        </textPath>
      </text>
      <text x={60} y={60 + symSize * 0.25} textAnchor="middle" fontSize={symSize} fill={m.ink} fontFamily="Gloock, Georgia, serif">
        {symbol}
      </text>
      <text x={60} y={86} textAnchor="middle" fontSize={7.5} letterSpacing={1.5} fill={m.ink} fontFamily="IBM Plex Mono, monospace" fontWeight={600}>
        AGE {age}
      </text>
    </svg>
  );
}

/** The narrow symbol for a currency ("$", "¥", "₹", "R$"), or its code if there is none. */
export function currencySymbol(code: string): string {
  try {
    const parts = new Intl.NumberFormat("en", { style: "currency", currency: code, currencyDisplay: "narrowSymbol" }).formatToParts(0);
    return parts.find((p) => p.type === "currency")?.value ?? code;
  } catch {
    return code;
  }
}
