import type { CSSProperties } from "react"

/**
 * Single source of truth for the onboarding accent color.
 *
 * The beta release uses a pink accent to visually distinguish it from the
 * stable (blue) product. Every accent surface in the onboarding — buttons,
 * glows, the demo cursor, the feature demo panel, tints and washes — reads from
 * these values (as CSS variables via {@link onboardingThemeVars}, or imported
 * directly for inline gradients). Change the palette here and the whole flow
 * follows; to restore the stable blue set `--ob-accent` back to `#3b82f7` and
 * friends.
 */
export const OB_ACCENT = "#ec4899"
export const OB_ACCENT_STRONG = "#db2777"
export const OB_ACCENT_DEEP = "#be185d"
/** RGB channels only, for `rgba(var(--ob-accent-rgb), a)` glows. */
export const OB_ACCENT_RGB = "236, 72, 153"
/** Soft fill behind badges / active nav rows. */
export const OB_ACCENT_TINT = "#fce7f3"
/** Faint page wash (web build backdrop, demo card backgrounds). */
export const OB_ACCENT_WASH = "#fdf2f8"
/** Rich gradient for the feature demo panel. */
export const OB_PANEL_GRADIENT =
  "linear-gradient(150deg, #f472b6 0%, #db2777 60%, #a1104f 100%)"

/**
 * CSS custom properties applied to the onboarding root so descendants can use
 * `bg-[var(--ob-accent)]`, `rgba(var(--ob-accent-rgb), a)`, etc. Custom
 * properties inherit, so setting them once on the shell covers every scene.
 */
export const onboardingThemeVars: CSSProperties = {
  "--ob-accent": OB_ACCENT,
  "--ob-accent-strong": OB_ACCENT_STRONG,
  "--ob-accent-deep": OB_ACCENT_DEEP,
  "--ob-accent-rgb": OB_ACCENT_RGB,
  "--ob-accent-tint": OB_ACCENT_TINT,
  "--ob-accent-wash": OB_ACCENT_WASH,
} as CSSProperties
