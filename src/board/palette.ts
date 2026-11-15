// The printed faces a cell's flap can show. Density is quantised into a few grey cards,
// the way a real board's flaps are printed, never a continuous ramp.

export const PALETTE = [
	"#191918", // 0 blank card
	"#2f2e2b", // 1 a quiet airport or two
	"#4d4b45", // 2
	"#7a776d", // 3
	"#b3afa3", // 4
	"#ece7da", // 5 the great hubs
	"#232220", // 6 dimmed: has airports, but outside the current selection
	"#ffc629", // 7 in the selection
	"#fff8e6", // 8 the origin, or the ends of a journey
	"#8a6a12", // 9 in the selection, but not the focus
] as const;

export const C = {
	blank: 0,
	dim: 6,
	active: 7,
	origin: 8,
	muted: 9,
} as const;

/** Grey card for a cell, from the number of nonstop destinations its airports share. */
export function densityColor(weight: number) {
	if (weight <= 0) return C.blank;
	if (weight < 6) return 1;
	if (weight < 24) return 2;
	if (weight < 70) return 3;
	if (weight < 160) return 4;
	return 5;
}
