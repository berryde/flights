// The board's clatter, synthesised: short filtered noise bursts, one per flap. Off until
// the visitor turns it on (browsers only allow audio after a gesture anyway).

let ctx: AudioContext | null = null;
let noise: AudioBuffer | null = null;
let enabled = false;
let lastAt = 0;

export function setSound(on: boolean) {
	enabled = on;
	if (on && !ctx) {
		ctx = new AudioContext();
		const length = Math.round(ctx.sampleRate * 0.03);
		noise = ctx.createBuffer(1, length, ctx.sampleRate);
		const data = noise.getChannelData(0);
		for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (length * 0.12));
	}
	if (on) void ctx?.resume();
}

export const soundOn = () => enabled;

/** One flap landing, `delay` seconds from now. Rate-limited so cascades stay a patter, not a roar. */
export function clack(delay = 0, volume = 1) {
	if (!enabled || !ctx || !noise) return;
	const at = ctx.currentTime + delay;
	if (Math.abs(at - lastAt) < 0.012) return;
	lastAt = at;
	const src = ctx.createBufferSource();
	src.buffer = noise;
	src.playbackRate.value = 0.8 + Math.random() * 0.5;
	const filter = ctx.createBiquadFilter();
	filter.type = "bandpass";
	filter.frequency.value = 1800 + Math.random() * 2200;
	filter.Q.value = 1.4;
	const gain = ctx.createGain();
	gain.gain.value = 0.16 * volume;
	src.connect(filter).connect(gain).connect(ctx.destination);
	src.start(at);
}

/** A cascade of `count` flaps spread over the given delays. */
export function clatter(delays: number[], volume = 0.7) {
	if (!enabled) return;
	const sorted = delays.slice().sort((a, b) => a - b);
	const step = Math.max(1, Math.floor(sorted.length / 90));
	for (let i = 0; i < sorted.length; i += step) clack(sorted[i], volume);
}
