# Ocean Breathing Mission | 海洋呼吸任務

An HTML5 2D educational game about marine ecological survey and dissolved-oxygen
(DO) monitoring, built with **Phaser 4 + TypeScript + Vite**.

一款關於海洋生態調查與溶氧（DO）監測的 HTML5 2D 教育遊戲，採用
**Phaser 4 + TypeScript + Vite** 建置。

> This repository contains a playable two-chapter educational prototype:
> historical-photo comparison, diver fieldwork, food-chain and fish-breathing
> lessons, dissolved-oxygen sensing, monitoring deployment and a final quiz.
>
> 本倉庫包含可遊玩的兩章教育原型：歷史照片比較、潛水調查、食物鏈與魚類呼吸教學、
> 溶解氧感測、監測部署，以及最終測驗。

## Requirements | 環境需求

- Node.js 18+ and npm
- A modern browser (desktop, laptop or tablet)

## Getting started | 快速開始

```bash
npm install     # Install dependencies | 安裝相依套件
npm run dev     # Start the dev server | 啟動開發伺服器
```

Then open the URL printed by Vite (default `http://localhost:5173`).
接著開啟 Vite 顯示的網址（預設 `http://localhost:5173`）。

### Browser-compatible opening videos | 瀏覽器片頭轉碼

The supplied masters are HEVC/H.265 MP4 files. Most web builds need H.264 video
with AAC audio. After installing FFmpeg, run:

```powershell
powershell -ExecutionPolicy Bypass -File tools/convert-opening-videos.ps1
```

The helper keeps the HEVC masters and writes separate `*.web.mp4` delivery
files. If they are absent or fail to load, the game automatically uses the
static interactive opening, then continues to the photo archive and tutorial.

原始 MP4 內部是 HEVC/H.265；網頁版需要 H.264 畫面與 AAC 聲音。上述指令會保留
原檔，另外產生 `*.web.mp4`。若轉碼檔不存在或載入失敗，遊戲會自動改用靜態互動
開場，再依序進入歷史照片與新手教學。

## Open local host | 開啟本機伺服器

如果你已經安裝過依賴，只需要輸入：

```bash
npm run dev
```

如果是第一次打開這個專案，請先執行：

```bash
npm install
npm run dev
```

終端機會顯示本機網址，通常是 `http://localhost:5173`。
如果 5173 被占用，Vite 會改用其他可用埠號。

## GitHub Pages demo | 線上試玩版

Pushes to `main` run the type check, lint, tests and production build before
publishing `dist/` through GitHub Pages. In the repository, choose **Settings →
Pages → Source: GitHub Actions** once; later pushes deploy automatically.

推送到 `main` 後，GitHub 會先執行型別、程式碼、測試與正式建置檢查，再把
`dist/` 發布到 GitHub Pages。第一次只需在倉庫選擇 **Settings → Pages →
Source: GitHub Actions**；之後更新會自動上線。

## Scripts | 指令

| Command                | Description                   | 說明                 |
| ---------------------- | ----------------------------- | -------------------- |
| `npm run dev`        | Start Vite dev server         | 啟動開發伺服器       |
| `npm run build`      | Type-check + production build | 型別檢查並打包正式版 |
| `npm run preview`    | Preview the production build  | 預覽正式版           |
| `npm run typecheck`  | Strict TypeScript check       | 嚴格型別檢查         |
| `npm run test`       | Run unit tests once           | 執行單元測試         |
| `npm run test:watch` | Run tests in watch mode       | 監看模式執行測試     |
| `npm run lint`       | Lint the codebase             | 程式碼檢查           |
| `npm run format`     | Format with Prettier          | 以 Prettier 格式化   |

## Debug mode | 除錯模式

Append `?debug=1` to the URL (e.g. `http://localhost:5173/?debug=1`). In the
Dive scene this shows an FPS readout and lets you cycle oxygen scenarios with the
`O` key.

在網址加上 `?debug=1`（例如 `http://localhost:5173/?debug=1`）。在潛水場景中會顯示
FPS，並可用 `O` 鍵切換溶氧情境。

## Controls | 操作

- **Keyboard | 鍵盤**: WASD or arrow keys to move, E for the fixed-station
  viewfinder, and Space to photograph organisms or return with complete evidence.
- **Mouse | 滑鼠**: click UI buttons.
- **Touch | 觸控**: drag to move (virtual joystick), tap UI buttons.

## Project structure | 專案結構

See [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md) for the architecture overview and
[docs/DATA_DICTIONARY.md](docs/DATA_DICTIONARY.md) for the data schemas.

架構總覽見 [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md)，資料結構見
[docs/DATA_DICTIONARY.md](docs/DATA_DICTIONARY.md)。

```
src/
  config/       Game config + constants (responsive 16:9)
  scenes/       Boot / Preload / Menu / Dive orchestration
  entities/     Diver, survey subjects, camera stations and map view
  systems/      Gameplay systems (oxygen and future monitoring systems)
  simulation/   Scientific models (OxygenModel)
  state/        Central GameState
  services/     DataLoader, SaveService
  events/       Typed EventBus
  input/        Keyboard + touch input adapters
  ui/           HUD, overlays and layout helpers
  i18n/         Bilingual strings (en / zh-Hant)
  debug/        Debug overlay (FPS + scenario switch)
  data/         JSON data (species, locations, missions, equipment, sensors, oxygen)
  types/        TypeScript interfaces
  validation/   Runtime JSON validation
tests/          Unit tests (Vitest)
docs/           Design & science documentation
```

## Documentation | 文件

- [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md) — architecture & gameplay design
- [docs/SCIENCE_RULES.md](docs/SCIENCE_RULES.md) — scientific accuracy rules
- [docs/DATA_DICTIONARY.md](docs/DATA_DICTIONARY.md) — data schemas
- [docs/MVP_CHECKLIST.md](docs/MVP_CHECKLIST.md) — milestone checklist
- [docs/TODO.md](docs/TODO.md) — current todo list
- [docs/EXPERIMENT_LOG.md](docs/EXPERIMENT_LOG.md) — current experiment log

## Notes | 備註

- No external CDN dependencies; Phaser is bundled from npm.
- Scientific data is never hard-coded inside scenes — it lives in `src/data/`.
- All in-game locations are fictional composites (see SCIENCE_RULES.md).
