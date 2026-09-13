export type Waveform = "square" | "sawtooth" | "triangle" | "sine" | "noise";
export type SweepCurve = "linear" | "exponential";

export interface SfxParams {
  waveform: Waveform;

  /** Starting pitch in Hz */
  startFreq: number;
  /** Ending pitch in Hz. If omitted, pitch stays flat at startFreq. */
  endFreq?: number;
  /** How the pitch moves from startFreq to endFreq. Default: "exponential" (sounds more natural). */
  sweepCurve?: SweepCurve;

  /** Seconds to ramp up from silence to full volume. */
  attack: number;
  /** Seconds to hold at sustainLevel. */
  sustain: number;
  /** Seconds to ramp down to silence. */
  decay: number;
  /** 0-1 volume level held during the sustain phase. Default 1. */
  sustainLevel?: number;
  /** 0-1 extra transient spike right at the start, decaying quickly. Adds "punch"/percussiveness. Default 0. */
  punch?: number;

  /** 0-1 depth of pitch vibrato (fraction of frequency). Default 0. */
  vibratoDepth?: number;
  /** Vibrato rate in Hz. Default 0. */
  vibratoRate?: number;

  /** Pitch multiplier applied partway through the sound (classic chiptune "arpeggio" jump). Default 1 (no change). */
  arpeggioMultiplier?: number;
  /** Seconds into the sound when the arpeggio pitch jump happens. */
  arpeggioTime?: number;

  /** 0-1 pulse width for the "square" waveform. Default 0.5. */
  dutyCycle?: number;
  /** Change in duty cycle per second (can be negative). Default 0. */
  dutySweep?: number;

  /** Low-pass filter cutoff in Hz. Omit for no filtering. */
  lowPassFreq?: number;
  /** High-pass filter cutoff in Hz. Omit for no filtering. */
  highPassFreq?: number;

  /** 0-1 blend of noise mixed into the main waveform (0 = pure waveform, 1 = pure noise). Default 0. */
  noiseMix?: number;

  /** How many times to retrigger the whole envelope+sweep within the sound, back to back. Default 1 (no repeat). */
  repeatCount?: number;

  /** 0-1 overall output volume. Default 0.8. */
  volume?: number;

  /** Seed for the noise generator, so the same params always render the same sound. */
  seed?: number;
}

export const SAMPLE_RATE = 44100;

export function withDefaults(p: SfxParams): Required<SfxParams> {
  return {
    waveform: p.waveform,
    startFreq: p.startFreq,
    endFreq: p.endFreq ?? p.startFreq,
    sweepCurve: p.sweepCurve ?? "exponential",
    attack: p.attack,
    sustain: p.sustain,
    decay: p.decay,
    sustainLevel: p.sustainLevel ?? 1,
    punch: p.punch ?? 0,
    vibratoDepth: p.vibratoDepth ?? 0,
    vibratoRate: p.vibratoRate ?? 0,
    arpeggioMultiplier: p.arpeggioMultiplier ?? 1,
    arpeggioTime: p.arpeggioTime ?? 0,
    dutyCycle: p.dutyCycle ?? 0.5,
    dutySweep: p.dutySweep ?? 0,
    lowPassFreq: p.lowPassFreq ?? 0,
    highPassFreq: p.highPassFreq ?? 0,
    noiseMix: p.noiseMix ?? 0,
    repeatCount: p.repeatCount ?? 1,
    volume: p.volume ?? 0.8,
    seed: p.seed ?? Math.floor(Math.random() * 2 ** 31),
  };
}
