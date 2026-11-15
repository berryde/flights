import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlapText } from "./board/Flap";
import { Icon } from "./board/Icon";
import { type Arc, Matrix, type Role, type Scene } from "./board/Matrix";
import { setSound, soundOn } from "./board/sound";
import { loadFlightData } from "./data/catalog";
import { type Itinerary, type Network, type SearchHit, buildNetwork, formatMinutes } from "./data/network";

type Selection =
	| { kind: "none" }
	| { kind: "airport"; a: number }
	| { kind: "pair"; a: number; b: number }
	| { kind: "airline"; l: number };

type Row = {
	key: string;
	cells: string[];
	label: string;
	tone?: "active" | "dim";
	highlight: number[];
	onSelect: () => void;
};

const NONE: Selection = { kind: "none" };

const SHORT_COUNTRY: Record<string, string> = {
	"United Arab Emirates": "UAE",
	"United Kingdom": "UK",
	"United States": "USA",
	"Democratic Republic of the Congo": "DR Congo",
	"Bosnia and Herzegovina": "Bosnia",
	"Papua New Guinea": "PNG",
	"Saint Vincent and the Grenadines": "St Vincent",
	"Trinidad and Tobago": "Trinidad",
	"Antigua and Barbuda": "Antigua",
	"Saint Kitts and Nevis": "St Kitts",
	"Turks and Caicos Islands": "Turks Caicos",
	"Central African Republic": "CAR",
	"Dominican Republic": "Dominican Rep",
};

/** Whole words that fit a column, never a word cut in half. */
function fit(text: string, room: number) {
	const t = SHORT_COUNTRY[text] ?? text;
	if (t.length <= room) return t;
	let out = "";
	for (const word of t.split(/[\s-]+/)) {
		const next = out ? `${out} ${word}` : word;
		if (next.length > room) break;
		out = next;
	}
	return out || t.slice(0, room);
}
const count = (n: number) => n.toLocaleString("en-GB");

/** The board's proportions follow the window: tile size, how many characters each column holds. */
function useLayout() {
	const [size, setSize] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
	useEffect(() => {
		const on = () => setSize({ w: window.innerWidth, h: window.innerHeight });
		window.addEventListener("resize", on);
		return () => window.removeEventListener("resize", on);
	}, []);
	const gutter = size.w < 700 ? 16 : 40;
	const inner = size.w - gutter * 2;
	if (size.w >= 1000) {
		const fw = Math.max(16, Math.min(28, Math.floor(inner / 52), Math.floor(size.h / 34)));
		return { gutter, fw, columns: [17, 3, 5, 9], search: 22, rows: size.h > 1100 ? 5 : size.h > 960 ? 4 : 3, narrow: false };
	}
	if (size.w >= 700) {
		const fw = Math.max(14, Math.min(26, Math.floor(inner / 36)));
		return { gutter, fw, columns: [13, 3, 5, 6], search: 20, rows: size.h > 900 ? 5 : 4, narrow: false };
	}
	const fw = Math.max(12, Math.min(20, Math.floor((inner - 30) / 19) - 2));
	return {
		gutter,
		fw,
		columns: [10, 3, 5, 0],
		search: Math.floor((inner + 2) / (fw + 2)),
		rows: size.h > 760 ? 5 : 4,
		narrow: true,
	};
}

export function App() {
	const [network, setNetwork] = useState<Network>();
	const [error, setError] = useState<string>();
	const [sel, setSel] = useState<Selection>(NONE);
	const [focusTrip, setFocusTrip] = useState(0);
	const [query, setQuery] = useState("");
	const [searching, setSearching] = useState(false);
	const [searchFor, setSearchFor] = useState<"any" | "to">("any");
	const [activeHit, setActiveHit] = useState(0);
	const [page, setPage] = useState(0);
	const [paused, setPaused] = useState(false);
	const [rowHover, setRowHover] = useState<number[]>([]);
	const [sound, setSoundState] = useState(false);
	const input = useRef<HTMLInputElement>(null);
	const layout = useLayout();

	useEffect(() => {
		loadFlightData().then(
			(data) => setNetwork(buildNetwork(data)),
			(e: unknown) => setError(e instanceof Error ? e.message : String(e)),
		);
	}, []);

	const select = useCallback((next: Selection) => {
		setSel(next);
		setFocusTrip(0);
		setPage(0);
		setRowHover([]);
	}, []);

	// "/" jumps to search, Escape steps back out of whatever is open.
	useEffect(() => {
		const on = (e: KeyboardEvent) => {
			if (e.key === "/" && document.activeElement !== input.current) {
				e.preventDefault();
				setSearchFor("any");
				input.current?.focus();
			}
			if (e.key === "Escape" && document.activeElement !== input.current) select(NONE);
		};
		window.addEventListener("keydown", on);
		return () => window.removeEventListener("keydown", on);
	}, [select]);

	const trips: Itinerary[] = useMemo(
		() => (network && sel.kind === "pair" ? network.connections(sel.a, sel.b) : []),
		[network, sel],
	);

	const scene: Scene = useMemo(() => buildScene(network, sel, trips, focusTrip), [network, sel, trips, focusTrip]);

	const hits: SearchHit[] = useMemo(() => {
		if (!network || !query.trim()) return [];
		const all = network.search(query, 40);
		return searchFor === "to" ? all.filter((h) => h.kind === "airport") : all;
	}, [network, query, searchFor]);

	const pick = useCallback(
		(hit: SearchHit) => {
			setQuery("");
			input.current?.blur();
			if (hit.kind === "airline") select({ kind: "airline", l: hit.index });
			else if (searchFor === "to" && sel.kind === "airport" && hit.index !== sel.a)
				select({ kind: "pair", a: sel.a, b: hit.index });
			else select({ kind: "airport", a: hit.index });
			setSearchFor("any");
		},
		[searchFor, sel, select],
	);

	const onPick = useCallback(
		(here: number[]) => {
			if (!network) return;
			if (sel.kind === "airport") {
				const dests = new Set(network.legsFrom(sel.a).map((l) => l.to));
				const dest = here.find((a) => dests.has(a));
				if (dest != null) return select({ kind: "pair", a: sel.a, b: dest });
				if (here.includes(sel.a)) return;
			}
			select({ kind: "airport", a: here[0] });
		},
		[network, sel, select],
	);

	// What the departure rows list, and what their columns are called.
	const { rows, columns, heading } = useMemo(
		() => boardRows(network, sel, trips, focusTrip, searching && query.trim() ? hits : null, activeHit, {
			select,
			pick,
			setFocusTrip,
		}),
		[network, sel, trips, focusTrip, searching, query, hits, activeHit, select, pick],
	);

	const perPage = layout.rows;
	const pages = Math.max(1, Math.ceil(rows.length / perPage));
	const shownPage = Math.min(page, pages - 1);
	const visible = rows.slice(shownPage * perPage, shownPage * perPage + perPage);
	useEffect(() => setPage(0), [heading]);

	// Like a real board, long lists page on their own, unless someone is reading.
	useEffect(() => {
		if (pages < 2 || paused || searching) return;
		const t = window.setInterval(() => setPage((p) => (p + 1) % pages), 8000);
		return () => window.clearInterval(t);
	}, [pages, paused, searching]);

	const describe = useCallback((a: number) => describeAirport(network!, sel, a), [network, sel]);

	const searchText = searching
		? query
		: !network
			? ""
			: sel.kind === "airport"
				? `${network.airports[sel.a].city} ${network.airports[sel.a].code}`
				: sel.kind === "pair"
					? `${network.airports[sel.a].code} → ${network.airports[sel.b].code}`
					: sel.kind === "airline"
						? network.airlines[sel.l].name ?? network.airlines[sel.l].code
						: "";
	const placeholder = searchFor === "to" ? "TO: CITY OR CODE" : layout.narrow ? "SEARCH" : "AIRPORT OR AIRLINE";

	const toggleSound = () => {
		setSound(!soundOn());
		setSoundState(soundOn());
	};

	const style = {
		"--gutter": `${layout.gutter}px`,
		"--fw": `${layout.fw}px`,
		"--fh": `${Math.round(layout.fw * 1.45)}px`,
		"--fw-title": `${Math.round(layout.fw * (layout.narrow ? 1.35 : 1.3))}px`,
	} as React.CSSProperties;

	return (
		<main className="board" style={style}>
			<header className="board-head">
				<h1 className="board-title">
					<FlapText text="FLIGHTS" length={7} stagger={70} label="Flights" className="flaps-title" />
				</h1>
				<div className={`search ${searching ? "is-typing" : ""}`}>
					<label htmlFor="search" className="sr-only">
						{searchFor === "to" ? "Destination airport" : "Search airports and airlines"}
					</label>
					<FlapText
						text={searchText || placeholder}
						length={layout.search}
						stagger={12}
						className={`flaps-search ${searchText ? (searching ? "" : "tone-active") : "tone-dim"}`}
						label=""
					/>
					{searching && <span className="search-caret" style={{ left: `calc(${Math.min(query.length, layout.search - 1)} * (var(--fw) + 2px))` }} />}
					<input
						ref={input}
						id="search"
						className="search-input"
						autoComplete="off"
						spellCheck={false}
						value={query}
						maxLength={layout.search - 1}
						disabled={!network}
						role="combobox"
						aria-expanded={searching && hits.length > 0}
						aria-controls="departures"
						aria-activedescendant={searching && hits.length ? `row-${activeHit}` : undefined}
						onFocus={() => setSearching(true)}
						onBlur={() => {
							setSearching(false);
							setQuery("");
							setSearchFor("any");
						}}
						onChange={(e) => {
							setQuery(e.target.value);
							setActiveHit(0);
							setPage(0);
						}}
						onKeyDown={(e) => {
							if (e.key === "ArrowDown") {
								e.preventDefault();
								const n = Math.min(hits.length - 1, activeHit + 1);
								setActiveHit(n);
								setPage(Math.floor(n / perPage));
							} else if (e.key === "ArrowUp") {
								e.preventDefault();
								const n = Math.max(0, activeHit - 1);
								setActiveHit(n);
								setPage(Math.floor(n / perPage));
							} else if (e.key === "Enter" && hits[activeHit]) pick(hits[activeHit]);
							else if (e.key === "Escape") input.current?.blur();
						}}
					/>
				</div>
			</header>

			<Status network={network} error={error} sel={sel} trips={trips} narrow={layout.narrow} actions={{
				setDestination: () => {
					setSearchFor("to");
					input.current?.focus();
				},
				swap: () => sel.kind === "pair" && select({ kind: "pair", a: sel.b, b: sel.a }),
				flyOn: () => sel.kind === "pair" && select({ kind: "airport", a: sel.b }),
				back: () => sel.kind === "pair" && select({ kind: "airport", a: sel.a }),
				clear: () => select(NONE),
			}} />

			{network ? (
				<Matrix network={network} scene={scene} highlight={rowHover} describe={describe} onPick={onPick} ready />
			) : (
				<div className="matrix matrix-loading" aria-hidden="true" />
			)}

			<section
				className={`departures ${sel.kind !== "none" && !(searching && query.trim()) ? "is-selection" : ""}`}
				aria-labelledby="departures-heading"
				onPointerEnter={() => setPaused(true)}
				onPointerLeave={() => {
					setPaused(false);
					setRowHover([]);
				}}
				onFocus={() => setPaused(true)}
				onBlur={() => setPaused(false)}
			>
				<h2 id="departures-heading" className="sr-only">
					{heading}
				</h2>
				<div className="departures-labels" aria-hidden="true">
					{columns.map((c, i) =>
						layout.columns[i] ? (
							<span key={i} style={{ width: `calc(${layout.columns[i]} * (var(--fw) + 2px) - 2px)` }}>
								{c}
							</span>
						) : null,
					)}
				</div>
				<ul id="departures" className="departures-rows" role={searching ? "listbox" : "list"}>
					{Array.from({ length: perPage }, (_, i) => {
						const row = visible[i];
						const index = shownPage * perPage + i;
						return (
							<li key={i} role={searching ? "option" : undefined} id={`row-${index}`} aria-selected={searching ? index === activeHit : undefined}>
								<button
									type="button"
									className={`departure ${row?.tone ? `tone-${row.tone}` : ""}`}
									disabled={!row}
									aria-label={row?.label}
									tabIndex={searching ? -1 : undefined}
									// Keep the search open while a result is being clicked.
									onMouseDown={(e) => searching && e.preventDefault()}
									onClick={() => row?.onSelect()}
									onPointerEnter={() => setRowHover(row?.highlight ?? [])}
									onFocus={() => setRowHover(row?.highlight ?? [])}
								>
									{layout.columns.map((len, c) =>
										len ? (
											<FlapText
												key={c}
												text={row?.cells[c] ?? ""}
												length={len}
												delay={i * 90 + c * 40}
												label=""
												className={c === 2 ? "flaps-time" : ""}
											/>
										) : null,
									)}
								</button>
							</li>
						);
					})}
				</ul>
				{!rows.length && network && (
					<p className="departures-empty">
						{searching && query.trim()
							? `Nothing matches “${query.trim()}”. Try a city, an airport name or a three-letter code.`
							: sel.kind === "pair"
								? "No way to get there in three flights or fewer on this network."
								: ""}
					</p>
				)}
			</section>

			<footer className="board-foot">
				<p className="credit">
					Route data from{" "}
					<a href="https://github.com/Jonty/airline-route-data" target="_blank" rel="noreferrer">
						airline-route-data
					</a>{" "}
					by Jonty Wareing, via flightsfrom.com
					{network ? ` · updated ${new Date(network.catalog.downloadedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}` : ""}
				</p>
				<div className="foot-keys">
					{pages > 1 && (
						<>
							<button type="button" className="key" onClick={() => setPage((shownPage - 1 + pages) % pages)} aria-label="Previous page">
								<Icon name="prev" />
							</button>
							<span className="pager" aria-live="polite">
								{shownPage + 1}/{pages}
							</span>
							<button type="button" className="key" onClick={() => setPage((shownPage + 1) % pages)} aria-label="Next page">
								<Icon name="next" />
							</button>
						</>
					)}
					<button type="button" className="key key-wide" aria-pressed={sound} onClick={toggleSound}>
						Sound {sound ? "on" : "off"}
					</button>
				</div>
			</footer>
		</main>
	);
}

function Status({
	network,
	error,
	sel,
	trips,
	narrow,
	actions,
}: {
	network?: Network;
	error?: string;
	sel: Selection;
	trips: Itinerary[];
	narrow: boolean;
	actions: Record<"setDestination" | "swap" | "flyOn" | "back" | "clear", () => void>;
}) {
	let text: React.ReactNode;
	let keys: [string, () => void][] = [];
	if (error) text = `The route data didn't load (${error}). Reload to try again.`;
	else if (!network) text = "Loading the world’s routes…";
	else {
		const ap = (a: number) => network.airports[a];
		if (sel.kind === "none")
			text = (
				<>
					<b>{count(network.airports.length)}</b> airports, <b>{count(network.catalog.count)}</b> routes, a few traced at a time. Brighter
					cards are busier
					{narrow ? "; tap one, drag to pan" : ": pick one"}, or search.
				</>
			);
		else if (sel.kind === "airport") {
			const legs = network.legsFrom(sel.a);
			const airlines = new Set(legs.flatMap((l) => l.airlines)).size;
			text = (
				<>
					<b>{ap(sel.a).name}</b>, {ap(sel.a).country} · <b>{legs.length}</b> nonstop destinations on <b>{airlines}</b> airlines, landing in
					the order the flights would.
				</>
			);
			keys = [
				["Set destination", actions.setDestination],
				["Clear", actions.clear],
			];
		} else if (sel.kind === "pair") {
			const best = trips[0];
			const via = best && best.stops.length > 2 ? best.stops.slice(1, -1).map((s) => ap(s).code).join(" & ") : "";
			text = (
				<>
					<b>
						{ap(sel.a).city} to {ap(sel.b).city}
					</b>{" "}
					·{" "}
					{!best
						? "no connection within three flights"
						: best.stops.length === 2
							? `nonstop, ${formatMinutes(best.legs[0].minutes).toLowerCase()} in the air`
							: `no nonstop; quickest via ${via}, ${formatMinutes(best.minutes).toLowerCase()} in the air${best.partial ? " or more" : ""} plus layovers`}
				</>
			);
			keys = [
				["Swap", actions.swap],
				[`From ${ap(sel.b).code}`, actions.flyOn],
				[`Back to ${ap(sel.a).code}`, actions.back],
			];
		} else {
			const al = network.airlines[sel.l];
			const net = network.airlineNetwork(sel.l);
			text = (
				<>
					<b>{al.name ?? al.code}</b> ({al.code}) · <b>{net.airports.length}</b> airports, <b>{net.pairs.length}</b> routes
				</>
			);
			keys = [["Clear", actions.clear]];
		}
	}
	return (
		<div className="status">
			<p aria-live="polite">{text}</p>
			{keys.length > 0 && (
				<div className="status-keys">
					{keys.map(([label, fn]) => (
						<button key={label} type="button" className="key key-wide" onClick={fn}>
							{label}
						</button>
					))}
				</div>
			)}
		</div>
	);
}

// ---- Scenes: what lights up on the board for each kind of selection ----

const RIPPLE = 1.7; // seconds for the longest flight's cell to land

function buildScene(network: Network | undefined, sel: Selection, trips: Itinerary[], focus: number): Scene {
	const roles = new Map<number, Role>();
	const timing = new Map<number, number>();
	const arcs: Arc[] = [];
	if (!network || sel.kind === "none") return { key: "none", roles, timing, dimFrom: null, arcs, focus: null };

	if (sel.kind === "airport") {
		const legs = network.legsFrom(sel.a);
		const est = (l: (typeof legs)[number]) => l.minutes || network.distanceKm(l.from, l.to) / 13 + 30;
		const longest = Math.max(1, ...legs.map(est));
		roles.set(sel.a, "origin");
		timing.set(sel.a, 0);
		const weight = legs.length > 260 ? "faint" : "normal";
		for (const l of legs) {
			// Time-true: each destination lands in proportion to how long the flight takes.
			const t = 0.2 + (est(l) / longest) * RIPPLE;
			roles.set(l.to, "active");
			timing.set(l.to, t);
			arcs.push({ from: sel.a, to: l.to, delay: 0.12, duration: t - 0.12, weight });
		}
		return { key: `a${sel.a}`, roles, timing, dimFrom: sel.a, arcs, focus: sel.a };
	}

	if (sel.kind === "pair") {
		roles.set(sel.a, "origin");
		roles.set(sel.b, "origin");
		timing.set(sel.a, 0);
		const shown = trips.slice(0, 12);
		shown.forEach((trip, k) => {
			const isFocus = k === focus;
			trip.legs.forEach((leg, j) => {
				const start = j * 0.55 + (isFocus ? 0 : 0.4 + k * 0.05);
				arcs.push({ from: leg.from, to: leg.to, delay: start, duration: 0.55, weight: isFocus ? "focus" : "faint" });
				if (leg.to !== sel.b) {
					const prev = roles.get(leg.to);
					if (isFocus || !prev) roles.set(leg.to, isFocus ? "active" : "muted");
					timing.set(leg.to, Math.min(timing.get(leg.to) ?? Infinity, start + 0.55));
				}
			});
		});
		const lastFocusLeg = shown[focus]?.legs.length ?? 1;
		timing.set(sel.b, lastFocusLeg * 0.55);
		return { key: `p${sel.a}-${sel.b}-${focus}`, roles, timing, dimFrom: sel.a, arcs, focus: sel.b };
	}

	const net = network.airlineNetwork(sel.l);
	const hub = net.airports[0]?.airport ?? 0;
	const far = Math.max(1, ...net.airports.map((x) => network.distanceKm(hub, x.airport)));
	net.airports.forEach(({ airport }, i) => {
		roles.set(airport, i < 3 && net.airports.length > 6 ? "origin" : "active");
		timing.set(airport, 0.15 + (network.distanceKm(hub, airport) / far) * RIPPLE);
	});
	const weight = net.pairs.length > 300 ? "faint" : "normal";
	for (const [a, b] of net.pairs) {
		const [from, to] = network.distanceKm(hub, a) <= network.distanceKm(hub, b) ? [a, b] : [b, a];
		const start = timing.get(from) ?? 0;
		arcs.push({ from, to, delay: start, duration: Math.max(0.3, (timing.get(to) ?? 1) - start), weight });
	}
	return { key: `l${sel.l}`, roles, timing, dimFrom: hub, arcs, focus: hub };
}

// ---- Rows: the departure board under the map ----

function boardRows(
	network: Network | undefined,
	sel: Selection,
	trips: Itinerary[],
	focusTrip: number,
	hits: SearchHit[] | null,
	activeHit: number,
	act: { select: (s: Selection) => void; pick: (h: SearchHit) => void; setFocusTrip: (n: number) => void },
): { rows: Row[]; columns: string[]; heading: string } {
	if (!network) return { rows: [], columns: ["Destination", "Code", "Time", "Airlines"], heading: "Departures" };
	const ap = (a: number) => network.airports[a];
	const codes = (ls: number[], room = 9) => {
		const all = ls.map((l) => network.airlines[l].code);
		let out = "";
		for (let i = 0; i < all.length; i++) {
			const more = all.length - i;
			const next = out ? `${out} ${all[i]}` : all[i];
			if (next.length > room || (more > 1 && next.length > room - 3)) return `${out} +${more}`.trim();
			out = next;
		}
		return out;
	};

	if (hits) {
		return {
			heading: "Search results",
			columns: ["Match", "Code", "Dest.", "Country"],
			rows: hits.map((h, i) => {
				if (h.kind === "airport") {
					const a = ap(h.index);
					return {
						key: `s-a${h.index}`,
						cells: [fit(a.city, 17), a.code, String(network.destinations[h.index]), fit(a.country, 9)],
						label: `${a.name}, ${a.city}, ${a.country} (${a.code}), ${network.destinations[h.index]} nonstop destinations`,
						tone: i === activeHit ? "active" : undefined,
						highlight: [h.index],
						onSelect: () => act.pick(h),
					};
				}
				const l = network.airlines[h.index];
				return {
					key: `s-l${h.index}`,
					cells: [l.name ?? l.code, l.code, String(network.airlineRouteCount[h.index]), "Airline"],
					label: `Airline ${l.name ?? l.code} (${l.code})`,
					tone: i === activeHit ? "active" : undefined,
					highlight: [],
					onSelect: () => act.pick(h),
				};
			}),
		};
	}

	if (sel.kind === "none") {
		return {
			heading: "Busiest airports",
			columns: ["Busiest airports", "Code", "Dest.", "Country"],
			rows: network.airports.slice(0, 60).map((a) => ({
				key: `n${a.index}`,
				cells: [fit(a.city, 17), a.code, String(network.destinations[a.index]), fit(a.country, 9)],
				label: `${a.name}, ${a.city} (${a.code}): ${network.destinations[a.index]} nonstop destinations. Show its routes.`,
				highlight: [a.index],
				onSelect: () => act.select({ kind: "airport", a: a.index }),
			})),
		};
	}

	if (sel.kind === "airport") {
		const legs = network
			.legsFrom(sel.a)
			.slice()
			.sort((x, y) => (x.minutes || 1e9) - (y.minutes || 1e9) || ap(x.to).city.localeCompare(ap(y.to).city));
		return {
			heading: `Departures from ${ap(sel.a).city}`,
			columns: ["Destination", "Code", "Time", "Airlines"],
			rows: legs.map((l) => ({
				key: `d${l.to}`,
				cells: [fit(ap(l.to).city, 17), ap(l.to).code, formatMinutes(l.minutes), codes(l.airlines)],
				label: `${ap(l.to).city} (${ap(l.to).code}), ${l.minutes ? formatMinutes(l.minutes) : "flight time unknown"}, ${
					l.airlines.map((x) => network.airlines[x].name ?? network.airlines[x].code).join(", ") || "airline not listed"
				}. Show this route.`,
				highlight: [l.to],
				onSelect: () => act.select({ kind: "pair", a: sel.a, b: l.to }),
			})),
		};
	}

	if (sel.kind === "pair") {
		return {
			heading: `${ap(sel.a).city} to ${ap(sel.b).city}`,
			columns: ["Route", "Via", "In air", "Airlines"],
			rows: trips.map((t, i) => {
				const via = t.stops.slice(1, -1);
				return {
					key: `t${t.stops.join("-")}`,
					cells: [
						via.length === 0 ? "Nonstop" : via.length === 1 ? `Via ${ap(via[0]).city}` : `Via ${via.map((v) => ap(v).code).join(" ")}`,
						via.length ? ap(via[0]).code : "---",
						formatMinutes(t.minutes),
						t.legs
							.map((l) => (l.airlines.length ? network.airlines[l.airlines[0]].code : "--"))
							.filter((c, k, all) => c !== all[k - 1])
							.join("/"),
					],
					label: `${via.length ? `Via ${via.map((v) => ap(v).city).join(" and ")}` : "Nonstop"}, ${formatMinutes(t.minutes)} in the air${
						t.partial ? " or more" : ""
					}. ${t.legs.map((l) => `${ap(l.from).code} to ${ap(l.to).code}: ${l.airlines.map((x) => network.airlines[x].code).join(", ") || "airline not listed"}`).join("; ")}.`,
					tone: i === focusTrip ? "active" : undefined,
					highlight: t.stops,
					onSelect: () => act.setFocusTrip(i),
				};
			}),
		};
	}

	const net = network.airlineNetwork(sel.l);
	return {
		heading: `${network.airlines[sel.l].name ?? network.airlines[sel.l].code} network`,
		columns: ["Airport", "Code", "Routes", "Country"],
		rows: net.airports.map(({ airport, routes }) => ({
			key: `l${airport}`,
			cells: [fit(ap(airport).city, 17), ap(airport).code, String(routes), fit(ap(airport).country, 9)],
			label: `${ap(airport).city} (${ap(airport).code}): ${routes} routes from here. Show all its routes.`,
			highlight: [airport],
			onSelect: () => act.select({ kind: "airport", a: airport }),
		})),
	};
}

function describeAirport(network: Network, sel: Selection, a: number) {
	const p = network.airports[a];
	const title = `${p.code} · ${p.city}`;
	if (sel.kind === "airport" && a !== sel.a) {
		const leg = network.legsFrom(sel.a).find((l) => l.to === a);
		if (leg)
			return {
				title,
				detail: `${leg.minutes ? formatMinutes(leg.minutes).toLowerCase() : "nonstop"} from ${network.airports[sel.a].code} · ${
					leg.airlines.map((l) => network.airlines[l].code).join(" ") || "airline not listed"
				} · click for the route`,
			};
		return { title, detail: `${p.name} · no nonstop from ${network.airports[sel.a].code} · click to switch` };
	}
	return { title, detail: `${p.name} · ${network.destinations[a]} nonstop destinations` };
}
