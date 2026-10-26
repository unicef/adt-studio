export type ThemeMode = "light" | "dark" | "system"

export const THEME_KEY = "adt.theme"
/** Kept in sync with the boot script in index.html, which runs before this module. */
export const DEFAULT_THEME: ThemeMode = "light"

/* eslint-disable-next-line lingui/no-unlocalized-strings -- CSS media query, not UI copy */
const DARK_QUERY = "(prefers-color-scheme: dark)"

/** True while a screen opts out of the theme (see useForceLightTheme). */
let suspended = false

function isThemeMode(value: string | null): value is ThemeMode {
  return value === "light" || value === "dark" || value === "system"
}

/** The user's stored preference, or the default when nothing is stored yet. */
export function readThemeMode(): ThemeMode {
  try {
    const stored = localStorage.getItem(THEME_KEY)
    return isThemeMode(stored) ? stored : DEFAULT_THEME
  } catch {
    return DEFAULT_THEME
  }
}

/** Whether a mode resolves to dark right now — "system" asks the OS. */
export function resolvesToDark(mode: ThemeMode): boolean {
  if (mode === "dark") return true
  if (mode !== "system") return false
  return window.matchMedia?.(DARK_QUERY).matches ?? false
}

/** Paint a mode onto the document without storing it. */
export function paintTheme(mode: ThemeMode): void {
  if (suspended) return
  document.documentElement.classList.toggle("dark", resolvesToDark(mode))
}

/** Store the user's choice and paint it. */
export function setThemeMode(mode: ThemeMode): void {
  try {
    localStorage.setItem(THEME_KEY, mode)
  } catch {
    /* preference is best-effort; painting still works */
  }
  paintTheme(mode)
}

/** Re-paint whatever the user last chose. */
export function applyStoredTheme(): void {
  paintTheme(readThemeMode())
}

/**
 * Suspends theme painting so a screen can opt out of it (the pipeline renders
 * light regardless of preference until it is themed). While suspended, an OS
 * colour-scheme change cannot repaint the document underneath that screen.
 */
export function setThemeSuspended(next: boolean): void {
  suspended = next
}

/**
 * Applies the stored preference and keeps "system" in step with the OS.
 *
 * The class itself is set by the boot script in index.html so the first paint
 * is already correct; this re-applies it from the same source of truth and adds
 * the listener React needs for later changes.
 */
export function initTheme(): () => void {
  applyStoredTheme()
  const media = window.matchMedia?.(DARK_QUERY)
  if (!media) return () => {}
  const onChange = () => {
    if (readThemeMode() === "system") applyStoredTheme()
  }
  media.addEventListener("change", onChange)
  return () => media.removeEventListener("change", onChange)
}
