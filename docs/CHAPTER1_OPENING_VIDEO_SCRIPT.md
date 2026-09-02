# Chapter 1 Opening Flow and Video Script

Status: agreed concept; Seedance is proposed for the cinematic segments

This document defines the proposed opening experience after the current basic
briefing is replaced. Seedance should produce the short cinematic segments;
the game should handle the historical-photo archive and tutorial as interactive
UI. This separation keeps the opening attractive without making it a long
unskippable movie, and keeps all important text easy to localize.

## Recommended total length

- Cinematic A: about 15–20 seconds
- Historical-photo archive: about 25–40 seconds, depending on how long the player reads
- Cinematic B: about 10–15 seconds
- Interactive tutorial: about 20–35 seconds for a new player
- Total first entry: about 70–110 seconds
- Repeat entry with skip: about 5 seconds to skip directly to the dive

The actual Seedance video content should stay around 25–35 seconds. The rest of
the time belongs to player-controlled photo inspection and tutorial prompts.
This keeps the opening informative without delaying the playable part.

## Seedance production direction

Use Seedance for Cinematic A and Cinematic B only. Generate several short clips
and edit them together rather than asking for one long clip with all story beats.
The exact duration and export options should be checked in the Seedance product
surface at generation time.

Recommended reference materials:

- the new diver PNG frame as the character and silhouette reference;
- the research-vessel image as the setting reference;
- a clean water / seabed frame as the color and lighting reference;
- one historical-photo composition as a mood reference, without relying on AI to
  render readable words or dates.

Seedance 2.0's multimodal reference workflow can use image, video and audio
inputs, which is useful for keeping the diver, vessel and camera language
consistent across shots. The generated clips should still be treated as
visual atmosphere; the game's UI should provide the exact educational copy.

### Generation rules

- Generate in 16:9 to match the game canvas.
- Do not ask the model to render Chinese or English titles, labels, dates or
  interface text. Add those in Phaser as subtitles and UI overlays.
- Keep the diver's face and body mostly in silhouette or side profile to reduce
  identity drift between clips.
- Use the same reference images and a repeated character description for every
  shot.
- Avoid realistic claims about a named real ocean, real survey station or real
  measurement.
- Prefer quiet underwater ambience or no baked-in dialogue; add localized text,
  music and sound effects in the game layer.

### Starter prompt — Cinematic A

```text
Cinematic educational game opening, fictional tropical bay underwater, deep
blue ocean with soft shafts of light, suspended particles and a calm research
vessel light entering from above. A weathered field notebook and three faded
marine survey photographs drift gently in the water, then align like an old
archive. Slow documentary camera movement, restrained mystery, high-detail 2D
illustrated realism, coherent palette of deep navy, teal and muted warm paper.
End on a clear empty space for subtitles. No readable text, no logos, no
watermarks, no real-world location, no horror, no dramatic disaster.
```

### Starter prompt — Cinematic B

```text
Cinematic educational game cutscene using the same diver, research vessel and
underwater palette as the reference images. The diver enters the water with a
camera, approaches a fixed survey camera station, and a small diver-worn survey
unit emits a gentle cyan pulse over the station and nearby organisms. Tiny
abstract data marks appear briefly but contain no readable text. The diver raises
the camera and the viewfinder frame settles on the station. Calm purposeful
motion, clear subject silhouette, high-detail 2D illustrated realism, 16:9.
No readable text, no logos, no extra equipment buttons, no real-world claim.
```

The final game transition should place the generated clip underneath a dark
gradient, subtitle text and the “Next / Skip” controls. This preserves the
cinematic feeling while keeping the player in control.

## Flow overview

```text
Cinematic A: why we are returning
        -> Historical photo archive: player flips and inspects the old records
        -> Cinematic B: today's equipment and evidence rule
        -> New-player tutorial: movement, camera, photo and automatic survey unit
        -> Start Chapter 1 dive
```

## Segment 1 — Cinematic A: the return mission

Target length: 15–20 seconds

| Time | Visual direction | On-screen text / narration | Audio |
| --- | --- | --- | --- |
| 0–4s | Dark blue water, faint particles, a research vessel light enters frame | “第一章 · 海洋調查” / “Chapter 1 · Field Survey” | Low underwater ambience, distant vessel hum |
| 4–9s | Old survey notebook, faded map lines and three photo frames appear | “這片海灣曾經被調查過。” / “This bay has been surveyed before.” | Soft paper movement, restrained pulse |
| 9–15s | Three historical photo frames glow one by one; current water slowly overlays them | “現在，我們要回到相同位置。” / “Now we return to the same locations.” | Three light confirmation tones |
| 15–20s | Title settles, transition toward the photo archive | “先看證據，再談原因。” / “Evidence first. Explanations later.” | Music resolves into a quiet loop |

The first cinematic should establish curiosity, not announce that low oxygen
caused a decline. It should say that a change may be visible and the cause is
still unknown.

## Segment 2 — Interactive historical-photo archive

Target length: 25–40 seconds

This is a game-like album interface rather than a video. The player can flip
between three historical photos, inspect a larger view and read a short field
note for each location.

Each photo card contains:

- location name: Bay entrance, Raft edge, Inner bay;
- a historical-photo label and survey date placeholder;
- one or two observed organisms or habitat clues;
- a short instruction: “Repeat this view during today's survey”;
- previous / next controls and a visible `1 / 3`, `2 / 3`, `3 / 3` progress state.

Recommended interaction rule: the player should open all three cards once before
the Next button becomes the primary action. A Skip button remains available for
repeat players, and the sequence can be replayed later from the mission board.

Example field notes:

1. **Bay entrance** — “Small reef fish were visible in the mid-water frame.”
2. **Raft edge** — “Structure and near-bottom organisms were recorded here.”
3. **Inner bay** — “The open-water composition provides a comparison point.”

These notes are teaching references, not claims that the historical images prove
the whole bay had the same population everywhere.

## Segment 3 — Cinematic B: today's survey method

Target length: 10–15 seconds

| Time | Visual direction | On-screen text / narration | Audio |
| --- | --- | --- | --- |
| 0–4s | Diver enters the water with the camera; a small device pulse appears near the suit | “今天，照片由你選擇。” / “You choose what to photograph today.” | Camera latch / suit movement |
| 4–9s | Pulse passes over a station and nearby organisms; small data labels appear | “調查裝置會自動記錄 DO、物種、深度與棲地資料。” / “The survey unit logs DO, species, depth and habitat context.” | Soft scanning pulse, no alarm tone |
| 9–15s | Camera viewfinder frame aligns with the first station | “拍下可以比較的證據。” / “Capture evidence we can compare.” | Shutter preparation sound |

The device is background support, not a fourth task the player must manage. The
player's deliberate actions remain approaching, framing and photographing.

## Segment 4 — Focused new-player tutorial

Target length: 20–35 seconds, interactive

The tutorial should appear as a short sequence of contextual prompts rather than
one large wall of text:

1. **Move** — “Use WASD / arrow keys to move.” Show a brief input hint.
2. **Station camera** — Highlight the nearest station: “Press E to enter the viewfinder.”
3. **Take the station photo** — “Match the earlier view, then press SPACE.”
4. **Photograph organisms** — Highlight a nearby organism: “Move close and press SPACE to record it.”
5. **Automatic survey unit** — Show a quiet data pulse: “Nearby DO and context are logged automatically.”
6. **Safety** — “Tank oxygen is your safe dive time, not a DO reading.”

The player can dismiss the tutorial after the first complete run. The Help
button should reopen it during the dive, and the mission board should offer
“Replay Chapter 1 opening”.

## Segment 5 — Start the dive

Target transition: 2–3 seconds

The archive panel and tutorial fade into the live map. The first status prompt
should be simple:

> First step: find any fixed survey station, then press E to enter the viewfinder.

The HUD should show the three station checklist, photo progress, device status
and oxygen gauge. It should not show a tool-selection row.

## Visual direction

The opening should feel like a field notebook becoming a live survey:

- historical material: warm paper, faded blue, muted sepia accents;
- transition: paper edges dissolve into water particles;
- live survey: deep blue, cyan equipment highlights and restrained gold warnings;
- motion: slow camera drift, photo-card slide, device pulse and shutter flash;
- typography: large readable titles, short lines, no dense paragraphs during motion.

The first prototype can implement this with Phaser tweened panels, image crops,
particles and text rather than a pre-rendered MP4. This keeps the sequence
interactive, skippable and bilingual. A final video export can be considered
later if the project needs a promotional trailer or presentation version.

## Scientific and content constraints

- Do not state that low oxygen caused all organisms to disappear.
- “Not observed during this survey” must not be presented as “extinct”.
- Historical photos are comparison references, not proof of a whole-bay trend.
- All locations and readings remain labelled as fictional educational simulation
  content.

## Acceptance criteria

- A new player understands why the diver is returning before movement begins.
- The player has actively inspected all three historical photos at least once.
- The player understands that photography is required evidence.
- The player understands that the survey unit records background context automatically.
- The tutorial can be skipped, dismissed after first use and reopened later.
- The complete first-entry flow stays within roughly 70–110 seconds.
- The sequence remains readable in both English and Traditional Chinese.
