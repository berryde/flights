// The printed faces a cell's flap can show. Density is quantised into a few grey cards,
// the way a real board's flaps are printed, never a continuous ramp.

export const PALETTE = [
	"#0d0d0c", // 0 sea: barely a card, so the continents stand off the housing
	"#3b3935", // 1 a quiet airport or two
	"#58554e", // 2
	"#817d72", // 3
	"#b5b1a5", // 4
	"#ece7da", // 5 the great hubs
	"#2b2a27", // 6 dimmed: quiet airports outside the current selection
	"#ffc629", // 7 in the selection
	"#fff8e6", // 8 the origin, or the ends of a journey
	"#8a6a12", // 9 in the selection, but not the focus
	"#232220", // 10 land with no airport
	"#3b3935", // 11 dimmed: busy airports outside the current selection
] as const;

export const C = {
	sea: 0,
	land: 10,
	dim: 6,
	dimBusy: 11,
	active: 7,
	origin: 8,
	muted: 9,
} as const;

/** Grey card for a cell, from the number of nonstop destinations its airports share. */
export function densityColor(weight: number) {
	// Roughly log-spaced, so the small airports that trace coasts and inland
	// routes print a visible card rather than one barely off the land.
	if (weight < 3) return 1;
	if (weight < 12) return 2;
	if (weight < 45) return 3;
	if (weight < 150) return 4;
	return 5;
}

/** The face an airport cell drops to when it's outside the selection: one of two quiet steps, so hubs still show. */
export function dimColor(weight: number) {
	return weight < 45 ? C.dim : C.dimBusy;
}
