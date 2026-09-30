import { app } from "electron";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

interface OnboardingState {
  completed?: boolean;
}

function statePath(): string {
  return join(app.getPath("userData"), "onboarding-state.json");
}

function readState(): OnboardingState {
  try {
    return JSON.parse(readFileSync(statePath(), "utf8")) as OnboardingState;
  } catch {
    return {};
  }
}

function writeState(state: OnboardingState): void {
  try {
    writeFileSync(statePath(), JSON.stringify(state), "utf8");
  } catch (err) {
    console.error("[onboarding-state] failed to persist", err);
  }
}

export function hasCompletedOnboarding(): boolean {
  return readState().completed === true;
}

export function markOnboardingCompleted(): void {
  writeState({ ...readState(), completed: true });
}
