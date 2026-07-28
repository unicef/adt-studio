/**
 * Which buddy-menu design to render.
 *
 * Three interaction models ship side by side while the team decides which one
 * children get on with. The choice comes from the temporary dev switch in the
 * reader and can be forced with `?kidsMenu=<id>` for review; it is stored per
 * reader, never in the book config.
 */
export const KIDS_MENU_VARIANTS = ["classic", "chat", "shelf"] as const

export type KidsMenuVariant = (typeof KIDS_MENU_VARIANTS)[number]

export const DEFAULT_KIDS_MENU_VARIANT: KidsMenuVariant = "classic"

export function isKidsMenuVariant(
  value: string | null | undefined,
): value is KidsMenuVariant {
  return (
    typeof value === "string" &&
    (KIDS_MENU_VARIANTS as readonly string[]).includes(value)
  )
}

/** Drops the query override so a stored choice can take effect again. */
export function clearKidsMenuVariantOverride(): void {
  if (typeof window === "undefined") return
  try {
    const url = new URL(window.location.href)
    if (!url.searchParams.has("kidsMenu")) return
    url.searchParams.delete("kidsMenu")
    window.history.replaceState(null, "", url.toString())
  } catch {
    // A history failure just leaves the override in place for this page.
  }
}

/**
 * A `?kidsMenu=` query parameter wins over the stored choice so a reviewer can
 * jump straight to one design.
 */
export function getKidsMenuVariantOverride(): KidsMenuVariant | null {
  if (typeof window === "undefined") return null
  try {
    const fromQuery = new URLSearchParams(window.location.search).get(
      "kidsMenu",
    )
    return isKidsMenuVariant(fromQuery) ? fromQuery : null
  } catch {
    return null
  }
}
