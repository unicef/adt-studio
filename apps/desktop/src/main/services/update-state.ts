import { app } from "electron";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface PostUpdateInfo {
  version: string;
  releaseNotes?: string;
}

interface UpdateState {
  pending?: PostUpdateInfo;
}

function statePath(): string {
  return join(app.getPath("userData"), "update-state.json");
}

function readState(): UpdateState {
  try {
    return JSON.parse(readFileSync(statePath(), "utf8")) as UpdateState;
  } catch {
    return {};
  }
}

function writeState(state: UpdateState): void {
  try {
    writeFileSync(statePath(), JSON.stringify(state), "utf8");
  } catch (err) {
    console.error("[update-state] failed to persist", err);
  }
}

export function recordPendingInstall(version: string, releaseNotes?: string): void {
  writeState({ ...readState(), pending: { version, releaseNotes } });
}

let postUpdateInfo: PostUpdateInfo | null = null;
let initialized = false;

export function initPostUpdateDetection(): void {
  if (initialized) return;
  initialized = true;

  const current = app.getVersion();
  const state = readState();

  if (state.pending && state.pending.version === current) {
    postUpdateInfo = {
      version: current,
      releaseNotes: state.pending.releaseNotes,
    };
  }

  if (state.pending) writeState({});
}

export function consumePostUpdateInfo(): PostUpdateInfo | null {
  const info = postUpdateInfo;
  postUpdateInfo = null;
  return info;
}
