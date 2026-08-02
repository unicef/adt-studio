type RenderStrategyLike = {
  render_type?: string | null
} | undefined

type RenderStrategyMap = Record<string, RenderStrategyLike>

export function listSelectableRenderStrategies(
  strategies: RenderStrategyMap
): string[] {
  return Object.keys(strategies).filter((name) => {
    const type = strategies[name]?.render_type
    // `activity` strategies are auto-assigned to matching section types.
    // `fixed_layout` is a book-wide rendering mode, not a per-section override.
    return type !== "activity" && type !== "fixed_layout"
  })
}

/**
 * Strategies that may be picked as the book-wide default. Same as
 * {@link listSelectableRenderStrategies} but also includes `fixed_layout`,
 * which is a valid whole-book rendering mode even though it cannot be assigned
 * to an individual section.
 */
export function listDefaultRenderStrategies(
  strategies: RenderStrategyMap
): string[] {
  return Object.keys(strategies).filter(
    (name) => strategies[name]?.render_type !== "activity"
  )
}

export function chooseDefaultRenderStrategyFallback(
  strategies: RenderStrategyMap
): string {
  // Prefer a reflowable strategy for the auto-fallback — `fixed_layout`
  // should only ever become the default when explicitly requested.
  const selectable = listSelectableRenderStrategies(strategies)
  if (selectable.includes("two_column")) return "two_column"
  return selectable[0] ?? ""
}

/**
 * Whether the book renders in fixed-layout mode. Mirrors the server-side
 * `isFixedLayoutBook` (packages/pipeline/src/fixed-layout-rendering.ts): a book
 * is fixed-layout if its book-wide default OR any per-section strategy resolves
 * to a `fixed_layout`-typed render strategy. The frontend can't import the
 * pipeline package (layer rule), so this replicates the same predicate over the
 * merged config record from `useActiveConfig`.
 */
export function isFixedLayoutConfig(
  merged: Record<string, unknown> | undefined | null
): boolean {
  if (!merged) return false
  const strategies = (
    merged.render_strategies && typeof merged.render_strategies === "object"
      ? merged.render_strategies
      : {}
  ) as RenderStrategyMap
  const names = new Set<string>()
  if (typeof merged.default_render_strategy === "string") {
    names.add(merged.default_render_strategy)
  }
  const sectionStrategies = merged.section_render_strategies
  if (sectionStrategies && typeof sectionStrategies === "object") {
    for (const name of Object.values(sectionStrategies as Record<string, unknown>)) {
      if (typeof name === "string") names.add(name)
    }
  }
  for (const name of names) {
    if (strategies[name]?.render_type === "fixed_layout") return true
  }
  return false
}

export function normalizeDefaultRenderStrategy(
  requested: string | null | undefined,
  strategies: RenderStrategyMap
): string {
  const trimmed = (requested ?? "").trim()
  const candidates = listDefaultRenderStrategies(strategies)

  if (candidates.length === 0) return ""
  if (!trimmed || trimmed === "dynamic") {
    return chooseDefaultRenderStrategyFallback(strategies)
  }
  if (candidates.includes(trimmed)) return trimmed

  return chooseDefaultRenderStrategyFallback(strategies)
}
