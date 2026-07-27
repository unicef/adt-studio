import { useActiveConfig } from "@/hooks/use-debug"
import { isFixedLayoutConfig } from "@/lib/render-strategy"

/**
 * Whether the book renders in fixed-layout mode, derived from the merged
 * config. Returns `false` until the config has loaded, so callers never flash a
 * false-positive warning. See {@link isFixedLayoutConfig} for the predicate.
 */
export function useIsFixedLayout(label: string): boolean {
  const { data } = useActiveConfig(label)
  return isFixedLayoutConfig(data?.merged)
}
