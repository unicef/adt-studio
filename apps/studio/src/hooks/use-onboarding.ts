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

let desktopCompleted = false

/**
 * Whether onboarding is done, asked of whoever owns the answer. In the desktop
 * build the main process persists it (`userData/onboarding-state.json`) and decides
 * which window opens, so the renderer must not hold a second opinion: a local flag
 * that disagreed would redirect the main window into the tour, which is built for
 * its own small window. The local flag stays as the web-build value and as the
 * fallback when the bridge is missing or fails.
 */
export async function resolveOnboardingCompleted(): Promise<boolean> {
  if (desktopCompleted) return true
  const bridge = typeof window !== "undefined" ? window.api?.onboarding : undefined
  if (!bridge?.getStatus) return hasCompletedOnboarding()
  try {
    const completed = await bridge.getStatus()
    if (completed) {
      desktopCompleted = true
      // Heal a local flag that drifted from the main process.
      markOnboardingCompleted()
    }
    return completed
  } catch {
    return hasCompletedOnboarding()
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
