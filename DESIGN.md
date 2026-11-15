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
  sea: "#0d0d0c"
  land: "#232220"
  density-1: "#3b3935"
  density-2: "#58554e"
  density-3: "#817d72"
  density-4: "#b5b1a5"
  density-5-hub: "#ece7da"
  dimmed-quiet: "#2b2a27"
  dimmed-busy: "#3b3935"
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

Everything on screen is part of one Solari split-flap board: a matte near-black housing that holds charcoal flap cards, warm-white printed ink, and a single sodium yellow for whatever is active right now. The world map is itself a matrix of square flap cells. Every cell is printed sea, bare land, or one of five grey airport-density cards, never a gradient, so the continents read before a single airport does. Text appears letter by letter on flap tiles that roll through the drum to reach their character. Every change of state is a flip: cells, letters and rows. Nothing fades or slides.

Density is high and the chrome is low. The board fills the viewport edge to edge inside a single gutter. The only surfaces are the housing, the cards and a slightly lighter rail for transient notes, and depth comes from the card's own construction: lighter above the hinge, darker below, with a hairline of housing between the halves. The visual rejection the build carries out is the category default of a dark glowing globe with neon arcs and every route drawn at once. Route lines are thin, flat and yellow, and they appear only for the current scene or a handful of ambient traces.

**Key Characteristics:**
- One housing, charcoal cards, warm-white ink, one sodium yellow.
- Sea, land and five quantised grey density cards (plus two dimmed faces), like printed flaps.
- Every state change is a flip with a hinge; letters roll through the drum.
- Square map cells that move in whole cells when panned.
- Condensed signage caps on tiles and keys; small tracked caps only for column labels.

## Colors

A near-monochrome warm-grey board with exactly one hue: sodium yellow means "active".

### Primary
- **Sodium Yellow** (sodium-yellow): the only accent. It marks selected destination cells, active and previewed departure rows, key hover, focus and pressed states, the search caret, the focus outline, text selection, route arcs and edge markers. If it's yellow, it's live.
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
- **Sea and Land** (sea, land): the ground the board is printed on. A cell with no airport shows land when at least a third of its footprint is land on the Natural Earth 1:50m outline (rasterised to a 0.25° mask by `pipeline/land.py`, committed as `src/board/land.bin`), and sea otherwise. Sea sits a hair above the housing, so the open ocean reads as the board's back rather than as cards.
- **Density cards** (density-1 through density-5-hub): the printed faces of airport cells, roughly log-spaced by the nonstop destinations a cell's airports share: under 3, 12, 45 and 150, then the great hubs. Each step is at least 1.4:1 above the one below, and density-1 is 1.4:1 above land.
- **Dimmed faces** (dimmed-quiet, dimmed-busy): airport cells outside the current selection drop to one of two quiet steps (under or over 45 destinations), so the coasts and the big hubs still read around the selection. Sea and land never change with a selection.

### Named Rules
**The One Sodium Rule.** Yellow is reserved for what is active, selected, focused or in flight. It is never used for decoration, headings or static emphasis; static emphasis is warm ink on label grey.

**The Printed Card Rule.** The map uses its printed faces (sea, land, five density cards, two dimmed cards) and nothing in between. Never interpolate a ramp or add a hue to density.

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

- **Head:** FLIGHTS on the left, search flap row on the right with the sound key (a speaker icon, off by default) after it; on phones they stack and the sound key sits at the right of the title.
- **Map:** square cells, `floor(width / 170)` clamped to 6–12px, centred in the area. About 170 columns on a laptop. Panning snaps to whole cells.
- **Departures:** four flap columns with gaps of 0.8 × tile width, labelled above. From 700px the columns run the full width like a real board: code and time keep 3 and 5 characters, and the name (13 to 24 characters, about 58% of what's left) and the last column share the rest; on phones they are [10, 3, 5] and the fourth column drops. Rows per page follow viewport height: 3 below 860px tall on desktop, 4 from 860px, 5 above 1100px; 4 to 5 on tablet and phone. Rows page like a real board, every 8s, holding still for 15s after a new selection and while a row is previewed.
- **Departures head:** the column labels, whose first label names the subject (DEPARTURES FROM YTZ, MOST ROUTES, QANTAS AIRPORTS), with the pager right-aligned on the same line from 1000px: ‹ 1–3 OF 17 ›, counting rows, not pages. Below 1000px it sits under the rows, right-aligned. Every key lives beside what it acts on: zoom with the map, paging with the rows, selection keys in the status line, sound in the head. The footer carries only the credit.
- **Map keys:** + and − anchored in the map's bottom-right corner; a Whole world key appears to their left only once zoomed in, so + and − never move.
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
- **Touch (`pointer: coarse`):** keys grow to 40px tall and at least 44px wide; departure rows sit 10px apart and each row's tap area stretches 5px above and below its flaps, so the gaps between rows still land on a row; the search's tap area extends 10px above and below its tiles. A touch that moves under 10px is a tap, not a pan.
- **Fill:** the split card: card-top above, a 1px housing hinge, card-bottom below.
- **Hover / Focus / Pressed (`aria-pressed`):** ink turns sodium yellow in one step, no fade; `:active` fills with card-bottom. Disabled ink is key-disabled.
- **Content:** uppercase key type, or a 16px drawn SVG icon (plus, minus, prev, next, speaker on and off).

### Flap tile (signature)
- A single split-flap character in four stacked halves: static top and bottom, plus a folding top and bottom with a 1px housing hinge.
- **Tones:** ink at rest, sodium yellow only for the active row and the row being previewed (hovered, focused or tapped once), label grey for dimmed rows. Whole columns are never yellow.
- **Motion:** each step is 46ms. The old top folds to −90° over 23ms (`cubic-bezier(.5,0,1,.6)`), then the new bottom swings from 90° over 23ms (`cubic-bezier(0,.4,.5,1)`). A character rolls forward through the drum and caps at 9 cards, skipping the rest. Characters in a row are staggered 18ms apart (70ms for the title). Departure rows are staggered 90ms per row and 40ms per column, except just after an airport or airline is chosen: then each row on the first page starts rolling 250ms before its cell lands in the ripple, so row and cell settle together.

### Search
- A flap row that takes typing: a transparent input is laid over the tiles, with placeholder text printed on the tiles in the same flaps.
- **Hints:** until the visitor first picks something, the empty search flips every 4.5s between its prompt and a real example (TRY: QANTAS, TRY: TOKYO, TRY: EMIRATES…), so it's plain that airlines are searchable too.
- **Caret:** a 3px sodium underline on the current tile that blinks with `steps(1)` over 1s (static under reduced motion).
- **Focus:** a 2px sodium outline, offset 4px, around the whole row. Matching rows act as a listbox in the departures area.

### Flap matrix (signature)
- The map, drawn as one WebGL quad per cell. Each cell's flip lasts 0.17s and is drawn by the fragment shader as a hinge fold.
- **Roles:** origin is origin-white, active is sodium-yellow and muted is sodium-deep. Airport cells outside the selection drop to the dimmed faces, rippling out from the selected airport; sea and land stay put.
- **Time-true ripple:** destinations flip yellow with a delay proportional to flight time, and the longest flight lands at 1.7s while its arc draws on.
- **Arc weights:** faint (yellow at 16% alpha, 0.75px), normal (50%, 1px), focus (solid, 2px). A drawing arc has an origin-white square tip.
- **Resting traces:** about 0.42 × columns ambient routes at a time, yellow at 80% alpha and 1.5px, with square yellow heads. Long routes are favoured. A cell flashes yellow when its trace lands and reverts after 1.6s. Under reduced motion the traces become a still sample at 35% alpha.
- **Framing:** each selection frames itself. A network covering a small patch zooms in by whole steps (2×, 4×, 8×) until it fills at most 60% of the board; on a board showing the whole world, a network whose routes would split across its edge recentres on its own longitude, in whole cells. Going back to rest undoes whatever the board chose. Once the visitor zooms or pans, the board stops choosing and only keeps the selection in view.
- **Arc ends:** every arc starts and ends on the centre of its airports' cells (the correction is eased along the line), so zoomed in, routes land on their cards.
- **Edge markers:** when the board is narrower than the world, a yellow square fills the edge cell where each off-board route leaves.
- **Preview (linking rows and cells):** pointing at a row (mouse hover, keyboard focus, or a first tap on touch, where the second tap opens it) previews it on the map: the rest of the selection flips to sodium-deep, the row's cells stay sodium-yellow with an origin-white outline, and its routes draw at focus weight while the others drop to faint. Each cell waits for its own ripple landing before flipping. Pointing at a lit cell does the reverse: the board pages to that cell's row and lights it. At rest, the hovered row's cell gets a sodium-yellow outline instead.
- **Outlines:** the pointer's hovered cell gets an origin-white outline.

### Airline keys
- In airport and route rows, each airline code in the last column is its own key that opens that airline's network, still printed on the row's flaps. Pointing at a code puts a 3px sodium underline under it (the search caret's mark); the row lights as a whole, its keys included. Phones drop the column, so there airlines are reached through search.

### Tooltip
- A rail surface with a 1px tip-edge border, 2px corners, 8px 10px 9px padding and a maximum width of 260px. It shows a yellow condensed title, ink detail lines and label-grey overflow lines.

### Status line
- One line of body prose in label grey, with names and counts in warm ink, announced politely to screen readers. It states facts, not instructions it doesn't need: at rest "**3,830** airports, **89,209** routes. Pick one to see where it flies."; for an airport "**Name** (CODE), Country · **78** destinations, **43** airlines". On desktop the line always reserves a key row's height, so a selection never resizes the map. Contextual keys sit on the right and name their outcome: Route to… and Clear for an airport, Swap and each end's "XXX departures" for a pair.

## Do's and Don'ts

### Do:
- **Do** build every new surface from the housing, flap cards and the rail; nothing else exists on this board.
- **Do** reserve sodium yellow (#ffc629) for active, selected, focused or in-flight state.
- **Do** show map density with the quantised grey faces from the density palette, printed over the sea and land faces.
- **Do** make every state change a flip: a fold at the hinge for cells, a drum roll for letters, staggered row by row.
- **Do** keep the map in square cells that move in whole cells.
- **Do** swap state instantly under `prefers-reduced-motion` (no rolls, no ripple, static caret, still traces).
- **Do** credit the route data source in the footer, with the byline (runs in the browser, and the author) opposite it.

### Don't:
- **Don't** fade, slide or scale anything in or out; the board only flips.
- **Don't** add soft gradients, glass, glows or elevation shadows. The only gradient allowed is the hard-stop hinge split of a card.
- **Don't** round corners beyond 2px or use pills and circles; markers are square cells.
- **Don't** draw the whole route network at once or add a glowing globe; arcs belong only to the current scene or the few ambient traces.
- **Don't** introduce a second accent hue or tint the density cards.
- **Don't** set prose in Barlow Condensed or on flap tiles; tiles carry short uppercase values only.
