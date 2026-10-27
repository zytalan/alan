"""Download the raw public datasets the game is built on.

Everything lands in pipeline/raw/ (gitignored). Re-running skips files that
already exist unless --force is given. build.py turns these into the compact
JSON the game ships with.

Sources
- World Bank WDI API: demographics, income, prices, rates, education, health
- OECD Financial Market dataset (SDMX): share prices, interest rates, FX
- Jorda-Schularick-Taylor Macrohistory Database R6: long-run returns, 18 countries
- Damodaran (NYU Stern) histretSP.xls: US stocks, bills, bonds, real estate, gold
- blockchain.com charts API: Bitcoin market price
- Robert Shiller's ie_data.xls: monthly S&P 500 prices and dividends since 1871
- Kenneth French Data Library: monthly returns of 49 US industry portfolios since 1926
- Kraken public market data: weekly prices of six more coins, each from its first week on Kraken
- World Bank commodity prices (the Pink Sheet): monthly gold and silver since 1960
- BLS Current Employment Statistics via FRED: US jobs by industry, monthly since 1939 (1990 for the detailed ones)
- ILO modelled estimates (ILOSTAT SDMX): jobs by industry (ISIC sections) in every country since 1991
"""

from __future__ import annotations

import argparse
import concurrent.futures as cf
import json
import os
import re
import time
import urllib.request
from pathlib import Path

RAW = Path(__file__).parent / "raw"
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"

WB_INDICATORS = {
    "pop": "SP.POP.TOTL",
    "cbr": "SP.DYN.CBRT.IN",
    "tfr": "SP.DYN.TFRT.IN",
    "le_m": "SP.DYN.LE00.MA.IN",
    "le_f": "SP.DYN.LE00.FE.IN",
    "imr": "SP.DYN.IMRT.IN",
    "u5mr": "SH.DYN.MORT",
    "gdppc_real": "NY.GDP.PCAP.KD",
    "gdppc_ppp": "NY.GDP.PCAP.PP.KD",
    "gdppc_lcu": "NY.GDP.PCAP.CN",
    "ppp": "PA.NUS.PPP",
    "cpi": "FP.CPI.TOTL.ZG",
    "defl": "NY.GDP.DEFL.KD.ZG",
    "fx": "PA.NUS.FCRF",
    "dep": "FR.INR.DPST",
    "lend": "FR.INR.LEND",
    "growth": "NY.GDP.MKTP.KD.ZG",
    "gini": "SI.POV.GINI",
    "unemp": "SL.UEM.TOTL.ZS",
    "mktcap": "CM.MKT.LCAP.GD.ZS",
    "oop": "SH.XPD.OOPC.CH.ZS",
    "prim": "SE.PRM.ENRR",
    "sec": "SE.SEC.ENRR",
    "ter": "SE.TER.ENRR",
    "acct": "FX.OWN.TOTL.ZS",
    "agr": "SL.AGR.EMPL.ZS",
    "selfemp": "SL.EMP.SELF.ZS",
    "tax": "GC.TAX.TOTL.GD.ZS",
    "battle": "VC.BTL.DETH",
}

URLS = {
    "wb_countries.json": "https://api.worldbank.org/v2/country?format=json&per_page=400",
    "oecd_finmark.csv": (
        "https://sdmx.oecd.org/public/rest/data/OECD.SDD.STES,DSD_STES@DF_FINMARK,/all"
        "?startPeriod=1950&dimensionAtObservation=AllDimensions&format=csvfilewithlabels"
    ),
    "jst_r6.dta": "https://www.macrohistory.net/app/download/9834512469/JSTdatasetR6.dta",
    "damodaran_histretSP.xls": "https://pages.stern.nyu.edu/~adamodar/pc/datasets/histretSP.xls",
    "btc_market_price.json": "https://api.blockchain.info/charts/market-price?timespan=all&format=json&sampled=false",
    "kf_49_industries.zip": "https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/ftp/49_Industry_Portfolios_CSV.zip",
    "shiller_ie_data.xls": "https://shillerdata.com/",  # resolved to the current file link at download time
    "wb_cmo_monthly.xlsx": "https://www.worldbank.org/en/research/commodity-markets",  # likewise
}
CMO_FALLBACK = (
    "https://thedocs.worldbank.org/en/doc/74e8be41ceb20fa0da750cda2f6b9e4e-0050012026/related/"
    "CMO-Historical-Data-Monthly.xlsx"
)
SHILLER_FALLBACK = (
    "https://img1.wsimg.com/blobby/go/e5e77e0b-59d1-44d9-ab25-4763ac982e53/downloads/"
    "1449043e-a1ed-4e2e-8e9c-7b9a2a064493/ie_data.xls"
)
# weekly candles; Kraken returns up to 720 of them, which reaches back to each pair's first week
KRAKEN_PAIRS = {"ltc": "LTCUSD", "eth": "ETHUSD", "xrp": "XRPUSD", "doge": "XDGUSD", "sol": "SOLUSD", "luna": "LUNAUSD"}
for key, pair in KRAKEN_PAIRS.items():
    URLS[f"kraken_{key}.json"] = f"https://api.kraken.com/0/public/OHLC?pair={pair}&interval=10080"
# US employment by industry, thousands of jobs, seasonally adjusted (BLS Current Employment Statistics)
FRED_SERIES = {
    "total": "PAYEMS",
    "tech": "CES6054150001",  # computer systems design and related services, from 1990
    "info": "USINFO",
    "finance": "USFIRE",
    "manufacturing": "MANEMP",
    "construction": "USCONS",
    "mining": "USMINE",
    "health": "CES6562000101",  # health care, from 1990
    "eduhealth": "USEHS",
    "education": "CES9093161101",  # local government education, from 1955
    "public": "USGOVT",
    "retail": "USTRADE",
    "hospitality": "USLAH",
    "transport": "CES4300000001",  # transportation and warehousing, from 1972
    "tpu": "USTPU",
    "business": "USPBS",
}
# every country's employment by ISIC section, ILO modelled estimates
ILO_SECTIONS = ["TOTAL", "A", "B", "C", "DE", "F", "G", "HJ", "I", "K", "LMN", "O", "P", "Q", "RSTU"]
URLS["ilo_emp_by_industry.csv"] = (
    "https://sdmx.ilo.org/rest/data/ILO,DF_EMP_2EMP_SEX_ECO_NB,1.0/.A..SEX_T."
    + "+".join(f"ECO_ISIC4_{x}" for x in ILO_SECTIONS)
    + "?startPeriod=1991&format=csv"
)
for key, code in WB_INDICATORS.items():
    URLS[f"wb_{key}.json"] = (
        f"https://api.worldbank.org/v2/country/all/indicator/{code}"
        "?format=json&per_page=20000&date=1960:2025"
    )


def shiller_link() -> str:
    """The data page links the spreadsheet under a versioned URL; find the current one."""
    req = urllib.request.Request(URLS["shiller_ie_data.xls"], headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            page = resp.read().decode("utf-8", "replace")
        m = re.search(r'href="((?:https:)?//[^"]+/ie_data\.xls[^"]*)"', page)
        if m:
            return m.group(1) if m.group(1).startswith("https:") else "https:" + m.group(1)
    except Exception:
        pass
    return SHILLER_FALLBACK


def cmo_link() -> str:
    """The World Bank's monthly commodity prices (the Pink Sheet) move to a new URL each month."""
    req = urllib.request.Request(URLS["wb_cmo_monthly.xlsx"], headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            page = resp.read().decode("utf-8", "replace")
        m = re.search(r'(https://thedocs\.worldbank\.org/[^"\']+/CMO-Historical-Data-Monthly\.xlsx)', page)
        if m:
            return m.group(1)
    except Exception:
        pass
    return CMO_FALLBACK


def download(name: str, url: str, force: bool) -> str:
    dest = RAW / name
    if dest.exists() and dest.stat().st_size > 0 and not force:
        return f"cached  {name}"
    if name == "shiller_ie_data.xls":
        url = shiller_link()
    elif name == "wb_cmo_monthly.xlsx":
        url = cmo_link()
    last_err: Exception | None = None
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=180) as resp:
                body = resp.read()
            if name.endswith(".json"):
                json.loads(body)  # fail loudly on an error page
            dest.write_bytes(body)
            return f"fetched {name} ({len(body) / 1e6:.1f} MB)"
        except Exception as err:  # network hiccups: back off and retry
            last_err = err
            time.sleep(2 ** (attempt + 1))
    raise RuntimeError(f"{name}: {last_err}")


def fetch_fred(force: bool) -> None:
    """FRED serves scripted downloads through its API, which needs a free key (FRED_API_KEY).
    Without one, save each series' CSV from its FRED page into pipeline/raw/ as fred_<key>.csv."""
    key = os.environ.get("FRED_API_KEY")
    for name, sid in FRED_SERIES.items():
        dest = RAW / f"fred_{name}.csv"
        if dest.exists() and dest.stat().st_size > 0 and not force:
            print(f"cached  {dest.name}")
            continue
        if not key:
            print(f"MISSING {dest.name}: set FRED_API_KEY, or save https://fred.stlouisfed.org/series/{sid} as CSV there")
            continue
        url = f"https://api.stlouisfed.org/fred/series/observations?series_id={sid}&api_key={key}&file_type=json"
        with urllib.request.urlopen(url, timeout=120) as resp:
            obs = json.loads(resp.read())["observations"]
        rows = [f"{o['date']},{o['value']}" for o in obs if o["value"] != "."]
        dest.write_text("\n".join([f"observation_date,{sid}", *rows]) + "\n")
        print(f"fetched {dest.name}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--force", action="store_true", help="re-download cached files")
    args = parser.parse_args()
    RAW.mkdir(parents=True, exist_ok=True)
    with cf.ThreadPoolExecutor(max_workers=6) as pool:
        futures = {pool.submit(download, n, u, args.force): n for n, u in URLS.items()}
        failed = []
        for fut in cf.as_completed(futures):
            try:
                print(fut.result())
            except Exception as err:
                failed.append(futures[fut])
                print(f"FAILED  {err}")
    fetch_fred(args.force)
    if failed:
        raise SystemExit(f"{len(failed)} downloads failed: {', '.join(sorted(failed))}")


if __name__ == "__main__":
    main()
