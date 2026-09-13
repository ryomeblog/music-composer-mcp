import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import * as state from "./state.js";
import { buildMidiFile } from "./midi-writer.js";
import { renderWithFluidsynth } from "./render.js";
import { parsePitch, GM_INSTRUMENTS } from "./note-utils.js";

const OUTPUT_DIR = path.resolve(process.cwd(), "output");

interface WriteResult {
  /** Absolute path written to, or null if the filesystem was unavailable/read-only. */
  path: string | null;
}

/** Best-effort file write: on read-only/ephemeral hosts (e.g. remote API deployments) this
 * silently no-ops so callers can still fall back to the base64 payload returned alongside it. */
async function tryWriteFile(fileName: string, buffer: Buffer): Promise<WriteResult> {
  try {
    await mkdir(OUTPUT_DIR, { recursive: true });
    const outPath = path.join(OUTPUT_DIR, fileName);
    await writeFile(outPath, buffer);
    return { path: outPath };
  } catch {
    return { path: null };
  }
}

const noteSchema = z.object({
  pitch: z
    .union([z.number().int().min(0).max(127), z.string()])
    .describe('MIDI note number 0-127, or a name like "C4" / "F#3" / "Bb5" (C4 = middle C = 60)'),
  start: z.number().min(0).describe("start time in beats (quarter notes) from the start of the track"),
  duration: z.number().gt(0).describe("note length in beats"),
  velocity: z.number().int().min(1).max(127).optional().describe("1-127, default 100"),
});

/** Builds a fresh MCP server instance with every music-composer tool registered.
 * Note: project state (`./state.ts`) is a process-wide singleton, so under the HTTP
 * transport all concurrent sessions share the same "current project" -- fine for a
 * single-operator deployment, not multi-tenant safe. */
export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "music-composer",
    version: "1.0.0",
  });

  server.registerTool(
    "set_tempo",
    {
      title: "Set tempo",
      description: "Set the project tempo in BPM.",
      inputSchema: { bpm: z.number().gt(0).max(400) },
    },
    async ({ bpm }) => {
      state.setTempo(bpm);
      return { content: [{ type: "text", text: `Tempo set to ${bpm} BPM.` }] };
    }
  );

  server.registerTool(
    "set_time_signature",
    {
      title: "Set time signature",
      description: "Set the project time signature, e.g. 4/4, 3/4, 6/8.",
      inputSchema: { numerator: z.number().int().positive(), denominator: z.number().int().positive() },
    },
    async ({ numerator, denominator }) => {
      state.setTimeSignature(numerator, denominator);
      return { content: [{ type: "text", text: `Time signature set to ${numerator}/${denominator}.` }] };
    }
  );

  server.registerTool(
    "add_track",
    {
      title: "Add track",
      description:
        "Add a new instrument track to the project. Use list_gm_instruments to see available program numbers. Returns the new track's id.",
      inputSchema: {
        name: z.string(),
        program: z.number().int().min(0).max(127).describe("General MIDI program number, 0-127"),
        channel: z.number().int().min(0).max(15).optional().describe("MIDI channel 0-15, default: next free channel (9 is conventionally drums)"),
      },
    },
    async ({ name, program, channel }) => {
      const project = state.getProject();
      const usedChannels = new Set(project.tracks.map((t) => t.channel));
      let ch = channel;
      if (ch === undefined) {
        ch = 0;
        while (usedChannels.has(ch) && ch < 16) ch++;
        if (ch === 9 && !usedChannels.has(9)) {
          // leave 9 free for drums unless everything else is taken
          ch = 0;
          while ((usedChannels.has(ch) || ch === 9) && ch < 16) ch++;
        }
      }
      const track = state.addTrack(name, program, ch);
      return {
        content: [
          { type: "text", text: `Track created: id=${track.id}, name="${track.name}", channel=${track.channel}, program=${track.program}` },
        ],
      };
    }
  );

  server.registerTool(
    "remove_track",
    {
      title: "Remove track",
      description: "Delete a track and all of its notes.",
      inputSchema: { trackId: z.string() },
    },
    async ({ trackId }) => {
      state.removeTrack(trackId);
      return { content: [{ type: "text", text: `Track ${trackId} removed.` }] };
    }
  );

  server.registerTool(
    "list_tracks",
    {
      title: "List tracks",
      description: "List all tracks in the current project with their id, name, program, channel and note count.",
      inputSchema: {},
    },
    async () => {
      const project = state.getProject();
      const summary = project.tracks.map((t) => ({
        id: t.id,
        name: t.name,
        program: t.program,
        channel: t.channel,
        noteCount: t.notes.length,
      }));
      return { content: [{ type: "text", text: JSON.stringify(summary, null, 2) }] };
    }
  );

  server.registerTool(
    "add_notes",
    {
      title: "Add notes",
      description:
        "Add one or more notes to a track. Pitches may be MIDI numbers (0-127) or names like C4/F#3/Bb5 (C4 = 60).",
      inputSchema: { trackId: z.string(), notes: z.array(noteSchema).min(1) },
    },
    async ({ trackId, notes }) => {
      const resolved = notes.map((n) => ({
        pitch: parsePitch(n.pitch),
        start: n.start,
        duration: n.duration,
        velocity: n.velocity ?? 100,
      }));
      state.addNotes(trackId, resolved);
      return { content: [{ type: "text", text: `Added ${resolved.length} note(s) to track ${trackId}.` }] };
    }
  );

  server.registerTool(
    "clear_notes",
    {
      title: "Clear notes",
      description: "Remove all notes from a track (keeps the track itself).",
      inputSchema: { trackId: z.string() },
    },
    async ({ trackId }) => {
      state.clearNotes(trackId);
      return { content: [{ type: "text", text: `Notes cleared on track ${trackId}.` }] };
    }
  );

  server.registerTool(
    "get_project",
    {
      title: "Get project state",
      description: "Return the full current project as JSON: tempo, time signature, and every track with all its notes.",
      inputSchema: {},
    },
    async () => {
      return { content: [{ type: "text", text: JSON.stringify(state.getProject(), null, 2) }] };
    }
  );

  server.registerTool(
    "reset_project",
    {
      title: "Reset project",
      description: "Discard the current project and start a new empty one.",
      inputSchema: { name: z.string().optional() },
    },
    async ({ name }) => {
      state.resetProject(name);
      return { content: [{ type: "text", text: `Project reset${name ? ` ("${name}")` : ""}.` }] };
    }
  );

  server.registerTool(
    "list_gm_instruments",
    {
      title: "List General MIDI instruments",
      description: "List all 128 General MIDI program numbers and their instrument names, for use with add_track.",
      inputSchema: {},
    },
    async () => {
      return { content: [{ type: "text", text: JSON.stringify(GM_INSTRUMENTS, null, 2) }] };
    }
  );

  server.registerTool(
    "export_midi",
    {
      title: "Export MIDI file",
      description:
        "Write the current project to a .mid file and return its absolute path plus the raw MIDI bytes as base64 (useful when there is no shared filesystem, e.g. a remote API deployment).",
      inputSchema: { fileName: z.string().optional().describe('default: "project.mid"') },
    },
    async ({ fileName }) => {
      const buffer = buildMidiFile(state.getProject());
      const { path: outPath } = await tryWriteFile(fileName ?? "project.mid", buffer);
      return {
        content: [
          { type: "text", text: outPath ?? "(no local file written; MIDI returned inline as base64)" },
          { type: "audio", data: buffer.toString("base64"), mimeType: "audio/midi" },
        ],
      };
    }
  );

  server.registerTool(
    "render_audio",
    {
      title: "Render audio (WAV)",
      description:
        "Render the current project to a WAV file using fluidsynth and a SoundFont (.sf2). Requires fluidsynth installed and on PATH, and a soundfontPath readable on the machine running this server (for the HTTP API, that's the server host, not the caller's machine).",
      inputSchema: {
        soundfontPath: z.string().describe("absolute path to a .sf2 SoundFont file, readable on the server host"),
        fileName: z.string().optional().describe('default: "render.wav"'),
      },
    },
    async ({ soundfontPath, fileName }) => {
      await mkdir(OUTPUT_DIR, { recursive: true });
      const midiPath = path.join(OUTPUT_DIR, "_render_source.mid");
      const wavPath = path.join(OUTPUT_DIR, fileName ?? "render.wav");
      const buffer = buildMidiFile(state.getProject());
      await writeFile(midiPath, buffer);
      await renderWithFluidsynth(midiPath, soundfontPath, wavPath);
      const wavBuffer = await readFile(wavPath);
      return {
        content: [
          { type: "text", text: wavPath },
          { type: "audio", data: wavBuffer.toString("base64"), mimeType: "audio/wav" },
        ],
      };
    }
  );

  server.registerTool(
    "save_project",
    {
      title: "Save project",
      description: "Save the current project state as JSON so it can be reloaded later with load_project.",
      inputSchema: { fileName: z.string().optional().describe('default: "project.json"') },
    },
    async ({ fileName }) => {
      await mkdir(OUTPUT_DIR, { recursive: true });
      const outPath = path.join(OUTPUT_DIR, fileName ?? "project.json");
      await state.saveProject(outPath);
      return { content: [{ type: "text", text: outPath }] };
    }
  );

  server.registerTool(
    "load_project",
    {
      title: "Load project",
      description: "Load a previously saved project JSON file, replacing the current in-memory project.",
      inputSchema: { path: z.string() },
    },
    async ({ path: filePath }) => {
      const project = await state.loadProject(filePath);
      return { content: [{ type: "text", text: `Loaded project "${project.name}" with ${project.tracks.length} track(s).` }] };
    }
  );

  return server;
}
