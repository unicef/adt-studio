const STORAGE_KEY = "adt-studio-onboarding-completed"

export function hasCompletedOnboarding(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1"
  } catch {
    return false
  }
}

export function markOnboardingCompleted(): void {
  try {
    localStorage.setItem(STORAGE_KEY, "1")
  } catch {
    // localStorage unavailable
  }
}

/**
 * In the desktop build the onboarding runs in its own small window. Finishing
 * hands off to the main process, which persists completion and opens the main
 * app window on `startPath`. Returns `true` when the handoff was made, so the
 * caller skips the in-window navigation used by the web build.
 */
export function finishOnboardingViaBridge(startPath: string): boolean {
  const bridge =
    typeof window !== "undefined" ? window.api?.onboarding : undefined
  if (!bridge) return false
  markOnboardingCompleted()
  void bridge.finish(startPath)
  return true
}
