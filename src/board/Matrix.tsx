import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Network } from "../data/network";
import { FlapGrid } from "./FlapGrid";
import { Icon } from "./Icon";
import { type Land, landCells, loadLand } from "./land";
import { C, densityColor, dimColor } from "./palette";
import { clatter } from "./sound";
import { type Bins, type Grid, type View, bin, clampView, fitView, project, showsWholeWidth, wrapLon, zoomAt } from "./view";

export type Role = "origin" | "active" | "muted";

export type Arc = {
	from: number;
	to: number;
	/** Seconds after the scene starts that the arc starts drawing, and how long it takes. */
	delay: number;
	duration: number;
	weight: "focus" | "normal" | "faint";
};

/** What the board should show, independent of zoom: which airports light up, when, and the routes between them. */
export type Scene = {
	key: string;
	roles: Map<number, Role>;
	/** Seconds after the scene starts that each lit airport's cell flips. */
	timing: Map<number, number>;
	/** Unrelated cells drop to a dim card, rippling out from this airport. */
	dimFrom: number | null;
	arcs: Arc[];
	/** Where the view should settle when this scene arrives, if it's off screen. */
	focus: number | null;
};

const ROLE_COLOR: Record<Role, number> = { origin: C.origin, active: C.active, muted: C.muted };
const ROLE_RANK: Record<Role, number> = { origin: 3, active: 2, muted: 1 };

const now = () => performance.now() / 1000;
/** Seconds after a scene starts during which its ripple is still landing. */
const RIPPLE_WINDOW = 2.5;
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function gridFor(width: number, height: number): Grid {
	// About 170 square columns on a laptop; never finer than 6px, so cells stay legible as flaps.
	const cellW = Math.max(6, Math.min(12, Math.floor(width / 170)));
	const cellH = cellW;
	return { cellW, cellH, cols: Math.floor(width / cellW), rows: Math.floor(height / cellH) };
}

type Props = {
	network: Network;
	scene: Scene;
	/** Airports to preview, such as the stops of the row under the pointer: they stay lit while the rest of the selection steps down. */
	highlight: number[];
	describe: (airport: number) => { title: string; detail: string };
	onPick: (airports: number[]) => void;
	/** The airports in the cell under the pointer, or none. */
	onHover?: (airports: number[]) => void;
	ready: boolean;
};

export function Matrix({ network, scene, highlight, describe, onPick, onHover, ready }: Props) {
	const wrapRef = useRef<HTMLDivElement>(null);
	const glRef = useRef<HTMLCanvasElement>(null);
	const inkRef = useRef<HTMLCanvasElement>(null);
	const flaps = useRef<FlapGrid | null>(null);
	const [failed, setFailed] = useState(false);
	const [size, setSize] = useState<{ w: number; h: number } | null>(null);
	const grid = useMemo(() => (size ? gridFor(size.w, size.h) : null), [size]);
	const base = useMemo(() => (grid ? fitView(grid) : null), [grid]);
	const [view, setView] = useState<View | null>(null);
	const sceneStart = useRef(0);
	const intro = useRef(true);
	const [hover, setHover] = useState<{ cell: number; x: number; y: number } | null>(null);

	const lats = useMemo(() => network.airports.map((a) => a.lat), [network]);
	const lons = useMemo(() => network.airports.map((a) => a.lon), [network]);

	// Size the board to its container.
	useEffect(() => {
		const el = wrapRef.current!;
		const ro = new ResizeObserver(([e]) => {
			const { width, height } = e.contentRect;
			setSize((s) => (s && Math.abs(s.w - width) < 1 && Math.abs(s.h - height) < 1 ? s : { w: width, h: height }));
		});
		ro.observe(el);
		return () => ro.disconnect();
	}, []);

	useEffect(() => {
		try {
			flaps.current = new FlapGrid(glRef.current!);
		} catch (e) {
			console.error(e);
			setFailed(true);
		}
	}, []);

	useEffect(() => {
		if (!grid || !size || !flaps.current) return;
		flaps.current.resize(grid.cols, grid.rows, grid.cellW, grid.cellH, size.w, size.h, devicePixelRatio);
		const ink = inkRef.current!;
		ink.width = Math.round(size.w * devicePixelRatio);
		ink.height = Math.round(size.h * devicePixelRatio);
		setView((v) => (v && base ? clampView(grid, v, base) : base));
		// The opening sweep plays once. A later resize repaints the new grid quickly instead,
		// so a layout shift mid-selection never replays the board assembling itself.
	}, [grid, size, base]);

	// The land mask is small and arrives well before the routes; the board waits for it
	// so the first sweep already shows the continents.
	const [land, setLand] = useState<Land | null>(null);
	useEffect(() => {
		let live = true;
		loadLand().then((l) => live && setLand(l));
		return () => {
			live = false;
		};
	}, []);

	const bins: Bins | null = useMemo(
		() => (grid && view ? bin(grid, view, lats, lons, network.destinations) : null),
		[grid, view, lats, lons, network],
	);
	const ground = useMemo(() => (grid && view && land ? landCells(grid, view, land) : null), [grid, view, land]);

	// The board frames each selection itself, unless the visitor has taken the view in hand:
	// a small network zooms in to fill the board, a network that would split across the
	// world's edge recentres on itself, and going back to rest undoes whatever it chose.
	const auto = useRef(false);
	useEffect(() => {
		if (!grid || !base) return;
		setView((v) => {
			if (!v) return v;
			const untouched = auto.current || (v.dpc === base.dpc && v.lat === base.lat && v.lon === base.lon);
			if (scene.focus == null) {
				if (!auto.current) return v;
				auto.current = false;
				return base;
			}
			if (!untouched) return keepInView(v);
			const chosen = frameScene(grid, base, network, scene) ?? centreScene(grid, base, network, scene) ?? keepInView(base);
			auto.current = chosen.lon !== base.lon || chosen.lat !== base.lat || chosen.dpc !== base.dpc;
			return chosen;
		});

		// On a board narrower than the world (a phone, or zoomed in), keep the selection on it.
		function keepInView(v: View): View {
			const focus = scene.focus!;
			if (!showsWholeWidth(grid!, v) && scene.roles.size > 1) {
				// Centre on the selection's whole network so its routes don't fan off one edge.
				let x = 0;
				let y = 0;
				for (const airport of scene.roles.keys()) {
					const lon = (network.airports[airport].lon * Math.PI) / 180;
					x += Math.cos(lon);
					y += Math.sin(lon);
				}
				const origin = network.airports[focus];
				const mean = (Math.atan2(y, x) * 180) / Math.PI;
				// Keep the origin itself on the board.
				const offset = Math.max(-(grid!.cols / 2 - 6) * v.dpc, Math.min((grid!.cols / 2 - 6) * v.dpc, wrapLon(mean - origin.lon)));
				return clampView(grid!, { ...v, lon: origin.lon + offset, lat: origin.lat }, base!);
			}
			const a = network.airports[focus];
			const p = project(grid!, v, a.lat, a.lon)!;
			const margin = 4;
			if (p[0] > margin && p[0] < grid!.cols - margin && p[1] > margin && p[1] < grid!.rows - margin) return v;
			return clampView(grid!, { ...v, lon: a.lon, lat: a.lat }, base!);
		}
	}, [scene, grid, base, network]);

	// At rest the board traces a rolling sample of real routes: each one draws out from
	// its origin, its tail follows it in, and the destination's card flips yellow as it lands.
	type Trace = { from: number; to: number; start: number; dur: number; xy: Float32Array; landed: boolean };
	const ambient = useRef<Trace[]>([]);
	const ambientFrom = useRef(0);
	const restColors = useRef<Uint8Array | null>(null);
	const reverts = useRef<{ cell: number; at: number }[]>([]);
	/** When each cell's scene flip lands (board time), so a preview never cuts a ripple short. */
	const landAt = useRef<Float32Array | null>(null);
	const previewed = useRef<string | null>(null);
	const resting = scene.key === "none";

	// Work out every cell's colour, and when it should flip.
	const paint = useCallback(
		(mode: "scene" | "view") => {
			const g = flaps.current;
			if (!g || !grid || !bins || !ground) return;
			const t = now();
			const size = grid.cols * grid.rows;
			const colors = new Uint8Array(size);
			const delays = new Float32Array(size);
			const roleRank = new Uint8Array(size);
			const instant = reducedMotion();
			const introPaint = intro.current;

			for (const [airport, role] of scene.roles) {
				const c = bins.cellOf[airport];
				if (c < 0 || ROLE_RANK[role] <= roleRank[c]) continue;
				roleRank[c] = ROLE_RANK[role];
				colors[c] = ROLE_COLOR[role];
			}
			let ox = 0;
			let oy = 0;
			if (scene.dimFrom != null) {
				const c = bins.cellOf[scene.dimFrom];
				if (c >= 0) {
					ox = c % grid.cols;
					oy = Math.floor(c / grid.cols);
				}
			}
			for (let c = 0; c < size; c++) {
				if (roleRank[c]) continue;
				const w = bins.weight[c];
				// Sea and empty land never change; airports outside a selection drop a step,
				// keeping the coasts and the big hubs readable around it.
				if (w <= 0) colors[c] = ground[c] ? C.land : C.sea;
				else colors[c] = scene.dimFrom != null ? dimColor(w) : densityColor(w);
			}

			if (!instant) {
				if (intro.current) {
					// First paint: the board sweeps in left to right, each column's cards a little out of step.
					for (let c = 0; c < size; c++) delays[c] = (c % grid.cols) * (1.1 / grid.cols) + Math.random() * 0.25;
					intro.current = false;
				} else if (mode === "scene" || (scene.dimFrom != null && t - sceneStart.current < RIPPLE_WINDOW)) {
					// (A repaint while a scene is still landing keeps the scene's own clock.)
					const elapsed = t - sceneStart.current;
					// Lit airports flip on the scene's own clock (flight time, for an airport's routes);
					// everything else ripples out from the origin.
					const lit = new Float32Array(size).fill(Infinity);
					for (const [airport, s] of scene.timing) {
						const c = bins.cellOf[airport];
						if (c >= 0) lit[c] = Math.min(lit[c], s);
					}
					for (let c = 0; c < size; c++) {
						if (lit[c] !== Infinity) delays[c] = Math.max(0, lit[c] - elapsed);
						else {
							const d = Math.hypot((c % grid.cols) - ox, Math.floor(c / grid.cols) - oy);
							delays[c] = Math.min(0.9, d * 0.007) + Math.random() * 0.06;
						}
					}
				} else {
					for (let c = 0; c < size; c++) delays[c] = Math.random() * 0.14;
				}
			}
			restColors.current = colors;
			landAt.current = new Float32Array(size);
			for (let c = 0; c < size; c++) landAt.current[c] = t + (instant ? 0 : delays[c]);
			previewed.current = null;
			ambient.current = [];
			// Let the board settle before the traces start.
			ambientFrom.current = t + (instant ? 0 : introPaint ? 1.5 : 0.6);
			const changing: number[] = [];
			for (let c = 0; c < size; c++) if (g.target(c) !== colors[c]) changing.push(delays[c]);
			clatter(changing);
			g.set(colors, t, delays);
		},
		[grid, bins, ground, scene],
	);

	// A new scene restarts the clock; the arcs and ripple time from here.
	const lastScene = useRef<string>("");
	useEffect(() => {
		if (!ready) return;
		if (scene.key !== lastScene.current) {
			lastScene.current = scene.key;
			sceneStart.current = now();
			paint("scene");
		} else paint("view");
		kick();
	}, [paint, ready]);

	// Preview: while a row (or a cell) is pointed at, the rest of the selection steps down to
	// sodium-deep and the previewed airports stay yellow. Each cell waits for its own landing.
	const previewSet = useMemo(() => new Set(resting ? [] : highlight), [highlight, resting]);
	useEffect(() => {
		const g = flaps.current;
		const base = restColors.current;
		if (!ready || !g || !bins || !base || resting) return;
		const key = [...previewSet].sort().join(",");
		if (key === (previewed.current ?? "")) return;
		previewed.current = key;
		const colors = base.slice();
		if (previewSet.size) {
			const keep = new Set<number>();
			for (const a of previewSet) if (bins.cellOf[a] >= 0) keep.add(bins.cellOf[a]);
			for (const [airport, role] of scene.roles) {
				const c = bins.cellOf[airport];
				if (c < 0 || role === "origin" || colors[c] === C.origin) continue;
				colors[c] = keep.has(c) ? C.active : C.muted;
			}
		}
		const t = now();
		const lands = landAt.current;
		g.set(colors, t, (c) => (lands ? Math.max(0, lands[c] - t) : 0) + (reducedMotion() ? 0 : Math.random() * 0.05));
		kick();
	}, [previewSet, bins, scene, ready, resting]);

	// The ink layer: routes, drawn on along their great circles.
	const arcPaths = useMemo(() => {
		if (!grid || !view) return [];
		return scene.arcs.map((arc) => routePath(grid, view, network, arc.from, arc.to));
	}, [scene, grid, view, network]);

	const raf = useRef(0);
	const draw = useCallback(() => {
		const g = flaps.current;
		const ink = inkRef.current;
		if (!g || !ink || !grid || !size) return false;
		const t = now();
		g.render(t);

		const ctx = ink.getContext("2d")!;
		const dpr = devicePixelRatio;
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.clearRect(0, 0, ink.width, ink.height);
		const ox = ((size.w - grid.cols * grid.cellW) / 2) * dpr;
		const oy = ((size.h - grid.rows * grid.cellH) / 2) * dpr;
		const sx = grid.cellW * dpr;
		const sy = grid.cellH * dpr;
		ctx.setTransform(sx, 0, 0, sy, ox, oy);
		const elapsed = t - sceneStart.current;
		const instant = reducedMotion();
		let animating = false;
		const order = ["faint", "normal", "focus"] as const;
		// A preview draws the pointed-at routes solid and pushes the others back.
		const weightOf = (arc: Arc) => {
			if (!previewSet.size) return arc.weight;
			const hit = previewSet.size === 1 ? previewSet.has(arc.to) || previewSet.has(arc.from) : previewSet.has(arc.to) && previewSet.has(arc.from);
			return hit ? "focus" : "faint";
		};
		for (const weight of order) {
			ctx.strokeStyle = weight === "faint" ? "rgba(255,198,41,0.16)" : weight === "normal" ? "rgba(255,198,41,0.5)" : "#ffc629";
			ctx.lineWidth = (weight === "focus" ? 2 : weight === "normal" ? 1 : 0.75) / sx;
			ctx.beginPath();
			const tips: [number, number][] = [];
			scene.arcs.forEach((arc, k) => {
				if (weightOf(arc) !== weight) return;
				const xy = arcPaths[k];
				if (!xy) return;
				const progress = instant ? 1 : Math.min(1, Math.max(0, (elapsed - arc.delay) / arc.duration));
				if (progress < 1) animating = true;
				if (progress <= 0) return;
				const count = xy.length / 2;
				const end = Math.max(1, Math.round((count - 1) * progress));
				for (let i = 0; i <= end; i++) {
					const x = xy[i * 2];
					const y = xy[i * 2 + 1] + 0.5;
					const px = xy[(i - 1) * 2];
					if (i === 0 || Math.abs(x - px) > grid.cols / 2) ctx.moveTo(x + 0.5, y);
					else ctx.lineTo(x + 0.5, y);
				}
				if (progress < 1) tips.push([xy[end * 2] + 0.5, xy[end * 2 + 1] + 0.5]);
			});
			ctx.stroke();
			ctx.fillStyle = "#fff8e6";
			for (const [x, y] of tips) ctx.fillRect(x - 0.35, y - 0.3, 0.7, 0.6);
		}

		if (resting && bins && view && t >= ambientFrom.current) {
			const traces = ambient.current;
			const target = Math.round(grid.cols * 0.42);
			if (instant) {
				// Reduced motion: a still sample of routes, drawn whole.
				if (!traces.length)
					while (traces.length < target) {
						const [from, to] = network.randomRoute();
						if (bins.cellOf[from] < 0 || bins.cellOf[to] < 0) continue;
						traces.push({ from, to, start: 0, dur: 1, xy: routePath(grid, view, network, from, to), landed: true });
					}
				ctx.strokeStyle = "rgba(255,198,41,0.35)";
				ctx.lineWidth = 1 / sx;
				ctx.beginPath();
				for (const tr of traces) strokeSpan(ctx, tr.xy, 0, tr.xy.length / 2 - 1, grid.cols);
				ctx.stroke();
			} else {
				// Keep the sky full: the first batch starts mid-flight so the board never looks empty.
				const initial = traces.length === 0;
				let spawned = 0;
				while (traces.length < target && spawned < (initial ? target : 2)) {
					const [from, to] = network.randomRoute();
					if (bins.cellOf[from] < 0 || bins.cellOf[to] < 0 || bins.cellOf[from] === bins.cellOf[to]) continue;
					const km = network.distanceKm(from, to);
					// Most routes are short hops; favour the long ones so the traces read across the board.
					if (Math.random() > Math.min(1, km / 3500)) continue;
					const dur = 1.6 + (km / 12000) * 3.4;
					const start = initial ? t - Math.random() * dur * 1.4 : t + Math.random() * 0.6;
					traces.push({ from, to, start, dur, xy: routePath(grid, view, network, from, to), landed: false });
					spawned++;
				}
				ctx.strokeStyle = "rgba(255,198,41,0.8)";
				ctx.lineWidth = 1.5 / sx;
				ctx.beginPath();
				const heads: [number, number][] = [];
				for (let k = traces.length - 1; k >= 0; k--) {
					const tr = traces[k];
					const head = Math.min(1, (t - tr.start) / tr.dur);
					const tail = Math.min(1, (t - tr.start - tr.dur * 0.85) / tr.dur);
					if (tail >= 1) {
						traces.splice(k, 1);
						continue;
					}
					if (head <= 0) continue;
					const last = tr.xy.length / 2 - 1;
					const hi = Math.round(last * head);
					const lo = Math.max(0, Math.round(last * tail));
					strokeSpan(ctx, tr.xy, lo, hi, grid.cols);
					if (head < 1) heads.push([tr.xy[hi * 2] + 0.5, tr.xy[hi * 2 + 1] + 0.5]);
					else if (!tr.landed) {
						tr.landed = true;
						const c = bins.cellOf[tr.to];
						g.flip(c, C.active, t);
						reverts.current.push({ cell: c, at: t + 1.6 });
					}
				}
				ctx.stroke();
				ctx.fillStyle = "#ffc629";
				for (const [x, y] of heads) ctx.fillRect(x - 0.22, y - 0.22, 0.44, 0.44);
				animating = true;
			}
		}
		// On a board narrower than the world, mark the edge where each route leaves it, so
		// far destinations still register.
		if (view && !resting && !showsWholeWidth(grid, view)) {
			ctx.fillStyle = "#ffc629";
			const marked = new Set<number>();
			scene.arcs.forEach((arc, k) => {
				const xy = arcPaths[k];
				if (!xy || !bins || bins.cellOf[arc.to] >= 0) return;
				if (!instant && elapsed < arc.delay + arc.duration * 0.5) return;
				for (let i = 1; i < xy.length / 2; i++) {
					const x = xy[i * 2];
					if (x >= 0 && x < grid.cols) continue;
					const row = Math.min(grid.rows - 1, Math.max(0, Math.floor(xy[i * 2 + 1])));
					const col = x < 0 ? 0 : grid.cols - 1;
					const key = row * grid.cols + col;
					if (!marked.has(key)) {
						marked.add(key);
						ctx.fillRect(col + 0.12, row + 0.12, 0.76, 0.76);
					}
					break;
				}
			});
		}

		// Landed cards flip back to their density once the trace has gone.
		if (reverts.current.length) {
			const due = reverts.current.filter((r) => r.at <= t);
			reverts.current = reverts.current.filter((r) => r.at > t);
			if (resting && restColors.current)
				for (const r of due) if (g.target(r.cell) === C.active) g.flip(r.cell, restColors.current[r.cell], t);
			if (reverts.current.length) animating = true;
		}

		// Outlines: the cell under the pointer, and the stops of the row under the pointer.
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		const outline = (c: number, color: string) => {
			const x = ox + (c % grid.cols) * sx;
			const y = oy + Math.floor(c / grid.cols) * sy;
			ctx.strokeStyle = color;
			ctx.lineWidth = 1.5 * dpr;
			ctx.strokeRect(x - 1.5 * dpr, y - 1.5 * dpr, sx + 3 * dpr, sy + 3 * dpr);
		};
		if (bins) for (const a of highlight) if (bins.cellOf[a] >= 0) outline(bins.cellOf[a], resting ? "#ffc629" : "#fff8e6");
		if (hover) outline(hover.cell, "#fff8e6");

		return animating || t < g.busyUntil;
	}, [grid, size, scene, arcPaths, bins, highlight, previewSet, hover, resting, view, network]);

	const kick = useCallback(() => {
		cancelAnimationFrame(raf.current);
		const loop = () => {
			if (draw()) raf.current = requestAnimationFrame(loop);
		};
		raf.current = requestAnimationFrame(loop);
	}, [draw]);
	useEffect(() => {
		kick();
		return () => cancelAnimationFrame(raf.current);
	}, [kick]);

	// Pointer: hover, click to pick, drag to pan, wheel and pinch to zoom.
	const cellAt = (clientX: number, clientY: number) => {
		if (!grid || !size) return null;
		const r = wrapRef.current!.getBoundingClientRect();
		const x = (clientX - r.left - (size.w - grid.cols * grid.cellW) / 2) / grid.cellW;
		const y = (clientY - r.top - (size.h - grid.rows * grid.cellH) / 2) / grid.cellH;
		if (x < 0 || y < 0 || x >= grid.cols || y >= grid.rows) return null;
		return { x, y, cell: Math.floor(y) * grid.cols + Math.floor(x), px: clientX - r.left, py: clientY - r.top };
	};
	const airportsIn = (cell: number) => {
		if (!bins) return [];
		const out: number[] = [];
		for (let a = 0; a < bins.cellOf.length; a++) if (bins.cellOf[a] === cell) out.push(a);
		return out;
	};

	const pointers = useRef(new Map<number, { x: number; y: number }>());
	const drag = useRef<{ x: number; y: number; view: View; moved: boolean; pinch?: number } | null>(null);

	const zoom = useCallback(
		(factor: number, at?: { x: number; y: number }) => {
			if (!grid || !base) return;
			auto.current = false;
			setView((v) => (v ? zoomAt(grid, v, base, factor, at?.x ?? grid.cols / 2, at?.y ?? grid.rows / 2) : v));
		},
		[grid, base],
	);
	const wheelAcc = useRef(0);

	useEffect(() => {
		const el = wrapRef.current!;
		const onWheel = (e: WheelEvent) => {
			e.preventDefault();
			wheelAcc.current += e.deltaY * (e.deltaMode === 1 ? 30 : 1);
			if (Math.abs(wheelAcc.current) < 80) return;
			const at = cellAt(e.clientX, e.clientY);
			zoom(wheelAcc.current < 0 ? 2 : 0.5, at ?? undefined);
			wheelAcc.current = 0;
		};
		el.addEventListener("wheel", onWheel, { passive: false });
		return () => el.removeEventListener("wheel", onWheel);
	});

	const onPointerDown = (e: React.PointerEvent) => {
		(e.target as HTMLElement).setPointerCapture(e.pointerId);
		pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
		if (!view) return;
		if (pointers.current.size === 2) {
			const [p, q] = [...pointers.current.values()];
			drag.current = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2, view, moved: true, pinch: Math.hypot(p.x - q.x, p.y - q.y) };
		} else drag.current = { x: e.clientX, y: e.clientY, view, moved: false };
	};
	const onPointerMove = (e: React.PointerEvent) => {
		const hit = cellAt(e.clientX, e.clientY);
		if (e.pointerType === "mouse")
			setHover((h) => (hit && bins && bins.weight[hit.cell] > 0 ? (h?.cell === hit.cell ? h : { cell: hit.cell, x: hit.px, y: hit.py }) : null));
		if (!pointers.current.has(e.pointerId)) return;
		pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
		const d = drag.current;
		if (!d || !grid || !base) return;
		if (d.pinch && pointers.current.size === 2) {
			const [p, q] = [...pointers.current.values()];
			const ratio = Math.hypot(p.x - q.x, p.y - q.y) / d.pinch;
			if (ratio > 1.5 || ratio < 0.66) {
				const at = cellAt(d.x, d.y);
				zoom(ratio > 1 ? 2 : 0.5, at ?? undefined);
				d.pinch = Math.hypot(p.x - q.x, p.y - q.y);
			}
			return;
		}
		const dx = (e.clientX - d.x) / grid.cellW;
		const dy = (e.clientY - d.y) / grid.cellH;
		// A finger wobbles more than a mouse: don't turn a tap into a pan.
		if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < (e.pointerType === "mouse" ? 5 : 10)) return;
		d.moved = true;
		auto.current = false;
		setHover(null);
		// The board moves in whole cells, like a display, not a sliding picture.
		const next = clampView(
			grid,
			{ ...d.view, lon: d.view.lon - Math.round(dx) * d.view.dpc, lat: d.view.lat + Math.round(dy) * d.view.dpc },
			base,
		);
		setView((v) => (v && v.lon === next.lon && v.lat === next.lat ? v : next));
	};
	const onPointerUp = (e: React.PointerEvent) => {
		pointers.current.delete(e.pointerId);
		const d = drag.current;
		if (pointers.current.size > 0) return;
		drag.current = null;
		if (d && !d.moved) {
			const hit = cellAt(e.clientX, e.clientY);
			if (hit) {
				const here = airportsIn(hit.cell);
				if (here.length) onPick(here);
				if (e.pointerType !== "mouse") setHover(here.length ? { cell: hit.cell, x: hit.px, y: hit.py } : null);
			}
		}
	};

	const onKeyDown = (e: React.KeyboardEvent) => {
		if (!grid || !base || !view) return;
		const pan = (dx: number, dy: number) =>
			setView(clampView(grid, { ...view, lon: view.lon + dx * view.dpc * 8, lat: view.lat - dy * view.dpc * 8 }, base));
		const keys: Record<string, () => void> = {
			"+": () => zoom(2),
			"=": () => zoom(2),
			"-": () => zoom(0.5),
			"0": () => setView(base),
			ArrowLeft: () => pan(-1, 0),
			ArrowRight: () => pan(1, 0),
			ArrowUp: () => pan(0, -1),
			ArrowDown: () => pan(0, 1),
		};
		const k = keys[e.key];
		if (k) {
			e.preventDefault();
			auto.current = false;
			k();
		}
	};

	const tip = hover && bins ? airportsIn(hover.cell) : [];
	const hoverKey = tip.join(",");
	const hoverRef = useRef(onHover);
	hoverRef.current = onHover;
	useEffect(() => hoverRef.current?.(hoverKey ? hoverKey.split(",").map(Number) : []), [hoverKey]);
	const tipInfo = tip.length ? describe(tip[0]) : null;
	const zoomLevel = view && base ? Math.round(base.dpc / view.dpc) : 1;

	return (
		<div className="matrix">
			<div
				ref={wrapRef}
				className="matrix-board"
				tabIndex={0}
				role="application"
				aria-roledescription="flight map"
				aria-label="World map of airports drawn as a split-flap board. Use the search above or the departures list to choose airports. Plus and minus zoom, arrow keys pan."
				onPointerDown={onPointerDown}
				onPointerMove={onPointerMove}
				onPointerUp={onPointerUp}
				onPointerCancel={onPointerUp}
				onPointerLeave={(e) => e.pointerType === "mouse" && setHover(null)}
				onKeyDown={onKeyDown}
			>
				<canvas ref={glRef} className="matrix-layer" />
				<canvas ref={inkRef} className="matrix-layer" />
				{failed && <p className="matrix-fallback">This board needs WebGL2, which this browser hasn't made available.</p>}
				{tipInfo && hover && (
					<div
						className="matrix-tip"
						style={{
							left: Math.max(0, Math.min(hover.x + 24, (size?.w ?? 0) - 264)),
							top: hover.y + 28 > (size?.h ?? 0) - 90 ? hover.y - 96 : hover.y + 28,
						}}
					>
						<span className="matrix-tip-title">{tipInfo.title}</span>
						<span className="matrix-tip-detail">{tipInfo.detail}</span>
						{tip.length > 1 && (
							<span className="matrix-tip-more">
								+{tip.length - 1} more here: {tip
									.slice(1, 4)
									.map((a) => network.airports[a].code)
									.join(" ")}
								{tip.length > 4 ? "…" : ""}
								{zoomLevel < 32 ? " · zoom in to separate" : ""}
							</span>
						)}
					</div>
				)}
			</div>
			<div className="matrix-controls" role="group" aria-label="Map zoom">
				{/* Only offered once there's something to undo; it sits left so + and − never move. */}
				{zoomLevel > 1 && (
					<button type="button" className="key key-wide" onClick={() => {
							auto.current = false;
							if (base) setView(base);
						}}>
						Whole world
					</button>
				)}
				<button type="button" className="key" onClick={() => zoom(2)} aria-label="Zoom in" disabled={zoomLevel >= 32}>
					<Icon name="plus" />
				</button>
				<button type="button" className="key" onClick={() => zoom(0.5)} aria-label="Zoom out" disabled={zoomLevel <= 1}>
					<Icon name="minus" />
				</button>
			</div>
		</div>
	);
}

/**
 * A route's path in fractional cells, ending exactly on the centres of its two airports' cells.
 * The cells are the airports' grid squares, not their exact positions, so the ends are pulled to
 * the cell and the correction eased along the line: zoomed in, an arc lands on its card instead
 * of beside it, and an airport's fan of routes meets at its card's centre.
 */
export function routePath(grid: Grid, view: View, network: Network, from: number, to: number): Float32Array {
	const xy = rawRoutePath(grid, view, network, from, to);
	const n = xy.length / 2;
	// Points are drawn at +0.5, so a stored whole number is a cell centre.
	const sx = Math.floor(xy[0]) - xy[0];
	const sy = Math.floor(xy[1]) - xy[1];
	const ex = Math.floor(xy[(n - 1) * 2]) - xy[(n - 1) * 2];
	const ey = Math.floor(xy[(n - 1) * 2 + 1]) - xy[(n - 1) * 2 + 1];
	for (let i = 0; i < n; i++) {
		const t = i / (n - 1);
		xy[i * 2] += sx * (1 - t) + ex * t;
		xy[i * 2 + 1] += sy * (1 - t) + ey * t;
	}
	return xy;
}

function rawRoutePath(grid: Grid, view: View, network: Network, from: number, to: number): Float32Array {
		const a = network.airports[from];
		const b = network.airports[to];
		const pts = greatCircle(a.lat, a.lon, b.lat, b.lon);
		const xy = new Float32Array(pts.length * 2);
		let leaves = false;
		pts.forEach(([la, lo], i) => {
			const p = project(grid, view, la, lo)!;
			xy[i * 2] = p[0];
			xy[i * 2 + 1] = p[1];
			if (p[1] < 0.5 || p[1] > grid.rows - 0.5) leaves = true;
		});
		if (!leaves) return xy;
		// Polar routes climb off the top of a flat board: draw them as a bow between the
		// two cells instead, so every arc lands where it should.
		const n = pts.length;
		const [x0, y0, x1, y1] = [xy[0], xy[1], xy[(n - 1) * 2], xy[(n - 1) * 2 + 1]];
		let dx = x1 - x0;
		if (Math.abs(dx) > grid.cols / 2) dx -= Math.sign(dx) * (360 / view.dpc);
		const dy = y1 - y0;
		const len = Math.hypot(dx, dy) || 1;
		let cx = x0 + dx / 2 + (dy / len) * len * 0.25;
		let cy = y0 + dy / 2 - (Math.abs(dx) / len) * len * 0.25;
		cx = Math.min(grid.cols - 0.5, Math.max(0.5, cx));
		cy = Math.min(grid.rows - 0.5, Math.max(0.5, cy));
		for (let i = 0; i < n; i++) {
			const t = i / (n - 1);
			const u = 1 - t;
			xy[i * 2] = u * u * x0 + 2 * u * t * cx + t * t * (x0 + dx);
			xy[i * 2 + 1] = u * u * y0 + 2 * u * t * cy + t * t * y1;
		}
		return xy;
}

function strokeSpan(ctx: CanvasRenderingContext2D, xy: Float32Array, lo: number, hi: number, cols: number) {
	for (let i = lo; i <= hi; i++) {
		const x = xy[i * 2] + 0.5;
		const y = xy[i * 2 + 1] + 0.5;
		if (i === lo || Math.abs(xy[i * 2] - xy[(i - 1) * 2]) > cols / 2) ctx.moveTo(x, y);
		else ctx.lineTo(x, y);
	}
}

// Points along the great circle between two places, in [lat, lon].
function greatCircle(lat1: number, lon1: number, lat2: number, lon2: number, steps = 48): [number, number][] {
	const r = Math.PI / 180;
	const p1 = [Math.cos(lat1 * r) * Math.cos(lon1 * r), Math.cos(lat1 * r) * Math.sin(lon1 * r), Math.sin(lat1 * r)];
	const p2 = [Math.cos(lat2 * r) * Math.cos(lon2 * r), Math.cos(lat2 * r) * Math.sin(lon2 * r), Math.sin(lat2 * r)];
	const d = Math.acos(Math.min(1, p1[0] * p2[0] + p1[1] * p2[1] + p1[2] * p2[2]));
	if (d < 1e-6) return [[lat1, lon1]];
	const out: [number, number][] = [];
	for (let i = 0; i <= steps; i++) {
		const t = i / steps;
		const a = Math.sin((1 - t) * d) / Math.sin(d);
		const b = Math.sin(t * d) / Math.sin(d);
		const x = a * p1[0] + b * p2[0];
		const y = a * p1[1] + b * p2[1];
		const z = a * p1[2] + b * p2[2];
		out.push([Math.atan2(z, Math.hypot(x, y)) / r, Math.atan2(y, x) / r]);
	}
	return out;
}

/** Zoom in on a selection that only covers a small patch of the board, in whole steps up to 8×. */
function frameScene(grid: Grid, base: View, network: Network, scene: Scene): View | null {
	if (scene.focus == null || scene.roles.size < 2) return null;
	const origin = network.airports[scene.focus];
	let west = Infinity;
	let east = -Infinity;
	let south = Infinity;
	let north = -Infinity;
	for (const airport of scene.roles.keys()) {
		const a = network.airports[airport];
		const dx = wrapLon(a.lon - origin.lon);
		west = Math.min(west, dx);
		east = Math.max(east, dx);
		south = Math.min(south, a.lat);
		north = Math.max(north, a.lat);
	}
	const w = (east - west) / base.dpc;
	const h = (north - south) / base.dpc;
	let zoom = 1;
	// Leave a margin: the network takes at most 60% of the board either way.
	while (zoom < 8 && w * zoom * 2 <= grid.cols * 0.6 && h * zoom * 2 <= grid.rows * 0.6) zoom *= 2;
	if (zoom < 2) return null;
	return clampView(grid, { dpc: base.dpc / zoom, lon: origin.lon + (west + east) / 2, lat: (south + north) / 2 }, base);
}

/**
 * On a board showing the whole world, pick the centre longitude that splits the fewest of the
 * scene's routes across the edge: usually the default, but a Pacific network centres on the Pacific.
 */
function centreScene(grid: Grid, base: View, network: Network, scene: Scene): View | null {
	if (!showsWholeWidth(grid, base) || !scene.arcs.length) return null;
	let x = 0;
	let y = 0;
	for (const airport of scene.roles.keys()) {
		const lon = (network.airports[airport].lon * Math.PI) / 180;
		x += Math.cos(lon);
		y += Math.sin(lon);
	}
	const mean = (Math.atan2(y, x) * 180) / Math.PI;
	const paths = scene.arcs.map((arc) => {
		const a = network.airports[arc.from];
		const b = network.airports[arc.to];
		return greatCircle(a.lat, a.lon, b.lat, b.lon, 24).map(([, lon]) => lon);
	});
	const splits = (centre: number) => {
		let n = 0;
		for (const lons of paths)
			for (let i = 1; i < lons.length; i++)
				if (Math.abs(wrapLon(lons[i] - centre) - wrapLon(lons[i - 1] - centre)) > 180) {
					n++;
					break;
				}
		return n;
	};
	const here = splits(base.lon);
	if (here === 0) return null;
	// Whole-cell steps keep the board's cells where they'd be.
	const centre = base.lon + Math.round(wrapLon(mean - base.lon) / base.dpc) * base.dpc;
	return splits(centre) < here ? clampView(grid, { ...base, lon: centre }, base) : null;
}
