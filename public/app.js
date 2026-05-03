const DATA_BASE = "https://9947bevinye-crypto.github.io/index-watch";
const CACHE_PREFIX = "iw_cache_";
const CACHE_AGE_MS = 24 * 60 * 60 * 1000;

const state = {
  charts: [],
  chartConfig: null,
  activeChartId: "spx-vix",
  activeRange: "1y",
  seriesVisibility: {},
  payload: null,
  visibleData: []
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
    referenceLines: [],
    dataFile: "spx-vix.json"
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
    ],
    dataFile: "hs300-valuation.json"
  }
];

const elements = {
  chartNav: document.querySelector("#chartNav"),
  menuButton: document.querySelector("#menuButton"),
  drawer: document.querySelector("#indexDrawer"),
  drawerBackdrop: document.querySelector("#drawerBackdrop"),
  drawerCloseButton: document.querySelector("#drawerCloseButton"),
  refreshButton: document.querySelector("#refreshButton"),
  pageTitle: document.querySelector("#pageTitle"),
  statusStrip: document.querySelector("#statusStrip"),
  summaryGrid: document.querySelector("#summaryGrid"),
  toolbar: document.querySelector(".chart-toolbar"),
  rangeTabs: document.querySelector("#rangeTabs"),
  canvas: document.querySelector("#mainChart"),
  tooltip: document.querySelector("#chartTooltip"),
  sourceText: document.querySelector("#sourceText"),
  latestDate: document.querySelector("#latestDate")
};

const context = elements.canvas.getContext("2d");

init();

async function init() {
  state.charts = chartCatalog;
  bindEvents();
  renderNav();
  await loadActiveChart();
}

function bindEvents() {
  elements.refreshButton.addEventListener("click", () => loadActiveChart(true));
  elements.menuButton.addEventListener("click", openDrawer);
  elements.drawerCloseButton.addEventListener("click", closeDrawer);
  elements.drawerBackdrop.addEventListener("click", closeDrawer);

  elements.rangeTabs.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-range]");
    if (!button) return;
    state.activeRange = button.dataset.range;
    updateRangeButtons();
    renderActiveChart();
  });

  elements.toolbar.addEventListener("change", (event) => {
    const input = event.target.closest("input[data-series]");
    if (!input) return;
    state.seriesVisibility[input.dataset.series] = input.checked;
    drawChart();
  });

  elements.canvas.addEventListener("mousemove", handleChartHover);
  elements.canvas.addEventListener("mouseleave", () => {
    elements.tooltip.hidden = true;
  });
  window.addEventListener("resize", drawChart);
  document.addEventListener("fullscreenchange", () => {
    const btn = document.querySelector("#fullscreenBtn");
    if (!document.fullscreenElement && btn) btn.textContent = "⛶";
    setTimeout(drawChart, 150);
  });
  document.addEventListener("webkitfullscreenchange", () => {
    const btn = document.querySelector("#fullscreenBtn");
    if (!document.webkitFullscreenElement && btn) btn.textContent = "⛶";
    setTimeout(drawChart, 150);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        closeDrawer();
      }
    }
  });
  updateRangeButtons();
}

function getCached(chartId) {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + chartId);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (Date.now() - entry.ts > CACHE_AGE_MS) return null;
    return entry.data;
  } catch {
    return null;
  }
}

function setCached(chartId, data) {
  try {
    localStorage.setItem(CACHE_PREFIX + chartId, JSON.stringify({ ts: Date.now(), data }));
  } catch {
    // storage full, ignore
  }
}

async function fetchChartData(chartId, forceRefresh) {
  const config = chartCatalog.find((c) => c.id === chartId);
  if (!config) throw new Error("Unknown chart: " + chartId);

  if (!forceRefresh) {
    const cached = getCached(chartId);
    if (cached) return { ...cached, cache: { status: "fresh" } };
  }

  const url = `${DATA_BASE}/${config.dataFile}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();

  setCached(chartId, data);
  return data;
}

async function loadActiveChart(forceRefresh) {
  setStatus("pending", forceRefresh ? "正在联网更新..." : "正在检查最新数据...");

  try {
    const payload = await fetchChartData(state.activeChartId, forceRefresh);
    setChartConfig();
    state.payload = payload;
    renderActiveChart();
    renderStatus(payload);
  } catch (error) {
    setStatus("error", "数据加载失败，请检查网络后点刷新重试");
  }
}

function setChartConfig() {
  state.chartConfig = chartCatalog.find((c) => c.id === state.activeChartId) || null;
  if (state.chartConfig && state.chartConfig.series) {
    state.seriesVisibility = {};
    for (const s of state.chartConfig.series) {
      state.seriesVisibility[s.key] = true;
    }
  }
}

function renderNav() {
  elements.chartNav.innerHTML = "";

  for (const chart of chartCatalog) {
    const button = document.createElement("button");
    button.className = `nav-button${chart.id === state.activeChartId ? " active" : ""}`;
    button.type = "button";
    button.innerHTML = `
      <span class="nav-title">${chart.shortTitle}</span>
      <span class="nav-meta">打开时自动更新</span>
    `;
    button.addEventListener("click", async () => {
      state.activeChartId = chart.id;
      document.querySelectorAll(".nav-button").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      closeDrawer();
      await loadActiveChart();
    });
    elements.chartNav.append(button);
  }
}

function renderToggleBar() {
  const config = state.chartConfig;
  if (!config || !config.series) {
    elements.toolbar.innerHTML = "";
    return;
  }

  elements.toolbar.innerHTML = config.series
    .map((s) => {
      const checked = state.seriesVisibility[s.key] !== false ? "checked" : "";
      return `<label class="toggle">
        <input type="checkbox" data-series="${s.key}" ${checked} />
        <span class="swatch" style="background:${s.color}"></span>
        <span>${s.label}</span>
      </label>`;
    })
    .join("");
}

function renderActiveChart() {
  if (!state.payload) return;

  const { chart, data, sources, latestDate } = state.payload;
  state.visibleData = filterByRange(data, state.activeRange);

  // Remove data points with invalid (zero/negative) values
  if (state.chartConfig && state.chartConfig.series) {
    const keys = state.chartConfig.series.map((s) => s.key);
    state.visibleData = state.visibleData.filter((p) =>
      keys.every((k) => p[k] > 0)
    );
  }

  elements.pageTitle.textContent = chart.title;
  elements.sourceText.textContent = `数据来源：${(sources || []).map((s) => s.name).join(" / ") || chart.sourceNames.join(" / ")}`;
  elements.latestDate.textContent = `最新日期：${formatDate(latestDate)}`;

  renderToggleBar();
  renderSummaryCards(state.visibleData, state.payload);
  drawChart();
}

function renderSummaryCards(data, payload) {
  const first = data[0];
  const latest = data.at(-1);
  const id = state.activeChartId;

  if (id === "hs300-valuation") {
    const pe = latest.pe;
    const pp = payload.pePercentiles;
    const indexChange = first ? ((latest.index - first.index) / first.index) * 100 : 0;

    let valuationZone = "合理区间";
    if (pe <= pp.opportunity) valuationZone = "低估区间";
    else if (pe >= pp.danger) valuationZone = "高估区间";

    elements.summaryGrid.innerHTML = `
      <article class="metric-card">
        <p class="metric-label">沪深300 最新值</p>
        <p class="metric-value">${formatNumber(latest.index)}</p>
        <p class="metric-note">${rangeLabel(state.activeRange)}涨跌：${formatPercent(indexChange)}</p>
      </article>
      <article class="metric-card">
        <p class="metric-label">PE TTM 最新值</p>
        <p class="metric-value">${formatNumber(latest.pe)}</p>
        <p class="metric-note valuation-zone">估值状态：${valuationZone}</p>
      </article>
      <article class="metric-card">
        <p class="metric-label">危险值 / 中位数 / 机会值</p>
        <p class="metric-value">${pp.danger} / ${pp.median} / ${pp.opportunity}</p>
        <p class="metric-note">历史70/50/30分位</p>
      </article>
      <article class="metric-card">
        <p class="metric-label">同步状态</p>
        <p class="metric-value">${statusLabel((payload.cache || {}).status || "updated")}</p>
        <p class="metric-note">${payload.syncedAt ? `同步：${formatDateTime(payload.syncedAt)}` : "已是最新数据"}</p>
      </article>
    `;
  } else {
    const highVix = maxBy(data, "vix");
    const spxChange = first ? ((latest.spx - first.spx) / first.spx) * 100 : 0;

    elements.summaryGrid.innerHTML = `
      <article class="metric-card">
        <p class="metric-label">S&P 500 最新值</p>
        <p class="metric-value">${formatNumber(latest.spx)}</p>
        <p class="metric-note">${rangeLabel(state.activeRange)}涨跌：${formatPercent(spxChange)}</p>
      </article>
      <article class="metric-card">
        <p class="metric-label">VIX 最新值</p>
        <p class="metric-value">${formatNumber(latest.vix)}</p>
        <p class="metric-note">${describeVix(latest.vix)}</p>
      </article>
      <article class="metric-card">
        <p class="metric-label">区间最高 VIX</p>
        <p class="metric-value">${formatNumber(highVix.vix)}</p>
        <p class="metric-note">日期：${formatDate(highVix.date)}</p>
      </article>
      <article class="metric-card">
        <p class="metric-label">同步状态</p>
        <p class="metric-value">${statusLabel((payload.cache || {}).status || "updated")}</p>
        <p class="metric-note">${payload.syncedAt ? `同步：${formatDateTime(payload.syncedAt)}` : "已是最新数据"}</p>
      </article>
    `;
  }
}

function renderStatus(payload) {
  const cache = payload.cache || {};
  if (cache.warning) {
    setStatus(cache.status === "demo" ? "pending" : "error", cache.warning);
    return;
  }
  setStatus("ok", `数据已就绪，最新日期 ${formatDate(payload.latestDate)}`);
}

/* ═══════════════════════════ Chart ═══════════════════════════ */

function drawChart() {
  const data = state.visibleData;
  const config = state.chartConfig;
  if (!data.length || !config || !config.series) {
    clearCanvas();
    return;
  }

  const canvas = elements.canvas;
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(rect.width * dpr));
  canvas.height = Math.max(1, Math.floor(rect.height * dpr));
  context.setTransform(dpr, 0, 0, dpr, 0, 0);

  const width = rect.width;
  const height = rect.height;
  const padding = { top: 24, right: 62, bottom: 44, left: 58 };
  const plot = {
    x: padding.left,
    y: padding.top,
    width: width - padding.left - padding.right,
    height: height - padding.top - padding.bottom
  };

  clearCanvas(width, height);
  drawGrid(context, plot);

  const leftSeries = config.series.find((s) => s.axis === "left");
  const rightSeries = config.series.find((s) => s.axis === "right");

  const leftScale = leftSeries
    ? createScale(data.map((p) => p[leftSeries.key]).filter((v) => v > 0), plot.y + plot.height, plot.y)
    : null;
  const rightScale = rightSeries
    ? createScale(data.map((p) => p[rightSeries.key]).filter((v) => v > 0), plot.y + plot.height, plot.y)
    : null;

  const xScale = (index) => plot.x + (index / Math.max(1, data.length - 1)) * plot.width;

  drawAxes(context, plot, leftSeries, leftScale, rightSeries, rightScale, data);

  for (const s of config.series) {
    if (!state.seriesVisibility[s.key]) continue;
    const scale = s.axis === "left" ? leftScale : rightScale;
    if (!scale) continue;
    const lineWidth = s.axis === "right" ? 2.25 : 2;
    drawLine(context, data, xScale, (point) => scale.toY(point[s.key]), s.color, lineWidth);
  }

  if (config.referenceLines && config.referenceLines.length && state.payload.pePercentiles) {
    const peScale = leftSeries && leftSeries.key === "pe" ? leftScale : rightScale;
    if (peScale) {
      for (const rl of config.referenceLines) {
        const val = state.payload.pePercentiles[rl.key];
        if (val != null) {
          drawReferenceLine(context, plot, peScale.toY(val), rl.color, rl.label);
        }
      }
    }
  }
}

function drawGrid(ctx, plot) {
  ctx.save();
  ctx.strokeStyle = "#d7dce1";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = plot.y + (plot.height / 4) * i;
    ctx.beginPath();
    ctx.moveTo(plot.x, y);
    ctx.lineTo(plot.x + plot.width, y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawAxes(ctx, plot, leftSeries, leftScale, rightSeries, rightScale, data) {
  ctx.save();
  ctx.fillStyle = "#5c6670";
  ctx.font = "12px Inter, Microsoft YaHei, sans-serif";
  ctx.textBaseline = "middle";

  for (let i = 0; i <= 4; i++) {
    const y = plot.y + plot.height * (i / 4);
    if (leftScale) {
      ctx.textAlign = "right";
      ctx.fillText(formatAxisNumber(leftScale.fromY(y)), plot.x - 10, y);
    }
    if (rightScale) {
      ctx.textAlign = plot.width < 520 ? "right" : "left";
      ctx.fillText(formatAxisNumber(rightScale.fromY(y)),
        plot.width < 520 ? plot.x + plot.width + 54 : plot.x + plot.width + 10, y);
    }
  }

  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  const labelCount = Math.min(plot.width < 520 ? 3 : 5, data.length);
  for (let i = 0; i < labelCount; i++) {
    const idx = Math.round((data.length - 1) * (i / Math.max(1, labelCount - 1)));
    const x = plot.x + (idx / Math.max(1, data.length - 1)) * plot.width;
    ctx.textAlign = i === 0 ? "left" : i === labelCount - 1 ? "right" : "center";
    ctx.fillText(formatShortDate(data[idx].date), x, plot.y + plot.height + 16);
  }

  if (plot.width >= 520) {
    if (leftSeries) {
      ctx.fillStyle = leftSeries.color;
      ctx.textAlign = "left";
      ctx.fillText(leftSeries.label, plot.x - 42, plot.y - 12);
    }
    if (rightSeries) {
      ctx.fillStyle = rightSeries.color;
      ctx.textAlign = "right";
      ctx.fillText(rightSeries.label, plot.x + plot.width + 56, plot.y - 12);
    }
  }
  ctx.restore();
}

async function toggleFullscreen() {
  const el = elements.canvas;
  const btn = document.querySelector("#fullscreenBtn");
  if (!document.fullscreenElement) {
    try {
      await el.requestFullscreen();
      if (screen.orientation && screen.orientation.lock) {
        try { await screen.orientation.lock("landscape"); } catch {}
      }
      if (btn) btn.textContent = "✕ 退出";
    } catch {}
  } else {
    if (screen.orientation && screen.orientation.unlock) {
      screen.orientation.unlock();
    }
    document.exitFullscreen();
    if (btn) btn.textContent = "⛶";
  }
}

function drawReferenceLine(ctx, plot, y, color, label) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.moveTo(plot.x, y);
  ctx.lineTo(plot.x + plot.width, y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = color;
  ctx.font = "11px Inter, Microsoft YaHei, sans-serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "bottom";
  ctx.fillText(label, plot.x + plot.width, y - 2);
  ctx.restore();
}

function drawLine(ctx, data, xScale, yScale, color, lineWidth) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  data.forEach((point, index) => {
    const x = xScale(index);
    const y = yScale(point);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.restore();
}

function handleChartHover(event) {
  const data = state.visibleData;
  const config = state.chartConfig;
  if (!data.length || !config) return;

  const rect = elements.canvas.getBoundingClientRect();
  const pl = 58, pr = 62;
  const plotW = rect.width - pl - pr;
  const x = Math.min(Math.max(event.clientX - rect.left - pl, 0), plotW);
  const index = Math.round((x / Math.max(1, plotW)) * (data.length - 1));
  const point = data[index];

  let lines = `<strong>${formatDate(point.date)}</strong>`;
  for (const s of config.series) {
    if (state.seriesVisibility[s.key] !== false && point[s.key] != null) {
      lines += `<br><span style="color:${s.color}">${s.label}</span> ${formatNumber(point[s.key])}`;
    }
  }
  elements.tooltip.innerHTML = lines;
  elements.tooltip.hidden = false;
  elements.tooltip.style.left = `${Math.min(event.clientX - rect.left + 12, rect.width - 190)}px`;
  elements.tooltip.style.top = `${Math.max(event.clientY - rect.top - 64, 12)}px`;
}

function clearCanvas(w, h) {
  const cw = w || elements.canvas.clientWidth;
  const ch = h || elements.canvas.clientHeight;
  context.clearRect(0, 0, cw, ch);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, cw, ch);
}

function createScale(values, yBottom, yTop) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = (max - min || 1) * 0.08;
  const low = min - pad;
  const high = max + pad;
  return {
    toY(v) { return yBottom - ((v - low) / (high - low)) * (yBottom - yTop); },
    fromY(y) { return low + ((yBottom - y) / (yBottom - yTop)) * (high - low); }
  };
}

function filterByRange(data, range) {
  if (range === "all") return data;
  const latest = new Date(`${data.at(-1).date}T00:00:00Z`);
  const start = new Date(latest);
  if (range.endsWith("m")) start.setUTCMonth(latest.getUTCMonth() - Number(range.replace("m", "")));
  else start.setUTCFullYear(latest.getUTCFullYear() - Number(range.replace("y", "")));
  return data.filter((p) => new Date(`${p.date}T00:00:00Z`) >= start);
}

function updateRangeButtons() {
  elements.rangeTabs.querySelectorAll("button[data-range]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.range === state.activeRange);
  });
}

function openDrawer() {
  document.body.classList.add("drawer-open");
  elements.drawerBackdrop.hidden = false;
  elements.drawer.setAttribute("aria-hidden", "false");
  elements.drawer.inert = false;
}

function closeDrawer() {
  document.body.classList.remove("drawer-open");
  elements.drawer.setAttribute("aria-hidden", "true");
  elements.drawer.inert = true;
  elements.drawerBackdrop.hidden = true;
}

function setStatus(type, message) {
  const dotClass = type === "error" ? "error" : type === "pending" ? "pending" : "";
  elements.statusStrip.innerHTML = `<span class="status-dot ${dotClass}"></span><span>${message}</span>`;
}

function maxBy(data, key) {
  return data.reduce((w, p) => (p[key] > w[key] ? p : w), data[0]);
}

function formatNumber(v) { return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: v > 100 ? 0 : 2 }).format(v); }
function formatAxisNumber(v) { return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 }).format(v); }
function formatPercent(v) { return `${new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 1, signDisplay: "always" }).format(v)}%`; }
function formatDate(v) { if (!v) return "--"; return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(`${v}T00:00:00`)); }
function formatShortDate(v) { return new Intl.DateTimeFormat("zh-CN", { year: "2-digit", month: "2-digit" }).format(new Date(`${v}T00:00:00`)); }
function formatDateTime(v) { return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(v)); }
function describeVix(v) { if (v >= 30) return "市场波动显著升温"; if (v >= 20) return "风险偏好偏谨慎"; return "波动率处于相对平稳区间"; }
function rangeLabel(range) { return { "1m": "近1月", "3m": "近3月", "6m": "近6月", "1y": "近1年", "2y": "近2年", "5y": "近5年", all: "全部" }[range]; }
function statusLabel(s) { return { updated: "已更新", fresh: "缓存有效", stale: "旧缓存", demo: "演示" }[s] || "未知"; }
