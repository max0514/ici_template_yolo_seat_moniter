# YOLO::DETECT — 圖書館座位即時偵測 + ROI + 歷史分析

完整的 YOLOv8 座位佔用監測系統，三個頁面組成完整工作流：

| 頁面 | 路徑 | 用途 |
|---|---|---|
| **DETECTOR** | `/` | 上傳/Webcam 即時偵測、座位狀態 dashboard |
| **ANNOTATOR** | `/annotator` | 多邊形畫座位 ROI、拖曳頂點微調 |
| **HISTORY** | `/history` | 時間序列分析、座位排名、CSV 匯出 |

針對你那份**圖書館人流數據採集許可申請**設計：研究用的時間序列資料會自動累積到 SQLite。

---

## ✨ 三大核心

### 1️⃣ 精準座位佔用（不是粗估）
```
coverage = area(person_bbox ∩ seat_polygon) / area(seat_polygon)
occupied = coverage ≥ threshold   (預設 0.15，標註器內可調)
```
比起 `chairs - persons` 粗估，這個方法對攝影機角度穩健、不會把走過的路人誤判成「在座位上」。

### 2️⃣ 多邊形標註器
鍵盤快捷：`CLICK` 新增頂點 · `ENTER`/`DBL` 閉合 · `ESC` 取消 · `SHIFT+DRAG` 拖曳頂點 · `DEL` 刪除選取座位

可在不同尺寸影像間自動縮放（在 1920×1080 標、用 1280×720 推論，polygon 自動 scale）。

### 3️⃣ 歷史時間序列
每次 `/api/detect`（只要有定義 ROI）會自動寫進 `data/history.db`：

- **OCCUPANCY TIMELINE**：占用率折線圖 + 人數疊圖
- **SEAT RANK**：哪些座位最熱門
- **HOURLY PATTERN**：24 小時聚合，看出尖峰時段
- **CSV 匯出**：直接給統計分析用

---

## 📁 專案結構

```
yolo-webapp/
├── app.py                       # Flask + YOLO + ROI + SQLite
├── requirements.txt
├── data/                        # (自動建立)
│   ├── rois.json                # 座位定義
│   ├── reference.jpg            # 標註用參考影像
│   └── history.db               # SQLite 歷史庫
├── templates/
│   ├── index.html               # 偵測主頁
│   ├── annotator.html           # 座位標註器
│   └── history.html             # 歷史分析
├── static/
│   ├── style.css                # 共用樣式
│   ├── script.js                # 偵測頁
│   ├── annotator.js             # 標註器
│   └── history.js               # 歷史頁（Chart.js）
```

---

## 🚀 啟動

```bash
cd yolo-webapp
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python app.py
```

首次啟動：
- ultralytics 會自動下載 `yolov8n.pt`（≈6MB）
- SQLite + Chart.js（CDN）皆零額外依賴

開啟 <http://127.0.0.1:5001/>

---

## 🎯 圖書館研究典型工作流

```
[一次性] /annotator → 上傳參考照 → 畫所有座位多邊形 → SAVE
                              ↓
[常態運作] /             → 偵測器 LIVE 模式對接攝影機 (或 ESP32-CAM 持續送圖)
                              ↓
                       每筆推論結果自動寫入 history.db
                              ↓
[資料分析] /history       → 看趨勢、出 CSV、跑統計
```

---

## 🔌 REST API

### `POST /api/detect`
回應包含 `seats.status` 陣列（每個座位的 `occupied`、`coverage`、`person_confidence`）。
可加 `?nolog=1` 跳過歷史記錄。

### History API

| 方法 | 路徑 | 用途 |
|---|---|---|
| GET | `/api/history/summary?start=&end=` | KPI 統計（samples、avg/max rate、peak time） |
| GET | `/api/history/timeseries?start=&end=&bucket_min=` | 時間序列桶聚合 |
| GET | `/api/history/by-seat?start=&end=` | 每座位占用率排名 |
| GET | `/api/history/hourly?start=&end=` | 24 小時聚合模式 |
| GET | `/api/history/recent?limit=20` | 最近 N 筆原始紀錄 |
| GET | `/api/history/csv?start=&end=` | CSV 下載 |
| DELETE | `/api/history?before=<iso>` | 刪除指定時間前的紀錄（不帶 before 則全清） |

`start` / `end` 用 ISO 8601 本地時間（如 `2026-05-26T00:00:00`）。
省略時預設過去 24 小時。

`bucket_min` 預設自動：
- < 2h → 1 min
- < 24h → 5 min
- < 7d → 30 min
- ≥ 7d → 60 min

範例：
```bash
# 抓昨天到今天的時間序列（每 15 分鐘一桶）
curl "http://localhost:5001/api/history/timeseries?start=2026-05-25T00:00:00&end=2026-05-26T00:00:00&bucket_min=15"

# 匯出 7 天 CSV
curl -o week.csv "http://localhost:5001/api/history/csv?start=2026-05-19T00:00:00&end=2026-05-26T00:00:00"
```

---

## 📊 CSV 欄位

匯出的 CSV 包含每筆推論的 row-level 資料：

| 欄位 | 說明 |
|---|---|
| ts | ISO 8601 本地時間 |
| model | nano / small / medium / large |
| persons | 該時刻偵測到的人數 |
| total_seats | 已定義的座位總數 |
| occupied | 該時刻被佔用的座位數 |
| vacant | 空位數 |
| occupancy_rate | 0.0 ~ 1.0 |
| result_id | 對應 `results/{id}.jpg` 標註影像 |

要拿到 seat-level 細節，目前需直接查 SQLite：
```python
import sqlite3
conn = sqlite3.connect("data/history.db")
rows = conn.execute("""
  SELECT ts, seat_id, occupied, coverage
  FROM seat_events
  WHERE ts BETWEEN ? AND ?
""", (start, end)).fetchall()
```

---

## ⚙️ 進階

### 控制歷史記錄
- 預設：只在有 ROI 定義時才寫，沒 ROI 不會留垃圾資料
- 跳過：呼叫 `/api/detect?nolog=1`
- 清理：history 頁面右上 `CLEAR <7D` 按鈕，或 `DELETE /api/history?before=...`

### LIVE 模式累積太快？
LIVE webcam 預設每 1.5 秒推論一次，一小時會累積 ~2400 筆。可以：
1. 在 `static/script.js` 改 `setInterval(tick, 1500)` 拉長間隔
2. 或在偵測時加 `?nolog=1`，只記錄手動點 RUN 的批次

### 跨日資料
SQL 用本地時間（`strftime`），跨時區搬移 db 會錯位。單一場域部署不會有問題。

### ESP32-CAM 整合
ESP32-CAM 持續送圖到 `/api/detect`，後端會自動：
1. YOLO 推論
2. 比對 ROI 算佔用
3. 寫進 history.db
4. 回傳 seat status

→ 你完全不需要在 ESP32 端做任何狀態管理，只要把圖送過來。

---

## 🧱 技術棧

- **後端**：Flask 3 · Ultralytics YOLOv8 · OpenCV · NumPy · Pillow · SQLite (stdlib)
- **前端**：純 HTML/Canvas/CSS/JS · Chart.js 4 (CDN) · IBM Plex Mono + Space Grotesk
- **設計**：終端機 / CV 監控室 / phosphor green

## 📜 版本歷程

- **v1**：基礎 YOLOv8 偵測 + Webcam LIVE + 粗估空位
- **v2**：座位多邊形 ROI 標註器 + 精準佔用判定 + Dashboard
- **v3**：SQLite 自動歷史記錄 + 時間序列分析頁 + CSV 匯出

授權：MIT
