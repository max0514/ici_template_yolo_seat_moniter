/* =========================================================
   YOLO::ANNOTATE — polygon seat annotator
   ========================================================= */

const $ = (id) => document.getElementById(id);

// ----- canvas & state -----
const canvas = $("canvas");
const ctx = canvas.getContext("2d");
const wrap = $("canvas-wrap");
const empty = $("empty-hint");
const drawStatusEl = $("draw-status");

const state = {
  image: null,            // HTMLImageElement
  natW: 0, natH: 0,       // 原始尺寸
  dispW: 0, dispH: 0,     // 顯示尺寸
  scale: 1,               // 顯示 / 原始
  seats: [],              // [{id, label, polygon:[[x,y],...]}]
  drawing: null,          // {points:[[x,y]...], mouseX, mouseY} 或 null
  selected: null,         // 選取的 seat id
  dragging: null,         // {seatId, vertexIdx} 或 null
  unsaved: false,
  threshold: 0.15,
};

// ---------- 狀態顯示 ----------
function setStatus(text, kind = "ok") {
  $("status-text").textContent = text;
  const dot = $("status-dot");
  dot.classList.remove("busy", "error");
  if (kind === "busy") dot.classList.add("busy");
  if (kind === "error") dot.classList.add("error");
}

function setUnsaved(v) {
  state.unsaved = v;
  const el = $("save-status");
  if (v) { el.textContent = "● 有未儲存變更"; el.style.color = "var(--accent-2)"; }
  else   { el.textContent = "✓ 已儲存到伺服器"; el.style.color = "var(--accent)"; }
}

function updateDrawStatus() {
  if (state.drawing) {
    const n = state.drawing.points.length;
    drawStatusEl.textContent = `DRAWING · ${n} 點 · ${n >= 3 ? "Enter/雙擊結束" : "至少需 3 點"}`;
    drawStatusEl.style.display = "block";
  } else if (state.dragging) {
    drawStatusEl.textContent = "DRAGGING · 鬆開以放下頂點";
    drawStatusEl.style.display = "block";
  } else {
    drawStatusEl.style.display = "none";
  }
}

// ---------- 載入參考影像 ----------
async function loadReference(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      state.image = img;
      state.natW = img.naturalWidth;
      state.natH = img.naturalHeight;
      fitCanvas();
      empty.style.display = "none";
      $("ref-info").textContent = `${state.natW}×${state.natH} · ${(url.length/1024).toFixed(1)}KB (data url)`;
      $("canvas-meta").textContent = `${state.natW}×${state.natH}`;
      resolve();
    };
    img.onerror = reject;
    img.src = url;
  });
}

function fitCanvas() {
  if (!state.image) return;
  const rect = wrap.getBoundingClientRect();
  const padding = 20;
  const availW = rect.width - padding * 2;
  const availH = rect.height - padding * 2;
  const scaleW = availW / state.natW;
  const scaleH = availH / state.natH;
  state.scale = Math.min(scaleW, scaleH, 1.5);
  state.dispW = Math.round(state.natW * state.scale);
  state.dispH = Math.round(state.natH * state.scale);

  // device pixel ratio for sharpness
  const dpr = window.devicePixelRatio || 1;
  canvas.width = state.dispW * dpr;
  canvas.height = state.dispH * dpr;
  canvas.style.width = state.dispW + "px";
  canvas.style.height = state.dispH + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  redraw();
}

window.addEventListener("resize", fitCanvas);

// ---------- 座位 ID 自動分配 ----------
function nextSeatId() {
  let n = 1;
  const used = new Set(state.seats.map(s => s.id));
  while (used.has(`S${n}`)) n++;
  return `S${n}`;
}

// ---------- 繪製 ----------
function redraw() {
  if (!state.image) return;
  ctx.clearRect(0, 0, state.dispW, state.dispH);
  ctx.drawImage(state.image, 0, 0, state.dispW, state.dispH);

  // 已存座位
  for (const seat of state.seats) {
    const isSel = seat.id === state.selected;
    drawSavedPolygon(seat, isSel);
  }

  // 繪製中的多邊形
  if (state.drawing) {
    drawInProgress(state.drawing);
  }
}

function toDisp(p) { return [p[0] * state.scale, p[1] * state.scale]; }

function drawSavedPolygon(seat, selected) {
  const pts = seat.polygon.map(toDisp);
  if (pts.length < 2) return;

  ctx.save();
  // 填色
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  ctx.fillStyle = selected ? "rgba(255, 181, 71, 0.20)" : "rgba(92, 255, 159, 0.18)";
  ctx.fill();

  // 描邊
  ctx.strokeStyle = selected ? "#ffb547" : "#5cff9f";
  ctx.lineWidth = selected ? 2.5 : 1.8;
  ctx.stroke();

  // 頂點
  for (const [x, y] of pts) {
    ctx.beginPath();
    ctx.arc(x, y, selected ? 5 : 3.5, 0, Math.PI * 2);
    ctx.fillStyle = selected ? "#ffb547" : "#5cff9f";
    ctx.fill();
    ctx.strokeStyle = "#0a0e0c";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // 標籤
  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  const text = seat.label || seat.id;
  ctx.font = "600 11px 'IBM Plex Mono', monospace";
  const tw = ctx.measureText(text).width;
  ctx.fillStyle = selected ? "#ffb547" : "#5cff9f";
  ctx.fillRect(cx - tw/2 - 5, cy - 9, tw + 10, 18);
  ctx.fillStyle = "#0a0e0c";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, cx, cy);

  ctx.restore();
}

function drawInProgress(d) {
  const pts = d.points.map(toDisp);
  ctx.save();

  // 虛線連到滑鼠位置
  if (pts.length > 0) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.lineTo(d.mouseX, d.mouseY);

    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = "#ffb547";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // 頂點
  for (let i = 0; i < pts.length; i++) {
    const [x, y] = pts[i];
    ctx.beginPath();
    ctx.arc(x, y, i === 0 ? 6 : 4, 0, Math.PI * 2);
    ctx.fillStyle = i === 0 ? "#ff5c7a" : "#ffb547";
    ctx.fill();
    ctx.strokeStyle = "#0a0e0c";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // 起點高亮（提示可閉合）
  if (pts.length >= 3) {
    const [x, y] = pts[0];
    ctx.beginPath();
    ctx.arc(x, y, 12, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255, 92, 122, 0.8)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  ctx.restore();
}

// ---------- 滑鼠事件 ----------
function canvasToNat(e) {
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) / state.scale;
  const y = (e.clientY - rect.top) / state.scale;
  return [Math.max(0, Math.min(state.natW, x)), Math.max(0, Math.min(state.natH, y))];
}

function canvasToDisp(e) {
  const rect = canvas.getBoundingClientRect();
  return [e.clientX - rect.left, e.clientY - rect.top];
}

function findVertexNear(dispX, dispY, radius = 10) {
  for (const seat of state.seats) {
    for (let i = 0; i < seat.polygon.length; i++) {
      const [vx, vy] = toDisp(seat.polygon[i]);
      const dx = vx - dispX, dy = vy - dispY;
      if (dx*dx + dy*dy <= radius*radius) return { seat, idx: i };
    }
  }
  return null;
}

function findSeatAt(natX, natY) {
  // 點是否在 polygon 內（ray casting）
  for (let i = state.seats.length - 1; i >= 0; i--) {
    const s = state.seats[i];
    if (pointInPolygon(natX, natY, s.polygon)) return s;
  }
  return null;
}

function pointInPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1];
    const xj = poly[j][0], yj = poly[j][1];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi + 1e-9) + xi)) inside = !inside;
  }
  return inside;
}

canvas.addEventListener("mousedown", (e) => {
  if (!state.image) return;
  const [dx, dy] = canvasToDisp(e);
  const [nx, ny] = canvasToNat(e);

  // SHIFT + 點擊已存頂點 → 拖曳
  if (e.shiftKey) {
    const hit = findVertexNear(dx, dy);
    if (hit) {
      state.dragging = { seatId: hit.seat.id, vertexIdx: hit.idx };
      state.selected = hit.seat.id;
      renderSeatList();
      updateDrawStatus();
      redraw();
      return;
    }
  }

  // 沒在繪製：判斷是否點到已存座位來選取
  if (!state.drawing) {
    const seat = findSeatAt(nx, ny);
    if (seat) {
      state.selected = seat.id;
      renderSeatList();
      redraw();
      return;
    }
    // 否則開始畫新多邊形
    state.drawing = { points: [[nx, ny]], mouseX: dx, mouseY: dy };
    state.selected = null;
    renderSeatList();
  } else {
    // 已在繪製：判斷是否點到起點來閉合
    const [sx, sy] = toDisp(state.drawing.points[0]);
    const ddx = sx - dx, ddy = sy - dy;
    if (state.drawing.points.length >= 3 && (ddx*ddx + ddy*ddy) <= 12*12) {
      closeCurrentPolygon();
      return;
    }
    state.drawing.points.push([nx, ny]);
  }
  updateDrawStatus();
  redraw();
});

canvas.addEventListener("mousemove", (e) => {
  if (!state.image) return;
  const [dx, dy] = canvasToDisp(e);

  if (state.dragging) {
    const [nx, ny] = canvasToNat(e);
    const seat = state.seats.find(s => s.id === state.dragging.seatId);
    if (seat) {
      seat.polygon[state.dragging.vertexIdx] = [nx, ny];
      setUnsaved(true);
      redraw();
    }
    return;
  }

  if (state.drawing) {
    state.drawing.mouseX = dx;
    state.drawing.mouseY = dy;
    redraw();
  } else {
    // hover cursor 提示
    const hit = e.shiftKey ? findVertexNear(dx, dy) : null;
    canvas.style.cursor = hit ? "grab" : "crosshair";
  }
});

canvas.addEventListener("mouseup", () => {
  if (state.dragging) {
    state.dragging = null;
    updateDrawStatus();
  }
});

canvas.addEventListener("dblclick", (e) => {
  e.preventDefault();
  if (state.drawing && state.drawing.points.length >= 3) {
    closeCurrentPolygon();
  }
});

// ---------- 鍵盤 ----------
document.addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT") return;

  if (e.key === "Enter") {
    if (state.drawing && state.drawing.points.length >= 3) {
      closeCurrentPolygon();
      e.preventDefault();
    }
  } else if (e.key === "Escape") {
    if (state.drawing) {
      state.drawing = null;
      updateDrawStatus();
      redraw();
    }
  } else if (e.key === "Delete" || e.key === "Backspace") {
    if (state.selected) {
      deleteSeat(state.selected);
      e.preventDefault();
    }
  }
});

function closeCurrentPolygon() {
  if (!state.drawing || state.drawing.points.length < 3) return;
  const id = nextSeatId();
  const label = prompt(`座位標籤（預設 ${id}）：`, id);
  const seat = {
    id,
    label: (label && label.trim()) || id,
    polygon: state.drawing.points.slice(),
  };
  state.seats.push(seat);
  state.drawing = null;
  state.selected = seat.id;
  setUnsaved(true);
  renderSeatList();
  updateDrawStatus();
  redraw();
}

function deleteSeat(id) {
  state.seats = state.seats.filter(s => s.id !== id);
  if (state.selected === id) state.selected = null;
  setUnsaved(true);
  renderSeatList();
  redraw();
}

// ---------- 座位清單 UI ----------
function renderSeatList() {
  $("seats-count").textContent = state.seats.length;
  const list = $("seat-list");
  if (state.seats.length === 0) {
    list.innerHTML = '<div class="placeholder">— 尚未標註任何座位 —</div>';
    return;
  }
  list.innerHTML = state.seats.map(s => `
    <div class="seat-list-row ${s.id === state.selected ? 'selected' : ''}" data-id="${s.id}">
      <span class="slr-id">${s.id}</span>
      <input class="slr-label" data-id="${s.id}" value="${escapeHtml(s.label)}" maxlength="24">
      <button class="slr-del" data-id="${s.id}" title="刪除">✕</button>
    </div>
  `).join("");

  list.querySelectorAll(".seat-list-row").forEach(row => {
    row.addEventListener("click", (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "BUTTON") return;
      state.selected = row.dataset.id;
      renderSeatList();
      redraw();
    });
  });
  list.querySelectorAll(".slr-label").forEach(inp => {
    inp.addEventListener("change", () => {
      const seat = state.seats.find(s => s.id === inp.dataset.id);
      if (seat) {
        seat.label = inp.value.trim() || seat.id;
        setUnsaved(true);
        redraw();
      }
    });
  });
  list.querySelectorAll(".slr-del").forEach(btn => {
    btn.addEventListener("click", () => deleteSeat(btn.dataset.id));
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}

// ---------- 上傳參考影像 ----------
$("ref-input").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  setStatus("UPLOADING", "busy");
  const form = new FormData();
  form.append("file", file);
  try {
    const res = await fetch("/api/reference", { method: "POST", body: form });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "上傳失敗");
    // 把檔案內容也直接讀進來（避免再從 /api/reference fetch 一次）
    const reader = new FileReader();
    reader.onload = async (ev) => {
      await loadReference(ev.target.result);
      setStatus("READY");
    };
    reader.readAsDataURL(file);
  } catch (err) {
    setStatus("ERROR", "error");
    alert("上傳失敗：" + err.message);
  }
});

// ---------- 儲存 ----------
$("btn-save").addEventListener("click", async () => {
  if (!state.image) {
    alert("請先上傳參考影像");
    return;
  }
  if (state.seats.length === 0 && !confirm("沒有任何座位，要清空伺服器上的 ROI 嗎？")) return;

  setStatus("SAVING", "busy");
  try {
    const res = await fetch("/api/rois", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image_size: { w: state.natW, h: state.natH },
        seats: state.seats,
        occupancy_threshold: state.threshold,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "儲存失敗");
    setStatus("READY");
    setUnsaved(false);
  } catch (err) {
    setStatus("ERROR", "error");
    alert("儲存失敗：" + err.message);
  }
});

// ---------- 清空 ----------
$("btn-clear").addEventListener("click", () => {
  if (state.seats.length === 0) return;
  if (!confirm(`確定要清除全部 ${state.seats.length} 個座位嗎？`)) return;
  state.seats = [];
  state.selected = null;
  setUnsaved(true);
  renderSeatList();
  redraw();
});

// ---------- threshold slider ----------
$("thr-slider").addEventListener("input", (e) => {
  state.threshold = parseFloat(e.target.value);
  $("thr-val").textContent = state.threshold.toFixed(2);
  setUnsaved(true);
});

// ---------- 啟動：載入既有 ROI ----------
async function init() {
  // 嘗試載入既有參考影像 + ROIs
  try {
    const refRes = await fetch("/api/reference");
    if (refRes.ok) {
      const blob = await refRes.blob();
      const url = URL.createObjectURL(blob);
      await loadReference(url);
    }
  } catch {}

  try {
    const roisRes = await fetch("/api/rois");
    const rois = await roisRes.json();
    if (rois.seats && rois.seats.length > 0) {
      state.seats = rois.seats;
      state.threshold = rois.occupancy_threshold ?? 0.15;
      $("thr-slider").value = state.threshold;
      $("thr-val").textContent = state.threshold.toFixed(2);
      renderSeatList();
      redraw();
      setUnsaved(false);
    }
  } catch {}

  // 防止頁面離開時遺失
  window.addEventListener("beforeunload", (e) => {
    if (state.unsaved) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
}

init();
