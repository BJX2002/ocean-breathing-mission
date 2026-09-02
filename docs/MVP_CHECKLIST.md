# MVP Checklist | MVP 檢核表

Tracks the initial milestone and the current Chapter 1 vertical slice. Chapter
2 gameplay remains listed below but is not started.

追蹤初始里程碑。後續玩法里程碑已列出但尚未開始。

## Initial milestone (this delivery) | 初始里程碑（本次交付）

- [x] Complete folder structure | 完整資料夾結構
- [x] BootScene, PreloadScene, MenuScene and playable DiveScene | 四個場景
- [x] Loading progress bar | 載入進度條
- [x] Responsive 16:9 game configuration | 響應式 16:9 設定
- [x] Placeholder JSON files (species, locations, missions, equipment, sensors, oxygen) | 佔位 JSON
- [x] Matching TypeScript interfaces | 對應 TypeScript 介面
- [x] Runtime validation for loaded JSON | JSON 執行期驗證
- [x] Central GameState | 中央 GameState
- [x] EventBus (typed) | 型別化 EventBus
- [x] SaveService (localStorage) | 存檔服務
- [x] Keyboard + touch input adapters | 鍵盤與觸控輸入轉接器
- [x] Debug mode (switch oxygen scenarios + FPS) | 除錯模式
- [x] i18n scaffold (en / zh-Hant) | 雙語骨架
- [x] README, GAME_DESIGN, SCIENCE_RULES, DATA_DICTIONARY, MVP_CHECKLIST | 文件
- [x] Unit-test configuration (Vitest) | 單元測試設定
- [x] No external CDN dependencies | 無外部 CDN
- [x] Runs with `npm install` + `npm run dev` | 可用 npm 安裝並啟動

## Explicitly NOT in the current slice | 目前切片明確不做

- [ ] Fish AI | 魚群 AI
- [ ] Deployment/replay gameplay | 部署／回放玩法
- [ ] Final artwork | 最終美術
- [ ] Any mechanic not in the proposal | 提案外的任何機制

## Next milestone — Vertical slice | 下一里程碑——垂直切片

- [x] Diver entity + movement driven by `InputManager`
- [x] Oxygen consumption system (reads mission `oxygenBudget`) + HUD gauge
- [x] Runtime placeholder textures + data-driven dive map (coral / rock / seagrass / buoy / seabed)
- [x] Landmark navigation + historical camera stations (proximity discovery + HUD tracker)
- [x] Animated opening interface + chapter selector (Ch.1 playable, Ch.2 locked)
- [x] First-time tutorial overlay (persisted via SaveService)
- [x] In-dive help button to re-open tutorial at any time
- [x] Sprite-art loading pipeline scaffold (manifest-driven, graceful fallback to procedural textures)
- [x] Photography + species scan (non-destructive)
- [x] Return-to-vessel + evidence comparison screen
- [ ] Chapter 2: shop, fixed budget, drag deploy, 24h replay, missed-event analysis

## Acceptance criteria (from proposal) | 驗收標準（源自提案）

- [ ] **Playable**: goal is clear, players want to retry.
- [ ] **Understandable**: a non-player can explain the task in one minute.
- [ ] **Scientific**: no single-cause claims, false thresholds, real-site
      misrepresentation or exaggerated product claims.
- [ ] **Stable**: starts, runs, restarts reliably on target computers and iPads.
