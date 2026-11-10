import { useCallback, useMemo } from "react"
import { isProviderAvailable } from "@/api/provider-credentials"
import { useProviderCredentials } from "@/hooks/use-provider-credentials"
import { useActiveConfig } from "@/hooks/use-debug"
import { normalizeLocale } from "@/lib/languages"
import { resolveSpeechProviderForLanguage } from "@/lib/speech-routing"
import type { VoiceSlot } from "./speechRows"

export const SPEECH_PROVIDERS = ["openai", "azure", "gemini", "elevenlabs"] as const
export type SpeechProviderId = (typeof SPEECH_PROVIDERS)[number]

export interface SpeechProviders {
  speechConfig: Record<string, unknown> | undefined
  defaultProvider: string
  available: Record<SpeechProviderId, boolean>
  isProviderReady: (providerId: string) => boolean
  providerFor: (language: string, slot: VoiceSlot) => string
  canSynthesize: (language: string, slot: VoiceSlot) => boolean
  anyReady: boolean
  hasTranscriber: boolean
  isLoading: boolean
}

function secondaryProvider(speechConfig: Record<string, unknown> | undefined, language: string): string | null {
  const voices = speechConfig?.secondary_voices
  if (!voices || typeof voices !== "object") return null
  const wanted = normalizeLocale(language).toLowerCase()
  const match = Object.entries(voices as Record<string, unknown>).find(([code]) => normalizeLocale(code).toLowerCase() === wanted)
  const profile = match?.[1] as Record<string, unknown> | undefined
  return typeof profile?.provider === "string" ? profile.provider : null
}

export function useSpeechProviders(label: string): SpeechProviders {
  const { providers, credentials, isAvailable, isLoading } = useProviderCredentials()
  const merged = useActiveConfig(label).data?.merged as Record<string, unknown> | undefined
  const speechConfig = merged?.speech as Record<string, unknown> | undefined

  const isProviderReady = useCallback(
    (providerId: string) => {
      const provider = providers.find(({ manifest }) => manifest.id === providerId)
      return !!provider && provider.manifest.modalities.includes("tts") && isProviderAvailable(provider, credentials)
    },
    [providers, credentials],
  )

  const available = useMemo(
    () => Object.fromEntries(SPEECH_PROVIDERS.map((id) => [id, isProviderReady(id)])) as Record<SpeechProviderId, boolean>,
    [isProviderReady],
  )

  const providerFor = useCallback(
    (language: string, slot: VoiceSlot) =>
      (slot === "secondary" ? secondaryProvider(speechConfig, language) : null) ?? resolveSpeechProviderForLanguage(language, speechConfig),
    [speechConfig],
  )

  const canSynthesize = useCallback(
    (language: string, slot: VoiceSlot) => !!language && isProviderReady(providerFor(language, slot)),
    [isProviderReady, providerFor],
  )

  const defaultProvider = typeof speechConfig?.default_provider === "string" ? speechConfig.default_provider : "openai"

  return {
    speechConfig,
    defaultProvider,
    available,
    isProviderReady,
    providerFor,
    canSynthesize,
    anyReady: SPEECH_PROVIDERS.some((id) => available[id]),
    hasTranscriber: isAvailable("stt"),
    isLoading,
  }
}
