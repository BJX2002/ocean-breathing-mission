# Science Rules | 科學規則

These rules are binding for all code and content. They exist to prevent false
causation, misleading data and exaggerated product claims. Derived directly from
the project proposal (Sections 10–14, 18).

以下規則對所有程式碼與內容具有約束力，目的是避免錯誤因果、誤導性數據與誇大的產品宣稱。
直接源自專案提案（第 10–14、18 節）。

## 1. No hard-coded biological deletion | 禁止硬編碼刪除生物

The program MUST NOT use a rule such as "if DO < 2, delete all fish". Scientific
data stays in JSON and controls abundance category, depth, tolerance, behaviour
and survey status. `OxygenModel` only classifies/looks up DO values — it never
mutates populations.

程式**絕不可**使用「若 DO < 2 就刪除所有魚」這類規則。科學數據保留在 JSON，用於控制豐度
類別、深度、耐受度、行為與調查狀態。`OxygenModel` 只做溶氧分類／查詢，絕不改動族群。

## 2. Evidence-safe wording | 證據安全用語

| Use | Avoid |
| --- | --- |
| Not observed during this survey | Extinct |
| Less frequently observed / shifted distribution | Low oxygen made every fish disappear |
| Hypoxia may be one contributing factor | Fewer fish must have been caused by hypoxia |

`SurveyStatus` values (`still-observed`, `less-frequently-observed`,
`shifted-distribution`, `not-observed`) encode this wording. **"not-observed"
never means extinct.**

`SurveyStatus` 的值即編碼上述用語。**「not-observed」絕不等於絕種。**

## 3. Teaching alert bands (not safety thresholds) | 教學警戒帶（非安全閾值）

Defined in `src/data/oxygenScenarios.json` (`alertBands`), NOT in code:

| Band | Range (mg/L) | Meaning |
| --- | --- | --- |
| oxygenated | ≥ 4 | Relatively oxygenated |
| warning | 2–4 | Low-oxygen warning |
| severe | < 2 | Severe hypoxia |

These are teaching bands, not universal safety thresholds for every species.
Response depends on species, temperature and duration.

這些是教學警戒帶，並非適用所有物種的通用安全閾值；反應取決於物種、溫度與持續時間。

## 4. Three evidence categories | 三種證據類別

| Category | Required label |
| --- | --- |
| Real Monitoring Data | Show source, unit, time, depth and limitations |
| Literature-based Simulation | Label as simulation, not history of a real site |
| Teaching Simplification | Explain the simplification in teacher mode |

All bundled oxygen scenarios are **educational simulation** — not real-time data
for any named site (see the `descriptionEn`/`descriptionZh` fields).

所有內建的溶氧情境皆為**教育模擬**，並非任何具名水域的即時數據。

## 5. Government-presentation safety | 政府簡報安全

- All in-game locations are **fictional composites** (`isFictionalComposite: true`).
- No political borders or flags on the world map.
- Real names, coordinates, historical years and water-quality claims require
  review by the project team and a marine-science adviser before use.

所有遊戲地點皆為**虛構合成**；世界地圖不含政治邊界或國旗；真實名稱、座標、歷史年份與水質
宣稱須經專案團隊與海洋科學顧問審查後方可使用。

## 6. Product-claim discipline | 產品宣稱紀律

Placeholder sensor costs/performance in `src/data/sensors.json` are **not**
verified product data. Claims such as "80% lower price" or "90% lower
maintenance" require a comparator, assumptions, calculation and an approving
reviewer before any public/government demo.

`src/data/sensors.json` 中的感測器成本／效能為佔位值，**並非**經驗證的產品數據。任何
「降價 80%」「維護降低 90%」等宣稱，於公開／政府示範前須具備比較基準、假設、計算與核可者。

## 7. Public demo disclaimer | 公開示範免責聲明

Any public build should display: "This is an educational simulation, not a
real-time assessment of the represented waters."

任何公開版本皆應顯示：「這是教育模擬，並非對所示水域的即時評估。」

## 8. Sensors do not add oxygen | 感測器不會增氧

Sensors provide monitoring, records and warning. They do NOT directly add oxygen
or instantly restore fish populations. This must remain true in UI copy and
gameplay framing.

感測器提供監測、記錄與警示，**不會**直接增氧或立即恢復魚群。UI 文案與玩法框架皆須遵守。
