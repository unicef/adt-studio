/* eslint-disable lingui/no-unlocalized-strings -- design tokens: color hexes and CSS gradient strings, never user-facing */
import type { CSSProperties } from "react"
import betaLogoSrc from "@/assets/update-icons/beta-512x512.png?url"
import stableLogoSrc from "@/assets/update-icons/stable-512x512.png?url"

/**
 * Single source of truth for the onboarding accent + brand mark, resolved by
 * release channel.
 *
 * A **beta** build wears the app's beta identity — the violet/magenta tone
 * (hue ~305, matching the beta update banner and the beta app icon), the beta
 * app icon, and the extra "how the beta works" step. A **stable** build wears
 * the standard blue accent and the stable app icon, with no beta step. The
 * channel is read once from the app version (`-beta` ⇒ beta); the web build has
 * no version so it defaults to stable, and `?channel=beta|stable` overrides it
 * for previewing either flow in the browser.
 *
 * Every accent surface in the onboarding — buttons, glows, the demo cursor, the
 * feature demo panel, tints and washes — reads from these values (as CSS
 * variables via {@link onboardingThemeVars}, or imported directly for inline
 * gradients / the logo), so the whole flow follows the resolved channel.
 */
export type OnboardingChannel = "stable" | "beta"

function detectOnboardingChannel(): OnboardingChannel {
  if (typeof window === "undefined") return "stable"
  try {
    const override = new URLSearchParams(window.location.search).get("channel")
    if (override === "beta" || override === "stable") return override
  } catch {
    // location unavailable — fall through to version detection
  }
  const version = window.api?.version
  return version && version.toLowerCase().includes("-beta") ? "beta" : "stable"
}

export const OB_CHANNEL: OnboardingChannel = detectOnboardingChannel()
export const OB_IS_BETA = OB_CHANNEL === "beta"

const PALETTES = {
  stable: {
    accent: "#3b82f7",
    strong: "#2563eb",
    rgb: "59, 130, 247",
    tint: "#dbeafe",
    wash: "#f5f8ff",
    panel: "linear-gradient(150deg, #5aa2ff 0%, #3b82f7 55%, #1e3a8a 100%)",
    providerPanel:
      "radial-gradient(120% 90% at 20% 12%, #cfe0ff 0%, #6ea8ff 34%, #3b82f7 62%, #1e3a8a 100%)",
    accentGradient: "linear-gradient(90deg,#2563eb,#22a3ff,#4f46e5,#2563eb)",
    logo: stableLogoSrc,
  },
  beta: {
    accent: "#9a41e4",
    strong: "#7e29c7",
    rgb: "154, 65, 228",
    tint: "#f3dfff",
    wash: "#fbf3ff",
    panel: "linear-gradient(150deg, #e365ff 0%, #8a3ee0 55%, #4c258c 100%)",
    providerPanel:
      "radial-gradient(120% 90% at 20% 12%, #efc9ff 0%, #c56bff 34%, #9a41e4 62%, #5a1e97 100%)",
    accentGradient: "linear-gradient(90deg,#9a41e4,#c56bff,#7e29c7,#9a41e4)",
    logo: betaLogoSrc,
  },
} as const

const P = PALETTES[OB_CHANNEL]

export const OB_ACCENT = P.accent
export const OB_ACCENT_STRONG = P.strong
/** RGB channels only, for `rgba(var(--ob-accent-rgb), a)` glows. */
export const OB_ACCENT_RGB = P.rgb
/** Soft fill behind badges / active nav rows. */
export const OB_ACCENT_TINT = P.tint
/** Faint page wash (web build backdrop, demo card backgrounds). */
export const OB_ACCENT_WASH = P.wash
/** Rich gradient for the feature demo panel. */
export const OB_PANEL_GRADIENT = P.panel
/** Rich radial for the provider preview panel. */
export const OB_PROVIDER_PANEL = P.providerPanel
/** Flowing gradient for the finale accent word. */
export const OB_ACCENT_GRADIENT = P.accentGradient

/** The channel's app icon — the brand mark shown throughout the onboarding. */
export const OB_LOGO_SRC = P.logo

/**
 * CSS custom properties applied to the onboarding root so descendants can use
 * `bg-[var(--ob-accent)]`, `rgba(var(--ob-accent-rgb), a)`, etc. Custom
 * properties inherit, so setting them once on the shell covers every scene.
 */
export const onboardingThemeVars: CSSProperties = {
  "--ob-accent": OB_ACCENT,
  "--ob-accent-strong": OB_ACCENT_STRONG,
  "--ob-accent-rgb": OB_ACCENT_RGB,
  "--ob-accent-tint": OB_ACCENT_TINT,
  "--ob-accent-wash": OB_ACCENT_WASH,
} as CSSProperties
