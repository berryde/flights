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

/** A run of characters in the last column; airline codes carry the airline they open. */
type Token = { text: string; airline?: number };

type Row = {
	key: string;
	cells: string[];
	/** When set, the last column is built from these, and each airline code is its own key. */
	airlines?: Token[];
	label: string;
	tone?: "active" | "dim";
	highlight: number[];
	onSelect: () => void;
};

const NONE: Selection = { kind: "none" };

/** Examples the empty search suggests, mixing airlines, cities and codes. */
const HINTS = ["QANTAS", "TOKYO", "EMIRATES", "LIMA", "JNB", "RYANAIR"];

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

// Words that can't end a cut name: "Santiago de" reads as a mistake, "Santiago" doesn't.
const DANGLING = new Set(["de", "del", "da", "do", "dos", "das", "di", "du", "des", "la", "le", "las", "los", "of", "the", "and", "&", "y", "e", "am", "an", "im", "upon", "on", "st", "st.", "ste", "ste.", "saint", "sainte", "san", "santa", "são", "port", "fort", "new", "el", "al"]);

/** Whole words that fit a column, never a word cut in half or left hanging. */
function fit(text: string, room: number) {
	const t = SHORT_COUNTRY[text] ?? text;
	if (t.length <= room) return t;
	const words: string[] = [];
	for (const word of t.split(/[\s-]+/)) {
		if ([...words, word].join(" ").length > room) break;
		words.push(word);
	}
	while (words.length > 1 && DANGLING.has(words[words.length - 1].toLowerCase())) words.pop();
	return words.join(" ") || t.slice(0, room);
}

/** "Toronto City Centre", "Johannesburg International": the city, unless the name already says it. */
function airportTitle(a: { name: string; city: string }) {
	return a.name.toLowerCase().includes(a.city.toLowerCase()) ? a.name : `${a.city} ${a.name}`;
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
	return useMemo(() => {
		const gutter = size.w < 700 ? 16 : 40;
		const inner = size.w - gutter * 2;
		if (size.w >= 700) {
			const wide = size.w >= 1000;
			const fw = wide
				? Math.max(16, Math.min(28, Math.floor(inner / 52), Math.floor(size.h / 34)))
				: Math.max(14, Math.min(26, Math.floor(inner / 36)));
			// Like a real board, the columns run the housing's full width: the name and the
			// last column (airlines or country) take whatever the code and time leave.
			const room = Math.floor((inner - 3 * Math.ceil(fw * 0.8) + 2) / (fw + 2)) - 8;
			const name = Math.max(13, Math.min(24, Math.round(room * 0.58)));
			return {
				gutter,
				fw,
				columns: [name, 3, 5, room - name],
				search: wide ? 22 : 20,
				rows: wide ? (size.h > 1100 ? 5 : size.h >= 860 ? 4 : 3) : size.h > 900 ? 5 : 4,
				narrow: false,
				// Beside the labels only when the last column has room to spare for it.
				pagerBelow: !wide,
			};
		}
		const fw = Math.max(12, Math.min(20, Math.floor((inner - 30) / 19) - 2));
		return {
			gutter,
			fw,
			columns: [10, 3, 5, 0],
			search: Math.floor((inner + 2) / (fw + 2)),
			// Short phones keep the map worth looking at by showing fewer rows.
			rows: size.h > 760 ? 5 : size.h > 680 ? 4 : 3,
			narrow: true,
			pagerBelow: true,
		};
	}, [size]);
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
	/** The row being previewed, by its index in `rows`: pointed at, focused, tapped once, or found from the map. */
	const [preview, setPreview] = useState<number | null>(null);
	const lastPointer = useRef<string>("mouse");
	/** When the current selection was made: its rows land with their cells, and the board holds still a while. */
	const selectedAt = useRef(0);
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
		setPreview(null);
		selectedAt.current = performance.now();
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
		() => boardRows(network, sel, trips, focusTrip, searching && query.trim() ? hits : null, activeHit, layout.columns, {
			select,
			pick,
			setFocusTrip,
		}),
		[network, sel, trips, focusTrip, searching, query, hits, activeHit, layout.columns, select, pick],
	);

	const perPage = layout.rows;
	const pages = Math.max(1, Math.ceil(rows.length / perPage));
	const shownPage = Math.min(page, pages - 1);
	const visible = rows.slice(shownPage * perPage, shownPage * perPage + perPage);
	useEffect(() => setPage(0), [heading]);

	// Like a real board, long lists page on their own, unless someone is reading, or has
	// just chosen something and is matching the first rows to the map.
	useEffect(() => {
		if (pages < 2 || paused || searching || preview != null) return;
		const t = window.setInterval(() => {
			if (performance.now() - selectedAt.current > 15000) setPage((p) => (p + 1) % pages);
		}, 8000);
		return () => window.clearInterval(t);
	}, [pages, paused, searching, preview]);

	const previewFromMap = useRef(false);
	const previewRow = useCallback(
		(index: number | null, fromMap = false) => {
			previewFromMap.current = fromMap && index != null;
			setPreview(index);
			setRowHover(index == null ? [] : (rows[index]?.highlight ?? []));
		},
		[rows],
	);

	// Pointing at a lit cell on the map finds its row: the board pages to it and lights it.
	const selecting = sel.kind !== "none" && !(searching && query.trim());
	const onMapHover = useCallback(
		(airports: number[]) => {
			if (!selecting) return;
			const index = airports.length ? rows.findIndex((r) => r.highlight.some((a) => airports.includes(a))) : -1;
			if (index < 0) {
				if (previewFromMap.current) previewRow(null);
				return;
			}
			setPage(Math.floor(index / perPage));
			previewRow(index, true);
		},
		[selecting, rows, perPage, previewRow],
	);

	// Rows of an airport's departures (or an airline's airports) flip in as their cells land.
	const fresh = performance.now() - selectedAt.current < 2500;
	const rowDelay = (i: number, lands?: number) => (lands != null ? Math.max(0, lands * 1000 - 250) : i * 90);

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
	// Until the visitor picks something, the empty search flips through real examples, so it's
	// plain that airlines are searchable too, not just airports.
	const [hint, setHint] = useState(0);
	const explored = useRef(false);
	if (sel.kind !== "none") explored.current = true;
	const hinting = !explored.current && !searching && sel.kind === "none" && searchFor === "any";
	useEffect(() => {
		if (!hinting) return;
		const t = window.setInterval(() => setHint((h) => h + 1), 4500);
		return () => window.clearInterval(t);
	}, [hinting]);
	const prompt = layout.search >= 18 ? "AIRPORT OR AIRLINE" : "CITY OR AIRLINE";
	const placeholder =
		searchFor === "to" ? "TO: CITY OR CODE" : hinting && hint % 2 ? `TRY: ${HINTS[((hint - 1) / 2) % HINTS.length]}` : prompt;

	// The pager belongs to the rows it pages: it names which rows are showing, out of how many.
	const pager = pages > 1 && (
		<div className="pager-keys" role="group" aria-label="Pages">
			<button type="button" className="key" onClick={() => setPage((shownPage - 1 + pages) % pages)} aria-label={`Previous ${perPage} rows`}>
				<Icon name="prev" />
			</button>
			<span className="pager">
				{shownPage * perPage + 1}–{Math.min(rows.length, (shownPage + 1) * perPage)} of {rows.length}
			</span>
			<button type="button" className="key" onClick={() => setPage((shownPage + 1) % pages)} aria-label={`Next ${perPage} rows`}>
				<Icon name="next" />
			</button>
		</div>
	);

	const toggleSound = () => {
		setSound(!soundOn());
		setSoundState(soundOn());
	};

	// Off by default: most visitors are somewhere quiet. A small key beside search, not a label.
	const soundKey = (
		<button type="button" className="key" aria-pressed={sound} aria-label="Board sound" title={sound ? "Sound on" : "Sound off"} onClick={toggleSound}>
			<Icon name={sound ? "soundOn" : "soundOff"} />
		</button>
	);

	const style = {
		"--gutter": `${layout.gutter}px`,
		"--fw": `${layout.fw}px`,
		"--fh": `${Math.round(layout.fw * 1.45)}px`,
		"--fw-title": `${Math.round(layout.fw * (layout.narrow ? 1.35 : 1.3))}px`,
	} as React.CSSProperties;

	return (
		<main className="board" style={style}>
			<header className="board-head">
				<div className="head-title">
					<h1 className="board-title">
						<FlapText text="FLIGHTS" length={7} stagger={70} label="Flights" className="flaps-title" />
					</h1>
					{layout.narrow && soundKey}
				</div>
				<div className="head-search">
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
							// Clicking away keeps what was typed for when the visitor comes back; Escape clears it.
							onBlur={() => {
								setSearching(false);
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
								else if (e.key === "Escape") {
									setQuery("");
									input.current?.blur();
								}
							}}
						/>
					</div>
				{!layout.narrow && soundKey}
				</div>
			</header>

			<Status network={network} error={error} sel={sel} trips={trips} narrow={layout.narrow} actions={{
				setDestination: () => {
					setQuery("");
					setSearchFor("to");
					input.current?.focus();
				},
				swap: () => sel.kind === "pair" && select({ kind: "pair", a: sel.b, b: sel.a }),
				flyOn: () => sel.kind === "pair" && select({ kind: "airport", a: sel.b }),
				back: () => sel.kind === "pair" && select({ kind: "airport", a: sel.a }),
				clear: () => select(NONE),
			}} />

			{network ? (
				<Matrix network={network} scene={scene} highlight={rowHover} describe={describe} onPick={onPick} onHover={onMapHover} ready />
			) : (
				<div className="matrix matrix-loading" aria-hidden="true" />
			)}

			<section
				className={`departures ${sel.kind !== "none" && !(searching && query.trim()) ? "is-selection" : ""}`}
				aria-labelledby="departures-heading"
				onPointerEnter={() => setPaused(true)}
				onPointerLeave={(e) => {
					setPaused(false);
					if (e.pointerType === "mouse") previewRow(null);
				}}
				onFocus={() => setPaused(true)}
				onBlur={() => setPaused(false)}
			>
				<h2 id="departures-heading" className="sr-only">
					{heading}
				</h2>
				<div className="departures-head">
					<div className="departures-labels" aria-hidden="true">
						{columns.map((c, i) =>
							layout.columns[i] ? (
								<span key={i} style={{ width: `calc(${layout.columns[i]} * (var(--fw) + 2px) - 2px)` }}>
									{c}
								</span>
							) : null,
						)}
					</div>
					{!layout.pagerBelow && pager}
				</div>
				<ul id="departures" className="departures-rows" role={searching ? "listbox" : "list"}>
					{Array.from({ length: perPage }, (_, i) => {
						const row = visible[i];
						const index = shownPage * perPage + i;
						const lands = fresh && shownPage === 0 && (sel.kind === "airport" || sel.kind === "airline") && row ? scene.timing.get(row.highlight[0]) : undefined;
						return (
							<li
								key={i}
								className={`departure-row ${row ? "" : "is-empty"} ${row?.tone ? `tone-${row.tone}` : ""} ${row && preview === index ? "is-previewed" : ""}`}
								role={searching ? "option" : undefined}
								id={`row-${index}`}
								aria-selected={searching ? index === activeHit : undefined}
								onPointerEnter={(e) => e.pointerType === "mouse" && row && previewRow(index)}
							>
								<button
									type="button"
									className="departure"
									disabled={!row}
									aria-label={row?.label}
									tabIndex={searching ? -1 : undefined}
									// Keep the search open while a result is being clicked.
									onMouseDown={(e) => searching && e.preventDefault()}
									onPointerDown={(e) => (lastPointer.current = e.pointerType)}
									onClick={() => {
										if (!row) return;
										// On touch there's no hover: the first tap previews the row on the map, the second opens it.
										if (lastPointer.current !== "mouse" && !searching && selecting && preview !== index) return previewRow(index);
										row.onSelect();
									}}
									onFocus={(e) => row && e.currentTarget.matches(":focus-visible") && previewRow(index)}
								>
									{layout.columns.map((len, c) =>
										len && !(c === 3 && row?.airlines) ? (
											<FlapText
												key={c}
												text={row?.cells[c] ?? ""}
												length={len}
												// Start rolling a little early so the row settles as its cell lands.
												delay={rowDelay(i, lands) + c * 40}
												label=""
												className={c === 2 ? "flaps-time" : ""}
											/>
										) : null,
									)}
								</button>
								{row?.airlines && layout.columns[3] > 0 && (
									<AirlineKeys
										tokens={row.airlines}
										length={layout.columns[3]}
										delay={rowDelay(i, lands) + 120}
										focusable={!searching}
										describe={(l) => network!.airlines[l].name ?? network!.airlines[l].code}
										onOpen={(l) => select({ kind: "airline", l })}
									/>
								)}
							</li>
						);
					})}
				</ul>
				{layout.pagerBelow && pager}
				{!rows.length && network && (
					<p className="departures-empty" role="status">
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
				<p className="credit byline">
					No server: every route is worked out in your browser. By{" "}
					<a href="https://berryde.com" rel="author">
						Dan Berry
					</a>
				</p>
			</footer>
		</main>
	);
}

/**
 * The last column when it lists airlines: the same run of flaps, but each code is its own
 * key that opens that airline's network.
 */
function AirlineKeys({
	tokens,
	length,
	delay,
	focusable,
	describe,
	onOpen,
}: {
	tokens: Token[];
	length: number;
	delay: number;
	focusable: boolean;
	describe: (airline: number) => string;
	onOpen: (airline: number) => void;
}) {
	let at = 0;
	const parts = tokens.map((t, k) => {
		const start = at;
		at += t.text.length;
		const flaps = <FlapText text={t.text} length={t.text.length} delay={delay + start * 18} label="" />;
		return t.airline == null ? (
			<span key={k}>{flaps}</span>
		) : (
			<button
				key={k}
				type="button"
				className="airline-key"
				tabIndex={focusable ? undefined : -1}
				aria-label={`${describe(t.airline)} (${t.text}): show its network`}
				title={`${describe(t.airline)}: show its network`}
				onClick={() => onOpen(t.airline!)}
			>
				{flaps}
			</button>
		);
	});
	return (
		<span className="airline-keys">
			{parts}
			{at < length && <FlapText text="" length={length - at} delay={delay + at * 18} label="" />}
		</span>
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
	let keys: [label: string, run: () => void, describe?: string][] = [];
	if (error) text = `The route data didn't load (${error}). Reload to try again.`;
	else if (!network) text = "Loading the world’s routes…";
	else {
		const ap = (a: number) => network.airports[a];
		if (sel.kind === "none")
			text = (
				<>
					<b>{count(network.airports.length)}</b> airports, <b>{count(network.catalog.count)}</b> routes. {narrow ? "Tap" : "Pick"} one to see
					where it flies.
				</>
			);
		else if (sel.kind === "airport") {
			const legs = network.legsFrom(sel.a);
			const airlines = new Set(legs.flatMap((l) => l.airlines)).size;
			text = (
				<>
					<b>{airportTitle(ap(sel.a))}</b> ({ap(sel.a).code}){narrow ? "" : `, ${ap(sel.a).country}`} · <b>{legs.length}</b>{" "}
					{legs.length === 1 ? "destination" : "destinations"}
					{/* Phones keep it to the name and the count; the rows carry the airlines. */}
					{!narrow && (
						<>
							, <b>{airlines}</b> {airlines === 1 ? "airline" : "airlines"}
						</>
					)}
				</>
			);
			keys = [
				["Route to…", actions.setDestination, `Find routes from ${ap(sel.a).code} to another airport`],
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
				// Either end's own departures, named the same way, so neither reads as "back".
				["Swap", actions.swap, `Swap: ${ap(sel.b).city} to ${ap(sel.a).city}`],
				[`${ap(sel.a).code} departures`, actions.back, `Show every departure from ${ap(sel.a).city}`],
				[`${ap(sel.b).code} departures`, actions.flyOn, `Show every departure from ${ap(sel.b).city}`],
			];
		} else {
			const al = network.airlines[sel.l];
			const net = network.airlineNetwork(sel.l);
			text = (
				<>
					<b>{al.name ?? al.code}</b> ({al.code}) · <b>{net.airports.length}</b> airports, <b>{count(network.airlineRouteCount[sel.l])}</b> routes
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
					{keys.map(([label, fn, describe]) => (
						<button key={label} type="button" className="key key-wide" onClick={fn} aria-label={describe}>
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
	/** Characters per column, so names are cut to whole words that fit the flaps actually shown. */
	widths: number[],
	act: { select: (s: Selection) => void; pick: (h: SearchHit) => void; setFocusTrip: (n: number) => void },
): { rows: Row[]; columns: string[]; heading: string } {
	if (!network) return { rows: [], columns: ["Destination", "Code", "Time", "Airlines"], heading: "Departures" };
	const ap = (a: number) => network.airports[a];
	const narrow = !widths[3];
	const [name, place] = [widths[0], widths[3] || 9];
	/** As many airline codes as fit, then "+N" for the rest. */
	const codes = (ls: number[], room: number, sep = " "): Token[] => {
		const out: Token[] = [];
		let used = 0;
		for (let i = 0; i < ls.length; i++) {
			const code = network.airlines[ls[i]].code;
			const more = ls.length - i;
			const next = used + (out.length ? sep.length : 0) + code.length;
			if (next > room || (more > 1 && next > room - 3)) {
				out.push({ text: `${out.length ? " " : ""}+${more}` });
				break;
			}
			if (out.length) out.push({ text: sep });
			out.push({ text: code, airline: ls[i] });
			used = next;
		}
		return out;
	};
	const joined = (ts: Token[]) => ts.map((t) => t.text).join("");

	if (hits) {
		return {
			heading: "Search results",
			columns: ["Matches", "Code", "Routes", "Country"],
			rows: hits.map((h, i) => {
				if (h.kind === "airport") {
					const a = ap(h.index);
					return {
						key: `s-a${h.index}`,
						cells: [fit(a.city, name), a.code, String(network.routesFrom(h.index)), fit(a.country, place)],
						label: `${airportTitle(a)}, ${a.country} (${a.code}), ${network.routesFrom(h.index)} routes`,
						tone: i === activeHit ? "active" : undefined,
						highlight: [h.index],
						onSelect: () => act.pick(h),
					};
				}
				const l = network.airlines[h.index];
				return {
					key: `s-l${h.index}`,
					cells: [fit(l.name ?? l.code, name), l.code, String(network.airlineRouteCount[h.index]), "Airline"],
					label: `Airline ${l.name ?? l.code} (${l.code}), ${network.airlineRouteCount[h.index]} routes`,
					tone: i === activeHit ? "active" : undefined,
					highlight: [],
					onSelect: () => act.pick(h),
				};
			}),
		};
	}

	if (sel.kind === "none") {
		return {
			heading: "Airports with the most routes",
			columns: ["Most routes", "Code", "Routes", "Country"],
			// The data has no passenger numbers, so the board ranks by what it does have: routes out.
			rows: network.airports
				.slice(0, 80)
				.sort((x, y) => network.routesFrom(y.index) - network.routesFrom(x.index) || x.index - y.index)
				.slice(0, 60)
				.map((a) => ({
					key: `n${a.index}`,
					cells: [fit(a.city, name), a.code, String(network.routesFrom(a.index)), fit(a.country, place)],
					label: `${airportTitle(a)} (${a.code}): ${network.routesFrom(a.index)} routes to ${network.destinations[a.index]} destinations. Show them.`,
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
			heading: `Departures from ${airportTitle(ap(sel.a))} (${ap(sel.a).code}), shortest flight first`,
			columns: [narrow ? `From ${ap(sel.a).code}` : `Departures from ${ap(sel.a).code}`, "Code", narrow ? "Time" : "Flight time", "Airlines"],
			rows: legs.map((l) => {
				const airlines = codes(l.airlines, place);
				return {
					key: `d${l.to}`,
					cells: [fit(ap(l.to).city, name), ap(l.to).code, formatMinutes(l.minutes), joined(airlines)],
					airlines,
					label: `${ap(l.to).city} (${ap(l.to).code}), ${l.minutes ? formatMinutes(l.minutes) : "flight time unknown"}, ${
						l.airlines.map((x) => network.airlines[x].name ?? network.airlines[x].code).join(", ") || "airline not listed"
					}. Show this route.`,
					highlight: [l.to],
					onSelect: () => act.select({ kind: "pair", a: sel.a, b: l.to }),
				};
			}),
		};
	}

	if (sel.kind === "pair") {
		return {
			heading: `${ap(sel.a).city} to ${ap(sel.b).city}`,
			columns: [`${ap(sel.a).code} to ${ap(sel.b).code}`, "Via", "In air", "Airlines"],
			rows: trips.map((t, i) => {
				const via = t.stops.slice(1, -1);
				// Nonstop: everyone who flies it. With stops: who flies each leg, leg by leg.
				const airlines =
					t.legs.length === 1
						? codes(t.legs[0].airlines, place)
						: t.legs.flatMap((l, k): Token[] => [
								...(k ? [{ text: "/" }] : []),
								l.airlines.length ? { text: network.airlines[l.airlines[0]].code, airline: l.airlines[0] } : { text: "--" },
							]);
				return {
					airlines,
					key: `t${t.stops.join("-")}`,
					cells: [
						via.length === 0 ? "Nonstop" : via.length === 1 ? `Via ${ap(via[0]).city}` : `Via ${via.map((v) => ap(v).code).join(" ")}`,
						via.length ? ap(via[0]).code : "---",
						formatMinutes(t.minutes),
						joined(airlines),
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
		// Spelled out: at label size "QF" reads as "OF".
		columns: [`${fit(network.airlines[sel.l].name ?? network.airlines[sel.l].code, narrow ? 12 : 24)} airports`, "Code", "Routes", "Country"],
		rows: net.airports.map(({ airport, routes }) => ({
			key: `l${airport}`,
			cells: [fit(ap(airport).city, name), ap(airport).code, String(routes), fit(ap(airport).country, place)],
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
