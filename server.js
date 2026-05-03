import { createServer } from "node:http";
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(__dirname, "public");
const cacheDir = join(__dirname, "data", "cache");
const cacheFile = join(cacheDir, "spx-vix.json");
const hs300CacheFile = join(cacheDir, "hs300-valuation.json");
const pythonExe = join(__dirname, ".venv", "Scripts", "python.exe");
const fetchScript = join(__dirname, "scripts", "fetch_hs300.py");
const port = Number(process.env.PORT || 4173);
const maxCacheAgeMs = 12 * 60 * 60 * 1000;
const maxPeCacheAgeMs = 24 * 60 * 60 * 1000;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

const chartCatalog = [
  {
    id: "spx-vix",
    title: "S&P 500 与 VIX 风险观察",
    shortTitle: "S&P 500 + VIX",
    description: "用公开市场数据重建 MacroMicro 风格的双轴风险图。",
    sourceNames: ["FRED SP500", "FRED VIXCLS"],
    accent: "#b42318",
    secondaryAccent: "#1570a6",
    series: [
      { key: "vix", label: "VIX", axis: "left", color: "#1570a6" },
      { key: "spx", label: "S&P 500", axis: "right", color: "#b42318" }
    ],
    referenceLines: []
  },
  {
    id: "hs300-valuation",
    title: "沪深300估值观察",
    shortTitle: "沪深300估值",
    description: "沪深300指数与市盈率TTM走势，含危险值/中位数/机会值分位线。",
    sourceNames: ["东方财富", "乐咕乐股"],
    accent: "#b42318",
    secondaryAccent: "#1570a6",
    series: [
      { key: "pe", label: "PE TTM", axis: "left", color: "#1570a6" },
      { key: "index", label: "沪深300", axis: "right", color: "#b42318" }
    ],
    referenceLines: [
      { key: "danger", label: "危险值", color: "#b42318" },
      { key: "median", label: "中位数", color: "#5c6670" },
      { key: "opportunity", label: "机会值", color: "#237a57" }
    ]
  }
];

createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);

    if (url.pathname === "/api/charts") {
      return sendJson(response, {
        charts: chartCatalog,
        generatedAt: new Date().toISOString()
      });
    }

    if (url.pathname === "/api/charts/spx-vix") {
      const payload = await getSpxVixData();
      return sendJson(response, payload);
    }

    if (url.pathname === "/api/charts/hs300-valuation") {
      const payload = await getHs300ValuationData();
      return sendJson(response, payload);
    }

    return serveStatic(url.pathname, response);
  } catch (error) {
    console.error(error);
    sendJson(response, { error: "服务暂时不可用", detail: error.message }, 500);
  }
}).listen(port, () => {
  console.log(`Index dashboard running at http://localhost:${port}`);
});

function runPythonFetch() {
  return new Promise((resolve, reject) => {
    execFile(pythonExe, [fetchScript], { timeout: 60000 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`Python fetch failed: ${stderr || error.message}`));
        return;
      }
      console.log(stdout.trim());
      resolve();
    });
  });
}

async function getHs300ValuationData() {
  let cached = null;
  try {
    await stat(hs300CacheFile);
    cached = JSON.parse(await readFile(hs300CacheFile, "utf8"));
  } catch {
    // no cache yet
  }

  const freshEnough = cached && Date.now() - new Date(cached.syncedAt).getTime() < maxPeCacheAgeMs;

  if (freshEnough) {
    return {
      ...cached,
      cache: { status: "fresh", syncedAt: cached.syncedAt }
    };
  }

  try {
    await runPythonFetch();
    cached = JSON.parse(await readFile(hs300CacheFile, "utf8"));

    if (!cached.data || cached.data.length < 100) {
      throw new Error("Python fetch returned insufficient data");
    }

    return {
      ...cached,
      cache: { status: "updated", syncedAt: cached.syncedAt }
    };
  } catch (error) {
    if (cached) {
      return {
        ...cached,
        cache: {
          status: "stale",
          syncedAt: cached.syncedAt,
          warning: `更新失败，正在显示上次缓存：${error.message}`
        }
      };
    }

    const fallback = createDemoHs300Data();
    return {
      ...fallback,
      cache: {
        status: "demo",
        warning: `暂时无法获取估值数据，正在显示演示数据：${error.message}`
      }
    };
  }
}

function createDemoHs300Data() {
  const catalogEntry = chartCatalog.find((chart) => chart.id === "hs300-valuation");
  const data = [];
  const start = new Date("2015-01-01T00:00:00Z");
  let index = 3500;
  let pe = 13;

  for (let day = 0; day < 2800; day += 1) {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + day);
    const weekday = date.getUTCDay();
    if (weekday === 0 || weekday === 6) continue;

    index += Math.sin(day / 120) * 40 + Math.cos(day / 300) * 80 + (Math.random() - 0.48) * 15;
    index = Math.max(2500, Math.min(6000, index));
    pe += Math.sin(day / 140) * 0.5 + Math.cos(day / 350) * 0.8 + (Math.random() - 0.5) * 0.3;
    pe = Math.max(8, Math.min(28, pe));

    if (day % 7 < 5) {
      data.push({
        date: date.toISOString().slice(0, 10),
        index: Number(index.toFixed(2)),
        pe: Number(pe.toFixed(2))
      });
    }
  }

  return {
    chart: catalogEntry,
    data,
    syncedAt: null,
    latestDate: data.at(-1).date,
    sourceStatus: "demo",
    sources: [{ name: "演示数据", url: "https://legulegu.com/stockdata/hs300-ttm-lyr" }],
    pePercentiles: { danger: 18, median: 13, opportunity: 10 }
  };
}

async function getSpxVixData() {
  const cached = await readCachedChart();
  const freshEnough = cached && Date.now() - new Date(cached.syncedAt).getTime() < maxCacheAgeMs;

  if (freshEnough) {
    const normalized = normalizeChartPayload(cached);
    return {
      ...normalized,
      cache: { status: "fresh", syncedAt: normalized.syncedAt }
    };
  }

  try {
    const [spx, vix] = await Promise.all([
      fetchFredSeries("SP500", "S&P 500"),
      fetchFredSeries("VIXCLS", "VIX")
    ]);
    const data = mergeSeries(spx, vix);

    if (data.length < 20) {
      throw new Error("公开数据源返回的数据量不足");
    }

    const payload = {
      chart: chartCatalog.find((chart) => chart.id === "spx-vix"),
      data,
      syncedAt: new Date().toISOString(),
      latestDate: data.at(-1).date,
      sourceStatus: "live",
      sources: [
        {
          name: "FRED SP500",
          url: "https://fred.stlouisfed.org/series/SP500"
        },
        {
          name: "FRED VIXCLS",
          url: "https://fred.stlouisfed.org/series/VIXCLS"
        }
      ]
    };

    await writeCachedChart(payload);
    return {
      ...payload,
      cache: { status: "updated", syncedAt: payload.syncedAt }
    };
  } catch (error) {
    if (cached) {
      return {
        ...cached,
        cache: {
          status: "stale",
          syncedAt: cached.syncedAt,
          warning: `更新失败，正在显示上次缓存：${error.message}`
        }
      };
    }

    const fallback = createDemoSpxVixData();
    return {
      ...fallback,
      cache: {
        status: "demo",
        warning: `暂时无法连接公开数据源，正在显示演示数据：${error.message}`
      }
    };
  }
}

async function fetchFredSeries(seriesId, label) {
  const response = await fetch(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${seriesId}`, {
    headers: {
      "User-Agent": "macro-index-watch/0.1"
    }
  });

  if (!response.ok) {
    throw new Error(`${label} 数据请求失败：HTTP ${response.status}`);
  }

  const csv = await response.text();
  return parseFredCsv(csv, seriesId);
}

function parseFredCsv(csv, seriesId) {
  return csv
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .map((line) => {
      const [date, rawValue] = line.split(",");
      const value = Number(rawValue);
      return Number.isFinite(value) && value > 0 ? { date, value } : null;
    })
    .filter(Boolean)
    .map((point) => ({ date: point.date, [seriesId]: point.value }));
}

function mergeSeries(spx, vix) {
  const byDate = new Map();

  for (const point of spx) {
    byDate.set(point.date, { date: point.date, spx: point.SP500 });
  }

  for (const point of vix) {
    const existing = byDate.get(point.date);
    if (existing) {
      existing.vix = point.VIXCLS;
    }
  }

  return [...byDate.values()]
    .filter((point) => point.spx > 0 && point.vix > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
}

async function readCachedChart() {
  try {
    await stat(cacheFile);
    return normalizeChartPayload(JSON.parse(await readFile(cacheFile, "utf8")));
  } catch {
    return null;
  }
}

function normalizeChartPayload(payload) {
  const data = payload.data
    .filter((point) => point.spx > 0 && point.vix > 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    ...payload,
    data,
    latestDate: data.at(-1)?.date || payload.latestDate
  };
}

async function writeCachedChart(payload) {
  await mkdir(cacheDir, { recursive: true });
  await writeFile(cacheFile, JSON.stringify(payload, null, 2));
}

function createDemoSpxVixData() {
  const data = [];
  const start = new Date("2024-05-01T00:00:00Z");
  let spx = 5120;
  let vix = 14.2;

  for (let day = 0; day < 520; day += 1) {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + day);
    const weekday = date.getUTCDay();

    if (weekday === 0 || weekday === 6) {
      continue;
    }

    const drift = 1.8 + Math.sin(day / 35) * 8 + Math.cos(day / 19) * 5;
    const shock = day === 230 ? -420 : day === 410 ? -260 : 0;
    const calm = day === 260 ? 18 : day === 415 ? 12 : 0;
    spx = Math.max(4200, spx + drift + shock / 12);
    vix = Math.max(10, Math.min(55, vix + Math.sin(day / 12) * 0.7 + calm / 8 - drift / 90));

    data.push({
      date: date.toISOString().slice(0, 10),
      spx: Number(spx.toFixed(2)),
      vix: Number(vix.toFixed(2))
    });
  }

  return {
    chart: chartCatalog.find((chart) => chart.id === "spx-vix"),
    data,
    syncedAt: null,
    latestDate: data.at(-1).date,
    sourceStatus: "demo",
    sources: [
      {
        name: "演示数据",
        url: "https://fred.stlouisfed.org/"
      }
    ]
  };
}

function sendJson(response, payload, statusCode = 200) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

async function serveStatic(pathname, response) {
  const requestedPath = pathname === "/" ? "/index.html" : decodeURIComponent(pathname);
  const normalizedPath = normalize(requestedPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(publicDir, normalizedPath);

  if (!filePath.startsWith(publicDir)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    await stat(filePath);
    const extension = extname(filePath);
    response.writeHead(200, {
      "Content-Type": mimeTypes[extension] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
}
