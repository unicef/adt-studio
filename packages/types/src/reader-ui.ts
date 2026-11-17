/**
 * Reader UI customization — the look and layout of the reader chrome
 * (`apps/adt-runtime`) that an author picks in Studio's "Reader" step.
 *
 * Deliberately free of zod: the runtime bundle imports this module through the
 * `@adt/types/reader-ui` subpath and must not pull a schema library into every
 * book. The matching zod schema lives in `reader-ui-schema.ts` and is checked
 * against these types at compile time.
 *
 * Book config stores it under `reader_ui` (snake_case like the rest of the
 * YAML); packaging copies it verbatim into the bundle's `assets/config.json`
 * as `readerUi`. Only the variation the author chose ships — the reader has no
 * picker for any of it.
 */

/** shadcn colour tokens the chrome reads (see adt-runtime `globals.css`). */
export const READER_COLOR_TOKENS = [
  "background",
  "foreground",
  "card",
  "card-foreground",
  "popover",
  "popover-foreground",
  "primary",
  "primary-foreground",
  "secondary",
  "secondary-foreground",
  "muted",
  "muted-foreground",
  "accent",
  "accent-foreground",
  "destructive",
  "border",
  "input",
  "ring",
] as const
export type ReaderColorToken = (typeof READER_COLOR_TOKENS)[number]
export type ReaderColorTokens = Partial<Record<ReaderColorToken, string>>

export const READER_DOCK_POSITIONS = ["bottom", "top", "left", "right"] as const
export type ReaderDockPosition = (typeof READER_DOCK_POSITIONS)[number]

export const READER_DOCK_WIDTHS = ["full", "compact"] as const
export type ReaderDockWidth = (typeof READER_DOCK_WIDTHS)[number]

export const READER_DOCK_ALIGNS = ["spread", "center"] as const
export type ReaderDockAlign = (typeof READER_DOCK_ALIGNS)[number]

/** `popover`: a floating card anchored to its dock button (the default).
 *  `drawer`: a full-height side panel. */
export const READER_PANEL_STYLES = ["popover", "drawer"] as const
export type ReaderPanelStyle = (typeof READER_PANEL_STYLES)[number]

export const READER_PANEL_SIDES = ["left", "right"] as const
export type ReaderPanelSide = (typeof READER_PANEL_SIDES)[number]

/** `overlay`: the drawer floats over the book.
 *  `push`: the drawer takes its width from the book, which reflows beside it. */
export const READER_PANEL_BEHAVIORS = ["overlay", "push"] as const
export type ReaderPanelBehavior = (typeof READER_PANEL_BEHAVIORS)[number]

/** How dock buttons present themselves: the glyph, the glyph and its name, or the name. */
export const READER_BUTTON_STYLES = ["icon", "icon-label", "label"] as const
export type ReaderButtonStyle = (typeof READER_BUTTON_STYLES)[number]

export const READER_FONTS = ["default", "rounded", "serif", "mono"] as const
export type ReaderFont = (typeof READER_FONTS)[number]

export interface ReaderUiLayout {
  dock_position?: ReaderDockPosition
  dock_width?: ReaderDockWidth
  dock_align?: ReaderDockAlign
  panel_style?: ReaderPanelStyle
  panel_side?: ReaderPanelSide
  panel_behavior?: ReaderPanelBehavior
  button_style?: ReaderButtonStyle
}

export interface ReaderUi {
  layout?: ReaderUiLayout
  /** Colour overrides for the light chrome. Unset tokens keep the default. */
  light?: ReaderColorTokens
  /** Colour overrides for the dark chrome. Unset tokens keep the default. */
  dark?: ReaderColorTokens
  /** Base corner radius in rem (shadcn `--radius`). */
  radius?: number
  font?: ReaderFont
}

export const READER_RADIUS_MIN = 0
export const READER_RADIUS_MAX = 2
export const DEFAULT_READER_RADIUS = 0.625

export const DEFAULT_READER_LAYOUT: Required<ReaderUiLayout> = {
  dock_position: "bottom",
  dock_width: "full",
  dock_align: "spread",
  panel_style: "popover",
  panel_side: "left",
  panel_behavior: "overlay",
  button_style: "icon",
}

/**
 * The shadcn neutral palette the runtime ships with, restated so an editor can
 * show the effective value of a token the author has not overridden. Must stay
 * in step with `apps/adt-runtime/src/styles/globals.css`.
 */
export const DEFAULT_READER_COLORS: Record<"light" | "dark", Record<ReaderColorToken, string>> = {
  light: {
    background: "oklch(1 0 0)",
    foreground: "oklch(0.145 0 0)",
    card: "oklch(1 0 0)",
    "card-foreground": "oklch(0.145 0 0)",
    popover: "oklch(1 0 0)",
    "popover-foreground": "oklch(0.145 0 0)",
    primary: "oklch(0.205 0 0)",
    "primary-foreground": "oklch(0.985 0 0)",
    secondary: "oklch(0.97 0 0)",
    "secondary-foreground": "oklch(0.205 0 0)",
    muted: "oklch(0.97 0 0)",
    "muted-foreground": "oklch(0.556 0 0)",
    accent: "oklch(0.97 0 0)",
    "accent-foreground": "oklch(0.205 0 0)",
    destructive: "oklch(0.577 0.245 27.325)",
    border: "oklch(0.922 0 0)",
    input: "oklch(0.922 0 0)",
    ring: "oklch(0.708 0 0)",
  },
  dark: {
    background: "oklch(0.145 0 0)",
    foreground: "oklch(0.985 0 0)",
    card: "oklch(0.205 0 0)",
    "card-foreground": "oklch(0.985 0 0)",
    popover: "oklch(0.269 0 0)",
    "popover-foreground": "oklch(0.985 0 0)",
    primary: "oklch(0.922 0 0)",
    "primary-foreground": "oklch(0.205 0 0)",
    secondary: "oklch(0.269 0 0)",
    "secondary-foreground": "oklch(0.985 0 0)",
    muted: "oklch(0.269 0 0)",
    "muted-foreground": "oklch(0.708 0 0)",
    accent: "oklch(0.371 0 0)",
    "accent-foreground": "oklch(0.985 0 0)",
    destructive: "oklch(0.704 0.191 22.216)",
    border: "oklch(1 0 0 / 10%)",
    input: "oklch(1 0 0 / 15%)",
    ring: "oklch(0.556 0 0)",
  },
}

export const READER_FONT_STACKS: Record<Exclude<ReaderFont, "default">, string> = {
  rounded: 'ui-rounded, "SF Pro Rounded", "Nunito", "Varela Round", "Quicksand", system-ui, sans-serif',
  serif: 'ui-serif, Georgia, Cambria, "Times New Roman", serif',
  mono: 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
}

/**
 * A CSS colour value safe to interpolate into a stylesheet: hex, a colour
 * keyword, or a colour function. Rejects anything that could close the
 * declaration (`;`, `{`, `}`), open a comment, or reach a URL.
 */
const SAFE_CSS_COLOR = /^(?!.*(?:url|expression|\/\*))[#a-zA-Z0-9(),.%\s/+-]{1,64}$/i

export function isSafeReaderCssColor(value: string): boolean {
  return SAFE_CSS_COLOR.test(value.trim())
}

/** The chrome roots: the dock and its popovers/drawers both portal here. */
const CHROME_ROOTS = ["#interface-container", "#nav-container"] as const

function tokenDeclarations(tokens: ReaderColorTokens | undefined): string[] {
  if (!tokens) return []
  const out: string[] = []
  for (const token of READER_COLOR_TOKENS) {
    const value = tokens[token]
    if (typeof value !== "string" || !isSafeReaderCssColor(value)) continue
    out.push(`--${token}: ${value.trim()};`)
  }
  return out
}

function clampRadius(radius: number): number {
  return Math.min(READER_RADIUS_MAX, Math.max(READER_RADIUS_MIN, radius))
}

/**
 * Stylesheet that applies a reader UI's tokens to the chrome only — the book
 * content keeps its own palette, exactly as the light/dark theme switch does.
 * Light overrides are scoped with `:not(.dark)` so they never leak into dark
 * mode when the author customised only one of the two.
 *
 * Shared by packaging (baked into the bundle's CSS, so there is no flash of the
 * default chrome) and the runtime (live updates from the Studio editor).
 */
export function buildReaderUiCss(ui: ReaderUi | null | undefined): string {
  if (!ui) return ""
  const rules: string[] = []
  const all = CHROME_ROOTS.join(", ")
  const light = CHROME_ROOTS.map((root) => `${root}:not(.dark)`).join(", ")
  const dark = CHROME_ROOTS.map((root) => `${root}.dark`).join(", ")

  const shared: string[] = []
  if (typeof ui.radius === "number" && Number.isFinite(ui.radius)) {
    shared.push(`--radius: ${clampRadius(ui.radius)}rem;`)
  }
  if (ui.font && ui.font !== "default" && READER_FONT_STACKS[ui.font]) {
    shared.push(`font-family: ${READER_FONT_STACKS[ui.font]};`)
  }
  if (shared.length > 0) rules.push(`${all} { ${shared.join(" ")} }`)

  const lightDecls = tokenDeclarations(ui.light)
  if (lightDecls.length > 0) rules.push(`${light} { ${lightDecls.join(" ")} }`)
  const darkDecls = tokenDeclarations(ui.dark)
  if (darkDecls.length > 0) rules.push(`${dark} { ${darkDecls.join(" ")} }`)

  return rules.join("\n")
}

/** The layout a reader UI resolves to, with every unset field defaulted. */
export function resolveReaderUiLayout(
  layout: ReaderUiLayout | null | undefined,
): Required<ReaderUiLayout> {
  return { ...DEFAULT_READER_LAYOUT, ...(layout ?? {}) }
}

/** True when the reader UI says anything at all (an empty object ships nothing). */
export function hasReaderUiCustomization(ui: ReaderUi | null | undefined): boolean {
  if (!ui) return false
  return (
    (ui.layout !== undefined && Object.keys(ui.layout).length > 0) ||
    (ui.light !== undefined && Object.keys(ui.light).length > 0) ||
    (ui.dark !== undefined && Object.keys(ui.dark).length > 0) ||
    ui.radius !== undefined ||
    (ui.font !== undefined && ui.font !== "default")
  )
}
