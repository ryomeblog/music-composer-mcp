#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { synthesize } from "./synth.js";
import { encodeWav } from "./wav-writer.js";
import type { SfxParams } from "./types.js";
import { PRESET_NAMES, PRESET_DESCRIPTIONS, buildPreset, buildRandom, type PresetName } from "./presets.js";

const OUTPUT_DIR = path.resolve(process.cwd(), "output");

async function ensureOutputDir(): Promise<void> {
  await mkdir(OUTPUT_DIR, { recursive: true });
}

async function renderAndSave(params: SfxParams, fileName: string): Promise<string> {
  await ensureOutputDir();
  const samples = synthesize(params);
  const wav = encodeWav(samples);
  const outPath = path.join(OUTPUT_DIR, fileName);
  await writeFile(outPath, wav);
  return outPath;
}

const sfxParamsShape = {
  waveform: z.enum(["square", "sawtooth", "triangle", "sine", "noise"]).describe(
    '"noise" ignores frequency/duty settings and produces broadband white noise (good for explosions/hits/hiss).'
  ),
  startFreq: z.number().positive().describe("starting pitch in Hz"),
  endFreq: z.number().positive().optional().describe("ending pitch in Hz; omit to keep pitch flat"),
  sweepCurve: z.enum(["linear", "exponential"]).optional().describe('default "exponential" (sounds more natural for pitch sweeps)'),
  attack: z.number().min(0).describe("seconds to ramp up from silence"),
  sustain: z.number().min(0).describe("seconds held at sustainLevel"),
  decay: z.number().min(0).describe("seconds to ramp down to silence"),
  sustainLevel: z.number().min(0).max(1).optional().describe("0-1, default 1"),
  punch: z.number().min(0).max(1).optional().describe("0-1 extra percussive transient at the very start, default 0"),
  vibratoDepth: z.number().min(0).max(1).optional().describe("0-1 pitch wobble depth, default 0"),
  vibratoRate: z.number().min(0).optional().describe("vibrato speed in Hz, default 0"),
  arpeggioMultiplier: z.number().optional().describe("pitch multiplier applied at arpeggioTime, default 1 (no change)"),
  arpeggioTime: z.number().min(0).optional().describe("seconds in when the arpeggio pitch jump happens"),
  dutyCycle: z.number().min(0).max(1).optional().describe('pulse width for "square" wave, default 0.5'),
  dutySweep: z.number().optional().describe("change in duty cycle per second, default 0"),
  lowPassFreq: z.number().min(0).optional().describe("low-pass filter cutoff in Hz; omit/0 for no filter"),
  highPassFreq: z.number().min(0).optional().describe("high-pass filter cutoff in Hz; omit/0 for no filter"),
  noiseMix: z.number().min(0).max(1).optional().describe("0-1 blend of white noise into the main waveform, default 0"),
  repeatCount: z.number().int().min(1).max(20).optional().describe("retrigger the whole envelope this many times back to back, default 1"),
  volume: z.number().min(0).max(1).optional().describe("0-1 overall output volume, default 0.8"),
  seed: z.number().int().optional().describe("noise seed, for reproducible output; random if omitted"),
};

const server = new McpServer({
  name: "game-sfx-composer",
  version: "1.0.0",
});

server.registerTool(
  "synthesize_sfx",
  {
    title: "Synthesize a custom sound effect",
    description:
      "Render a one-shot game sound effect (WAV) from fully explicit synthesis parameters: waveform, pitch envelope, amplitude envelope, and optional vibrato/arpeggio/filters/noise blend. Use list_presets/generate_preset first to get a good starting point, then tweak with this tool.",
    inputSchema: {
      params: z.object(sfxParamsShape),
      fileName: z.string().optional().describe('default: "sfx.wav"'),
    },
  },
  async ({ params, fileName }) => {
    const outPath = await renderAndSave(params as SfxParams, fileName ?? "sfx.wav");
    return { content: [{ type: "text", text: outPath }] };
  }
);

server.registerTool(
  "list_presets",
  {
    title: "List SFX presets",
    description: "List built-in sound effect preset categories (pickup, laser, explosion, etc.) with descriptions.",
    inputSchema: {},
  },
  async () => {
    return { content: [{ type: "text", text: JSON.stringify(PRESET_DESCRIPTIONS, null, 2) }] };
  }
);

server.registerTool(
  "generate_preset",
  {
    title: "Generate a preset sound effect",
    description:
      "Render a WAV from a built-in preset category. Each call with a different (or omitted) seed gives a varied take on that category. Returns the file path and the resolved parameters, so you can feed them into synthesize_sfx to fine-tune.",
    inputSchema: {
      name: z.enum(PRESET_NAMES),
      seed: z.number().int().optional().describe("omit for a random seed"),
      fileName: z.string().optional().describe("default: \"<name>.wav\""),
    },
  },
  async ({ name, seed, fileName }) => {
    const resolvedSeed = seed ?? Math.floor(Math.random() * 2 ** 31);
    const params = buildPreset(name as PresetName, resolvedSeed);
    const outPath = await renderAndSave(params, fileName ?? `${name}.wav`);
    return {
      content: [{ type: "text", text: JSON.stringify({ path: outPath, params }, null, 2) }],
    };
  }
);

server.registerTool(
  "randomize_sfx",
  {
    title: "Generate a fully random sound effect",
    description:
      "Render a WAV from fully randomized parameters (not tied to any preset category) for open-ended discovery. Returns the file path and the parameters used.",
    inputSchema: {
      seed: z.number().int().optional().describe("omit for a random seed"),
      fileName: z.string().optional().describe('default: "random.wav"'),
    },
  },
  async ({ seed, fileName }) => {
    const resolvedSeed = seed ?? Math.floor(Math.random() * 2 ** 31);
    const params = buildRandom(resolvedSeed);
    const outPath = await renderAndSave(params, fileName ?? "random.wav");
    return {
      content: [{ type: "text", text: JSON.stringify({ path: outPath, params }, null, 2) }],
    };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Fatal error starting game-sfx-composer MCP server:", err);
  process.exit(1);
});
