"""Fetch SPX+VIX (FRED) and HS300 valuation (AKShare), write JSON cache files."""
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import akshare as ak
import requests

CACHE_DIR = Path(__file__).resolve().parent.parent / "data" / "cache"
CACHE_DIR.mkdir(parents=True, exist_ok=True)

FRED_USER_AGENT = "macro-index-watch/0.1"


def now_iso():
    return datetime.now(timezone.utc).isoformat()


# ── FRED helpers ──────────────────────────────────────────────

def fetch_fred_csv(series_id):
    url = f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={series_id}"
    for attempt in range(3):
        try:
            resp = requests.get(url, headers={"User-Agent": FRED_USER_AGENT}, timeout=60)
            resp.raise_for_status()
            return resp.text
        except requests.RequestException:
            if attempt == 2:
                raise
            import time
            time.sleep(5)


def parse_fred_csv(csv_text):
    data = []
    for line in csv_text.strip().split("\n")[1:]:
        parts = line.split(",")
        if len(parts) < 2:
            continue
        date_str = parts[0].strip()
        val = float(parts[1].strip()) if parts[1].strip() != "." else None
        if val is not None and val > 0:
            data.append({"date": date_str, "value": val})
    return data


# ── SPX + VIX ─────────────────────────────────────────────────

def fetch_spx_vix():
    spx_raw = parse_fred_csv(fetch_fred_csv("SP500"))
    vix_raw = parse_fred_csv(fetch_fred_csv("VIXCLS"))

    spx_map = {p["date"]: p["value"] for p in spx_raw}
    vix_map = {p["date"]: p["value"] for p in vix_raw}

    data = []
    for date in sorted(set(spx_map) & set(vix_map)):
        data.append({
            "date": date,
            "spx": round(spx_map[date], 2),
            "vix": round(vix_map[date], 2)
        })

    if len(data) < 100:
        raise RuntimeError(f"FRED data too short: {len(data)} rows")

    return {
        "chart": {
            "id": "spx-vix",
            "title": "S&P 500 与 VIX 风险观察",
            "shortTitle": "S&P 500 + VIX",
            "description": "用公开市场数据重建 MacroMicro 风格的双轴风险图。",
            "sourceNames": ["FRED SP500", "FRED VIXCLS"]
        },
        "data": data,
        "syncedAt": now_iso(),
        "latestDate": data[-1]["date"],
        "sourceStatus": "live",
        "sources": [
            {"name": "FRED SP500", "url": "https://fred.stlouisfed.org/series/SP500"},
            {"name": "FRED VIXCLS", "url": "https://fred.stlouisfed.org/series/VIXCLS"}
        ]
    }


# ── HS300 valuation ────────────────────────────────────────────

def fetch_hs300():
    df = ak.stock_index_pe_lg(symbol="沪深300")
    cols = df.columns.tolist()
    date_col = cols[0]
    index_col = cols[1]
    pe_col = cols[6]  # TTM PE cap-weighted

    data = []
    pe_vals = []

    for _, row in df.iterrows():
        date_str = str(row[date_col])[:10]
        idx_val = row[index_col]
        pe_val = row[pe_col]
        if not (idx_val and float(idx_val) > 0 and pe_val and float(pe_val) > 0):
            continue
        data.append({
            "date": date_str,
            "index": round(float(idx_val), 2),
            "pe": round(float(pe_val), 2)
        })
        pe_vals.append(float(pe_val))

    if len(data) < 100:
        raise RuntimeError(f"HS300 data too short: {len(data)} rows")

    pe_vals.sort()
    n = len(pe_vals)

    def pct(p):
        idx = round(n * p / 100)
        return round(pe_vals[min(idx, n - 1)], 2)

    return {
        "chart": {
            "id": "hs300-valuation",
            "title": "沪深300估值观察",
            "shortTitle": "沪深300估值",
            "description": "沪深300指数与市盈率TTM走势，含危险值/中位数/机会值分位线。",
            "sourceNames": ["东方财富", "乐咕乐股"]
        },
        "data": data,
        "syncedAt": now_iso(),
        "latestDate": data[-1]["date"],
        "sourceStatus": "live",
        "sources": [
            {"name": "东方财富/乐咕乐股", "url": "https://legulegu.com/stockdata/hs300-ttm-lyr"}
        ],
        "pePercentiles": {
            "danger": pct(70),
            "median": pct(50),
            "opportunity": pct(30)
        }
    }


# ── Main ───────────────────────────────────────────────────────

def main():
    print("Fetching HS300 valuation...")
    hs300 = fetch_hs300()
    path = CACHE_DIR / "hs300-valuation.json"
    path.write_text(json.dumps(hs300, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"  -> {path}  ({len(hs300['data'])} rows, latest={hs300['latestDate']})")
    pp = hs300["pePercentiles"]
    print(f"  PE danger={pp['danger']} median={pp['median']} opportunity={pp['opportunity']}")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"FETCH_ERROR: {exc}", file=sys.stderr)
        sys.exit(1)
