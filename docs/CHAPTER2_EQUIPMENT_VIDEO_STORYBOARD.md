# Chapter 2 Equipment Demonstration — Storyboard and SeedDance Prompts

Status: production brief approved for asset exploration; video integration is deferred until the teaching flow and UI layout are stable.

## 1. Teaching goal

The three clips are one comparison, not three advertisements. They must let a Primary 4–6 player answer:

1. What does the method physically do in the water?
2. Does it record one moment or keep recording?
3. What makes long-term, multi-location monitoring difficult or useful?

The three methods are:

- research-vessel manual sampling;
- a generic conventional fixed dissolved-oxygen probe;
- the NerOcean replaceable photo-sensing-film sensor used as a monitoring network.

The product lesson must not be reduced to fictional prices or a five-minute difference in sampling interval. The useful contrast is sparse manual sampling, maintenance burden during long-term fixed monitoring, and a lower-maintenance network that can cover more locations and depths for longer.

## 2. Where the clips appear

Do not play them when the whole game first opens. In Chapter 2, use this order:

```text
Define dissolved oxygen (DO) in one sentence
    -> ask whether one boat measurement is enough
    -> player selects "See how the three methods work"
    -> play the three short clips
    -> equipment selection and deployment
    -> run 24 hours
    -> reveal the result chart
```

First viewing may be strongly prompted, but playback must be skippable. Add a replay control in the Chapter 2 help panel. Until the clips are ready, the same slot can use three static keyframes with short game-rendered captions.

## 3. Shared production specification

| Item | Specification |
| --- | --- |
| Master | 16:9, preferably 3840x2160; export a web version at 1920x1080 |
| Duration | 6–8 seconds per method; about 20–24 seconds combined |
| Frame rate | 24 or 30 fps, identical for all three clips |
| Camera | Same readable side-on cutaway of one coastal aquaculture bay |
| Style | High-detail 2D illustrated realism for a polished children's ocean-science adventure game |
| Palette | Deep ocean blue and teal, pale cyan science light, restrained warm gold action accents |
| Motion | Slow, readable and physically plausible; one main action at a time |
| Text | No generated text, numbers, labels, logos, dashboard or subtitles inside the video |
| UI overlay | Add clocks, data dots, arrows, captions and charts later in the game |
| Audio | Export clean visuals first; sound effects and narration remain separate |

Use the same environment seed/reference, water colour, seabed profile, lighting direction and camera height for all three clips. If the three outputs do not look like the same bay, they should not be accepted as a comparison set.

## 4. Shared SeedDance style prefix

Paste this paragraph at the beginning of each video prompt:

```text
Create a 7-second, 16:9 cinematic educational animation in high-detail 2D illustrated realism, matching a polished children's ocean-science adventure game. Use a locked, clean side-on cutaway view of the same Hong Kong coastal aquaculture bay, showing the water surface, water column and seabed at once. Deep teal and ocean-blue water, pale cyan scientific light, restrained warm-gold accents, clean readable silhouettes, gentle currents and small suspended particles. Motion is smooth, slow and physically plausible, with one clear action at a time. Keep generous empty space for game UI overlays. No text, no numbers, no labels, no subtitles, no logos and no dashboard inside the video.
```

Shared negative prompt / rejection criteria:

```text
Avoid photorealistic documentary footage, chibi style, exaggerated cartoon comedy, fantasy machinery, science-fiction holograms, glowing neon everywhere, unreadable gauges, random cables, extra boats, extra divers, malformed equipment, changing camera angle, fast cuts, shaky camera, dramatic storms, dangerous animal behaviour, murky unreadable water, baked-in text, fake brands or invented product controls.
```

## 5. Clip A — Research-vessel manual sampling

Reference asset: `public/assets/chapter1/research-vessel.png`.

### Storyboard

| Time | Visual action | Game overlay added later | Meaning |
| --- | --- | --- | --- |
| 0.0–1.5s | The research vessel enters slowly and stops above one marked location. | Method tab: vessel sampling | A boat must travel to the site. |
| 1.5–4.5s | A winch lowers one sampling bottle or compact probe from the vessel to near the seabed. One restrained cyan pulse occurs at the measurement point. | One map pin and one data dot | One place and one moment are measured. |
| 4.5–7.0s | The instrument is retrieved and the vessel leaves. The empty water remains while lighting shifts gently toward night. | Clock advances; later hours remain blank | A short event can happen after the vessel leaves. |

### SeedDance image-to-video prompt

Attach the vessel reference and paste the shared style prefix, followed by:

```text
Use the supplied research-vessel image as the exact vessel design and preserve its teal-and-white hull, cabin proportions and silhouette. The vessel glides in from the left and stops calmly above one sampling location. A realistic winch cable lowers one simple seawater sampling bottle or compact probe straight down through the water column until it reaches just above the seabed. At the lowest point, show one subtle pale-cyan measurement pulse only once. The cable then reels back up, the vessel departs slowly to the right, and the camera stays locked on the now-empty sampling location as daylight begins to dim. Do not leave any instrument behind. Keep the single measurement visually obvious without showing text or a graph.
```

Acceptance check: one vessel, one lowering action, one measurement pulse, then no instrument remains.

## 6. Clip B — Generic conventional fixed DO probe

This is a generic teaching representation, not a named competitor. Approve one still image before generating motion.

### Storyboard

| Time | Visual action | Game overlay added later | Meaning |
| --- | --- | --- | --- |
| 0.0–1.5s | A conventional cylindrical probe is fixed to a simple mooring frame near the seabed. | Method tab: fixed probe | It stays in place. |
| 1.5–4.0s | The probe makes several even cyan pulses while gentle day/night changes show time passing. | A continuous row of data dots | It can record repeatedly. |
| 4.0–6.0s | A restrained layer of biofouling gradually appears on the exposed sensing end. Pulses become visually less confident, not completely broken. | Confidence warning, no absolute failure claim | Long deployments require maintenance. |
| 6.0–7.0s | A small maintenance boat silhouette approaches as the probe pauses. | Maintenance-trip icon and a short data gap | Servicing costs time and can interrupt coverage. |

### SeedDance keyframe prompt

```text
Create one clean concept frame in the shared children's ocean-science illustration style: a generic conventional cylindrical dissolved-oxygen probe mounted vertically on a practical metal mooring frame just above the seabed. The exposed sensing tip is clearly visible. The design is believable contemporary marine equipment, not futuristic, with no brand, screen, label or logo. Show enough empty water around it for later animation and UI overlays.
```

### SeedDance image-to-video prompt

Use the approved keyframe and paste the shared style prefix, followed by:

```text
Preserve the exact approved probe and mooring design. The fixed probe remains anchored near the seabed for the entire shot and emits several soft, evenly timed pale-cyan measurement pulses. Use two gentle lighting transitions to suggest a longer deployment without moving the camera. Gradually add a thin, realistic layer of marine biofouling only around the exposed sensing end; keep the effect educational and restrained, not dirty or frightening. Near the end, the pulses pause briefly and a small maintenance-vessel silhouette approaches at the water surface. Do not imply that every conventional probe immediately fails, and do not show text, numbers or a graph.
```

Acceptance check: the device records continuously first; biofouling and maintenance appear only as a long-term trade-off, never as an instant failure.

## 7. Clip C — NerOcean photo-sensing-film network

Reference asset: `public/assets/chapter2/do-sensor-product-v1.png`.

The supplied reference determines the exterior. Do not ask the video model to invent a photorealistic internal mechanism. Show the film movement in a separate stylised inset or game-rendered overlay.

### Storyboard

| Time | Visual action | Game overlay added later | Meaning |
| --- | --- | --- | --- |
| 0.0–2.0s | Close readable view of the existing black sensor body and cable installed underwater. A small violet/UV light pulse occurs at the sensing area. | Method tab: sensing-film node | Light activates the measurement. |
| 2.0–4.0s | A clean diagrammatic inset shows a short film strip advancing to a fresh section after a reading. | Simple film/tape arrow | Replaceable film supports repeated long-term measurement. |
| 4.0–7.0s | The camera pulls back gently to reveal several matching nodes at different locations/depths. Each sends a restrained cyan signal toward one surface receiver or shore direction. | Location/depth nodes light up | Multiple nodes form a monitoring network. |

### SeedDance image-to-video prompt

Attach the NerOcean product reference and paste the shared style prefix, followed by:

```text
Use the supplied NerOcean sensor photograph as the exact exterior reference. Preserve the black sensor housing, cable shape, connectors, proportions and material appearance; do not add screens, buttons, propellers or fictional parts. Show the sensor installed securely in seawater near a simple mooring point. A small controlled violet light pulse appears only at the sensing area, followed by a pale-cyan data pulse travelling along the cable. Then make a gentle camera pull-back that reveals several identical sensor nodes placed at clearly different locations and depths in the same bay, each sending one restrained cyan signal toward a surface receiver or the shore. Leave clean space for a separate game-rendered film-strip inset and data overlay. No internal cutaway, no text, no numbers, no logo animation and no futuristic hologram.
```

### Separate film-motion overlay

Create this as a simple game animation or motion-graphic overlay rather than asking SeedDance to invent the sensor interior:

```text
UV pulse -> one film segment reacts -> the strip advances one step like a recording tape -> a fresh segment aligns with the light -> data pulse is sent
```

Acceptance check: the exterior matches the reference; the shot communicates light-triggered measurement, repeated fresh film sections and a multi-point network without inventing hardware.

## 8. Game-rendered captions

Keep the captions short and add them outside the generated videos:

| Method | Caption during clip | Result tag |
| --- | --- | --- |
| Vessel | `到現場，測一次` | `一個時間 · 一個地點` |
| Fixed probe | `留在一處，連續測量` | `長期使用需要維護` |
| Sensing-film network | `多個節點，持續傳回資料` | `更多地點 · 更多深度 · 更長時間` |

After all three clips, use one question rather than another paragraph:

> 要找出清晨近海床的短暫低氧，你會怎樣布置監測？

The answer is then discovered through deployment and the 24-hour result chart.

## 9. Production order

1. Generate and approve three still keyframes in one consistent visual style.
2. Lock the conventional-probe silhouette and the treatment of the supplied NerOcean reference.
3. Generate the three silent 6–8 second clips.
4. Select frames with no malformed equipment or visual discontinuity.
5. Export clean masters without text.
6. Add captions, clock, measurement dots and signal overlays in the game.
7. Compress to web formats only after visual approval.

