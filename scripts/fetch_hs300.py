"""Fetch HS300 index + PE TTM data via AKShare and write JSON cache."""
import json
import sys
from pathlib import Path

import akshare as ak

CACHE_FILE = Path(__file__).resolve().parent.parent / "data" / "cache" / "hs300-valuation.json"
CHART_ID = "hs300-valuation"
PE_DANGER_PCT = 70
PE_MEDIAN_PCT = 50
PE_OPPORTUNITY_PCT = 30


def fetch():
    df = ak.stock_index_pe_lg(symbol="沪深300")  # 沪深300

    # Columns: 日期, 指数, 等权静态市盈率, 静态市盈率, 静态市盈率中位数,
    #           等权滚动市盈率, 滚动市盈率, 滚动市盈率中位数
    cols = df.columns.tolist()
    date_col = cols[0]
    index_col = cols[1]
    pe_col = cols[6]  # TTM PE cap-weighted (market standard for PE temperature) (韭圈儿/乐咕乐股主图指标)

    data = []
    pe_values = []

    for _, row in df.iterrows():
        date_str = str(row[date_col])[:10]
        index_val = row[index_col]
        pe_val = row[pe_col]

        if not _is_valid(index_val) or not _is_valid(pe_val):
            continue

        data.append({
            "date": date_str,
            "index": round(float(index_val), 2),
            "pe": round(float(pe_val), 2)
        })
        pe_values.append(float(pe_val))

    if len(data) < 100:
        raise RuntimeError(f"Data too short: {len(data)} rows, expected >= 100")

    pe_values.sort()
    n = len(pe_values)

    def pct(p):
        idx = round(n * p / 100)
        return round(pe_values[min(idx, n - 1)], 2)

    pe_percentiles = {
        "danger": pct(PE_DANGER_PCT),
        "median": pct(PE_MEDIAN_PCT),
        "opportunity": pct(PE_OPPORTUNITY_PCT)
    }

    payload = {
        "chart": {
            "id": CHART_ID,
            "title": "沪深300估值观察",  # 沪深300估值观察
            "shortTitle": "沪深300估值",         # 沪深300估值
            "description": "沪深300指数与市盈率TTM走势，含危险值/中位数/机会值分位线。",
            "sourceNames": ["东方财富", "乐咕乐股"]
        },
        "data": data,
        "syncedAt": _now_iso(),
        "latestDate": data[-1]["date"],
        "sourceStatus": "live",
        "sources": [
            {"name": "东方财富/乐咕乐股", "url": "https://legulegu.com/stockdata/hs300-ttm-lyr"}
        ],
        "pePercentiles": pe_percentiles
    }

    CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
    CACHE_FILE.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")

    print(f"Written {len(data)} rows to {CACHE_FILE}")
    print(f"PE percentiles: danger={pe_percentiles['danger']}, "
          f"median={pe_percentiles['median']}, opportunity={pe_percentiles['opportunity']}")
    print(f"Latest: date={data[-1]['date']}, index={data[-1]['index']}, PE={data[-1]['pe']}")


def _is_valid(val):
    return val is not None and float(val) > 0


def _now_iso():
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat()


if __name__ == "__main__":
    try:
        fetch()
    except Exception as exc:
        print(f"FETCH_ERROR: {exc}", file=sys.stderr)
        sys.exit(1)
