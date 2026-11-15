// The files written by pipeline/build.py. See its docstring for the layout.

export type Catalog = {
	generatedAt: string;
	/** When the source file was downloaded: how current the routes are. */
	downloadedAt: string;
	/** Number of routes: the length of each column in routes.bin. */
	count: number;
	columns: string[];
	/** The value of a route's airline when the source doesn't name one. */
	noAirline: number;
	/** Columns, one entry per airport, the one with the most routes first. */
	airports: {
		code: string[];
		name: string[];
		city: string[];
		country: string[];
		lat: number[];
		lon: number[];
	};
	/** Columns, one entry per airline. */
	airlines: { code: string[]; name: string[] };
	sources: string[];
};

/**
 * One airline flying one way between two airports, as indices into the catalog.
 * Sorted by origin then destination, so one airport pair's airlines are adjacent.
 */
export type Routes = {
	from: Uint16Array;
	to: Uint16Array;
	airline: Uint16Array;
	/** Scheduled flight time. */
	minutes: Uint16Array;
};

export type FlightData = { catalog: Catalog; routes: Routes };

const DATA = `${import.meta.env.BASE_URL}data/`;

async function get(file: string): Promise<Response> {
	const response = await fetch(DATA + file);
	if (!response.ok) throw new Error(`${file}: ${response.status}`);
	return response;
}

export async function loadFlightData(): Promise<FlightData> {
	const [catalog, buffer] = await Promise.all([
		get("catalog.json").then((r) => r.json() as Promise<Catalog>),
		get("routes.bin").then((r) => r.arrayBuffer()),
	]);
	const column = (name: string) => {
		const index = catalog.columns.indexOf(name);
		if (index < 0) throw new Error(`routes.bin has no "${name}" column`);
		return new Uint16Array(buffer, index * catalog.count * 2, catalog.count);
	};
	return {
		catalog,
		routes: {
			from: column("from"),
			to: column("to"),
			airline: column("airline"),
			minutes: column("minutes"),
		},
	};
}
