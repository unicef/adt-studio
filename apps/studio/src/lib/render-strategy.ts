type RenderStrategyLike = {
  render_type?: string | null
} | undefined

type RenderStrategyMap = Record<string, RenderStrategyLike>

export function listSelectableRenderStrategies(
  strategies: RenderStrategyMap
): string[] {
  return Object.keys(strategies).filter(
    (name) => strategies[name]?.render_type !== "activity"
  )
}

export function chooseDefaultRenderStrategyFallback(
  strategies: RenderStrategyMap
): string {
  const selectable = listSelectableRenderStrategies(strategies)
  if (selectable.includes("two_column")) return "two_column"
  return selectable[0] ?? ""
}

export function normalizeDefaultRenderStrategy(
  requested: string | null | undefined,
  strategies: RenderStrategyMap
): string {
  const trimmed = (requested ?? "").trim()
  const selectable = listSelectableRenderStrategies(strategies)

  if (selectable.length === 0) return ""
  if (!trimmed || trimmed === "dynamic") {
    return chooseDefaultRenderStrategyFallback(strategies)
  }
  if (selectable.includes(trimmed)) return trimmed

  return chooseDefaultRenderStrategyFallback(strategies)
}
