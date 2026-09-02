# TODO List | 待辦清單

Current work items for Ocean Breathing Mission.

Ocean Breathing Mission 目前的待辦項目。

## Agreed Chapter 1 direction | 已確認的第一章方向

Confirmed 2026-08-11. The new Chapter 1 priority order is:

1. Replace the current briefing with the agreed opening flow: cinematic A → historical photo archive → cinematic B → tutorial → dive.
2. Establish the UI foundation: clearer hierarchy, typography, spacing, panels, buttons and photo-archive presentation.
3. Build the full evidence comparison: historical photo, current photo and DO/context side by side.
4. Integrate the new diver PNG frame animation and improve scene sharpness, depth and visual consistency.
5. Playtest the complete Chapter 1 loop at different screen sizes, then begin Chapter 2.

The opening flow should be skippable and replayable from the mission board. The
historical-photo archive is an interactive reading step, not just a decorative
cutscene.

Current visual decisions:

- Keep the existing fish assets for now; do not replace them during this gameplay pass.
- Defer the final ocean background / seabed environment and water-tank visual redesign until the UI and evidence flow are stable.
- Keep the current high-detail 2D cartoon direction for now rather than converting the whole game to strict pixel art.

## Ready now | 目前可做

- [x] Add chapter select and opening animation
- [x] Add first-run tutorial overlay
- [x] Add in-dive help button to reopen the tutorial
- [x] Add sprite-art loading pipeline scaffold with graceful fallback
- [x] Validate typecheck, tests, and production build
- [ ] Replace the current three-page briefing with the agreed opening sequence; see [CHAPTER1_OPENING_VIDEO_SCRIPT.md](./CHAPTER1_OPENING_VIDEO_SCRIPT.md)

## Next gameplay tasks | 下一步玩法任務

- [x] Photography and automatic survey-unit logging flow
- [x] Return-to-vessel basic evidence room with first food-web view
- [ ] Build the full historical/current/DO evidence comparison screen
- [ ] Chapter 2 shop, fixed budget, and drag-to-deploy flow
- [ ] 24-hour replay and missed-event analysis
- [x] More complete mission feedback after safe return

## 2026-08-26 beginner gameplay pass | 小學生新手體驗

- [x] Record the agreed Chapter 1 reasoning chain: historical fish groups → repeat-photo change → food chain / food web → fish breathing → DO → Chapter 2 monitoring.
- [x] Replace the current abrupt evidence-room transition with a two-question past/today observation comparison.
- [x] Let players complete one simple food chain before opening the full food-web puzzle.
- [x] Hide the term `DO` until the fish-breathing question formally introduces dissolved oxygen.
- [x] Label the diver HUD as tank oxygen so it cannot be confused with dissolved oxygen.
- [x] Cap completed HUD counters at their goals; never show confusing values such as `5 / 3`.
- [x] Add tap-card → tap-role-zone input to the food-web puzzle while retaining drag and drop.
- [x] Add a compact representative-fish archive card beside each investigated historical photo.
- [ ] Verify the complete Chapter 1 loop at a tablet-sized / iPad-like viewport.

## Asset replacement backlog | 素材替換待辦

- [ ] Generate two matched three-photo sets (historical / present day) using the same three viewpoints; the historical set must show clearly larger fish groups and the present-day set only scattered individuals.
- [ ] Replace the current symbolic past/today comparison cards with those six matched photos once approved.
- [ ] Replace every fish with a reviewed Hong Kong marine-fish asset; keep source URL, licence and attribution in an asset register.
- [ ] Prepare one large identification image for each highlighted archive fish plus transparent in-game cut-outs in one consistent art style.
- [ ] Replace provisional fish names only after species identification and educational copy are reviewed.
- [ ] Replace the Chapter 2 sensor placeholder when a clean product photo or approved reconstructed illustration becomes available.
- [ ] Repair / replace the scientist animation frames after a source image preserving the white lab coat and transparent background is available.
- [ ] Add a visible tablet virtual joystick plus separate interact and photograph buttons; the current prototype only provides an invisible drag-to-move touch adapter.

Reference starting points for later asset research:

- Hong Kong Biodiversity Information Hub — Fish: <https://bih.gov.hk/en/hong-kong-species/fish/index.html>
- AFCD Artificial Reef fish list: <https://www.afcd.gov.hk/english/fisheries/ar/files/ar_fish_list.pdf>
- AFCD Faunas of Artificial Reefs: <https://www.afcd.gov.hk/english/fisheries/ar/faunas_of_ar.html>
- Wikimedia Commons (check each file's licence and attribution individually): <https://commons.wikimedia.org/wiki/Category:Marine_fish>

## Visual / content tasks | 視覺與內容任務

- [ ] Add real hand-drawn sprite assets into the manifest
- [ ] Improve chapter artwork and scene transitions
- [ ] Expand map variants for more locations
- [ ] Add more tutorial tips for beginners
- [ ] Replace the current three-page briefing with cinematic A, an interactive historical-photo archive, cinematic B, and a focused new-player tutorial; keep skip and replay support.

## Chapter 1 UI foundation | 第一章 UI 基礎整理

- [ ] Define a consistent UI visual system: typography scale, panel shapes, button states, accent colors and spacing
- [ ] Redesign the historical-photo archive as a readable album / inspection interface
- [ ] Fix evidence-room spacing so the evidence list, food-web panel and conclusion do not compete for the same space
- [ ] Improve HUD clarity without adding more permanent controls to the top bar
- [ ] Add responsive layout checks for 16:9, large desktop and smaller tablet-sized views

## Chapter 1 ecology expansion | 第一章生態內容擴展

- [x] Record the agreed photography-first, automatic-detection and food-web direction in [CHAPTER1_PHOTO_FOOD_WEB_DESIGN.md](./CHAPTER1_PHOTO_FOOD_WEB_DESIGN.md)
- [x] Keep station and organism photographs as mandatory evidence while removing routine tool switching
- [x] Auto-record nearby DO, species identity, depth and survey context through the diver-worn survey unit
- [x] Connect food-web node status to detected and photographed evidence in the return evidence room
- [ ] Compare historical/reference and current photographs beside DO context
- [x] Add a first evidence-linked food-web view linking algae / seagrass, small fish, larger fish, and seabed organisms
- [x] Add clickable fish information bubbles with species, habitat role, depth zone, oxygen tolerance, and cautious survey status
- [ ] Add short background cards explaining why presence, absence, and distribution shifts are not the same as extinction
- [ ] Add feeding, fleeing, and resting behavior so organisms communicate ecological relationships through play

## Chapter 1 polish backlog | 第一章展示優化

- [ ] Add a compact field-notebook/photo-album feedback panel for the three repeat photographs
- [x] Redesign the mission progress HUD as a clear three-station checklist, showing which observation points are incomplete, nearby, or photographed instead of relying only on an abstract `0/3` counter. Initial visual QA at all three points is still pending.
- [x] Replace the small abstract procedural camera icon with a recognizable fixed survey-station marker. The current marker is a compact runtime camera-pole graphic; runtime visual QA at all three stations is still pending.
- [ ] Improve depth layering, foreground readability, and camera focus feedback without obscuring the scene
- [x] Add safe low-oxygen warning feedback before the return trigger
- [ ] Audit supplied image sheets and optimize oversized textures for faster loading
- [x] Connect the supplied diver sprite sheet into a continuous swim animation
- [x] Add gentle acceleration and deceleration to diver movement
- [x] Add two-stage viewfinder and shutter feedback for fixed-station photography
- [x] Make viewfinder aiming movable with WASD / arrow keys
- [x] Show multiple nearby species in each station preview composition
- [x] Add a first-discovery ecology observation card with a food-chain clue
- [x] Make the observation-card food-chain clue clickable by node
- [x] Add independent fish movement and reticle tracking inside the viewfinder
- [x] Track discovered species across the current dive and show progress
- [x] Re-open an observed species card by clicking its in-world label
- [x] Make viewfinder fish turn at boundaries instead of teleporting
- [x] Tighten framing quality and clamp the reticle to the preview area

## Chapter 1 current visual QA notes | 第一章目前畫面問題記錄

Observed 2026-08-06. These are notes only; no gameplay or visual behavior was changed in this pass.

- [x] Move the gold `Zzz / !` indicator closer to the fish head or upper side while keeping it outside the fish silhouette.
- [x] Prevent the floating species information card from covering fish, camera-station labels, habitat props, or other important scene information.
- [x] Add a safer placement priority for the floating card: first use clear space above the subject, then upper-left / upper-right, and hide or reposition when the area is occupied.
- [x] Resolve overlap between the repeat-review hint (`按 I 再次查看資料`) and lower-scene prompts or habitat objects.
- [ ] Re-check the card and status-indicator positions at the three observation points and at different screen sizes.

## Chapter 1 remaining visual issues | 第一章仍待處理的視覺問題

- [ ] Review and replace the diver sprite material: the current source sheet still needs a clean re-export because some frame edges may cut into the fins/feet. The runtime now preserves the source aspect ratio.
- [ ] Improve overall game sharpness: audit source asset resolution, crop/display scaling, render resolution, and image quality across screen sizes.

## Quality tasks | 品質任務

- [ ] Keep runtime JSON validation in sync with new data files
- [ ] Watch bundle size and split heavy chunks if needed
- [ ] Add more tests for new gameplay systems
- [ ] Keep save schema versioning updated when state changes
