---
name: Flights
description: The world's flight network as a Solari split-flap departures board.
colors:
  housing: "#0b0b0a"
  rail: "#141413"
  card-top: "#222120"
  card-bottom: "#1b1a19"
  ink: "#f1ece0"
  ink-dim: "#6f6b62"
  label: "#9a958a"
  sodium-yellow: "#ffc629"
  sodium-deep: "#8a6a12"
  origin-white: "#fff8e6"
  rule-line: "#262522"
  tip-edge: "#2c2b28"
  key-disabled: "#4b4842"
  density-0-blank: "#191918"
  density-1: "#2f2e2b"
  density-2: "#4d4b45"
  density-3: "#7a776d"
  density-4: "#b3afa3"
  density-5-hub: "#ece7da"
  density-dimmed: "#232220"
typography:
  flap:
    fontFamily: "Barlow Condensed, sans-serif"
    fontSize: "calc(var(--fh) * 0.74)"
    fontWeight: 600
    lineHeight: "var(--fh)"
    fontFeature: "tnum"
  key:
    fontFamily: "Barlow Condensed, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    letterSpacing: "0.08em"
  tip-title:
    fontFamily: "Barlow Condensed, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    letterSpacing: "0.02em"
  body:
    fontFamily: "Barlow, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 500
    lineHeight: 1.35
  column-label:
    fontFamily: "Barlow, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    letterSpacing: "0.22em"
  small:
    fontFamily: "Barlow, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.35
rounded:
  card: "2px"
spacing:
  flap-gap: "2px"
  key-gap: "6px"
  row-gap: "6px"
  board-gap: "14px"
  board-gap-narrow: "10px"
  gutter: "40px"
  gutter-narrow: "16px"
components:
  key:
    backgroundColor: "{colors.card-top}"
    textColor: "{colors.ink}"
    typography: "{typography.key}"
    rounded: "{rounded.card}"
    padding: "0 8px"
    height: "32px"
    width: "min 34px"
  key-hover:
    textColor: "{colors.sodium-yellow}"
  key-active:
    backgroundColor: "{colors.card-bottom}"
  key-pressed:
    textColor: "{colors.sodium-yellow}"
  key-disabled:
    textColor: "{colors.key-disabled}"
  key-wide:
    padding: "0 12px"
  flap-tile:
    backgroundColor: "{colors.card-top}"
    textColor: "{colors.ink}"
    typography: "{typography.flap}"
    rounded: "{rounded.card}"
    width: "var(--fw)"
    height: "var(--fh)"
  flap-tile-active:
    textColor: "{colors.sodium-yellow}"
  flap-tile-dim:
    textColor: "{colors.label}"
  tooltip:
    backgroundColor: "{colors.rail}"
    textColor: "{colors.ink}"
    typography: "{typography.small}"
    rounded: "{rounded.card}"
    padding: "8px 10px 9px"
  notice:
    backgroundColor: "{colors.rail}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    padding: "10px 14px"
---

# Design System: Flights

## Overview

**Creative North Star: "The Departures Board"**

Everything on screen is part of one Solari split-flap board: a matte near-black housing that holds charcoal flap cards, warm-white printed ink, and a single sodium yellow for whatever is active right now. The world map is itself a matrix of square flap cells. A cell's brightness is its printed grey card, and there are six of them, never a gradient. Text appears letter by letter on flap tiles that roll through the drum to reach their character. Every change of state is a flip: cells, letters and rows. Nothing fades or slides.

Density is high and the chrome is low. The board fills the viewport edge to edge inside a single gutter. The only surfaces are the housing, the cards and a slightly lighter rail for transient notes, and depth comes from the card's own construction: lighter above the hinge, darker below, with a hairline of housing between the halves. The visual rejection the build carries out is the category default of a dark glowing globe with neon arcs and every route drawn at once. Route lines are thin, flat and yellow, and they appear only for the current scene or a handful of ambient traces.

**Key Characteristics:**
- One housing, charcoal cards, warm-white ink, one sodium yellow.
- Quantised grey density cards (six faces plus a dimmed face), like printed flaps.
- Every state change is a flip with a hinge; letters roll through the drum.
- Square map cells that move in whole cells when panned.
- Condensed signage caps on tiles and keys; small tracked caps only for column labels.

## Colors

A near-monochrome warm-grey board with exactly one hue: sodium yellow means "active".

### Primary
- **Sodium Yellow** (sodium-yellow): the only accent. It marks selected destination cells, active departure rows and the time column in a selection, key hover, focus and pressed states, the search caret, the focus outline, text selection, route arcs and edge markers. If it's yellow, it's live.
- **Sodium Deep** (sodium-deep): cells that are in the selection but not its focus, such as the non-focused legs of a multi-leg trip.

### Secondary
- **Origin White** (origin-white): the origin airport, or the two ends of a journey, on the matrix. It also colours the travelling tip of an arc as it draws and the pointer's hover outline. It's brighter than ink, so the starting point reads above the yellow.

### Neutral
- **Housing** (housing): page background, the gaps between cards, the flap hinge, browser theme colour.
- **Rail** (rail): one step lighter than the housing, for transient overlays such as the map tooltip and the empty-results notice.
- **Card Top / Card Bottom** (card-top, card-bottom): the two halves of every DOM flap tile and every key, lit above the hinge and shadowed below.
- **Warm Ink** (ink): flap characters, emphasised numbers in the status line, links.
- **Label Grey** (label): status prose, column labels, credit, pager, tooltip secondary lines, and the dimmed tone of flap text.
- **Dim Ink** (ink-dim): link underline at rest.
- **Rule Line** (rule-line): the 1px rules above the status line and the footer.
- **Tip Edge** (tip-edge): the tooltip's 1px border.
- **Density cards** (density-0-blank through density-5-hub, density-dimmed): the printed faces of matrix cells. Faces 1 to 5 step up from a quiet airport or two (under 6 nonstop destinations) to the great hubs (160 or more). The dimmed face covers cells with airports that fall outside the current selection.

### Named Rules
**The One Sodium Rule.** Yellow is reserved for what is active, selected, focused or in flight. It is never used for decoration, headings or static emphasis; static emphasis is warm ink on label grey.

**The Printed Card Rule.** Map density uses the six quantised grey faces and nothing in between. Never interpolate a ramp or add a hue to density.

## Typography

**Display Font:** Barlow Condensed 600 (with sans-serif)
**Body Font:** Barlow 500 / 600 (with system-ui, sans-serif)

**Character:** Condensed signage caps printed on flap cards, set against a plain, slightly technical grotesque for the board's small print. Both are self-hosted via Fontsource.

### Hierarchy
- **Flap** (600, 0.74 × tile height, tabular figures): every character on a flap tile, including the FLIGHTS title, the search row and departure rows. Size comes from the tile, not a type scale: tile width `--fw` is computed from the viewport (16–28px desktop, 14–26px tablet, 12–20px phone), tile height is 1.45 × width, and title tiles are 1.3× width (1.35× on phones).
- **Tip title** (600, 20px, 0.02em, uppercase): airport name in the map tooltip.
- **Key** (600, 15px, 0.08em, uppercase): key labels and the pager.
- **Body** (500, 15px, 1.35; 14px on phones; max 90ch): the one-line status. Bold numbers and names use 600 in warm ink.
- **Small** (500, 13px, 1.35; credit 12px on phones): credit line, tooltip detail lines.
- **Column label** (600, 11px, 0.22em, uppercase, label grey): the headers above departure columns, sized to the column's flap width.

### Named Rules
**The Drum Rule.** Flap text is uppercase and limited to the drum's character set (space, A–Z, 0–9, `. - : / ' & + →`). Accents are stripped, and anything off the drum becomes a hyphen. Tiles are fixed-width runs: text is padded or cut to the column length and never wraps.

**The Signage Rule.** Barlow Condensed belongs to tiles, keys and the tooltip title. Running prose stays in Barlow at 13–15px.

## Layout

The board is one full-viewport (100dvh) grid with five rows: head (title and search), status line, map (takes the remaining height), departures, and footer. Padding is 0.7 × gutter on top, one gutter at the sides and 0.5 × gutter at the bottom. The gutter is 40px, or 16px below 700px. Rows are 14px apart, 10px on phones. The page never scrolls.

- **Head:** FLIGHTS on the left, search flap row on the right; on phones they stack.
- **Map:** square cells, `floor(width / 170)` clamped to 6–12px, centred in the area. About 170 columns on a laptop. Panning snaps to whole cells.
- **Departures:** four flap columns with gaps of 0.8 × tile width, labelled above. Character counts per column are [17, 3, 5, 9] at 1000px and up, [13, 3, 5, 6] from 700px, and [10, 3, 5] on phones (the fourth column drops). The number of rows per page follows viewport height: 3 to 5 on desktop, 4 to 5 on tablet and phone. Rows page like a real board.
- **Status and footer:** text on the left, keys on the right, a 1px rule above with 10px padding. Below 700px they stack (the footer reverses so keys sit above the credit).
- **Rhythm:** 2px between flap tiles, 6px between rows and between keys, 4px within the map's zoom cluster.

## Elevation & Depth

Flat. There is no elevation shadow anywhere. Depth comes from how a card is built: a lighter top half, a darker bottom half and a 1px housing hinge. In WebGL the top half is lifted ×1.05 and the bottom dropped ×0.93, and a mid-flip half darkens as it turns. Transient notes sit on the rail colour, one step above the housing, with at most a 1px tip-edge border.

### Named Rules
**The Hinge Rule.** Any surface that looks like a card (flap tile, matrix cell, key, favicon) has a split: lighter above the centre, darker below, and a housing-coloured hairline at the hinge. A key draws this as a hard-stop gradient, not a soft one.

## Shapes

Square and nearly sharp. Cards and keys have a 2px corner, applied per half (top corners on the top half, bottom corners on the bottom half). Matrix cells are true squares separated by a housing gap of 14% of the cell (minimum 1 device pixel), with no rounding. Icons are drawn 16px strokes at 1.75px with square caps. Route arcs are great-circle lines; the arc heads and edge markers are small square cell-sized blocks, never dots.

## Components

### Keys
The board's small hardware buttons, which are themselves flap cards.
- **Shape:** 2px corners, 32px tall, at least 34px wide, 0 8px padding (0 12px for word keys).
- **Fill:** the split card: card-top above, a 1px housing hinge, card-bottom below.
- **Hover / Focus / Pressed (`aria-pressed`):** ink turns sodium yellow (120ms ease-out); `:active` fills with card-bottom. Disabled ink is key-disabled.
- **Content:** uppercase key type, or a 16px drawn SVG icon (plus, minus, prev, next).

### Flap tile (signature)
- A single split-flap character in four stacked halves: static top and bottom, plus a folding top and bottom with a 1px housing hinge.
- **Tones:** ink at rest, sodium yellow for active rows and selection time columns, label grey for dimmed rows. Hovering or focusing a departure row turns its tiles yellow.
- **Motion:** each step is 46ms. The old top folds to −90° over 23ms (`cubic-bezier(.5,0,1,.6)`), then the new bottom swings from 90° over 23ms (`cubic-bezier(0,.4,.5,1)`). A character rolls forward through the drum and caps at 9 cards, skipping the rest. Characters in a row are staggered 18ms apart (70ms for the title). Departure rows are staggered 90ms per row and 40ms per column.

### Search
- A flap row that takes typing: a transparent input is laid over the tiles, with placeholder text printed on the tiles in the same flaps.
- **Caret:** a 3px sodium underline on the current tile that blinks with `steps(1)` over 1s (static under reduced motion).
- **Focus:** a 2px sodium outline, offset 4px, around the whole row. Matching rows act as a listbox in the departures area.

### Flap matrix (signature)
- The map, drawn as one WebGL quad per cell. Each cell's flip lasts 0.17s and is drawn by the fragment shader as a hinge fold.
- **Roles:** origin is origin-white, active is sodium-yellow and muted is sodium-deep. Cells outside the selection drop to the dimmed face, rippling out from the selected airport.
- **Time-true ripple:** destinations flip yellow with a delay proportional to flight time, and the longest flight lands at 1.7s while its arc draws on.
- **Arc weights:** faint (yellow at 16% alpha, 0.75px), normal (50%, 1px), focus (solid, 2px). A drawing arc has an origin-white square tip.
- **Resting traces:** about 0.42 × columns ambient routes at a time, yellow at 80% alpha and 1.5px, with square yellow heads. Long routes are favoured. A cell flashes yellow when its trace lands and reverts after 1.6s. Under reduced motion the traces become a still sample at 35% alpha.
- **Edge markers:** when the board is narrower than the world, a yellow square fills the edge cell where each off-board route leaves.
- **Outlines:** cells on the hovered departure row get a 1.5px sodium-yellow outline; the pointer's hovered cell gets an origin-white one.

### Tooltip
- A rail surface with a 1px tip-edge border, 2px corners, 8px 10px 9px padding and a maximum width of 260px. It shows a yellow condensed title, ink detail lines and label-grey overflow lines.

### Status line
- One line of body prose in label grey, with names and counts in warm ink, announced politely to screen readers. Contextual keys (Clear, Swap, From XXX, Back to XXX) sit on the right.

## Do's and Don'ts

### Do:
- **Do** build every new surface from the housing, flap cards and the rail; nothing else exists on this board.
- **Do** reserve sodium yellow (#ffc629) for active, selected, focused or in-flight state.
- **Do** show map density with the six quantised grey faces from the density palette.
- **Do** make every state change a flip: a fold at the hinge for cells, a drum roll for letters, staggered row by row.
- **Do** keep the map in square cells that move in whole cells.
- **Do** swap state instantly under `prefers-reduced-motion` (no rolls, no ripple, static caret, still traces).
- **Do** credit the route data source in the footer.

### Don't:
- **Don't** fade, slide or scale anything in or out; the board only flips.
- **Don't** add soft gradients, glass, glows or elevation shadows. The only gradient allowed is the hard-stop hinge split of a card.
- **Don't** round corners beyond 2px or use pills and circles; markers are square cells.
- **Don't** draw the whole route network at once or add a glowing globe; arcs belong only to the current scene or the few ambient traces.
- **Don't** introduce a second accent hue or tint the density cards.
- **Don't** set prose in Barlow Condensed or on flap tiles; tiles carry short uppercase values only.
