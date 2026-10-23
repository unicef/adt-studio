import { FOUNDATION_SLUGS, PLUGIN_SLUGS } from "@/components/app/screens/pipeline/shared/dockSlugs"

const FULL_HEIGHT_LANDINGS = new Set<string>([...FOUNDATION_SLUGS, ...PLUGIN_SLUGS])

export function hasFullHeightLanding(slug: string): boolean {
  return FULL_HEIGHT_LANDINGS.has(slug)
}
