import {
  normalizeModelId,
  parseModelId,
  safeParseModelId,
  type AiModality,
  type ParsedModelId,
} from "@adt/types"
import { AiProviderError } from "./ports/errors.js"
import type { ProviderRegistry } from "./registry.js"

export {
  isValidModelId,
  normalizeModelId,
  parseModelId,
  safeParseModelId,
  sanitizeModelIdForPath,
  type ParsedModelId,
} from "@adt/types"

export function resolveModelIdFor(
  registry: ProviderRegistry,
  rawModelId: string,
  modality: AiModality,
): ParsedModelId {
  const parsed = safeParseModelId(rawModelId)
  if (!parsed.ok) throw AiProviderError.invalidModelId(rawModelId, parsed.error)

  const { providerId } = parsed.value
  if (!registry.has(providerId)) {
    throw AiProviderError.unknownProvider(providerId, registry.ids)
  }
  if (!registry.supports(providerId, modality)) {
    throw AiProviderError.unsupportedModality(providerId, modality)
  }

  return parsed.value
}

export function assertSupportedModel(
  registry: ProviderRegistry,
  rawModelId: string,
  modality: AiModality,
): void {
  resolveModelIdFor(registry, rawModelId, modality)
}

export function isSupportedModel(
  registry: ProviderRegistry,
  rawModelId: string,
  modality: AiModality,
): boolean {
  const parsed = safeParseModelId(rawModelId)
  return parsed.ok && registry.supports(parsed.value.providerId, modality)
}

export function qualifyModelId(rawModelId: string, defaultProviderId: string): string {
  return normalizeModelId(rawModelId, { defaultProviderId })
}

export function providerIdOf(rawModelId: string): string {
  return parseModelId(rawModelId).providerId
}
