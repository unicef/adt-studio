import { msg } from "@lingui/core/macro"
import type { MessageDescriptor } from "@lingui/core"
import type { ReaderColorTokens, ReaderFont, ReaderUi } from "@adt/types"

export interface ReaderThemePreset {
  id: string
  label: MessageDescriptor
  description: MessageDescriptor
  light: ReaderColorTokens
  dark: ReaderColorTokens
  radius: number
  font: ReaderFont
}

/** Colour, shape and type bundles. Applying one leaves the layout alone. */
export const READER_THEME_PRESETS: ReaderThemePreset[] = [
  {
    id: "neutral",
    label: msg`Neutral`,
    description: msg`The default shadcn palette.`,
    light: {},
    dark: {},
    radius: 0.625,
    font: "default",
  },
  {
    id: "school",
    label: msg`School notebook`,
    description: msg`Deep teal with warm paper tones.`,
    light: {
      background: "#fbf8f1",
      foreground: "#1d1d1b",
      popover: "#ffffff",
      "popover-foreground": "#1d1d1b",
      card: "#ffffff",
      "card-foreground": "#1d1d1b",
      primary: "#0b5a55",
      "primary-foreground": "#ffffff",
      secondary: "#f3efe6",
      "secondary-foreground": "#33302a",
      muted: "#f4f1ea",
      "muted-foreground": "#6b675e",
      accent: "#cdeceb",
      "accent-foreground": "#0b4542",
      destructive: "#d64535",
      border: "#e3ddd0",
      input: "#e3ddd0",
      ring: "#0b5a55",
    },
    dark: {
      background: "#141a19",
      foreground: "#eef2f1",
      card: "#141a19",
      "card-foreground": "#eef2f1",
      popover: "#1e2423",
      "popover-foreground": "#eef2f1",
      primary: "#5cc8bf",
      "primary-foreground": "#06302d",
      secondary: "#2a3331",
      "secondary-foreground": "#eef2f1",
      muted: "#2a3331",
      "muted-foreground": "#a7b3b0",
      accent: "#18403d",
      "accent-foreground": "#d5f3f0",
      border: "#34403e",
      input: "#34403e",
      ring: "#5cc8bf",
    },
    radius: 0.75,
    font: "rounded",
  },
  {
    id: "ocean",
    label: msg`Ocean`,
    description: msg`Calm blues with crisp edges.`,
    light: {
      popover: "#ffffff",
      "popover-foreground": "#0f172a",
      foreground: "#0f172a",
      primary: "#1d4ed8",
      "primary-foreground": "#ffffff",
      accent: "#dbeafe",
      "accent-foreground": "#1e3a8a",
      muted: "#f1f5f9",
      "muted-foreground": "#64748b",
      border: "#dbe3f0",
      input: "#dbe3f0",
      ring: "#3b82f6",
    },
    dark: {
      background: "#0a1324",
      foreground: "#e2e8f0",
      card: "#0a1324",
      "card-foreground": "#e2e8f0",
      popover: "#0f1b33",
      "popover-foreground": "#e2e8f0",
      primary: "#60a5fa",
      "primary-foreground": "#0b1220",
      secondary: "#1a2742",
      "secondary-foreground": "#e2e8f0",
      muted: "#1a2742",
      "muted-foreground": "#94a3b8",
      accent: "#1e3a8a",
      "accent-foreground": "#dbeafe",
      border: "#26365a",
      input: "#26365a",
      ring: "#60a5fa",
    },
    radius: 0.5,
    font: "default",
  },
  {
    id: "forest",
    label: msg`Forest`,
    description: msg`Leafy greens, soft corners.`,
    light: {
      popover: "#fbfdf9",
      "popover-foreground": "#14261a",
      foreground: "#14261a",
      primary: "#166534",
      "primary-foreground": "#ffffff",
      accent: "#dcfce7",
      "accent-foreground": "#14532d",
      muted: "#f0f5ee",
      "muted-foreground": "#5b6b5f",
      border: "#d9e6d5",
      input: "#d9e6d5",
      ring: "#22c55e",
    },
    dark: {
      background: "#0d1712",
      foreground: "#e3f1e7",
      card: "#0d1712",
      "card-foreground": "#e3f1e7",
      popover: "#13201a",
      "popover-foreground": "#e3f1e7",
      primary: "#4ade80",
      "primary-foreground": "#052e16",
      secondary: "#1c2d24",
      "secondary-foreground": "#e3f1e7",
      muted: "#1c2d24",
      "muted-foreground": "#9fb5a6",
      accent: "#14532d",
      "accent-foreground": "#dcfce7",
      border: "#2a3d32",
      input: "#2a3d32",
      ring: "#4ade80",
    },
    radius: 0.875,
    font: "default",
  },
  {
    id: "playful",
    label: msg`Playful`,
    description: msg`Bright and rounded, for younger readers.`,
    light: {
      popover: "#fffbf2",
      "popover-foreground": "#2b1d0e",
      foreground: "#2b1d0e",
      primary: "#7c3aed",
      "primary-foreground": "#ffffff",
      accent: "#fde68a",
      "accent-foreground": "#713f12",
      muted: "#fdf3dc",
      "muted-foreground": "#8a6a3f",
      border: "#f3e3c3",
      input: "#f3e3c3",
      ring: "#7c3aed",
    },
    dark: {
      background: "#1a1129",
      foreground: "#f5edff",
      card: "#1a1129",
      "card-foreground": "#f5edff",
      popover: "#24183a",
      "popover-foreground": "#f5edff",
      primary: "#c4b5fd",
      "primary-foreground": "#2e1065",
      secondary: "#33244d",
      "secondary-foreground": "#f5edff",
      muted: "#33244d",
      "muted-foreground": "#c1b2d9",
      accent: "#854d0e",
      "accent-foreground": "#fef3c7",
      border: "#45335f",
      input: "#45335f",
      ring: "#c4b5fd",
    },
    radius: 1.25,
    font: "rounded",
  },
  {
    id: "contrast",
    label: msg`High contrast`,
    description: msg`Black, white and yellow for low vision.`,
    light: {
      background: "#000000",
      foreground: "#ffffff",
      popover: "#000000",
      "popover-foreground": "#ffffff",
      card: "#000000",
      "card-foreground": "#ffffff",
      primary: "#ffd600",
      "primary-foreground": "#000000",
      secondary: "#1a1a1a",
      "secondary-foreground": "#ffffff",
      muted: "#1a1a1a",
      "muted-foreground": "#e5e5e5",
      accent: "#ffd600",
      "accent-foreground": "#000000",
      border: "#ffffff",
      input: "#ffffff",
      ring: "#ffd600",
    },
    dark: {
      background: "#000000",
      foreground: "#ffffff",
      card: "#000000",
      "card-foreground": "#ffffff",
      popover: "#000000",
      "popover-foreground": "#ffffff",
      primary: "#ffd600",
      "primary-foreground": "#000000",
      secondary: "#1a1a1a",
      "secondary-foreground": "#ffffff",
      muted: "#1a1a1a",
      "muted-foreground": "#e5e5e5",
      accent: "#ffd600",
      "accent-foreground": "#000000",
      border: "#ffffff",
      input: "#ffffff",
      ring: "#ffd600",
    },
    radius: 0.25,
    font: "default",
  },
]

export function applyThemePreset(ui: ReaderUi, preset: ReaderThemePreset): ReaderUi {
  return {
    ...ui,
    light: { ...preset.light },
    dark: { ...preset.dark },
    radius: preset.radius,
    font: preset.font,
  }
}

function sameRecord(a: Record<string, unknown> | undefined, b: Record<string, unknown> | undefined): boolean {
  const ka = Object.keys(a ?? {}).filter((k) => a?.[k] !== undefined)
  const kb = Object.keys(b ?? {}).filter((k) => b?.[k] !== undefined)
  if (ka.length !== kb.length) return false
  return ka.every((k) => String(a?.[k]).toLowerCase() === String(b?.[k]).toLowerCase())
}

/** The theme preset the reader UI currently matches exactly, if any. */
export function matchThemePreset(ui: ReaderUi): string | null {
  const preset = READER_THEME_PRESETS.find(
    (p) =>
      sameRecord(p.light, ui.light) &&
      sameRecord(p.dark, ui.dark) &&
      (ui.radius ?? 0.625) === p.radius &&
      (ui.font ?? "default") === p.font,
  )
  return preset?.id ?? null
}

