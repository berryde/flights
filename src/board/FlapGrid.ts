// Draws the board's cells with WebGL2: one instanced quad per flap. Each cell holds the
// colour it shows, the colour it's flipping to and when that flip starts; the fragment
// shader folds the top half down over the hinge, the way a split-flap card turns.

import { PALETTE } from "./palette";

const FLIP = 0.17; // seconds per flip

const VERT = `#version 300 es
layout(location=0) in vec2 aCorner;
layout(location=1) in vec3 aFlap; // prev colour, next colour, start time
uniform vec2 uGrid;   // cols, rows
uniform vec2 uCanvas; // device pixels
uniform vec2 uCell;   // device pixels
uniform vec2 uOrigin; // device pixels
out vec2 vUv;
flat out vec3 vFlap;
void main() {
	float id = float(gl_InstanceID);
	float row = floor(id / uGrid.x);
	float col = id - row * uGrid.x;
	vec2 px = uOrigin + (vec2(col, row) + aCorner) * uCell;
	vec2 clip = px / uCanvas * 2.0 - 1.0;
	gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
	vUv = aCorner;
	vFlap = aFlap;
}`;

const FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
flat in vec3 vFlap;
uniform float uTime;
uniform vec2 uCell;
uniform vec3 uPalette[${PALETTE.length}];
uniform vec3 uHousing;
out vec4 outColor;
const float FLIP = ${FLIP.toFixed(3)};

vec3 pal(float i) { return uPalette[int(i + 0.5)]; }

void main() {
	vec2 px = vUv * uCell;
	float gap = max(1.0, floor(uCell.x * 0.14));
	// The housing shows between cards.
	if (px.x < gap || px.y < gap) { outColor = vec4(uHousing, 1.0); return; }
	// Re-normalise y to the card itself (below the gap) so the hinge sits mid-card.
	float y = (px.y - gap) / (uCell.y - gap);

	vec3 prev = pal(vFlap.x);
	vec3 next = pal(vFlap.y);
	float t = clamp((uTime - vFlap.z) / FLIP, 0.0, 1.0);
	vec3 c;
	if (t <= 0.0) c = prev;
	else if (t >= 1.0) c = next;
	else if (t < 0.5) {
		// The old top half falls towards the hinge, uncovering the new top half behind it.
		float s = 1.0 - t * 2.0;
		if (y < 0.5) c = (y > 0.5 - 0.5 * s) ? prev * (0.55 + 0.45 * s) : next;
		else c = prev;
	} else {
		// The new bottom half swings down from the hinge over the old one.
		float s = (t - 0.5) * 2.0;
		if (y < 0.5) c = next;
		else c = (y < 0.5 + 0.5 * s) ? next * (0.7 + 0.3 * s) : prev;
	}
	// Cards catch the light on top and sit in shadow below the hinge.
	c *= y < 0.5 ? 1.05 : 0.93;
	float hinge = max(0.5, uCell.y * 0.035) / uCell.y;
	if (abs(y - 0.5) < hinge) c = mix(c, uHousing, 0.7);
	outColor = vec4(c, 1.0);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
	const s = gl.createShader(type)!;
	gl.shaderSource(s, src);
	gl.compileShader(s);
	if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader");
	return s;
}

export class FlapGrid {
	private gl: WebGL2RenderingContext;
	private program: WebGLProgram;
	private flapBuffer: WebGLBuffer;
	private flaps = new Float32Array(0);
	private u: Record<string, WebGLUniformLocation | null> = {};
	private cols = 0;
	private rows = 0;
	private cellW = 0;
	private cellH = 0;
	private originX = 0;
	private originY = 0;
	/** When the last scheduled flip ends, in board time. */
	busyUntil = 0;

	constructor(private canvas: HTMLCanvasElement) {
		const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, preserveDrawingBuffer: false });
		if (!gl) throw new Error("WebGL2 unavailable");
		this.gl = gl;
		const p = gl.createProgram()!;
		gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, VERT));
		gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, FRAG));
		gl.linkProgram(p);
		if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? "link");
		this.program = p;
		for (const name of ["uGrid", "uCanvas", "uCell", "uOrigin", "uTime", "uPalette", "uHousing"])
			this.u[name] = gl.getUniformLocation(p, name);

		const vao = gl.createVertexArray();
		gl.bindVertexArray(vao);
		const corners = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, corners);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
		gl.enableVertexAttribArray(0);
		gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
		this.flapBuffer = gl.createBuffer()!;
		gl.bindBuffer(gl.ARRAY_BUFFER, this.flapBuffer);
		gl.enableVertexAttribArray(1);
		gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
		gl.vertexAttribDivisor(1, 1);

		gl.useProgram(p);
		gl.uniform3fv(this.u.uPalette, PALETTE.flatMap(hexToRgb));
		gl.uniform3fv(this.u.uHousing, hexToRgb(HOUSING));
	}

	/** Lay out a new grid. Every cell starts blank. */
	resize(cols: number, rows: number, cellW: number, cellH: number, width: number, height: number, dpr: number) {
		this.canvas.width = Math.round(width * dpr);
		this.canvas.height = Math.round(height * dpr);
		this.cols = cols;
		this.rows = rows;
		this.cellW = cellW * dpr;
		this.cellH = cellH * dpr;
		this.originX = Math.round(((width - cols * cellW) / 2) * dpr);
		this.originY = Math.round(((height - rows * cellH) / 2) * dpr);
		this.flaps = new Float32Array(cols * rows * 3);
		this.upload();
	}

	/** The colour each cell will settle on. */
	target(i: number) {
		return this.flaps[i * 3 + 1];
	}

	/**
	 * Flip cells to new colours. `delays` (seconds from `now`) staggers them; cells
	 * already showing their colour don't move.
	 */
	set(colors: Uint8Array, now: number, delays?: Float32Array | ((i: number) => number)) {
		const f = this.flaps;
		let until = this.busyUntil;
		for (let i = 0; i < colors.length; i++) {
			const next = colors[i];
			const o = i * 3;
			if (f[o + 1] === next) continue;
			// Mid-flip, start from whichever face is mostly showing.
			const shown = now - f[o + 2] >= FLIP / 2 ? f[o + 1] : f[o];
			const d = delays ? (typeof delays === "function" ? delays(i) : delays[i]) : 0;
			f[o] = shown;
			f[o + 1] = next;
			f[o + 2] = now + d;
			until = Math.max(until, now + d + FLIP);
		}
		this.busyUntil = until;
		this.upload();
	}

	/** Flip a single cell, starting at `at` (board time). */
	flip(i: number, color: number, at: number) {
		const f = this.flaps;
		const o = i * 3;
		if (f[o + 1] === color) return;
		f[o] = at - f[o + 2] >= FLIP / 2 ? f[o + 1] : f[o];
		f[o + 1] = color;
		f[o + 2] = at;
		this.busyUntil = Math.max(this.busyUntil, at + FLIP);
		const gl = this.gl;
		gl.bindBuffer(gl.ARRAY_BUFFER, this.flapBuffer);
		gl.bufferSubData(gl.ARRAY_BUFFER, o * 4, f.subarray(o, o + 3));
	}

	private upload() {
		const gl = this.gl;
		gl.bindBuffer(gl.ARRAY_BUFFER, this.flapBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, this.flaps, gl.DYNAMIC_DRAW);
	}

	render(now: number) {
		const gl = this.gl;
		gl.viewport(0, 0, this.canvas.width, this.canvas.height);
		const [r, g, b] = hexToRgb(HOUSING);
		gl.clearColor(r, g, b, 1);
		gl.clear(gl.COLOR_BUFFER_BIT);
		if (!this.cols) return;
		gl.useProgram(this.program);
		gl.uniform2f(this.u.uGrid, this.cols, this.rows);
		gl.uniform2f(this.u.uCanvas, this.canvas.width, this.canvas.height);
		gl.uniform2f(this.u.uCell, this.cellW, this.cellH);
		gl.uniform2f(this.u.uOrigin, this.originX, this.originY);
		gl.uniform1f(this.u.uTime, now);
		gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.cols * this.rows);
	}
}

export const HOUSING = "#0b0b0a";

function hexToRgb(hex: string): [number, number, number] {
	const n = parseInt(hex.slice(1), 16);
	return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
