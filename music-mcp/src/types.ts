export interface Note {
  /** MIDI pitch 0-127 */
  pitch: number;
  /** Start time, in beats (quarter notes), from the beginning of the track */
  start: number;
  /** Duration, in beats */
  duration: number;
  /** 0-127, default 100 */
  velocity: number;
}

export interface Track {
  id: string;
  name: string;
  /** General MIDI program number 0-127 */
  program: number;
  /** MIDI channel 0-15. Channel 9 is the conventional GM drum channel. */
  channel: number;
  notes: Note[];
}

export interface Project {
  name: string;
  tempo: number; // BPM
  timeSigNum: number;
  timeSigDen: number;
  tracks: Track[];
}

export function createEmptyProject(name = "untitled"): Project {
  return {
    name,
    tempo: 120,
    timeSigNum: 4,
    timeSigDen: 4,
    tracks: [],
  };
}
