import { app } from "electron";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface PostUpdateInfo {
  version: string;
  releaseNotes?: string;
}

interface UpdateState {
  lastVersion?: string;
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

const FAKE_POSTUPDATE_NOTES = [
  "## Highlights",
  "",
  "- **Redesigned update experience** end to end",
  "- Cancelable downloads with live progress",
  "- A friendly *What's new* summary after every update",
  "",
  "![ADT Studio](/logo.png)",
  "",
  "Read the [full changelog](https://github.com/unicef/adt-studio/releases).",
].join("\n");

export function initPostUpdateDetection(): void {
  if (initialized) return;
  initialized = true;

  if (!app.isPackaged && process.env.ADT_FAKE_POSTUPDATE === "1") {
    postUpdateInfo = {
      version: app.getVersion(),
      releaseNotes: FAKE_POSTUPDATE_NOTES,
    };
    return;
  }

  const current = app.getVersion();
  const state = readState();

  if (state.pending && state.pending.version === current) {
    postUpdateInfo = {
      version: current,
      releaseNotes: state.pending.releaseNotes,
    };
  }

  writeState({ lastVersion: current });
}

export function consumePostUpdateInfo(): PostUpdateInfo | null {
  const info = postUpdateInfo;
  postUpdateInfo = null;
  return info;
}
