/* eslint-disable lingui/no-unlocalized-strings -- design tokens: color hexes and CSS gradient strings, never user-facing */
import type { CSSProperties } from "react"
import betaLogoSrc from "@/assets/update-icons/beta-512x512.png?url"

/**
 * Single source of truth for the onboarding accent + brand mark.
 *
 * The beta release wears the app's own beta identity: the violet/magenta tone
 * (hue ~305, matching the beta update banner and the beta app icon) instead of
 * the stable blue, and the beta app icon (purple, with the BETA pill) instead
 * of the blue stable logo. Every accent surface in the onboarding — buttons,
 * glows, the demo cursor, the feature demo panel, tints and washes — reads from
 * these values (as CSS variables via {@link onboardingThemeVars}, or imported
 * directly for inline gradients / the logo). Change the palette here and the
 * whole flow follows; to restore the stable blue, set `--ob-accent` back to
 * `#3b82f7` and swap {@link OB_LOGO_SRC} for the stable icon.
 */
export const OB_ACCENT = "#9a41e4"
export const OB_ACCENT_STRONG = "#7e29c7"
export const OB_ACCENT_DEEP = "#6022a2"
/** RGB channels only, for `rgba(var(--ob-accent-rgb), a)` glows. */
export const OB_ACCENT_RGB = "154, 65, 228"
/** Soft fill behind badges / active nav rows. */
export const OB_ACCENT_TINT = "#f3dfff"
/** Faint page wash (web build backdrop, demo card backgrounds). */
export const OB_ACCENT_WASH = "#fbf3ff"
/** Rich gradient for the feature demo panel. */
export const OB_PANEL_GRADIENT =
  "linear-gradient(150deg, #e365ff 0%, #8a3ee0 55%, #4c258c 100%)"

/** The beta app icon — the brand mark shown throughout the beta onboarding. */
export const OB_LOGO_SRC = betaLogoSrc

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
