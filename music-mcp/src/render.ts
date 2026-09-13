import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { constants } from "node:fs";

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Renders a MIDI file to a WAV file using the fluidsynth CLI and a SoundFont (.sf2).
 * Requires fluidsynth to be installed and on PATH.
 */
export async function renderWithFluidsynth(
  midiPath: string,
  soundfontPath: string,
  outputWavPath: string
): Promise<void> {
  if (!(await fileExists(soundfontPath))) {
    throw new Error(
      `SoundFont not found at "${soundfontPath}". Download a free .sf2 file (e.g. FluidR3_GM.sf2) and pass its path.`
    );
  }

  await new Promise<void>((resolve, reject) => {
    const proc = spawn("fluidsynth", [
      "-ni",
      soundfontPath,
      midiPath,
      "-F",
      outputWavPath,
      "-r",
      "44100",
    ]);

    let stderr = "";
    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    proc.on("error", (err) => {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        reject(
          new Error(
            "fluidsynth executable not found. Install it first (macOS: `brew install fluid-synth`, " +
              "Ubuntu/Debian: `sudo apt install fluidsynth`, Windows: download from the fluidsynth GitHub releases)."
          )
        );
      } else {
        reject(err);
      }
    });

    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`fluidsynth exited with code ${code}: ${stderr}`));
    });
  });
}
