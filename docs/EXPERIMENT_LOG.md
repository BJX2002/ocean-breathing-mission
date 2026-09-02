# Experiment Log | 實驗日志

Last updated: 2026-07-24

最後更新：2026-07-24

## Current status | 目前狀態

- The project builds and runs with Phaser 4.2.1, TypeScript, and Vite.
- The current playable slice includes chapter select, opening animation, tutorial overlay, help replay, oxygen drain, and safe return.
- A manifest-driven art pipeline now loads real assets first and falls back to procedural textures when assets are missing.
- Runtime validation is still used for JSON data so bad content fails early.

## What was tested | 已測試內容

- `npm run typecheck`
- `npm run test`
- `npm run build`

All three passed on the latest run.

## Observations | 實驗觀察

- Replacing procedural textures with real art through a preload manifest is safe if missing files are treated as non-fatal.
- Reusing the tutorial overlay for an in-dive help button keeps the onboarding logic simple.
- The 1080p design-space approach is more stable than the earlier camera-zoom experiment.
- Large production bundles still need watching, even though the build succeeds.

## Next experiments | 下一步可做的實驗

- Add one or two real sprite sheets and confirm they override the placeholders.
- Measure whether code splitting is needed for the Vite bundle warning.
- Test the help replay flow on keyboard, mouse, and touch.
- Add a first real photography/replay loop once art assets are ready.
