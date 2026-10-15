const FULL_HEIGHT_LANDINGS = new Set<string>(["extract", "sectioning"])

export function hasFullHeightLanding(slug: string): boolean {
  return FULL_HEIGHT_LANDINGS.has(slug)
}
