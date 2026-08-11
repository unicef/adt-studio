import { app } from "electron";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

interface OnboardingState {
  /** App version for which the user last finished onboarding. */
  completedVersion?: string;
  /** Legacy flag from builds that tracked completion as a boolean. Ignored. */
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

/**
 * Onboarding runs once per installed version. Completion is stamped with the
 * app version, and any version that differs from the last completed one shows
 * the flow again — so a fresh install (no state) and every install/update run
 * onboarding, regardless of whether the user installed the app before.
 *
 * This is keyed on the version because macOS keeps `userData` across
 * uninstall/reinstall: a plain boolean flag would suppress onboarding forever
 * after the first run, even on a brand-new install of a new build.
 *
 * Note: reinstalling the *exact same version* won't re-show onboarding, since
 * the persisted version still matches. Normal releases always bump the version,
 * so each distributed install shows it once.
 */
export function hasCompletedOnboarding(): boolean {
  return readState().completedVersion === app.getVersion();
}

export function markOnboardingCompleted(): void {
  writeState({ completedVersion: app.getVersion() });
}
