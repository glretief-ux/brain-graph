#!/usr/bin/env python3
"""Fetch live-ish market prices (gold, oil, crypto, indices...) into site/markets.json for Jarvis.

Usage:  python scripts/fetch_markets.py [output_json]
Runs inside the GitHub job, so no browser limits and no API key. Every quote has a
backup source; a quote that cannot be read is simply left out (the build never fails).
Standard library only.
"""
import csv
import datetime
import io
import json
import pathlib
import sys
import urllib.request

UA = "Mozilla/5.0 (compatible; BrainGraphMarkets/1.0)"

# key, names people say, Yahoo symbol, stooq symbol (backup), unit, label, currency
ASSETS = [
    ("gold", "gold", "GC=F", "xauusd", "per ounce", "Gold", "USD"),
    ("silver", "silver", "SI=F", "xagusd", "per ounce", "Silver", "USD"),
    ("brent", "Brent crude oil", "BZ=F", "cb.f", "per barrel", "Brent crude oil", "USD"),
    ("wti", "WTI crude oil", "CL=F", "cl.f", "per barrel", "WTI crude oil", "USD"),
    ("gas", "natural gas", "NG=F", "ng.f", "per MMBtu", "US natural gas", "USD"),
    ("ttf", "European gas", "TTF=F", "", "per MWh", "European gas (TTF)", "EUR"),
    ("copper", "copper", "HG=F", "hg.f", "per pound", "Copper", "USD"),
    ("bitcoin", "Bitcoin", "BTC-USD", "btcusd", "", "Bitcoin", "USD"),
    ("ethereum", "Ethereum", "ETH-USD", "ethusd", "", "Ethereum", "USD"),
    ("sp500", "S&P 500", "^GSPC", "^spx", "points", "S&P 500", ""),
    ("dow", "Dow Jones", "^DJI", "^dji", "points", "Dow Jones", ""),
    ("nasdaq", "Nasdaq", "^IXIC", "^ndq", "points", "Nasdaq", ""),
    ("eurostoxx", "Euro Stoxx 50", "^STOXX50E", "", "points", "Euro Stoxx 50", ""),
    ("bel20", "BEL 20", "^BFX", "", "points", "BEL 20", ""),
    ("eurusd", "euro to dollar", "EURUSD=X", "eurusd", "", "Euro in US dollars", "USD"),
]


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
    with urllib.request.urlopen(req, timeout=20) as r:
        return r.read().decode("utf-8", "replace")


def yahoo(sym):
    for host in ("query1", "query2"):
        try:
            d = json.loads(get(f"https://{host}.finance.yahoo.com/v8/finance/chart/{sym}?range=5d&interval=1d"))
            m = d["chart"]["result"][0]["meta"]
            price = m.get("regularMarketPrice")
            prev = m.get("chartPreviousClose") or m.get("previousClose")
            t = m.get("regularMarketTime")
            if price:
                return float(price), float(prev) if prev else None, (
                    datetime.datetime.fromtimestamp(t, datetime.timezone.utc).isoformat() if t else "")
        except Exception:
            continue
    return None


def stooq(sym):
    if not sym:
        return None
    try:
        rows = list(csv.DictReader(io.StringIO(get(f"https://stooq.com/q/l/?s={sym}&f=sd2t2ohlcv&h&e=csv"))))
        row = rows[0]
        price = float(row["Close"])
        opn = float(row["Open"]) if row.get("Open") not in (None, "N/D") else None
        return price, opn, ""
    except Exception:
        return None


def main():
    out = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "site/markets.json")
    quotes = {}
    for key, name, ysym, ssym, unit, label, cur in ASSETS:
        got = yahoo(ysym) or stooq(ssym)
        if not got:
            print("skip", key)
            continue
        price, prev, when = got
        change = round((price - prev) / prev * 100, 2) if prev else None
        quotes[key] = {"name": name, "label": label, "price": round(price, 4 if price < 10 else 2),
                       "change_pct": change, "unit": unit, "currency": cur, "time": when}
        print("ok", key, price)
    if not quotes and out.exists():
        print("no quotes fetched; keeping the previous file")
        return
    out.write_text(json.dumps({"updated": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                               "quotes": quotes}, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
