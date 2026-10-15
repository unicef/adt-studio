import { useVariant, type VariantState } from "@/components/app/lab/variants"
import { FOUNDATION_SLUGS } from "./dockSlugs"

const FOUNDATION_PICKS = {
  running: "live",
  loaders: "content",
  landing: "action-first",
  entry: "gated",
} as const satisfies Partial<VariantState>

type FoundationKey = keyof typeof FOUNDATION_PICKS

export function isFoundationSlug(slug: string | undefined): boolean {
  return !!slug && (FOUNDATION_SLUGS as readonly string[]).includes(slug)
}

export function useStepVariant<K extends FoundationKey>(key: K, slug: string | undefined): VariantState[K] {
  const lab = useVariant(key)
  return isFoundationSlug(slug) ? (FOUNDATION_PICKS[key] as VariantState[K]) : lab
}
