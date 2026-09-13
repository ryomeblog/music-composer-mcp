import type { SfxParams } from "./types.js";
import { makePrng, randRange, pick } from "./prng.js";

export const PRESET_NAMES = [
  "pickup",
  "laser",
  "explosion",
  "powerup",
  "hit",
  "jump",
  "select",
  "alert",
] as const;
export type PresetName = (typeof PRESET_NAMES)[number];

export const PRESET_DESCRIPTIONS: Record<PresetName, string> = {
  pickup: "Short bright ascending blip, for coins / item pickups.",
  laser: "Descending pitch zap, for shooting / lasers.",
  explosion: "Filtered noise burst with a punchy transient, for explosions / impacts.",
  powerup: "Longer rising sweep with light vibrato, for power-ups / level-ups.",
  hit: "Short noisy crunch, for taking damage / hitting something.",
  jump: "Quick rising blip, for jump actions.",
  select: "Very short high blip, for UI clicks / menu selection.",
  alert: "A few short repeated beeps, for warnings / notifications.",
};

export function buildPreset(name: PresetName, seed: number): SfxParams {
  const rng = makePrng(seed);

  switch (name) {
    case "pickup":
      return {
        waveform: "square",
        startFreq: randRange(rng, 800, 1100),
        endFreq: randRange(rng, 1400, 2000),
        sweepCurve: "exponential",
        attack: 0.005,
        sustain: randRange(rng, 0.03, 0.06),
        decay: randRange(rng, 0.08, 0.15),
        dutyCycle: 0.5,
        arpeggioMultiplier: randRange(rng, 1.3, 1.8),
        arpeggioTime: 0.03,
        volume: 0.6,
        seed,
      };

    case "laser":
      return {
        waveform: pick(rng, ["sawtooth", "square"] as const),
        startFreq: randRange(rng, 1400, 2200),
        endFreq: randRange(rng, 150, 400),
        sweepCurve: "exponential",
        attack: 0.001,
        sustain: randRange(rng, 0.02, 0.05),
        decay: randRange(rng, 0.05, 0.1),
        volume: 0.5,
        seed,
      };

    case "explosion":
      return {
        waveform: "noise",
        startFreq: 200,
        attack: 0.001,
        sustain: randRange(rng, 0.02, 0.05),
        decay: randRange(rng, 0.3, 0.6),
        punch: randRange(rng, 0.2, 0.4),
        lowPassFreq: randRange(rng, 700, 1800),
        volume: 0.8,
        seed,
      };

    case "powerup":
      return {
        waveform: pick(rng, ["triangle", "sine"] as const),
        startFreq: randRange(rng, 200, 350),
        endFreq: randRange(rng, 900, 1500),
        sweepCurve: "exponential",
        attack: 0.01,
        sustain: randRange(rng, 0.15, 0.25),
        decay: 0.1,
        vibratoDepth: 0.05,
        vibratoRate: randRange(rng, 18, 30),
        volume: 0.6,
        seed,
      };

    case "hit":
      return {
        waveform: "square",
        startFreq: randRange(rng, 200, 300),
        endFreq: randRange(rng, 100, 180),
        sweepCurve: "linear",
        noiseMix: randRange(rng, 0.5, 0.8),
        attack: 0.001,
        sustain: 0.02,
        decay: randRange(rng, 0.08, 0.15),
        volume: 0.7,
        seed,
      };

    case "jump":
      return {
        waveform: "square",
        startFreq: randRange(rng, 300, 450),
        endFreq: randRange(rng, 600, 900),
        sweepCurve: "exponential",
        attack: 0.001,
        sustain: 0.03,
        decay: 0.08,
        volume: 0.5,
        seed,
      };

    case "select":
      return {
        waveform: "sine",
        startFreq: randRange(rng, 600, 900),
        attack: 0.001,
        sustain: 0.02,
        decay: 0.03,
        volume: 0.4,
        seed,
      };

    case "alert":
      return {
        waveform: "square",
        startFreq: randRange(rng, 500, 700),
        attack: 0.005,
        sustain: 0.08,
        decay: 0.05,
        repeatCount: 3,
        volume: 0.5,
        seed,
      };
  }
}

const ALL_WAVEFORMS = ["square", "sawtooth", "triangle", "sine", "noise"] as const;

/** Fully randomized parameters within tasteful ranges, for "happy accident" discovery. */
export function buildRandom(seed: number): SfxParams {
  const rng = makePrng(seed);
  const waveform = pick(rng, ALL_WAVEFORMS);
  return {
    waveform,
    startFreq: randRange(rng, 100, 1800),
    endFreq: randRange(rng, 100, 1800),
    sweepCurve: pick(rng, ["linear", "exponential"] as const),
    attack: randRange(rng, 0, 0.05),
    sustain: randRange(rng, 0, 0.2),
    decay: randRange(rng, 0.05, 0.4),
    punch: rng() < 0.4 ? randRange(rng, 0.1, 0.4) : 0,
    vibratoDepth: rng() < 0.3 ? randRange(rng, 0.02, 0.1) : 0,
    vibratoRate: randRange(rng, 5, 40),
    arpeggioMultiplier: rng() < 0.3 ? randRange(rng, 0.6, 1.8) : 1,
    arpeggioTime: randRange(rng, 0.02, 0.1),
    dutyCycle: randRange(rng, 0.1, 0.9),
    noiseMix: rng() < 0.3 ? randRange(rng, 0.1, 0.5) : 0,
    lowPassFreq: rng() < 0.3 ? randRange(rng, 500, 4000) : 0,
    highPassFreq: rng() < 0.15 ? randRange(rng, 100, 800) : 0,
    repeatCount: rng() < 0.2 ? Math.floor(randRange(rng, 2, 4)) : 1,
    volume: randRange(rng, 0.4, 0.8),
    seed,
  };
}
