# Chapter 1 Photography and Food-Web Design

Status: agreed design direction; photography/tool simplification and first food-web evidence pass implemented

This document records the gameplay direction discussed for Chapter 1. It is
intended to guide the next implementation pass without changing the current
code by itself.

## 1. Core decision

Photography remains a required player action and the main form of field
evidence.

The player must still:

- enter the camera viewfinder at each fixed survey station;
- take the station photograph;
- aim at and photograph organisms that are part of the survey evidence.

Other information can be detected automatically when the diver is close enough
to the relevant subject or station. In the fiction, this is handled by a
diver-worn survey unit that quietly logs routine context in the background. The
player should not have to switch among three separate tools just to complete
routine observations.

The intended division is:

| Information | Player action | Game response |
| --- | --- | --- |
| Fixed station / scene evidence | Enter viewfinder and press the shutter | Save a dated station photograph |
| Organism evidence | Aim and photograph the organism | Save a species photograph and update the observation record |
| Dissolved oxygen and context | Move near the station or subject | The diver-worn survey unit automatically records DO, depth, location and survey context |
| Species information | Move close enough to identify the subject | The survey unit automatically reveals role, habitat, depth zone and oxygen tolerance |

The survey unit supplies context; it does not replace the photograph that
proves what the player chose to document.

## 2. Photography loop

The intended player flow is:

```text
Approach a station or organism
        -> the diver-worn survey unit logs nearby data
        -> enter the viewfinder
        -> aim and take a photograph
        -> evidence is saved to the field notebook
        -> continue the survey or return to compare evidence
```

The evidence state for a station or organism should be understandable and
repeatable:

```text
unknown -> detected -> photographed -> included in comparison
```

Detection alone is useful feedback, but only the photograph counts as the
player's documented observation. A photograph should show a small amount of
shutter, framing and save feedback so the action feels meaningful rather than
like a hidden checklist click.

## 3. Educational purpose of the photographs

The current photography structure already supports the idea of returning to
the same observation point and collecting evidence before making a conclusion.
However, photography will only communicate the low-oxygen lesson clearly if
the report gives the player something real to compare.

Each station's evidence review should place three pieces of information
together:

1. the historical/reference photograph;
2. the player's current photograph;
3. the current DO reading, with unit, depth, time and the educational-simulation
   limitation.

The comparison should show changes such as:

- organisms still observed;
- organisms observed less frequently;
- organisms appearing at a shifted location or depth;
- organisms not observed during this survey.

The last status must never be presented as extinction. The educational message
should be phrased as a cautious hypothesis, for example:

> The current photograph shows fewer small fish at this station, while the DO
> reading is in a low-oxygen warning band. Low oxygen may be one contributing
> factor, but more observations are needed.

The game should not say that low DO automatically caused every organism to
disappear. Species tolerance, depth, duration and other environmental factors
remain relevant.

## 4. Food chain / food web presentation

Because ecological relationships branch, the UI should use a food-web model
even if the lesson is introduced to players as a “food chain”. A simple first
version can show these teaching links:

```text
algae / seagrass -> small fish -> larger fish
                         |
                         -> seabed organisms / sea cucumber

plankton -> filter feeders / tube sponge
```

The arrows describe possible feeding or energy relationships. They are clues
for investigation, not proof that one missing observation was directly caused
by another species or by low oxygen.

### Evidence-linked node states

Each food-web node should be connected to the survey evidence rather than
being a decorative diagram:

- `unknown`: not yet encountered or identified;
- `detected`: identified automatically nearby;
- `photographed`: the player captured the organism as evidence;
- `compared`: the photograph has been reviewed against historical/reference
  evidence.

The node can also show a cautious survey status: still observed, less
frequently observed, shifted distribution, or not observed during this survey.

Clicking a node should explain three things in plain language:

1. what role the organism plays in the web;
2. what evidence the player has collected;
3. what the current observation can and cannot prove.

For example, a missing small-fish node should read “not observed at this
station during this survey”, not “the small fish are extinct”. If the larger
fish is still present, that contrast can prompt the player to ask why different
levels of the web respond differently.

## 5. How the two systems reinforce each other

The combined lesson should follow this structure:

```text
Same station, historical photo
        + current station and organism photos
        + automatically recorded DO/depth/context
        -> compare which food-web nodes are present or absent from the evidence
        -> discuss a possible low-oxygen relationship
        -> keep the conclusion open to further monitoring
```

The viewfinder can help by showing several related organisms in the same
composition. For example, a station preview may contain seagrass, small fish
and a larger fish. The player then chooses which relationship to document,
instead of merely photographing an isolated subject with no context.

The final evidence screen should make the chain visible in the same place as
the photographs and DO reading. This lets the player understand:

- a photograph records what was seen;
- the food web explains how organisms may be related;
- DO provides environmental context;
- the comparison suggests a question, not a guaranteed cause-and-effect answer.

The first implementation now shows four evidence-linked nodes in the return
evidence room: algae/seagrass habitat context, small fish, larger reef fish and
seabed organisms. Organism nodes distinguish photographed, detected-but-not-
photographed and not-observed-here states. This is a first teaching view; the
historical/current image comparison still needs a dedicated follow-up pass.

## 6. HUD and controls direction

The current top row is too narrow because it combines mission identity,
station progress, instructions and three tool buttons in one strip.

For the next UI pass:

- remove the prominent `1 / 2 / 3` tool selector;
- keep one clear camera/shutter instruction because photography is mandatory;
- keep station progress and photo progress visible;
- let automatic detection appear as a nearby observation/status card;
- reserve the right side for oxygen status, return status and help;
- if necessary, give the HUD a slightly taller two-row layout so text is not
  compressed.

The player should feel that the camera is the deliberate scientific action,
while the detected data is support supplied by the survey system.

## 7. Implementation order

This design is intentionally staged:

1. simplify the HUD and remove the need to switch scanner/DO tools;
2. preserve and strengthen station and organism photography requirements;
3. record nearby DO, species and context automatically;
4. store photo evidence with station, organism, depth and time metadata;
5. connect each organism to a food-web node and evidence state;
6. build historical/current photo comparison with cautious survey statuses;
7. add short explanations and test the lesson at all Chapter 1 stations;
8. complete runtime visual QA at different screen sizes.

## 8. Acceptance criteria

The design is working when:

- a player cannot complete the chapter without taking the required photographs;
- routine DO/species/context data appears as a survey-unit log without tool switching;
- a current photograph can be compared with a historical/reference photograph;
- the food-web nodes reflect the player's actual observations and photographs;
- “not observed” is never presented as “extinct”;
- low DO is presented as a possible contributing factor, not an automatic cause;
- the top HUD remains readable at the target aspect ratios;
- the player can explain the relationship between evidence, food-web position and
  environmental context after returning to the vessel.
