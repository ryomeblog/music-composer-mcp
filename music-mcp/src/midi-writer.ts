import type { Project } from "./types.js";

const PPQ = 480; // pulses (ticks) per quarter note

function writeVarLen(value: number): number[] {
  let buffer = value & 0x7f;
  const bytes: number[] = [];
  while ((value >>= 7) > 0) {
    buffer <<= 8;
    buffer |= ((value & 0x7f) | 0x80);
  }
  while (true) {
    bytes.push(buffer & 0xff);
    if (buffer & 0x80) {
      buffer >>= 8;
    } else {
      break;
    }
  }
  return bytes;
}

interface RawEvent {
  tick: number;
  /** used to order simultaneous events: note-off (0) before note-on (1) */
  priority: number;
  bytes: number[];
}

function buildTrackChunk(events: RawEvent[]): Buffer {
  events.sort((a, b) => (a.tick !== b.tick ? a.tick - b.tick : a.priority - b.priority));

  const data: number[] = [];
  let lastTick = 0;
  for (const ev of events) {
    const delta = ev.tick - lastTick;
    data.push(...writeVarLen(delta));
    data.push(...ev.bytes);
    lastTick = ev.tick;
  }
  // End of track meta event
  data.push(...writeVarLen(0), 0xff, 0x2f, 0x00);

  const header = Buffer.alloc(8);
  header.write("MTrk", 0, "ascii");
  header.writeUInt32BE(data.length, 4);
  return Buffer.concat([header, Buffer.from(data)]);
}

function timeSigDenominatorPow2(den: number): number {
  // MIDI stores the denominator as a power of 2 exponent (4 -> 2, 8 -> 3, ...)
  return Math.round(Math.log2(den));
}

export function buildMidiFile(project: Project): Buffer {
  const microsecondsPerQuarter = Math.round(60_000_000 / project.tempo);

  // Track 0: conductor track (tempo + time signature only)
  const conductorEvents: RawEvent[] = [
    {
      tick: 0,
      priority: 0,
      bytes: [
        0xff,
        0x51,
        0x03,
        (microsecondsPerQuarter >> 16) & 0xff,
        (microsecondsPerQuarter >> 8) & 0xff,
        microsecondsPerQuarter & 0xff,
      ],
    },
    {
      tick: 0,
      priority: 0,
      bytes: [0xff, 0x58, 0x04, project.timeSigNum, timeSigDenominatorPow2(project.timeSigDen), 24, 8],
    },
  ];
  const trackChunks: Buffer[] = [buildTrackChunk(conductorEvents)];

  for (const track of project.tracks) {
    const events: RawEvent[] = [
      { tick: 0, priority: 0, bytes: [0xc0 | track.channel, track.program & 0x7f] },
    ];
    for (const note of track.notes) {
      const startTick = Math.max(0, Math.round(note.start * PPQ));
      const endTick = Math.max(startTick + 1, Math.round((note.start + note.duration) * PPQ));
      const velocity = Math.min(127, Math.max(1, Math.round(note.velocity)));
      events.push({
        tick: startTick,
        priority: 1,
        bytes: [0x90 | track.channel, note.pitch & 0x7f, velocity],
      });
      events.push({
        tick: endTick,
        priority: 0,
        bytes: [0x80 | track.channel, note.pitch & 0x7f, 0],
      });
    }
    trackChunks.push(buildTrackChunk(events));
  }

  const header = Buffer.alloc(14);
  header.write("MThd", 0, "ascii");
  header.writeUInt32BE(6, 4);
  header.writeUInt16BE(1, 8); // format 1: multiple simultaneous tracks
  header.writeUInt16BE(trackChunks.length, 10); // conductor + one per track
  header.writeUInt16BE(PPQ, 12);

  return Buffer.concat([header, ...trackChunks]);
}
