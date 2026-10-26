"""Turn the raw downloads into public/data/world.json, the file the game loads.

Run fetch.py first. The output keeps only what the engine needs, rounded to
sensible precision. Gaps are filled conservatively (interpolation for slow
series like life expectancy or enrollment, documented fallbacks for prices);
anything still missing stays null and the engine simulates it from the
country's own history.
"""

from __future__ import annotations

import datetime as dt
import json
import math
from pathlib import Path

import pandas as pd
import xlrd
from babel.numbers import get_territory_currencies

ROOT = Path(__file__).parent
RAW = ROOT / "raw"
OUT = ROOT.parent / "public" / "data" / "world.json"
OUT_MARKETS = ROOT.parent / "public" / "data" / "markets.json"

Y0, Y1 = 1960, 2025  # World Bank span
M0 = 1950  # market series start
MIN_POP = 500_000
EM_DIVIDEND_YIELD = 0.025  # added to OECD price-only indices outside JST

# Year retail investors could first buy local shares, where the datasets start later
MARKET_OPENED = {"CHN": 1991, "RUS": 1995, "VNM": 2000}

# Shanghai Composite year-end closes before the OECD series begins (public record)
SSE_CLOSE = {
    1990: 127.61, 1991: 292.75, 1992: 780.39, 1993: 833.80, 1994: 647.87,
    1995: 555.29, 1996: 917.02, 1997: 1194.10, 1998: 1146.70, 1999: 1366.58,
}

WB_KEYS = [
    "pop", "cbr", "tfr", "le_m", "le_f", "imr", "u5mr", "gdppc_real", "gdppc_ppp",
    "gdppc_lcu", "ppp", "cpi", "defl", "fx", "dep", "lend", "growth", "gini", "unemp",
    "mktcap", "oop", "prim", "sec", "ter", "acct", "agr", "selfemp", "tax", "battle",
]


# Series that must be strictly positive; zeros in the source are rounding artifacts
# (e.g. Serbia's GDP in local currency after its 1990s redenominations).
POSITIVE = {"pop", "gdppc_real", "gdppc_ppp", "gdppc_lcu", "ppp", "fx", "le_m", "le_f"}


def load_wb(key: str) -> dict[str, dict[int, float]]:
    rows = json.loads((RAW / f"wb_{key}.json").read_text())[1]
    out: dict[str, dict[int, float]] = {}
    for r in rows:
        if r["value"] is not None and r["countryiso3code"]:
            v = float(r["value"])
            if key in POSITIVE and v <= 0:
                continue
            out.setdefault(r["countryiso3code"], {})[int(r["date"])] = v
    return out


def span(d: dict[int, float] | None, y0: int = Y0, y1: int = Y1) -> list[float | None]:
    d = d or {}
    return [d.get(y) for y in range(y0, y1 + 1)]


def interpolate(xs: list[float | None], extend: int = 0) -> list[float | None]:
    """Linear interpolation inside the observed range; flat extension up to `extend` years."""
    idx = [i for i, v in enumerate(xs) if v is not None]
    if not idx:
        return xs
    out = list(xs)
    for a, b in zip(idx, idx[1:]):
        for i in range(a + 1, b):
            t = (i - a) / (b - a)
            out[i] = xs[a] + t * (xs[b] - xs[a])
    for i in range(max(0, idx[0] - extend), idx[0]):
        out[i] = xs[idx[0]]
    for i in range(idx[-1] + 1, min(len(xs), idx[-1] + 1 + extend)):
        out[i] = xs[idx[-1]]
    return out


def rnd(v: float | None, digits: int) -> float | int | None:
    if v is None or (isinstance(v, float) and (math.isnan(v) or math.isinf(v))):
        return None
    r = round(v, digits)
    return int(r) if digits <= 0 else r


def sig(v: float | None, n: int = 4) -> float | None:
    if v is None or v == 0 or math.isnan(v) or math.isinf(v):
        return None if v is None or math.isnan(v) or math.isinf(v) else 0
    return round(v, -int(math.floor(math.log10(abs(v)))) + (n - 1))


def median(vals: list[float]) -> float | None:
    vals = sorted(v for v in vals if v is not None)
    if not vals:
        return None
    m = len(vals) // 2
    return vals[m] if len(vals) % 2 else (vals[m - 1] + vals[m]) / 2


def fit_logistic_on_income(series_by_iso: dict, ppp_by_iso: dict) -> tuple[float, float]:
    """Least squares fit of logit(share) ~ a + b*log(gdppc) across all country-years."""
    xs, ys = [], []
    for iso, d in series_by_iso.items():
        for y, v in d.items():
            p = ppp_by_iso.get(iso, {}).get(y)
            if p and 0.5 < v < 99.5:
                xs.append(math.log(p))
                ys.append(math.log((v / 100) / (1 - v / 100)))
    n = len(xs)
    mx, my = sum(xs) / n, sum(ys) / n
    b = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / sum((x - mx) ** 2 for x in xs)
    return my - b * mx, b


def backcast_share(obs: dict[int, float], ppp: list[float | None], a: float, b: float) -> list[float | None]:
    """Fill a 0-100 share using the cross-country income relation, shifted to match this country's data."""
    resid = [
        math.log((v / 100) / (1 - v / 100)) - (a + b * math.log(ppp[y - Y0]))
        for y, v in obs.items()
        if 0.5 < v < 99.5 and Y0 <= y <= Y1 and ppp[y - Y0]
    ]
    shift = median(resid) or 0.0
    out: list[float | None] = []
    for i, p in enumerate(ppp):
        y = Y0 + i
        if y in obs:
            out.append(obs[y])
        elif p:
            z = a + b * math.log(p) + shift
            out.append(100 / (1 + math.exp(-z)))
        else:
            out.append(None)
    return out


# --------------------------------------------------------------------------- markets


def load_damodaran() -> dict[str, list[float | None]]:
    sh = xlrd.open_workbook(RAW / "damodaran_histretSP.xls").sheet_by_name("Returns by year")
    header_row = next(r for r in range(sh.nrows) if str(sh.cell_value(r, 0)).strip() == "Year")
    cols = {"sp": 1, "tbill": 3, "tbond": 4, "re": 6, "gold": 7}
    data: dict[int, dict[str, float]] = {}
    for r in range(header_row + 1, sh.nrows):
        y = sh.cell_value(r, 0)
        if not isinstance(y, float):
            break
        data[int(y)] = {k: float(sh.cell_value(r, c)) for k, c in cols.items()}
    y0, y1 = min(data), max(data)
    return {"y0": y0, **{k: [sig(data[y][k]) for y in range(y0, y1 + 1)] for k in cols}}


def load_jst() -> pd.DataFrame:
    df = pd.read_stata(RAW / "jst_r6.dta")
    return df[df.year >= M0]


OECD_MONTHLY_SHARES: dict[str, dict[int, float]] = {}  # filled by load_oecd for the desk


def load_oecd() -> dict[str, dict[str, dict[int, float]]]:
    df = pd.read_csv(RAW / "oecd_finmark.csv", low_memory=False,
                     usecols=["REF_AREA", "FREQ", "MEASURE", "TIME_PERIOD", "OBS_VALUE"])
    df = df[df.MEASURE.isin(["SHARE", "IRLT", "IR3TIB", "CC"])].dropna(subset=["OBS_VALUE"])
    out: dict[str, dict[str, dict[int, float]]] = {}
    for (iso, measure), g in df.groupby(["REF_AREA", "MEASURE"]):
        monthly = g[g.FREQ == "M"].copy()
        annual: dict[int, float] = {}
        if len(monthly):
            monthly["y"] = monthly.TIME_PERIOD.str[:4].astype(int)
            monthly["m"] = monthly.TIME_PERIOD.str[5:7].astype(int)
            if measure == "SHARE":
                OECD_MONTHLY_SHARES[iso] = {
                    month_index(int(y), int(m)): float(v) for y, m, v in zip(monthly.y, monthly.m, monthly.OBS_VALUE) if y >= M0
                }
            for y, gy in monthly.groupby("y"):
                if measure == "SHARE":
                    last = gy.sort_values("m").iloc[-1]
                    if last.m >= 11:  # need a year-end reading
                        annual[int(y)] = float(last.OBS_VALUE)
                elif len(gy) >= 6:
                    annual[int(y)] = float(gy.OBS_VALUE.mean())
        else:
            a = g[g.FREQ == "A"]
            annual = {int(t): float(v) for t, v in zip(a.TIME_PERIOD, a.OBS_VALUE)}
        out.setdefault(iso, {})[measure] = annual
    return out


def yearly_returns(levels: dict[int, float]) -> dict[int, float]:
    return {y: levels[y] / levels[y - 1] - 1 for y in levels if y - 1 in levels and levels[y - 1] > 0}


def bond_return_from_yields(yields_pct: dict[int, float], duration: float = 6.5) -> dict[int, float]:
    """Approximate a 10y government bond total return from the yield path."""
    out = {}
    for y in yields_pct:
        if y - 1 in yields_pct:
            y_prev, y_now = yields_pct[y - 1] / 100, yields_pct[y] / 100
            out[y] = y_prev - duration * (y_now - y_prev)
    return out


def month_index(year: int, month: int) -> int:
    return (year - M0) * 12 + month - 1


def load_shiller() -> tuple[dict[int, float], dict[int, float]]:
    """Monthly S&P composite (average of daily closes) and annualized dividends, by month index."""
    sh = xlrd.open_workbook(RAW / "shiller_ie_data.xls").sheet_by_name("Data")
    price: dict[int, float] = {}
    div: dict[int, float] = {}
    for r in range(sh.nrows):
        d = sh.cell_value(r, 0)
        if not isinstance(d, float) or d < M0:
            continue
        year = int(d)
        month = round((d - year) * 100)  # "2026.1" is October
        p, dv = sh.cell_value(r, 1), sh.cell_value(r, 2)
        if isinstance(p, float) and p > 0:
            price[month_index(year, month)] = p
        if isinstance(dv, float) and dv > 0:
            div[month_index(year, month)] = dv
    price.pop(max(price))  # the newest month is still in progress
    return price, div


def load_french_industries() -> tuple[list[str], dict[int, list[float | None]]]:
    """Value-weighted monthly returns (%) of Kenneth French's 49 US industry portfolios."""
    import io
    import zipfile

    z = zipfile.ZipFile(RAW / "kf_49_industries.zip")
    lines = z.read(z.namelist()[0]).decode("latin1").splitlines()
    start = next(i for i, l in enumerate(lines) if "Average Value Weighted Returns -- Monthly" in l)
    names = [c.strip() for c in lines[start + 1].split(",")[1:]]
    rows: dict[int, list[float | None]] = {}
    for l in lines[start + 2:]:
        cells = [c.strip() for c in l.split(",")]
        if not cells[0].isdigit() or len(cells[0]) != 6:
            break
        year, month = int(cells[0][:4]), int(cells[0][4:])
        if year < M0:
            continue
        vals = [float(c) for c in cells[1:]]
        rows[month_index(year, month)] = [None if v <= -99.99 else v for v in vals]
    return names, rows


COINS = [("BTC", None), ("LTC", "ltc"), ("ETH", "eth"), ("XRP", "xrp"), ("DOGE", "doge"), ("SOL", "sol"), ("LUNA", "luna")]


def load_coins() -> dict[str, dict[int, float]]:
    """Monthly average USD prices: Bitcoin from blockchain.com's daily series since 2010, the
    other coins from Kraken's weekly candles, each from its first weeks on that exchange."""
    today = dt.date.today()
    this_month = month_index(today.year, today.month)  # still in progress: left out
    out: dict[str, dict[int, float]] = {}
    days: dict[int, list[float]] = {}
    for v in json.loads((RAW / "btc_market_price.json").read_text())["values"]:
        if v["y"] > 0:
            d = dt.datetime.fromtimestamp(v["x"], dt.UTC)
            days.setdefault(month_index(d.year, d.month), []).append(v["y"])
    out["BTC"] = {k: sum(v) / len(v) for k, v in days.items() if len(v) >= 10 and k < this_month}
    for sym, key in COINS[1:]:
        data = json.loads((RAW / f"kraken_{key}.json").read_text())
        if data.get("error"):
            raise SystemExit(f"Kraken {key}: {data['error']}")
        rows = next(v for k, v in data["result"].items() if k != "last")
        weeks: dict[int, list[float]] = {}
        for t, _o, _h, _l, c, vwap, *_ in rows:
            mid = dt.datetime.fromtimestamp(t + 3.5 * 86400, dt.UTC)  # a week counts in the month it mostly falls in
            px = float(vwap) if float(vwap) > 0 else float(c)
            if px > 0:
                weeks.setdefault(month_index(mid.year, mid.month), []).append(px)
        first = min(weeks)
        out[sym] = {k: sum(v) / len(v) for k, v in weeks.items() if k < this_month and (k > first or len(v) >= 2)}
    return out


def build_markets(oecd_monthly: dict[str, dict[int, float]], jst: pd.DataFrame, isos: set[str]) -> dict:
    """Monthly market history for the trading desk, loaded only when a player opens it."""
    price, div = load_shiller()
    names, ind = load_french_industries()

    def packed(series: dict[int, float], digits: int = 4) -> list | None:
        if not series:
            return None
        s, e = min(series), max(series)
        return [s, [sig(series.get(k), digits) for k in range(s, e + 1)]]

    share = {iso: packed(m) for iso, m in oecd_monthly.items() if iso in isos and iso != "USA" and len(m) >= 24}
    share["USA"] = packed(price, 5)
    # dividends after the last reported month carry the last yield forward
    last_d = max(div)
    usdiv = {k: div.get(k, div[last_d] * price[k] / price[last_d] if k > last_d else None) for k in price}
    dy = {}
    for iso, g in jst.groupby("iso"):
        if iso in isos and iso != "USA":
            dp = g.set_index("year").eq_dp.dropna()
            if len(dp):
                dy[iso] = [int(dp.index.min()), [rnd(dp.get(y), 4) for y in range(int(dp.index.min()), int(dp.index.max()) + 1)]]
    s = min(ind)
    coins = load_coins()
    return {
        "v": 1,
        "generated": dt.date.today().isoformat(),
        "m0": M0,
        "share": {k: v for k, v in sorted(share.items()) if v},
        "cc": {sym: packed(coins[sym], 5) for sym, _ in COINS},
        "usDiv": packed(usdiv, 4),
        "dy": dy,
        "ind": {
            "start": s,
            "names": names,
            "r": {n: [rnd(ind[k][j] * 100, 0) if k in ind and ind[k][j] is not None else None for k in range(s, max(ind) + 1)] for j, n in enumerate(names)},
        },
        "sources": [
            "OECD Financial Market statistics, monthly share prices (sdmx.oecd.org)",
            "Robert J. Shiller, Irrational Exuberance data: S&P composite and dividends (shillerdata.com)",
            "Kenneth R. French Data Library: 49 industry portfolios, value-weighted monthly returns",
            "Jorda-Schularick-Taylor Macrohistory Database R6: dividend yields",
            "blockchain.com charts API: daily Bitcoin market price, averaged by month",
            "Kraken public OHLC data: weekly prices of LTC, ETH, XRP, DOGE, SOL and LUNA, averaged by month",
        ],
    }


def load_btc() -> dict:
    vals = json.loads((RAW / "btc_market_price.json").read_text())["values"]
    by_year: dict[int, float] = {}
    for v in vals:
        if v["y"] <= 0:
            continue
        d = dt.datetime.fromtimestamp(v["x"], dt.UTC)
        by_year[d.year] = v["y"]  # values are chronological, so the last one wins
    y0, y1 = min(by_year), max(by_year)
    return {"y0": y0, "px": [sig(by_year.get(y)) for y in range(y0, y1 + 1)]}


# --------------------------------------------------------------------------- main


def main() -> None:
    meta = json.loads((RAW / "wb_countries.json").read_text())[1]
    countries = {c["id"]: c for c in meta if c["region"]["value"].strip() != "Aggregates"}
    wb = {k: load_wb(k) for k in WB_KEYS}

    acct_a, acct_b = fit_logistic_on_income(wb["acct"], wb["gdppc_ppp"])
    agr_a, agr_b = fit_logistic_on_income(wb["agr"], wb["gdppc_ppp"])
    self_a, self_b = fit_logistic_on_income(wb["selfemp"], wb["gdppc_ppp"])
    enroll_coef = {
        k: fit_logistic_on_income({i: {y: min(v, 99.0) for y, v in d.items()} for i, d in wb[k].items()}, wb["gdppc_ppp"])
        for k in ("prim", "sec", "ter")
    }

    jst = load_jst()
    oecd = load_oecd()
    dam = load_damodaran()
    btc = load_btc()

    out_countries: dict[str, dict] = {}
    out_markets: dict[str, dict] = {}

    for iso, c in sorted(countries.items()):
        pops = wb["pop"].get(iso, {})
        latest_pop = pops.get(2024) or pops.get(2023) or (pops[max(pops)] if pops else 0)
        if latest_pop < MIN_POP:
            continue
        g = lambda k: span(wb[k].get(iso))

        pop = interpolate(g("pop"), extend=2)
        cbr = interpolate(g("cbr"), extend=3)
        births = [p * b / 1000 if p is not None and b is not None else None for p, b in zip(pop, cbr)]
        if not any(births):
            continue

        # GDP per capita in 2021 PPP dollars, backcast before 1990 with real growth
        ppp = g("gdppc_ppp")
        real = g("gdppc_real")
        growth = g("growth")
        first = next((i for i, v in enumerate(ppp) if v), None)
        if first is None:
            continue
        overlap = next((i for i in range(len(ppp)) if ppp[i] and real[i]), None)
        if overlap is not None:
            ratio = ppp[overlap] / real[overlap]
            for i in range(overlap - 1, -1, -1):
                if ppp[i] is None and real[i]:
                    ppp[i] = real[i] * ratio
        for i in range(len(ppp) - 2, -1, -1):  # remaining early gaps: walk back with GDP growth
            if ppp[i] is None and ppp[i + 1]:
                gr = growth[i + 1]
                # without growth data, assume income per person grew 2% a year (the world's 1960-90 pace)
                ppp[i] = ppp[i + 1] / ((1 + gr / 100 - 0.02) if gr is not None else 1.02)
        for i in range(1, len(ppp)):  # late gaps: walk forward
            if ppp[i] is None and ppp[i - 1]:
                gr = growth[i]
                ppp[i] = ppp[i - 1] * (1 + (gr / 100 if gr is not None else 0.015) - 0.015)

        # inflation: CPI, else GDP deflator
        cpi, defl = g("cpi"), g("defl")
        infl = [a if a is not None else b for a, b in zip(cpi, defl)]

        # nominal GDP per capita in local currency, filled with growth + inflation
        lcu = g("gdppc_lcu")
        for i in range(len(lcu) - 2, -1, -1):
            if lcu[i] is None and lcu[i + 1] and infl[i + 1] is not None:
                gr = (growth[i + 1] if growth[i + 1] is not None else 2.0) / 100 - 0.015
                lcu[i] = lcu[i + 1] / ((1 + gr) * (1 + infl[i + 1] / 100))
        for i in range(1, len(lcu)):
            if lcu[i] is None and lcu[i - 1] and infl[i] is not None:
                gr = (growth[i] if growth[i] is not None else 2.0) / 100 - 0.015
                lcu[i] = lcu[i - 1] * (1 + gr) * (1 + infl[i] / 100)

        if not any(lcu):
            continue
        # LCU per 2021 international dollar, defined so lcu/ppp21 reproduces the PPP series
        k21 = 2021 - Y0
        if lcu[k21] and ppp[k21]:
            ppp21 = lcu[k21] / ppp[k21]
        else:
            ppp_conv = wb["ppp"].get(iso, {})
            ppp21 = ppp_conv.get(2021) or next((ppp_conv[y] for y in sorted(ppp_conv, key=lambda y: abs(y - 2021))), None)
        if not ppp21:
            continue

        # exchange rates: WB, then OECD; repair years where the implied price level is implausible
        fx = g("fx")
        cc = oecd.get(iso, {}).get("CC", {})
        fx = [v if v is not None else cc.get(Y0 + i) for i, v in enumerate(fx)]
        level = [
            (lcu[i] / fx[i]) / ppp[i] if lcu[i] and fx[i] and ppp[i] else None for i in range(len(fx))
        ]
        recent = [v for v in level[-25:] if v and 0.03 < v < 5]
        lvl_med = median(recent) or median([v for v in level if v and 0.03 < v < 5]) or 0.4
        for i in range(len(fx)):
            ok = level[i] is not None and lvl_med / 4 < level[i] < lvl_med * 4
            if not ok and lcu[i] and ppp[i]:
                fx[i] = lcu[i] / (ppp[i] * lvl_med)

        dep = g("dep")
        lend = g("lend")
        jst_c = jst[jst.iso == iso].set_index("year")
        oecd_c = oecd.get(iso, {})
        for i in range(len(dep)):
            y = Y0 + i
            if dep[i] is None:
                if iso == "USA":
                    tb = dam["tbill"][y - dam["y0"]] if dam["y0"] <= y < dam["y0"] + len(dam["tbill"]) else None
                    dep[i] = max(0.0, tb * 100 - 0.5) if tb is not None else None
                elif y in jst_c.index and not math.isnan(jst_c.loc[y, "bill_rate"]):
                    dep[i] = max(0.0, jst_c.loc[y, "bill_rate"] * 100 - 0.5)
                elif y in oecd_c.get("IR3TIB", {}):
                    dep[i] = max(0.0, oecd_c["IR3TIB"][y] - 0.5)

        mkt_from = None
        mktcap = wb["mktcap"].get(iso, {})
        candidates = [y for y, v in mktcap.items() if v and v > 1]
        if candidates:
            mkt_from = min(candidates)
        if oecd_c.get("SHARE"):
            mkt_from = min(mkt_from or 9999, min(oecd_c["SHARE"]))
        if len(jst_c) and jst_c.eq_tr.notna().any():
            mkt_from = min(mkt_from or 9999, int(jst_c.eq_tr.dropna().index.min()))
        if iso == "USA":
            mkt_from = 1900
        if iso in MARKET_OPENED:
            mkt_from = MARKET_OPENED[iso]

        battle = {str(y): int(v) for y, v in wb["battle"].get(iso, {}).items() if v and v > 0}
        iso2 = c["iso2Code"]
        try:
            cur = get_territory_currencies(iso2)
            currency = next((x for x in cur if x != "USD"), cur[0]) if cur else "USD"
        except Exception:
            currency = "USD"

        # enrollment: interpolate observed years, backcast the rest from the income relation
        def enrollment(key: str, coef: tuple[float, float]) -> list[float | None]:
            obs = {y: min(v, 99.0) for y, v in wb[key].get(iso, {}).items()}
            filled = backcast_share(obs, ppp, *coef)
            inner = interpolate(span(obs), extend=0)
            return [inner[i] if inner[i] is not None else filled[i] for i in range(len(filled))]

        prim = enrollment("prim", enroll_coef["prim"])
        sec = enrollment("sec", enroll_coef["sec"])
        ter = enrollment("ter", enroll_coef["ter"])
        acct = backcast_share(wb["acct"].get(iso, {}), ppp, acct_a, acct_b)
        agr = backcast_share(wb["agr"].get(iso, {}), ppp, agr_a, agr_b)
        selfemp = backcast_share(wb["selfemp"].get(iso, {}), ppp, self_a, self_b)

        oop = median(list(wb["oop"].get(iso, {}).values()))
        tax = median(list(wb["tax"].get(iso, {}).values()))

        series = {
            "pop": [rnd(v / 1000, 0) if v else None for v in pop],  # thousands
            "births": [rnd(v / 1000, 1) if v else None for v in births],  # thousands
            "tfr": [rnd(v, 2) for v in interpolate(g("tfr"), extend=5)],
            "leM": [rnd(v, 1) for v in interpolate(g("le_m"), extend=5)],
            "leF": [rnd(v, 1) for v in interpolate(g("le_f"), extend=5)],
            "imr": [rnd(v, 1) for v in interpolate(g("imr"), extend=5)],
            "u5": [rnd(v, 1) for v in interpolate(g("u5mr"), extend=5)],
            "ppp": [rnd(v, 0) for v in ppp],
            "lcu": [sig(v) for v in lcu],
            "infl": [rnd(v, 2) for v in infl],
            "fx": [sig(v) for v in fx],
            "dep": [rnd(v, 2) for v in dep],
            "lend": [rnd(v, 2) for v in lend],
            "gr": [rnd(v, 2) for v in growth],
            "gini": [rnd(v, 1) for v in interpolate(g("gini"), extend=40)],
            "unemp": [rnd(v, 1) for v in g("unemp")],
            "prim": [rnd(v, 0) for v in prim],
            "sec": [rnd(v, 0) for v in sec],
            "ter": [rnd(v, 0) for v in ter],
            "acct": [rnd(v, 0) for v in acct],
            "agr": [rnd(v, 0) for v in agr],
            "self": [rnd(v, 0) for v in selfemp],
        }
        out_countries[iso] = {
            "n": c["name"],
            "i2": iso2,
            "r": c["region"]["id"],
            "inc": c["incomeLevel"]["id"],
            "cur": currency,
            "ppp21": sig(ppp21),
            "mkt": mkt_from,
            "oop": rnd(oop, 0),
            "tax": rnd(tax, 1),
            "s": series,
        }
        if battle:
            out_countries[iso]["war"] = battle

        # ------------------------------------------------------------ market series
        n = Y1 - M0 + 1
        eq: list[float | None] = [None] * n
        bond: list[float | None] = [None] * n
        house: list[float | None] = [None] * n
        rent: list[float | None] = [None] * n
        crisis: list[int] = []
        src = {}

        share_ret = yearly_returns(oecd_c.get("SHARE", {}))
        lt_bond = bond_return_from_yields(oecd_c.get("IRLT", {}))
        div_yield = EM_DIVIDEND_YIELD
        if len(jst_c):
            dp = jst_c.eq_dp.dropna()
            if len(dp):
                div_yield = float(dp.iloc[-1])
        for i in range(n):
            y = M0 + i
            if iso == "USA" and dam["y0"] <= y:
                k = y - dam["y0"]
                if k < len(dam["sp"]):
                    eq[i], bond[i], house[i] = dam["sp"][k], dam["tbond"][k], dam["re"][k]
            if y in jst_c.index:
                row = jst_c.loc[y]
                if eq[i] is None and not math.isnan(row.eq_tr):
                    eq[i] = row.eq_tr
                if bond[i] is None and not math.isnan(row.bond_tr):
                    bond[i] = row.bond_tr
                if house[i] is None and not math.isnan(row.housing_capgain):
                    house[i] = row.housing_capgain
                if not math.isnan(row.housing_rent_yd):
                    rent[i] = row.housing_rent_yd
                if row.crisisJST == 1:
                    crisis.append(y)
            if eq[i] is None and y in share_ret:
                eq[i] = share_ret[y] + div_yield
            if eq[i] is None and iso == "CHN" and y in SSE_CLOSE and y - 1 in SSE_CLOSE:
                eq[i] = SSE_CLOSE[y] / SSE_CLOSE[y - 1] - 1 + 0.01
            if bond[i] is None and y in lt_bond:
                bond[i] = lt_bond[y]
        if iso == "USA":
            src = {"eq": "S&P 500 total return (Damodaran)", "house": "Case-Shiller (Damodaran)"}
        elif len(jst_c):
            src = {"eq": "JST Macrohistory total return, then OECD share prices", "house": "JST Macrohistory"}
        elif share_ret:
            src = {"eq": "OECD share price index + 2.5% dividends"}
        rent = interpolate(rent, extend=6)
        if any(v is not None for v in eq + bond + house):
            out_markets[iso] = {
                "eq": [sig(v) for v in eq],
                "bond": [sig(v) for v in bond],
                "house": [sig(v) for v in house],
                "rent": [rnd(v, 4) for v in rent],
                "crisis": crisis,
                "src": src,
            }

    world = {
        "v": 1,
        "generated": dt.date.today().isoformat(),
        "y0": Y0,
        "y1": Y1,
        "m0": M0,
        "countries": out_countries,
        "markets": out_markets,
        "us": dam,
        "btc": btc,
        "sources": [
            "World Bank, World Development Indicators (api.worldbank.org)",
            "OECD Financial Market statistics (sdmx.oecd.org)",
            "Jorda-Schularick-Taylor Macrohistory Database R6 (macrohistory.net)",
            "Damodaran, Historical Returns on Stocks, Bonds and Bills (NYU Stern)",
            "Bitcoin market price (blockchain.com)",
        ],
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(world, separators=(",", ":")))
    markets = build_markets(OECD_MONTHLY_SHARES, jst, set(out_countries))
    OUT_MARKETS.write_text(json.dumps(markets, separators=(",", ":")))
    print(f"monthly markets: {len(markets['share'])} share series, {len(markets['ind']['names'])} industries, "
          f"{OUT_MARKETS.stat().st_size / 1e6:.2f} MB")

    total_births = sum(c["s"]["births"][2023 - Y0] or 0 for c in out_countries.values())
    print(f"countries: {len(out_countries)}  markets: {len(out_markets)}  size: {OUT.stat().st_size / 1e6:.2f} MB")
    print(f"births 2023: {total_births / 1000:.1f} M")
    for key in ["infl", "fx", "dep", "lend", "gini", "ppp", "lcu"]:
        filled = sum(v is not None for c in out_countries.values() for v in c["s"][key])
        print(f"  {key:6s} coverage {filled / (len(out_countries) * (Y1 - Y0 + 1)):.0%}")
    print(f"  equity series: {sum(1 for m in out_markets.values() if any(v is not None for v in m['eq']))}")


if __name__ == "__main__":
    main()
