import { DEFAULT_LLM_MODEL_ID } from "@adt/types"
import type { ActiveConfigResponse } from "@/api/client"
import { useActiveConfig } from "@/hooks/use-debug"

export function resolveEffectiveDefaultModel(
  activeConfig?: ActiveConfigResponse,
): string {
  const model = activeConfig?.merged.default_model
  return typeof model === "string" && model.trim()
    ? model
    : DEFAULT_LLM_MODEL_ID
}

export function useEffectiveDefaultModel(bookLabel?: string): string {
  const activeConfigQuery = useActiveConfig(bookLabel ?? "")
  return resolveEffectiveDefaultModel(activeConfigQuery.data)
}
