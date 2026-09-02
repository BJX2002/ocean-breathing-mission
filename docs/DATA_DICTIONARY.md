# Data Dictionary | 資料字典

Schemas for every JSON file in `src/data/`. Each file is validated at runtime by
`src/validation/validators.ts`; matching TypeScript interfaces live in
`src/types/`.

`src/data/` 中每個 JSON 檔案的結構。每個檔案於執行期由
`src/validation/validators.ts` 驗證；對應的 TypeScript 介面位於 `src/types/`。

Legend | 圖例: `enum(...)` = one of the listed values | 為列出值之一。

## species.json — `Species[]`

| Field | Type | Notes |
| --- | --- | --- |
| id | string | Unique id |
| nameEn / nameZh | string | Bilingual name |
| functionalGroup | enum(strongly-mobile-fish, habitat-associated-fish, benthic-invertebrate, tolerant-organism) | Drives simulation rules |
| abundanceCategory | enum(abundant, common, occasional, rare) | Qualitative, not a count |
| mobility | enum(high, medium, low) | |
| preferredDepthZone | enum(surface, mid, bottom) | |
| oxygenTolerance | enum(low, moderate, high) | |
| surveyStatus | enum(still-observed, less-frequently-observed, shifted-distribution, not-observed) | Evidence-safe wording |

## locations.json — `Location[]`

| Field | Type | Notes |
| --- | --- | --- |
| id | string | Unique id |
| nameEn / nameZh | string | Bilingual name |
| type | enum(reference, monitoring, extension) | Narrative role |
| isFictionalComposite | boolean | Must be `true` for all shipped locations |
| depthZones | enum(surface, mid, bottom)[] | Available depth zones |
| descriptionEn / descriptionZh | string | Bilingual description |

## missions.json — `Mission[]`

| Field | Type | Notes |
| --- | --- | --- |
| id | string | Unique id |
| titleEn / titleZh | string | Bilingual title |
| locationId | string | Must reference an existing location |
| chapter | 1 \| 2 | Core loop |
| objectives | `MissionObjective[]` | See below |
| oxygenBudget | number | Abstract 0–100 (dive) |
| timeLimitSeconds | number | 0 = no limit |

`MissionObjective`: `{ id: string, textEn: string, textZh: string }`

## equipment.json — `Equipment[]` (Chapter 1 dive tools)

| Field | Type | Notes |
| --- | --- | --- |
| id | string | Unique id |
| nameEn / nameZh | string | Bilingual name |
| category | enum(photography, navigation, scanning, sampling) | |
| slotCost | number | Equipment slots used |
| batteryDrainPerSecond | number | While active |
| descriptionEn / descriptionZh | string | Bilingual |

## sensors.json — `Sensor[]` (Chapter 2 monitoring devices)

| Field | Type | Notes |
| --- | --- | --- |
| id | string | Unique id |
| nameEn / nameZh | string | Bilingual name |
| category | enum(vessel-sampling, handheld, fixed-probe, sensing-film, gateway) | |
| unitCost | number | Placeholder game currency |
| maintenanceCost | number | Placeholder game currency |
| samplingIntervalMinutes | number | 0 = single/manual reading |
| maxDepthZone | enum(surface, mid, bottom) | |
| continuous | boolean | |
| wireless | boolean | |

> Costs/performance are placeholders, NOT verified product data. See
> [SCIENCE_RULES.md](SCIENCE_RULES.md) §6.
> 成本／效能為佔位值，並非經驗證的產品數據，見 [SCIENCE_RULES.md](SCIENCE_RULES.md) §6。

## oxygenScenarios.json — `OxygenData`

Top-level object with two arrays.

`OxygenData = { alertBands: AlertBand[], scenarios: OxygenScenario[] }`

**AlertBand**

| Field | Type | Notes |
| --- | --- | --- |
| id | string | Unique id |
| labelEn / labelZh | string | Bilingual label |
| minMgPerL | number \| null | null = open lower bound |
| maxMgPerL | number \| null | null = open upper bound |
| severity | enum(normal, warning, severe) | |

**OxygenScenario**

| Field | Type | Notes |
| --- | --- | --- |
| id | string | Unique id |
| nameEn / nameZh | string | Bilingual name |
| descriptionEn / descriptionZh | string | Must state "educational simulation" |
| readings | `OxygenReading[]` | See below |

**OxygenReading**: `{ depthZone: enum(surface, mid, bottom), timeOfDay: enum(dawn, day, dusk, night), doMgPerL: number }`

## diveMaps.json — `DiveMap[]`

Level-design layout per location (not scientific data). Rendered at runtime with
procedurally generated placeholder textures — no external art.

| Field | Type | Notes |
| --- | --- | --- |
| locationId | string | Must reference an existing location |
| decor | `DecorPlacement[]` | Habitat decoration placements |
| cameraStations | `CameraStationPlacement[]` | Historical camera-station landmarks |

`DecorPlacement`: `{ kind: enum(coral, rock, seagrass, buoy), x: number, y: number }`

`CameraStationPlacement`: `{ id: string, x: number, y: number, labelEn: string, labelZh: string }`

## Referential integrity | 參照完整性
`assertReferentialIntegrity` checks that every `mission.locationId` matches an
existing location. Extend this function as new cross-references are added.

`assertReferentialIntegrity` 會檢查每個 `mission.locationId` 是否對應到既有地點；
新增交叉參照時請擴充此函式。
