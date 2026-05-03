const state = {
  charts: [],
  chartConfig: null,
  activeChartId: "spx-vix",
  activeRange: "1y",
  seriesVisibility: {},
  payload: null,
  visibleData: []
};

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
  chartTitle: document.querySelector("#chartTitle"),
  chartKicker: document.querySelector("#chartKicker"),
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
  bindEvents();
  await loadCatalog();
  await loadActiveChart();
}

function bindEvents() {
  elements.refreshButton.addEventListener("click", () => loadActiveChart());
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

async function loadCatalog() {
  const response = await fetch("/api/charts");
  const payload = await response.json();
  state.charts = payload.charts;
  renderNav();
}

async function loadActiveChart() {
  setStatus("pending", "正在检查最新数据...");

  try {
    const response = await fetch(`/api/charts/${state.activeChartId}`);
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || "图表数据加载失败");
    }

    setChartConfig();

    if (payload.status === "coming-soon") {
      renderComingSoon(payload);
      return;
    }

    state.payload = payload;
    renderActiveChart();
    renderStatus(payload);
  } catch (error) {
    setStatus("error", error.message);
  }
}

function setChartConfig() {
  state.chartConfig = state.charts.find((c) => c.id === state.activeChartId) || null;

  if (state.chartConfig && state.chartConfig.series) {
    state.seriesVisibility = {};
    for (const s of state.chartConfig.series) {
      state.seriesVisibility[s.key] = true;
    }
  }
}

function renderNav() {
  elements.chartNav.innerHTML = "";

  for (const chart of state.charts) {
    const button = document.createElement("button");
    button.className = `nav-button${chart.id === state.activeChartId ? " active" : ""}`;
    button.type = "button";
    button.innerHTML = `
      <span class="nav-title">${chart.shortTitle}</span>
      <span class="nav-meta">${chart.comingSoon ? "待接入数据源" : "打开时自动更新"}</span>
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

  elements.pageTitle.textContent = chart.title;
  elements.sourceText.textContent = `数据来源：${sources.map((s) => s.name).join(" / ")}`;
  elements.latestDate.textContent = `最新日期：${formatDate(latestDate)}`;

  renderToggleBar();
  renderSummaryCards(state.visibleData, state.payload);
  drawChart();
}

function renderComingSoon(payload) {
  state.payload = null;
  state.visibleData = [];
  elements.pageTitle.textContent = payload.chart.title;
  elements.toolbar.innerHTML = "";
  elements.summaryGrid.innerHTML = `
    <article class="metric-card">
      <p class="metric-label">状态</p>
      <p class="metric-value">待接入</p>
      <p class="metric-note">${payload.message}</p>
    </article>
  `;
  clearCanvas();
  setStatus("pending", payload.message);
  elements.sourceText.textContent = "数据来源：待确认";
  elements.latestDate.textContent = "最新日期：--";
}

function renderSummaryCards(data, payload) {
  const first = data[0];
  const latest = data.at(-1);
  const id = state.activeChartId;
  const chartConfig = state.chartConfig;

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
        <p class="metric-value">${statusLabel(payload.cache.status)}</p>
        <p class="metric-note">${payload.syncedAt ? `同步：${formatDateTime(payload.syncedAt)}` : "等待真实数据源"}</p>
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
        <p class="metric-value">${statusLabel(payload.cache.status)}</p>
        <p class="metric-note">${payload.syncedAt ? `同步：${formatDateTime(payload.syncedAt)}` : "等待真实数据源"}</p>
      </article>
    `;
  }
}

function renderStatus(payload) {
  const { cache } = payload;

  if (cache.warning) {
    setStatus(cache.status === "demo" ? "pending" : "error", cache.warning);
    return;
  }

  const copy = cache.status === "updated" ? "已连接公开数据源并更新缓存" : "数据缓存仍在有效期内";
  setStatus("ok", `${copy}，最新日期 ${formatDate(payload.latestDate)}`);
}

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
    ? createScale(data.map((p) => p[leftSeries.key]), plot.y + plot.height, plot.y)
    : null;
  const rightScale = rightSeries
    ? createScale(data.map((p) => p[rightSeries.key]), plot.y + plot.height, plot.y)
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

  for (let index = 0; index <= 4; index += 1) {
    const y = plot.y + (plot.height / 4) * index;
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

  for (let index = 0; index <= 4; index += 1) {
    const ratio = index / 4;
    const y = plot.y + plot.height * ratio;

    if (leftScale) {
      const leftValue = leftScale.fromY(y);
      ctx.textAlign = "right";
      ctx.fillText(formatAxisNumber(leftValue), plot.x - 10, y);
    }

    if (rightScale) {
      const rightValue = rightScale.fromY(y);
      if (plot.width < 520) {
        ctx.textAlign = "right";
        ctx.fillText(formatAxisNumber(rightValue), plot.x + plot.width + 54, y);
      } else {
        ctx.textAlign = "left";
        ctx.fillText(formatAxisNumber(rightValue), plot.x + plot.width + 10, y);
      }
    }
  }

  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  const labelCount = Math.min(plot.width < 520 ? 3 : 5, data.length);

  for (let index = 0; index < labelCount; index += 1) {
    const dataIndex = Math.round((data.length - 1) * (index / Math.max(1, labelCount - 1)));
    const x = plot.x + (dataIndex / Math.max(1, data.length - 1)) * plot.width;
    ctx.textAlign = index === 0 ? "left" : index === labelCount - 1 ? "right" : "center";
    ctx.fillText(formatShortDate(data[dataIndex].date), x, plot.y + plot.height + 16);
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
    if (index === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });

  ctx.stroke();
  ctx.restore();
}

function handleChartHover(event) {
  const data = state.visibleData;
  const config = state.chartConfig;
  if (!data.length || !config) return;

  const rect = elements.canvas.getBoundingClientRect();
  const padding = { left: 58, right: 62 };
  const plotWidth = rect.width - padding.left - padding.right;
  const x = Math.min(Math.max(event.clientX - rect.left - padding.left, 0), plotWidth);
  const index = Math.round((x / Math.max(1, plotWidth)) * (data.length - 1));
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

function clearCanvas(width = elements.canvas.clientWidth, height = elements.canvas.clientHeight) {
  context.clearRect(0, 0, width, height);
}

function createScale(values, yBottom, yTop) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const padding = (max - min || 1) * 0.08;
  const low = min - padding;
  const high = max + padding;

  return {
    toY(value) {
      return yBottom - ((value - low) / (high - low)) * (yBottom - yTop);
    },
    fromY(y) {
      return low + ((yBottom - y) / (yBottom - yTop)) * (high - low);
    }
  };
}

function filterByRange(data, range) {
  if (range === "all") return data;

  const latest = new Date(`${data.at(-1).date}T00:00:00Z`);
  const start = new Date(latest);

  if (range.endsWith("m")) {
    start.setUTCMonth(latest.getUTCMonth() - Number(range.replace("m", "")));
  } else {
    start.setUTCFullYear(latest.getUTCFullYear() - Number(range.replace("y", "")));
  }

  return data.filter((point) => new Date(`${point.date}T00:00:00Z`) >= start);
}

function updateRangeButtons() {
  elements.rangeTabs.querySelectorAll("button[data-range]").forEach((button) => {
    button.classList.toggle("active", button.dataset.range === state.activeRange);
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
  elements.statusStrip.innerHTML = `
    <span class="status-dot ${dotClass}" aria-hidden="true"></span>
    <span>${message}</span>
  `;
}

function maxBy(data, key) {
  return data.reduce((winner, point) => (point[key] > winner[key] ? point : winner), data[0]);
}

function formatNumber(value) {
  return new Intl.NumberFormat("zh-CN", {
    maximumFractionDigits: value > 100 ? 0 : 2
  }).format(value);
}

function formatAxisNumber(value) {
  return new Intl.NumberFormat("zh-CN", {
    maximumFractionDigits: 0
  }).format(value);
}

function formatPercent(value) {
  const formatted = new Intl.NumberFormat("zh-CN", {
    maximumFractionDigits: 1,
    signDisplay: "always"
  }).format(value);
  return `${formatted}%`;
}

function formatDate(value) {
  if (!value) return "--";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(`${value}T00:00:00`));
}

function formatShortDate(value) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "2-digit",
    month: "2-digit"
  }).format(new Date(`${value}T00:00:00`));
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function describeVix(value) {
  if (value >= 30) return "市场波动显著升温";
  if (value >= 20) return "风险偏好偏谨慎";
  return "波动率处于相对平稳区间";
}

function rangeLabel(range) {
  return {
    "1m": "近1月",
    "3m": "近3月",
    "6m": "近6月",
    "1y": "近1年",
    "2y": "近2年",
    "5y": "近5年",
    all: "全部"
  }[range];
}

function statusLabel(status) {
  return {
    updated: "已更新",
    fresh: "缓存有效",
    stale: "旧缓存",
    demo: "演示"
  }[status] || "未知";
}
