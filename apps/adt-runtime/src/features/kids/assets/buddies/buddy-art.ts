export interface BuddyPalette {
  id: string
  labelKey: string
  labelFallback: string
  primary: string
  secondary: string
  accent: string
}

export interface BuddyArt {
  id: string
  svg: string
  palettes: readonly BuddyPalette[]
}

export function buddyPaletteVars(
  palette: Pick<BuddyPalette, "primary" | "secondary" | "accent">,
): Record<string, string> {
  return {
    "--buddy-primary": palette.primary,
    "--buddy-secondary": palette.secondary,
    "--buddy-accent": palette.accent,
  }
}
