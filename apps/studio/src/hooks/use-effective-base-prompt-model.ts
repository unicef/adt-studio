import { DEFAULT_BASE_PROMPT_MODEL_ID } from "@adt/types"
import type { ActiveConfigResponse } from "@/api/client"
import { useActiveConfig } from "@/hooks/use-debug"

export function resolveEffectiveBasePromptModel(
  activeConfig?: ActiveConfigResponse,
): string {
  const model = activeConfig?.merged.base_prompt_model
  return typeof model === "string" && model.trim()
    ? model
    : DEFAULT_BASE_PROMPT_MODEL_ID
}

export function useEffectiveBasePromptModel(bookLabel?: string): string {
  const activeConfigQuery = useActiveConfig(bookLabel ?? "")
  return resolveEffectiveBasePromptModel(activeConfigQuery.data)
}
