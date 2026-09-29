import { DEFAULT_BASE_PROMPT_MODEL_ID } from "@adt/types"
import { useQuery } from "@tanstack/react-query"
import { api } from "@/api/client"
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
  const globalConfig = useQuery({ queryKey: ["global-config"], queryFn: api.getGlobalConfig, enabled: !bookLabel })
  const model = globalConfig.data?.config.base_prompt_model
  return !bookLabel && typeof model === "string" && model.trim() ? model : resolveEffectiveBasePromptModel(activeConfigQuery.data)
}
