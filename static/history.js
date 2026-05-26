/* =========================================================
   YOLO::HISTORY — time-series dashboard
   ========================================================= */

const $ = (id) => document.getElementById(id);

// ----- Chart.js 全域樣式（深色主題） -----
Chart.defaults.color = "#7a9388";
Chart.defaults.borderColor = "#243029";
Chart.defaults.font.family = "'IBM Plex Mono', monospace";
Chart.defaults.font.size = 10;

const ACCENT = "#5cff9f";
const ACCENT_GLOW = "rgba(92,255,159,.3)";
const AMBER = "#ffb547";
const PINK = "#ff5c7a";
const BG_DIM = "rgba(92,255,159,.08)";

// ----- 狀態 -----
const state = {
  start: null,   // Date
  end: null,
  charts: {},    // 圖表實例
};

// ----- clock -----
function tickClock() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  $("clock").textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
setInterval(tickClock, 1000);
tickClock();

function setStatus(text, kind = "ok") {
  $("status-text").textContent = text;
  const dot = $("status-dot");
  dot.classList.remove("busy", "error");
  if (kind === "busy") dot.classList.add("busy");
  if (kind === "error") dot.classList.add("error");
}

// ----- 日期範圍 presets -----
function applyPreset(preset) {
  const now = new Date();
  let start;
  if (preset === "all") {
    start = new Date("2020-01-01T00:00:00");
  } else {
    const m = preset.match(/^(\d+)([hd])$/);
    if (!m) return;
    const n = parseInt(m[1]);
    const ms = m[2] === "h" ? n * 3600 * 1000 : n * 86400 * 1000;
    start = new Date(now.getTime() - ms);
  }
  state.start = start;
  state.end = now;
  syncDateInputs();
  refreshAll();
}

function syncDateInputs() {
  const fmt = (d) => {
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  $("start-input").value = fmt(state.start);
  $("end-input").value = fmt(state.end);
}

document.querySelectorAll(".tb-btn[data-preset]").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tb-btn[data-preset]").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    applyPreset(btn.dataset.preset);
  });
});

$("btn-apply").addEventListener("click", () => {
  const s = $("start-input").value;
  const e = $("end-input").value;
  if (!s || !e) return;
  state.start = new Date(s);
  state.end = new Date(e);
  document.querySelectorAll(".tb-btn[data-preset]").forEach(b => b.classList.remove("active"));
  refreshAll();
});

$("btn-refresh").addEventListener("click", refreshAll);

// ----- API helpers -----
function isoLocal(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function rangeQuery() {
  return `?start=${encodeURIComponent(isoLocal(state.start))}&end=${encodeURIComponent(isoLocal(state.end))}`;
}

async function fetchJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} → ${r.status}`);
  return r.json();
}

// ----- 主要重新整理 -----
async function refreshAll() {
  setStatus("LOADING", "busy");
  try {
    const [summary, ts, bySeat, hourly, recent] = await Promise.all([
      fetchJSON("/api/history/summary" + rangeQuery()),
      fetchJSON("/api/history/timeseries" + rangeQuery()),
      fetchJSON("/api/history/by-seat" + rangeQuery()),
      fetchJSON("/api/history/hourly" + rangeQuery()),
      fetchJSON("/api/history/recent?limit=20"),
    ]);
    renderSummary(summary);
    renderTimeSeries(ts);
    renderBySeat(bySeat);
    renderHourly(hourly);
    renderRecent(recent);
    setStatus("READY");
  } catch (err) {
    console.error(err);
    setStatus("ERROR", "error");
  }
}

// ----- 渲染：KPI -----
function renderSummary(s) {
  $("kpi-samples").textContent = s.samples ?? 0;
  $("kpi-avg-rate").textContent = s.avg_rate !== null ? (s.avg_rate * 100).toFixed(1) + "%" : "—";
  $("kpi-max-rate").textContent = s.max_rate !== null ? (s.max_rate * 100).toFixed(1) + "%" : "—";
  if (s.peak) {
    const d = new Date(s.peak.ts);
    $("kpi-peak-time").textContent = formatShortTime(d);
  } else {
    $("kpi-peak-time").textContent = "—";
  }
  $("kpi-max-persons").textContent = s.max_persons ?? 0;
  if (s.latest) {
    $("kpi-latest").textContent = `${s.latest.occupied}/${s.latest.total_seats}`;
    $("kpi-latest-time").textContent = formatShortTime(new Date(s.latest.ts));
  } else {
    $("kpi-latest").textContent = "—";
    $("kpi-latest-time").textContent = "—";
  }
}

function formatShortTime(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getMonth()+1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ----- 渲染：時間序列 -----
function renderTimeSeries(ts) {
  $("ts-meta").textContent = `${ts.data.length} buckets · ${ts.bucket_min} min`;
  const empty = $("ts-empty");

  if (state.charts.ts) state.charts.ts.destroy();

  if (ts.data.length === 0) {
    empty.style.display = "flex";
    return;
  }
  empty.style.display = "none";

  const labels = ts.data.map(d => d.bucket);
  const rateData = ts.data.map(d => d.avg_rate * 100);
  const personData = ts.data.map(d => d.avg_persons);

  state.charts.ts = new Chart($("chart-timeseries"), {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "OCCUPANCY %",
          data: rateData,
          borderColor: ACCENT,
          backgroundColor: BG_DIM,
          fill: true,
          tension: 0.25,
          borderWidth: 2,
          pointRadius: ts.data.length > 60 ? 0 : 2,
          pointHoverRadius: 4,
          yAxisID: "y",
        },
        {
          label: "PERSONS",
          data: personData,
          borderColor: AMBER,
          backgroundColor: "transparent",
          fill: false,
          tension: 0.25,
          borderWidth: 1.5,
          pointRadius: 0,
          pointHoverRadius: 3,
          yAxisID: "y1",
          borderDash: [4, 3],
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      scales: {
        x: {
          ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 12,
                   callback: function(val, i) {
                     const s = this.getLabelForValue(val);
                     return s.slice(5, 16).replace("T", " ");
                   } },
          grid: { color: "#1d2622" },
        },
        y: {
          position: "left", min: 0, max: 100,
          title: { display: true, text: "OCC %", color: "#7a9388" },
          ticks: { callback: v => v + "%" },
          grid: { color: "#1d2622" },
        },
        y1: {
          position: "right",
          title: { display: true, text: "PERSONS", color: "#7a9388" },
          grid: { drawOnChartArea: false },
        },
      },
      plugins: {
        legend: { labels: { boxWidth: 14, font: { size: 10, weight: "600" } } },
        tooltip: {
          backgroundColor: "#0a0e0c",
          borderColor: ACCENT, borderWidth: 1,
          titleFont: { family: "'IBM Plex Mono', monospace" },
          callbacks: {
            label: (c) => c.dataset.label + ": " +
                          (c.dataset.yAxisID === "y" ? c.parsed.y.toFixed(1) + "%"
                                                     : c.parsed.y.toFixed(1)),
          },
        },
      },
    },
  });
}

// ----- 渲染：每座位排名 -----
function renderBySeat(d) {
  const empty = $("seat-empty");
  if (state.charts.bySeat) state.charts.bySeat.destroy();
  if (d.data.length === 0) { empty.style.display = "flex"; return; }
  empty.style.display = "none";

  const labels = d.data.map(s => s.seat_label);
  const rates = d.data.map(s => s.occ_rate * 100);
  const colors = rates.map(r => r > 60 ? PINK : (r > 30 ? AMBER : ACCENT));

  state.charts.bySeat = new Chart($("chart-by-seat"), {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "OCC %",
        data: rates,
        backgroundColor: colors,
        borderColor: colors,
        borderWidth: 1,
        borderRadius: 0,
      }],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { min: 0, max: 100,
             ticks: { callback: v => v + "%" },
             grid: { color: "#1d2622" } },
        y: { grid: { color: "#1d2622" } },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#0a0e0c",
          borderColor: ACCENT, borderWidth: 1,
          callbacks: {
            label: (c) => c.parsed.x.toFixed(1) + "%  (" +
                          d.data[c.dataIndex].samples + " samples)",
          },
        },
      },
    },
  });
}

// ----- 渲染：小時模式 -----
function renderHourly(d) {
  if (state.charts.hourly) state.charts.hourly.destroy();
  const labels = d.data.map(x => String(x.hour).padStart(2,"0") + ":00");
  const rates = d.data.map(x => x.avg_rate * 100);
  const samples = d.data.map(x => x.samples);
  const maxS = Math.max(1, ...samples);
  const alphas = samples.map(s => Math.max(0.2, s / maxS));

  state.charts.hourly = new Chart($("chart-hourly"), {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "AVG OCC %",
        data: rates,
        backgroundColor: alphas.map(a => `rgba(92,255,159,${0.25 + a*0.55})`),
        borderColor: ACCENT,
        borderWidth: 1,
        borderRadius: 0,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { grid: { color: "#1d2622" }, ticks: { font: { size: 9 } } },
        y: { min: 0, max: 100,
             ticks: { callback: v => v + "%" },
             grid: { color: "#1d2622" } },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#0a0e0c",
          borderColor: ACCENT, borderWidth: 1,
          callbacks: {
            label: (c) => c.parsed.y.toFixed(1) + "%  (" + samples[c.dataIndex] + " samples)",
          },
        },
      },
    },
  });
}

// ----- 渲染：最近紀錄 -----
function renderRecent(data) {
  $("recent-meta").textContent = `last ${data.data.length}`;
  const tbody = $("recent-tbody");
  if (data.data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="placeholder">— no data —</td></tr>';
    return;
  }
  tbody.innerHTML = data.data.map(r => `
    <tr>
      <td>${formatShortTime(new Date(r.ts))}</td>
      <td>${r.model || "—"}</td>
      <td>${r.persons ?? "—"}</td>
      <td>${r.total_seats ?? "—"}</td>
      <td class="num occ">${r.occupied ?? "—"}</td>
      <td class="num vac">${r.vacant ?? "—"}</td>
      <td class="num">${r.occ_rate !== null ? (r.occ_rate*100).toFixed(0)+"%" : "—"}</td>
      <td class="muted">${r.result_id || "—"}</td>
    </tr>
  `).join("");
}

// ----- CSV / 清除 -----
$("btn-csv").addEventListener("click", () => {
  window.location.href = "/api/history/csv" + rangeQuery();
});

$("btn-clear-old").addEventListener("click", async () => {
  if (!confirm("確定要刪除 7 天前的所有歷史紀錄？此動作無法復原。")) return;
  const cutoff = new Date(Date.now() - 7*86400*1000);
  setStatus("DELETING", "busy");
  try {
    const r = await fetch(`/api/history?before=${encodeURIComponent(isoLocal(cutoff))}`,
                          { method: "DELETE" });
    const data = await r.json();
    alert(`刪除完成：${data.detections_deleted} 筆推論 / ${data.seat_events_deleted} 筆座位事件`);
    refreshAll();
  } catch (err) {
    alert("失敗：" + err.message);
    setStatus("ERROR", "error");
  }
});

// ----- 初始 -----
applyPreset("24h");
