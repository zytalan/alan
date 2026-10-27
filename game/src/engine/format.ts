const fmtCache = new Map<string, Intl.NumberFormat>();

function nf(key: string, make: () => Intl.NumberFormat): Intl.NumberFormat {
  let f = fmtCache.get(key);
  if (!f) {
    f = make();
    fmtCache.set(key, f);
  }
  return f;
}

/** Local-currency amount, compact by default ("₹4.2M"). */
export function money(amount: number, currency: string, compact = true): string {
  if (!Number.isFinite(amount)) return "—";
  const abs = Math.abs(amount);
  if (abs >= 1e15) {
    const exp = Math.floor(Math.log10(abs));
    const sign = amount < 0 ? "−" : "";
    return `${sign}${(abs / 10 ** exp).toFixed(1)}×10^${exp} ${currency}`;
  }
  const digits = compact ? (abs >= 1000 ? 1 : abs >= 10 ? 0 : 2) : abs >= 100 ? 0 : 2;
  try {
    return nf(`${currency}|${compact}|${digits}`, () =>
      new Intl.NumberFormat("en", {
        style: "currency",
        currency,
        currencyDisplay: "narrowSymbol",
        notation: compact ? "compact" : "standard",
        maximumFractionDigits: digits,
        minimumFractionDigits: 0,
      }),
    ).format(amount);
  } catch {
    return `${number(amount)} ${currency}`;
  }
}

export function usd(amount: number): string {
  return money(amount, "USD");
}

export function number(x: number, digits = 1): string {
  return nf(`n|${digits}`, () => new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: digits })).format(x);
}

export function pct(x: number, digits = 0): string {
  return `${(x * 100).toFixed(digits)}%`;
}

export function signedPct(x: number, digits = 0): string {
  const s = (x * 100).toFixed(digits);
  // a change that rounds to nothing reads as +0%, not −0%
  if (Number(s) === 0) return `+${s.replace("-", "")}%`;
  return x > 0 ? `+${s}%` : `${s.replace("-", "−")}%`;
}

export function oneIn(share: number): string {
  if (share <= 0) return "—";
  const n = 1 / share;
  return n < 10 ? `1 in ${n.toFixed(1)}` : `1 in ${Math.round(n).toLocaleString("en")}`;
}

export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function topPercent(pctile: number): string {
  // pctile in 0..1: share of people below you
  if (pctile >= 0.5) {
    const top = Math.max(0.1, (1 - pctile) * 100);
    return `top ${top < 1 ? top.toFixed(1) : Math.round(top)}%`;
  }
  return `bottom ${Math.max(1, Math.round(pctile * 100))}%`;
}
