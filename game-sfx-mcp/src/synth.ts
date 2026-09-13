import { SAMPLE_RATE, withDefaults, type SfxParams } from "./types.js";
import { makePrng } from "./prng.js";

function oscillator(waveform: string, phase: number, duty: number): number {
  const x = phase - Math.floor(phase); // wrap to [0, 1)
  switch (waveform) {
    case "square":
      return x < duty ? 1 : -1;
    case "sawtooth":
      return 2 * x - 1;
    case "triangle":
      return x < 0.5 ? 4 * x - 1 : 3 - 4 * x;
    case "sine":
      return Math.sin(2 * Math.PI * x);
    default:
      return 0; // "noise" is handled separately (no phase-based waveform)
  }
}

function envelopeAt(t: number, attack: number, sustain: number, decay: number, sustainLevel: number, punch: number): number {
  let env: number;
  if (t < attack) {
    env = attack > 0 ? t / attack : 1;
  } else if (t < attack + sustain) {
    env = sustainLevel;
  } else {
    const dt = t - attack - sustain;
    env = decay > 0 ? sustainLevel * Math.max(0, 1 - dt / decay) : 0;
  }
  if (punch > 0 && attack > 0 && t < attack) {
    env += punch * (1 - t / attack);
  }
  return env;
}

function freqAt(
  t: number,
  duration: number,
  startFreq: number,
  endFreq: number,
  curve: "linear" | "exponential",
  vibratoDepth: number,
  vibratoRate: number,
  arpMultiplier: number,
  arpTime: number
): number {
  const progress = duration > 0 ? Math.min(1, t / duration) : 0;
  const sf = Math.max(1, startFreq);
  const ef = Math.max(1, endFreq);
  let freq = curve === "exponential" ? sf * Math.pow(ef / sf, progress) : sf + (ef - sf) * progress;

  if (vibratoDepth > 0 && vibratoRate > 0) {
    freq *= 1 + vibratoDepth * Math.sin(2 * Math.PI * vibratoRate * t);
  }
  if (t >= arpTime && arpMultiplier !== 1) {
    freq *= arpMultiplier;
  }
  return Math.max(1, freq);
}

function applyLowPass(samples: Float32Array, cutoffHz: number): void {
  if (cutoffHz <= 0) return;
  const dt = 1 / SAMPLE_RATE;
  const rc = 1 / (2 * Math.PI * cutoffHz);
  const alpha = dt / (rc + dt);
  let prev = samples[0] ?? 0;
  for (let i = 0; i < samples.length; i++) {
    prev = prev + alpha * (samples[i] - prev);
    samples[i] = prev;
  }
}

function applyHighPass(samples: Float32Array, cutoffHz: number): void {
  if (cutoffHz <= 0) return;
  const dt = 1 / SAMPLE_RATE;
  const rc = 1 / (2 * Math.PI * cutoffHz);
  const alpha = rc / (rc + dt);
  let prevIn = samples[0] ?? 0;
  let prevOut = samples[0] ?? 0;
  for (let i = 0; i < samples.length; i++) {
    const x = samples[i];
    const y = alpha * (prevOut + x - prevIn);
    prevIn = x;
    prevOut = y;
    samples[i] = y;
  }
}

/** Renders the given SFX parameters to a buffer of 32-bit float samples in [-1, 1], mono, at SAMPLE_RATE. */
export function synthesize(rawParams: SfxParams): Float32Array {
  const p = withDefaults(rawParams);
  const rng = makePrng(p.seed);

  const cycleDuration = Math.max(0.001, p.attack + p.sustain + p.decay);
  const samplesPerCycle = Math.round(cycleDuration * SAMPLE_RATE);
  const totalSamples = samplesPerCycle * p.repeatCount;
  const out = new Float32Array(totalSamples);

  let phase = 0;
  let i = 0;
  for (let rep = 0; rep < p.repeatCount; rep++) {
    phase = 0;
    for (let n = 0; n < samplesPerCycle; n++, i++) {
      const t = n / SAMPLE_RATE;

      const env = envelopeAt(t, p.attack, p.sustain, p.decay, p.sustainLevel, p.punch);
      const freq = freqAt(
        t,
        cycleDuration,
        p.startFreq,
        p.endFreq,
        p.sweepCurve,
        p.vibratoDepth,
        p.vibratoRate,
        p.arpeggioMultiplier,
        p.arpeggioTime
      );

      let waveSample: number;
      if (p.waveform === "noise") {
        waveSample = rng() * 2 - 1;
      } else {
        const duty = Math.min(0.99, Math.max(0.01, p.dutyCycle + p.dutySweep * t));
        waveSample = oscillator(p.waveform, phase, duty);
        phase += freq / SAMPLE_RATE;
      }

      let sample = waveSample;
      if (p.noiseMix > 0) {
        const noiseSample = rng() * 2 - 1;
        sample = (1 - p.noiseMix) * waveSample + p.noiseMix * noiseSample;
      }

      out[i] = sample * env * p.volume;
    }
  }

  applyLowPass(out, p.lowPassFreq);
  applyHighPass(out, p.highPassFreq);

  // final safety clamp
  for (let k = 0; k < out.length; k++) {
    if (out[k] > 1) out[k] = 1;
    else if (out[k] < -1) out[k] = -1;
  }

  return out;
}
