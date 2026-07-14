/**
 * Studio preview override for kids mode.
 *
 * Whether a book is a kids book is normally an author-time decision baked
 * into the packed book (`features.kidsMode`) — see kids.atoms.ts. Studio's
 * live preview additionally lets the author flip between the KIDS and
 * REGULAR chrome *without* changing that packed decision, purely to review
 * both experiences (apps/studio PreviewView.tsx).
 *
 * The preview iframe tags its URL with `?kidsMode=on|off`. Because every
 * page turn inside the book is a full page load, the query string does not
 * survive navigation — so the first read persists the override to
 * sessionStorage, and later page loads (which drop the query string) keep
 * honoring it for the rest of the tab's session. A fresh preview (new tab,
 * new iframe src without the param) starts overrideless again.
 *
 * This only ever takes effect in the dev/authoring preview context (see
 * `isKidsPreviewContext`), so a shipped, standalone book can never be
 * affected — even if a stray `?kidsMode=` query string somehow reached it.
 */

const OVERRIDE_STORAGE_KEY = "kidsModePreviewOverride"

export type KidsModePreviewOverride = "on" | "off" | null

/**
 * Detects the Studio dev/authoring preview context: the runtime dev server
 * (NODE_ENV=development) or any iframed runtime (Studio's preview always
 * runs the book in an iframe). A shipped book runs standalone
 * (window.parent === window) in production, so this never fires for real
 * readers.
 *
 * NOTE: `import.meta.env` is unusable here — the esbuild runtime build
 * leaves it undefined and reading it throws (this previously crashed the
 * preview). Only `process.env.NODE_ENV` is defined at build time.
 */
export function isKidsPreviewContext(): boolean {
  if (typeof window === "undefined") return false
  if (process.env.NODE_ENV === "development") return true
  try {
    // Any iframed runtime is a preview context — Studio's preview always runs
    // the book in an iframe. A shipped book runs standalone
    // (window.parent === window), so this never fires for real readers.
    if (window.parent !== window) return true
  } catch {
    // Cross-origin parent access can throw in sandboxed iframes — fall
    // through to "not a preview context".
  }
  return false
}

function readOverrideParam(): "on" | "off" | null {
  if (typeof window === "undefined") return null
  try {
    const value = new URLSearchParams(window.location.search).get("kidsMode")
    return value === "on" || value === "off" ? value : null
  } catch {
    return null
  }
}

function readStoredOverride(): KidsModePreviewOverride {
  try {
    if (typeof sessionStorage === "undefined") return null
    const value = sessionStorage.getItem(OVERRIDE_STORAGE_KEY)
    return value === "on" || value === "off" ? value : null
  } catch {
    return null
  }
}

function writeStoredOverride(value: "on" | "off"): void {
  try {
    if (typeof sessionStorage === "undefined") return
    sessionStorage.setItem(OVERRIDE_STORAGE_KEY, value)
  } catch {
    // Storage may be unavailable (privacy mode, quota, etc.) — the override
    // just won't survive the next page load.
  }
}

/**
 * Returns the effective kids-mode preview override for the current page:
 * "on" | "off" | null.
 *
 * Reads (and persists to sessionStorage) the `?kidsMode=on|off` query param
 * when present; otherwise falls back to a previously stored override so it
 * survives the full-page-load navigation between book pages. Returns null
 * outside the preview context, or when no override has ever been set.
 */
export function getKidsModePreviewOverride(): KidsModePreviewOverride {
  if (!isKidsPreviewContext()) return null

  const param = readOverrideParam()
  if (param) {
    writeStoredOverride(param)
    return param
  }

  return readStoredOverride()
}
