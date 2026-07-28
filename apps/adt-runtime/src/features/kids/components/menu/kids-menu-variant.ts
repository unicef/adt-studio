/**
 * Which buddy-menu design to render.
 *
 * Three interaction models are shipping side by side while we learn which one
 * children get on with. The choice is picked once during onboarding and can be
 * forced with `?kidsMenu=<id>` for review; it is stored per reader, never in
 * the book config.
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

/**
 * A `?kidsMenu=` query parameter wins over the stored choice so a reviewer can
 * jump straight to one design without walking through onboarding.
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
