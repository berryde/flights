import { memo, useEffect, useRef } from "react";
import { clack } from "./sound";

// The order the cards are printed on the drum. A character rolls forward through it to
// reach its target, as on a real board.
const DRUM = " ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-:/'&+→";
const STEP = 46; // ms per card
const MAX_STEPS = 9;

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function normalise(ch: string) {
	const up = ch
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toUpperCase();
	return DRUM.includes(up) ? up : up === "" ? " " : up === "," ? "." : up === "(" || up === ")" ? " " : "-";
}

function path(from: string, to: string): string[] {
	if (from === to) return [];
	const a = DRUM.indexOf(from);
	const b = DRUM.indexOf(to);
	const out: string[] = [];
	let i = a < 0 ? 0 : a;
	const distance = (b - i + DRUM.length) % DRUM.length;
	// Long rolls skip ahead: the eye only reads the last few cards before it lands.
	if (distance > MAX_STEPS) i = (b - MAX_STEPS + DRUM.length) % DRUM.length;
	while (i !== b) {
		i = (i + 1) % DRUM.length;
		out.push(DRUM[i]);
	}
	return out;
}

/**
 * One split-flap character. The top half shows the next card, the bottom the last; on
 * each step the old top folds down and the new bottom swings into place.
 */
export const FlapChar = memo(function FlapChar({ ch, delay = 0 }: { ch: string; delay?: number }) {
	const ref = useRef<HTMLSpanElement>(null);
	const shown = useRef(" ");

	useEffect(() => {
		const el = ref.current!;
		const [top, bottom, foldTop, foldBottom] = Array.from(el.children) as HTMLSpanElement[];
		const set = (half: HTMLSpanElement, c: string) => {
			(half.firstChild as HTMLSpanElement).textContent = c;
		};
		const target = normalise(ch);
		if (reducedMotion()) {
			shown.current = target;
			for (const half of [top, bottom, foldTop, foldBottom]) set(half, target);
			return;
		}
		const cards = path(shown.current, target);
		if (!cards.length) return;
		let i = 0;
		let timer = 0;
		const step = () => {
			const prev = shown.current;
			const next = cards[i++];
			shown.current = next;
			set(top, next);
			set(bottom, prev);
			set(foldTop, prev);
			set(foldBottom, next);
			foldTop.animate([{ transform: "rotateX(0deg)" }, { transform: "rotateX(-90deg)" }], {
				duration: STEP / 2,
				easing: "cubic-bezier(.5,0,1,.6)",
				fill: "forwards",
			});
			foldBottom
				.animate([{ transform: "rotateX(90deg)" }, { transform: "rotateX(0deg)" }], {
					duration: STEP / 2,
					delay: STEP / 2,
					easing: "cubic-bezier(0,.4,.5,1)",
					fill: "both",
				})
				.addEventListener("finish", () => set(bottom, next));
			if (i === cards.length) clack(0, 0.35);
			if (i < cards.length) timer = window.setTimeout(step, STEP);
		};
		timer = window.setTimeout(step, delay);
		return () => window.clearTimeout(timer);
	}, [ch, delay]);

	return (
		<span ref={ref} className="flap" aria-hidden="true">
			<span className="flap-half flap-top">
				<span> </span>
			</span>
			<span className="flap-half flap-bottom">
				<span> </span>
			</span>
			<span className="flap-half flap-top flap-fold">
				<span> </span>
			</span>
			<span className="flap-half flap-bottom flap-fold">
				<span> </span>
			</span>
		</span>
	);
});

/**
 * A fixed-width run of flaps. `text` is padded or cut to `length`; `stagger` spreads the
 * characters' start times so a row ripples rather than snapping all at once.
 */
export function FlapText({
	text,
	length,
	stagger = 18,
	delay = 0,
	className = "",
	label,
}: {
	text: string;
	length: number;
	stagger?: number;
	delay?: number;
	className?: string;
	/** Accessible text; defaults to `text`. */
	label?: string;
}) {
	const chars = Array.from(text.slice(0, length).padEnd(length, " "));
	return (
		<span
			className={`flap-row ${className}`}
			{...((label ?? text).trim() ? { role: "img", "aria-label": (label ?? text).trim() } : { "aria-hidden": true })}
		>
			{chars.map((c, i) => (
				<FlapChar key={i} ch={c} delay={delay + i * stagger} />
			))}
		</span>
	);
}
