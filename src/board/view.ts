// The board's geometry: a fixed grid of flap cells over an equirectangular world.
// Cells are taller than wide (like real flaps), which offsets some of the projection's
// horizontal stretch at mid-latitudes.

export type Grid = { cols: number; rows: number; cellW: number; cellH: number };

/** What part of the world the grid shows. `dpc` is degrees per cell, in both axes. */
export type View = { lon: number; lat: number; dpc: number };

// Svalbard to Tierra del Fuego: every airport in the data, nothing but ocean beyond.
export const NORTH = 80;
export const SOUTH = -56;
const LAT_SPAN = NORTH - SOUTH;
const MIN_ZOOM_OUT = 1;
export const MAX_ZOOM = 32;

export const wrapLon = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;

/** The view that shows the whole world, or the full height of it on a tall, narrow screen. */
export function fitView(grid: Grid, centerLon = 11): View {
	const byHeight = LAT_SPAN / grid.rows;
	const byWidth = 360 / grid.cols;
	// On a portrait phone, fitting the width would leave most rows empty; fit the
	// height instead and let the visitor pan east and west.
	// On a wide board, fill the width and let a little of the far north and south crop
	// (they pan back into view); never so much that Sydney or Cape Town fall off.
	const dpc = byWidth > byHeight * 1.6 ? byHeight : Math.max(byWidth, byHeight * 0.85);
	return { lon: centerLon, lat: (NORTH + SOUTH) / 2, dpc };
}

export function clampView(grid: Grid, v: View, base: View): View {
	const dpc = Math.min(base.dpc * MIN_ZOOM_OUT, Math.max(base.dpc / MAX_ZOOM, v.dpc));
	const halfH = (grid.rows * dpc) / 2;
	const lat = halfH * 2 >= LAT_SPAN ? (NORTH + SOUTH) / 2 : Math.min(NORTH - halfH, Math.max(SOUTH + halfH, v.lat));
	return { lon: wrapLon(v.lon), lat, dpc };
}

/** Whether the grid spans the whole globe east to west, in which case nothing repeats. */
export const showsWholeWidth = (grid: Grid, v: View) => grid.cols * v.dpc >= 360;

/** A point's position in fractional cells, or null when it falls outside the world strip. */
export function project(grid: Grid, v: View, lat: number, lon: number): [number, number] | null {
	const dx = wrapLon(lon - v.lon) / v.dpc;
	const x = grid.cols / 2 + dx;
	const y = grid.rows / 2 + (v.lat - lat) / v.dpc;
	return [x, y];
}

export function unproject(grid: Grid, v: View, x: number, y: number): [number, number] {
	return [v.lat - (y - grid.rows / 2) * v.dpc, wrapLon(v.lon + (x - grid.cols / 2) * v.dpc)];
}

/** Zoom by `factor` (2 = in) keeping the point under cell (x, y) still. */
export function zoomAt(grid: Grid, v: View, base: View, factor: number, x: number, y: number): View {
	const [lat, lon] = unproject(grid, v, x, y);
	const dpc = v.dpc / factor;
	const next = { dpc, lon: lon - (x - grid.cols / 2) * dpc, lat: lat + (y - grid.rows / 2) * dpc };
	return clampView(grid, next, base);
}

export type Bins = {
	/** The busiest airport in each cell, or -1. */
	best: Int32Array;
	/** Summed weight of the airports in each cell. */
	weight: Float32Array;
	/** Which cell each airport falls in, or -1 when it's off the board. */
	cellOf: Int32Array;
};

export function bin(grid: Grid, v: View, lats: number[], lons: number[], weights: ArrayLike<number>): Bins {
	const size = grid.cols * grid.rows;
	const best = new Int32Array(size).fill(-1);
	const weight = new Float32Array(size);
	const cellOf = new Int32Array(lats.length).fill(-1);
	const whole = showsWholeWidth(grid, v);
	for (let i = 0; i < lats.length; i++) {
		const p = project(grid, v, lats[i], lons[i]);
		if (!p) continue;
		const cx = Math.floor(p[0]);
		const cy = Math.floor(p[1]);
		if (cx < 0 || cy < 0 || cx >= grid.cols || cy >= grid.rows) continue;
		// When zoomed out past 360°, the edges would repeat the far side: leave them blank.
		if (whole && Math.abs(wrapLon(lons[i] - v.lon)) > 180) continue;
		const c = cy * grid.cols + cx;
		cellOf[i] = c;
		weight[c] += weights[i];
		// Airports are in rank order, so the first one into a cell is its busiest.
		if (best[c] < 0) best[c] = i;
	}
	return { best, weight, cellOf };
}
