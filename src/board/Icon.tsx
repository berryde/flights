// The few drawn marks the board's keys need, in one 1.75px stroke.
const PATHS = {
	plus: "M8 3v10M3 8h10",
	minus: "M3 8h10",
	prev: "M10 3 5 8l5 5",
	next: "M6 3l5 5-5 5",
	soundOn: "M2 6h3l4-3v10l-4-3H2zM11.5 6a3 3 0 0 1 0 4M13 4a6 6 0 0 1 0 8",
	soundOff: "M2 6h3l4-3v10l-4-3H2zM11.5 6l4 4M15.5 6l-4 4",
} as const;

export function Icon({ name }: { name: keyof typeof PATHS }) {
	return (
		<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="square" aria-hidden="true">
			<path d={PATHS[name]} />
		</svg>
	);
}
