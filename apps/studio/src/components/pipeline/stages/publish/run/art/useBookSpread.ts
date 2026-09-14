import { useBookConfig } from "@/hooks/use-book-config"

/**
 * Whether this book's renders after the cover are merged facing pairs.
 *
 * Read from the book's own config — `spread_mode` merges every pair automatically, `spread_pairs`
 * merges the listed ones by hand — because that is the same flag extraction read when it produced
 * the renders. Measuring it off an image instead (a body render twice the cover's aspect) would
 * misfire on genuinely landscape books, which is exactly the case it would be trusted for.
 */
export function useBookSpread(label: string | null): boolean {
  const config = useBookConfig(label ?? "")
  if (!label) return false
  const merged = config.data?.config
  if (!merged) return false
  return (
    merged.spread_mode === true ||
    (Array.isArray(merged.spread_pairs) && merged.spread_pairs.length > 0)
  )
}
