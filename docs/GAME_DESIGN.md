# Game Design | 遊戲設計

This document summarises the architecture and design intent for the initial
milestone. Gameplay content is derived from the project proposal; this file does
**not** invent new mechanics beyond that specification.

本文件總結初始里程碑的架構與設計意圖。遊戲內容源自專案提案；本文件**不會**在規格之外
新增任何機制。

## 1. High-level concept | 核心概念

Two core loops (implemented in later milestones):

- **Loop A — Dive survey (Chapter 1)**: control a diver, choose equipment,
  locate historical camera stations, photograph/scan organisms, manage oxygen,
  return to the vessel, compare past vs. present evidence.
- **Loop B — Monitoring design (Chapter 2)**: under a fixed budget, buy
  monitoring devices, deploy them by location and depth, replay time, find
  missed events and redesign.

兩個核心循環（於後續里程碑實作）：

- **循環 A — 潛水調查（第一章）**：控制潛水員、選擇裝備、定位歷史相機站、拍照／掃描生物、
  管理氧氣、返回船隻、比對新舊證據。
- **循環 B — 監測設計（第二章）**：在固定預算下採購監測設備、依地點與深度部署、時間回放、
  找出漏測事件並重新設計。

## 2. Architecture principles | 架構原則

1. **Scenes orchestrate; they do not contain full game logic.**
   場景只負責編排，不包含完整遊戲邏輯。
2. **Scientific data is never hard-coded in scenes.** It lives in `src/data/*.json`,
   is validated at runtime, and is read via the `DataLoader` service.
   科學數據絕不寫死在場景，統一放於 `src/data/*.json`，於執行期驗證，經 `DataLoader` 讀取。
3. **Central state** (`GameState`) holds cross-scene progress.
   中央狀態（`GameState`）保存跨場景進度。
4. **EventBus** decouples gameplay systems from UI.
   `EventBus` 讓 gameplay 系統與 UI 解耦。
5. **Input adapters** isolate device specifics (keyboard/touch) behind a common
   `InputState`.
   輸入轉接器將裝置細節（鍵盤／觸控）隱藏在統一的 `InputState` 之後。
6. **Strict TypeScript** and modular files; no single mega-file.
   嚴格 TypeScript 與模組化檔案；不使用單一巨型檔案。

## 3. Module map | 模組對照

| Layer | Folder | Responsibility |
| --- | --- | --- |
| Config | `src/config` | Responsive 16:9 config, constants |
| Scenes | `src/scenes` | Boot, Preload, Menu, Dive (orchestration) |
| Entities | `src/entities` | Diver, fish, devices (later) |
| Systems | `src/systems` | Gameplay systems (later) |
| Simulation | `src/simulation` | `OxygenModel` and future science models |
| State | `src/state` | `GameState` |
| Services | `src/services` | `DataLoader`, `SaveService` |
| Events | `src/events` | Typed `EventBus` |
| Input | `src/input` | `InputManager` + keyboard/touch adapters |
| UI | `src/ui` | HUD/widgets (later) |
| i18n | `src/i18n` | Bilingual strings |
| Debug | `src/debug` | FPS + scenario switch |
| Data | `src/data` | JSON content |
| Types | `src/types` | Interfaces |
| Validation | `src/validation` | Runtime guards |

## 4. Scene flow | 場景流程

```mermaid
flowchart LR
  Boot[BootScene] --> Preload[PreloadScene]
  Preload -->|data validated| Menu[MenuScene]
  Menu -->|start| Dive[DiveScene (Chapter 1 vertical slice)]
  Dive -->|ESC| Menu
```

- **BootScene**: restore save, hand off to Preload.
- **PreloadScene**: load + validate all JSON with a progress bar, inject into
  `GameState`, then go to Menu.
- **MenuScene**: bilingual title, language toggle, start button.
- **DiveScene**: Chapter 1 vertical slice with briefing, diver movement,
  station navigation, original survey subjects, non-destructive recording,
  diver-worn automatic survey-unit context logging, required photography, safe
  return and evidence report. Chapter 2 remains outside the current playable
  slice.

## 5. Rendering & responsiveness | 繪製與響應式

- Fixed logical resolution 1280×720 (16:9).
- `Phaser.Scale.FIT` + `CENTER_BOTH` keeps aspect ratio on any screen.
- Up to 3 active pointers for multi-touch; mouse + touch both enabled.

## 6. Out of scope for this milestone | 本里程碑範圍外

Fish AI, Chapter 2 deployment/replay gameplay, final artwork, and any
additional mechanics not in the proposal.

魚群 AI、拍照、部署玩法、最終美術，以及提案未涵蓋的任何額外機制。
