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
"""

from __future__ import annotations

import argparse
import concurrent.futures as cf
import json
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
}
for key, code in WB_INDICATORS.items():
    URLS[f"wb_{key}.json"] = (
        f"https://api.worldbank.org/v2/country/all/indicator/{code}"
        "?format=json&per_page=20000&date=1960:2025"
    )


def download(name: str, url: str, force: bool) -> str:
    dest = RAW / name
    if dest.exists() and dest.stat().st_size > 0 and not force:
        return f"cached  {name}"
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
    if failed:
        raise SystemExit(f"{len(failed)} downloads failed: {', '.join(sorted(failed))}")


if __name__ == "__main__":
    main()
