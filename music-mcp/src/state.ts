import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import type { Note, Project, Track } from "./types.js";
import { createEmptyProject } from "./types.js";

let currentProject: Project = createEmptyProject();

export function getProject(): Project {
  return currentProject;
}

export function resetProject(name?: string): Project {
  currentProject = createEmptyProject(name ?? "untitled");
  return currentProject;
}

export function setTempo(bpm: number): void {
  if (bpm <= 0 || bpm > 400) throw new Error("bpm must be between 1 and 400");
  currentProject.tempo = bpm;
}

export function setTimeSignature(num: number, den: number): void {
  if (num <= 0 || den <= 0) throw new Error("time signature values must be positive");
  currentProject.timeSigNum = num;
  currentProject.timeSigDen = den;
}

export function addTrack(name: string, program: number, channel: number): Track {
  if (program < 0 || program > 127) throw new Error("program must be 0-127");
  if (channel < 0 || channel > 15) throw new Error("channel must be 0-15");
  const track: Track = { id: randomUUID().slice(0, 8), name, program, channel, notes: [] };
  currentProject.tracks.push(track);
  return track;
}

export function removeTrack(trackId: string): void {
  const before = currentProject.tracks.length;
  currentProject.tracks = currentProject.tracks.filter((t) => t.id !== trackId);
  if (currentProject.tracks.length === before) {
    throw new Error(`no track with id "${trackId}"`);
  }
}

export function findTrack(trackId: string): Track {
  const track = currentProject.tracks.find((t) => t.id === trackId);
  if (!track) throw new Error(`no track with id "${trackId}"`);
  return track;
}

export function addNotes(trackId: string, notes: Note[]): void {
  const track = findTrack(trackId);
  track.notes.push(...notes);
}

export function clearNotes(trackId: string): void {
  const track = findTrack(trackId);
  track.notes = [];
}

export async function saveProject(filePath: string): Promise<void> {
  await writeFile(filePath, JSON.stringify(currentProject, null, 2), "utf-8");
}

export async function loadProject(filePath: string): Promise<Project> {
  const raw = await readFile(filePath, "utf-8");
  currentProject = JSON.parse(raw) as Project;
  return currentProject;
}
