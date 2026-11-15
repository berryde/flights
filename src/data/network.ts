// Indexes over the pipeline's route columns, built once in the browser.
import type { FlightData } from "./catalog";

export type Airport = {
	index: number;
	code: string;
	name: string;
	city: string;
	country: string;
	lat: number;
	lon: number;
};

export type Airline = { index: number; code: string; name: string };

/** One airport pair flown in one direction, with everyone who flies it. */
export type Leg = {
	from: number;
	to: number;
	/** Scheduled flight time, or 0 when the source doesn't give one. */
	minutes: number;
	airlines: number[];
};

export type Itinerary = {
	/** Airports in order, origin first, destination last. */
	stops: number[];
	legs: Leg[];
	/** Sum of the legs' flight times (time in the air, not including layovers). */
	minutes: number;
	/** True when a leg has no published flight time, so `minutes` is a lower bound. */
	partial: boolean;
};

export type SearchHit =
	| { kind: "airport"; index: number; score: number }
	| { kind: "airline"; index: number; score: number };

export type Network = ReturnType<typeof buildNetwork>;

export function buildNetwork({ catalog, routes }: FlightData) {
	const A = catalog.airports;
	const airportCount = A.code.length;
	const airports: Airport[] = A.code.map((code, index) => ({
		index,
		code,
		name: A.name[index],
		city: A.city[index],
		country: A.country[index],
		lat: A.lat[index],
		lon: A.lon[index],
	}));
	const airlines: Airline[] = catalog.airlines.code.map((code, index) => ({
		index,
		code,
		name: catalog.airlines.name[index],
	}));

	// Routes are sorted by origin, then destination: one contiguous run per origin.
	const n = catalog.count;
	const fromStart = new Uint32Array(airportCount + 1);
	for (let i = 0; i < n; i++) fromStart[routes.from[i] + 1]++;
	for (let a = 0; a < airportCount; a++) fromStart[a + 1] += fromStart[a];

	const legCache = new Map<number, Leg[]>();
	/** The airports reachable nonstop from `a`, one leg per destination. */
	function legsFrom(a: number): Leg[] {
		let legs = legCache.get(a);
		if (legs) return legs;
		legs = [];
		for (let i = fromStart[a]; i < fromStart[a + 1]; i++) {
			const to = routes.to[i];
			let leg = legs[legs.length - 1];
			if (!leg || leg.to !== to) {
				leg = { from: a, to, minutes: 0, airlines: [] };
				legs.push(leg);
			}
			const m = routes.minutes[i];
			if (m && (!leg.minutes || m < leg.minutes)) leg.minutes = m;
			const airline = routes.airline[i];
			if (airline !== catalog.noAirline && !leg.airlines.includes(airline)) leg.airlines.push(airline);
		}
		legCache.set(a, legs);
		return legs;
	}

	/** Unique nonstop destinations per airport: the measure of how connected it is. */
	const destinations = new Uint16Array(airportCount);
	for (let a = 0; a < airportCount; a++) {
		let count = 0;
		let last = -1;
		for (let i = fromStart[a]; i < fromStart[a + 1]; i++) {
			if (routes.to[i] !== last) count++;
			last = routes.to[i];
		}
		destinations[a] = count;
	}

	/** Routes out of each airport, one per airline per destination: the measure the catalog ranks by. */
	const routesFrom = (a: number) => fromStart[a + 1] - fromStart[a];

	// Rows per airline, as a CSR index.
	const airlineCount = airlines.length;
	const airlineStart = new Uint32Array(airlineCount + 1);
	for (let i = 0; i < n; i++) if (routes.airline[i] !== catalog.noAirline) airlineStart[routes.airline[i] + 1]++;
	for (let l = 0; l < airlineCount; l++) airlineStart[l + 1] += airlineStart[l];
	const airlineRows = new Uint32Array(airlineStart[airlineCount]);
	{
		const fill = airlineStart.slice(0, airlineCount);
		for (let i = 0; i < n; i++) {
			const l = routes.airline[i];
			if (l !== catalog.noAirline) airlineRows[fill[l]++] = i;
		}
	}

	/** An airline's network: its routes as undirected pairs, and how many it flies from each airport. */
	function airlineNetwork(l: number) {
		const pairs = new Map<number, [number, number]>();
		const perAirport = new Map<number, number>();
		for (let k = airlineStart[l]; k < airlineStart[l + 1]; k++) {
			const i = airlineRows[k];
			const a = routes.from[i];
			const b = routes.to[i];
			perAirport.set(a, (perAirport.get(a) ?? 0) + 1);
			const key = a < b ? a * 65536 + b : b * 65536 + a;
			if (!pairs.has(key)) pairs.set(key, a < b ? [a, b] : [b, a]);
		}
		// A destination it only flies into still belongs to its network.
		for (const [a, b] of pairs.values()) {
			if (!perAirport.has(a)) perAirport.set(a, 0);
			if (!perAirport.has(b)) perAirport.set(b, 0);
		}
		const ranked = [...perAirport.entries()].sort((x, y) => y[1] - x[1] || x[0] - y[0]);
		return { pairs: [...pairs.values()], airports: ranked.map(([a, count]) => ({ airport: a, routes: count })) };
	}

	/** Which airports fly nonstop into `b`, and the leg each one flies. */
	function legsInto(b: number): Map<number, Leg> {
		const into = new Map<number, Leg>();
		for (let i = 0; i < n; i++) {
			if (routes.to[i] !== b) continue;
			const a = routes.from[i];
			if (!into.has(a)) {
				const leg = legsFrom(a).find((l) => l.to === b);
				if (leg) into.set(a, leg);
			}
		}
		return into;
	}

	const rad = Math.PI / 180;
	function distanceKm(a: number, b: number) {
		const p = airports[a];
		const q = airports[b];
		const h =
			Math.sin(((q.lat - p.lat) * rad) / 2) ** 2 +
			Math.cos(p.lat * rad) * Math.cos(q.lat * rad) * Math.sin(((q.lon - p.lon) * rad) / 2) ** 2;
		return 2 * 6371 * Math.asin(Math.sqrt(h));
	}
	/** A leg's flight time, estimated from distance when the source doesn't give one. Only used for ranking. */
	const rankMinutes = (leg: Leg) => leg.minutes || Math.round(distanceKm(leg.from, leg.to) / 13 + 30);

	function itinerary(legs: Leg[]): Itinerary {
		return {
			stops: [legs[0].from, ...legs.map((l) => l.to)],
			legs,
			minutes: legs.reduce((s, l) => s + rankMinutes(l), 0),
			partial: legs.some((l) => !l.minutes),
		};
	}

	/**
	 * Ways to get from `a` to `b`: the direct flight if there is one, then the quickest
	 * one-stop connections, falling back to two stops when there are no one-stop options.
	 * Ranked by time in the air; layovers aren't in the data.
	 */
	function connections(a: number, b: number, limit = 24): Itinerary[] {
		if (a === b) return [];
		const out: Itinerary[] = [];
		const fromA = legsFrom(a);
		const direct = fromA.find((l) => l.to === b);
		if (direct) out.push(itinerary([direct]));

		const into = legsInto(b);
		const one: Itinerary[] = [];
		for (const l1 of fromA) {
			if (l1.to === b) continue;
			const l2 = into.get(l1.to);
			if (l2) one.push(itinerary([l1, l2]));
		}
		one.sort((x, y) => x.minutes - y.minutes);
		out.push(...one.slice(0, limit - out.length));

		if (out.length === 0) {
			const two: Itinerary[] = [];
			for (const l1 of fromA) {
				for (const l2 of legsFrom(l1.to)) {
					if (l2.to === a || l2.to === b) continue;
					const l3 = into.get(l2.to);
					if (l3) two.push(itinerary([l1, l2, l3]));
				}
			}
			two.sort((x, y) => x.minutes - y.minutes);
			// The same middle pair reached many ways: keep the quickest of each.
			const seen = new Set<string>();
			for (const it of two) {
				const key = it.stops.slice(1, -1).join("-");
				if (seen.has(key)) continue;
				seen.add(key);
				out.push(it);
				if (out.length >= limit) break;
			}
		}
		return out;
	}

	// Search: normalised haystacks, built once.
	const fold = (s: string) =>
		s
			.normalize("NFD")
			.replace(/[̀-ͯ]/g, "")
			.toUpperCase();
	const airportHay = airports.map((p) => ({ code: p.code, city: fold(p.city), name: fold(p.name), country: fold(p.country) }));
	const airlineRouteCount = Array.from({ length: airlineCount }, (_, l) => airlineStart[l + 1] - airlineStart[l]);
	const airlineHay = airlines.map((l) => ({ code: fold(l.code ?? ""), name: fold(l.name ?? "") }));

	function search(query: string, limit = 12): SearchHit[] {
		const q = fold(query).trim();
		if (!q) return [];
		const hits: SearchHit[] = [];
		const words = q.split(/\s+/);
		airportHay.forEach((h, index) => {
			let score = 0;
			if (h.code === q) score = 1000;
			else if (h.city === q) score = 800;
			else if (h.city.startsWith(q)) score = 600;
			else if (words.every((w) => h.city.includes(w) || h.name.includes(w) || h.country.includes(w))) score = 300;
			else return;
			// Busier airports first among equals; the catalog's order is its ranking.
			hits.push({ kind: "airport", index, score: score - index / airportCount });
		});
		airlineHay.forEach((h, index) => {
			let score = 0;
			if (h.code === q) score = 900;
			else if (h.name === q) score = 850;
			else if (h.name.startsWith(q)) score = 550;
			else if (q.length >= 3 && words.every((w) => h.name.includes(w))) score = 250;
			else return;
			hits.push({ kind: "airline", index, score: score + Math.min(airlineRouteCount[index], 4000) / 4000 });
		});
		hits.sort((x, y) => y.score - x.score);
		return hits.slice(0, limit);
	}

	/** A real route, picked at random: busy airports and busy pairs come up more often, as they should. */
	function randomRoute(): [number, number] {
		const i = Math.floor(Math.random() * n);
		return [routes.from[i], routes.to[i]];
	}

	return {
		catalog,
		randomRoute,
		airports,
		airlines,
		destinations,
		routesFrom,
		airlineRouteCount,
		legsFrom,
		airlineNetwork,
		connections,
		search,
		distanceKm,
	};
}

/** "6H55", the way the board shows flight times. */
export function formatMinutes(m: number) {
	if (!m) return "--";
	return `${Math.floor(m / 60)}H${String(m % 60).padStart(2, "0")}`;
}
