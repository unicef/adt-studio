import type { CSSProperties } from "react"
import type { BuddyArt, BuddyPalette } from "@/features/kids/assets/buddies/buddy-art"

type BuddyPaletteOverride = Partial<
  Pick<BuddyPalette, "primary" | "secondary" | "accent">
>

export interface KidsBuddyArtProps {
  art: BuddyArt
  palette?: BuddyPaletteOverride | BuddyPalette
  className?: string
  title?: string
}

function partialPaletteVars(
  palette: BuddyPaletteOverride,
): Record<string, string> {
  const vars: Record<string, string> = {}

  if (palette.primary) vars["--buddy-primary"] = palette.primary
  if (palette.secondary) vars["--buddy-secondary"] = palette.secondary
  if (palette.accent) vars["--buddy-accent"] = palette.accent

  return vars
}

/**
 * Renders build-time buddy SVG constants inline so palette CSS variables can
 * cascade into layered character art. The injected SVG strings are authored in
 * this repository and are never user input.
 */
export function KidsBuddyArt({
  art,
  palette,
  className,
  title,
}: KidsBuddyArtProps) {
  const style = palette
    ? (partialPaletteVars(palette) as CSSProperties)
    : undefined

  return (
    <span
      className={className}
      style={style}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      dangerouslySetInnerHTML={{ __html: art.svg }}
    />
  )
}
