---
version: 1
slug: "src-app-tsx"
primary_target: "src/App.tsx"
related_targets: []
---

# Explorer (main surface)

Scope: the whole app at `/projects/flights/`, a single explorer surface. Mode: Experience.

Audience/job: portfolio visitors exploring for a minute or two (see PRODUCT.md). Map does the talking: minimal chrome. Tech budget: anything goes, smooth on a modern phone. Must not open on an unreadable hairball of 89k lines (user concern); the opening shows the network's structure, and interaction narrows it.

Capabilities on this surface: airport selection (map + search), airline network view, A-to-B (direct + shortest connections by flying time).

Memorable moment: select an airport and the board flips outward from it, destinations turning yellow in the order the flights would land.

Unresolved: deep-linkable URLs (undecided in PRODUCT.md); sound is opt-in only.

## Direction contract

THESIS: The world's flight network shown as a Solari split-flap departures board. The map itself is a matrix of physical flap cells, and every change of state is a flip. It refuses the category default of a dark glowing globe with neon arcs, and the hairball of every route drawn at once.

OWN-WORLD: Matte black board housing (#0d0d0d), flap cards in charcoal (#1e1e1e) split by a hairline gap, warm-white flap ink (#f4f1e8), and one sodium-yellow (#ffc629) reserved for whatever is active. Rest-state density uses four or five quantised grey flap shades, like printed cards rather than a gradient. Condensed signage caps (Barlow Condensed) on individual flap tiles; tiny tracked caps for column labels. No rounded cards, glass, gradients or shadows: everything is a flap, a row of flaps, or the housing.

STORY: Visitors see the whole world assembled from flaps, read hubs as the brightest clusters, tap one (or type into the flap search) and watch its network flip in. They follow a row onward to another airport, look at an airline's network, or ask A-to-B and get direct routes or the quickest connections.

FIRST VIEWPORT: Desktop 1440×900. Top-left: FLIGHTS in large flap tiles. Top-right: a flap-row search field. Centre: the flap-matrix world, about 170×58 cells, edge to edge inside the gutter, taking about two-thirds of the height. Bottom: departure rows with labelled columns (DESTINATION, FLIGHT TIME, AIRLINES), large flaps, paging like a real board. At rest the rows list the busiest airports as starting points.

FORM: Split-flap departures board, position 1 on the round-2 grounded list (Impeccable's pick, chosen by the user). seed:c1891e9e9b21dd35. Signature interaction: the time-true ripple, where a selection flips destination cells yellow with delay proportional to flight minutes while great-circle arcs draw on. Motion grammar: every change is a flip (cells, letters, rows), and letters roll through intermediate characters. No fades or slides. Reduced motion swaps instantly.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
