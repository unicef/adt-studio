import type { QueryClient } from "@tanstack/react-query"
import type { PromptResponse } from "@/api/client"
import type { ModelGroup } from "@/components/pipeline/components/ModelSelect"
import { LLM_MODEL_GROUPS } from "@/components/pipeline/components/ModelSelect"
import {
  promptModelForSelectedModel,
  promptNameForSelectedModel,
} from "@/components/pipeline/components/PromptViewer/promptModel"

export const DEFAULT_MODEL = "openai:gpt-5.4"

export const KNOWN_PROMPT_MODEL_IDS = LLM_MODEL_GROUPS.flatMap((group) =>
  group.models.map((model) => `${group.provider}:${model}`),
)

export function normalizePromptModelInput(value: string): string {
  return value.trim().toLowerCase()
}

export function modelIdsFromGroups(groups: ModelGroup[]): string[] {
  return groups.flatMap((group) => group.models.map((model) => `${group.provider}:${model}`))
}

export function isDefaultPromptModelId(
  modelId: string,
): boolean {
  const normalized = normalizePromptModelInput(modelId)
  return normalized.length > 0
    && promptModelForSelectedModel(normalized) == null
}

export function removeDefaultPromptModelGroups(
  groups: ModelGroup[],
): ModelGroup[] {
  return groups
    .map((group) => ({
      ...group,
      models: group.models.filter((model) => (
        !isDefaultPromptModelId(`${group.provider}:${model}`)
      )),
    }))
    .filter((group) => group.models.length > 0)
}

export function mergePromptModelGroups(
  baseGroups: ModelGroup[],
  additionalModelIds: string[],
): ModelGroup[] {
  const groups = baseGroups.map((group) => ({ ...group, models: [...group.models] }))
  const existing = new Set(modelIdsFromGroups(groups))

  for (const rawModelId of additionalModelIds) {
    const modelId = normalizePromptModelInput(rawModelId)
    if (!modelId || existing.has(modelId)) continue
    existing.add(modelId)

    const separatorIndex = modelId.indexOf(":")
    const provider = separatorIndex > 0 ? modelId.slice(0, separatorIndex) : "custom"
    const model = separatorIndex > 0 ? modelId.slice(separatorIndex + 1) : modelId
    const group = groups.find((candidate) => candidate.provider === provider)
    if (group) {
      group.models.push(model)
    } else {
      groups.push({ provider, models: [model] })
    }
  }

  return groups
}

export function modelIdForPromptVariant(baseName: string, variantName: string): string | null {
  return KNOWN_PROMPT_MODEL_IDS.find((modelId) => (
    promptNameForSelectedModel(baseName, modelId) === variantName
  )) ?? null
}

export function promptFileName(promptName: string): string {
  // eslint-disable-next-line lingui/no-unlocalized-strings -- File extension, not display copy.
  return `${promptName}.liquid`
}

export function promptTreeKey(modelId: string, promptName: string): string {
  return `model:${modelId}:prompt:${promptName}`
}

export function promptFileNameForModel(promptName: string, modelId: string): string {
  return promptFileName(promptName)
}

export function promptExistsForModel(
  prompt: { name: string; variants: string[] },
  modelId: string,
): boolean {
  const promptModelId = promptModelForSelectedModel(modelId)
  if (!promptModelId) return true
  return prompt.variants.includes(
    promptNameForSelectedModel(prompt.name, promptModelId),
  )
}

export function updatePromptCaches(
  queryClient: QueryClient,
  promptName: string,
  modelId: string | null,
  prompt: PromptResponse,
) {
  queryClient.setQueryData(["prompts", promptName, undefined, modelId], prompt)
}
