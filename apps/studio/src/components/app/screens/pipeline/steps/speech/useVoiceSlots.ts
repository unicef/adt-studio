import { useMemo } from "react"
import type { TTSLanguageData } from "@/api/client"
import { useElevenLabsVoices } from "@/hooks/use-elevenlabs-voices"
import { normalizeLocale } from "@/lib/languages"
import type { VoiceSlot } from "./speechRows"

export interface VoiceInfo {
  slot: VoiceSlot
  name: string | null
  provider: string | null
  model: string | null
}

export interface VoiceSlots {
  hasSecondary: boolean
  primary: VoiceInfo
  secondary: VoiceInfo
}

function secondaryProfile(speechConfig: Record<string, unknown> | undefined, language: string) {
  const voices = speechConfig?.secondary_voices
  if (!voices || typeof voices !== "object" || !language) return null
  const wanted = normalizeLocale(language).toLowerCase()
  const match = Object.entries(voices as Record<string, unknown>).find(([code]) => normalizeLocale(code).toLowerCase() === wanted)
  const profile = match?.[1] as Record<string, unknown> | undefined
  if (!profile || typeof profile.voice !== "string" || !profile.voice.trim()) return null
  return {
    voice: profile.voice,
    label: typeof profile.label === "string" ? profile.label : undefined,
    provider: typeof profile.provider === "string" ? profile.provider : undefined,
  }
}

export function useVoiceSlots(data: TTSLanguageData | undefined, speechConfig: Record<string, unknown> | undefined, language: string): VoiceSlots {
  const { describeVoice } = useElevenLabsVoices()
  return useMemo(() => {
    const entries = data?.entries ?? []
    const first = entries.find((entry) => (entry.voiceSlot ?? "primary") === "primary")
    const second = entries.find((entry) => entry.voiceSlot === "secondary")
    const profile = secondaryProfile(speechConfig, language)
    const nameOf = (voice: string | undefined, label: string | undefined, provider: string | undefined) =>
      label || (voice ? (provider === "elevenlabs" ? describeVoice(voice) : voice) : null)
    return {
      hasSecondary: !!profile || !!second,
      primary: {
        slot: "primary",
        name: nameOf(first?.voice, first?.voiceLabel, first?.provider),
        provider: first?.provider ?? null,
        model: first?.model ?? null,
      },
      secondary: {
        slot: "secondary",
        name: nameOf(second?.voice ?? profile?.voice, second?.voiceLabel ?? profile?.label, second?.provider ?? profile?.provider),
        provider: second?.provider ?? profile?.provider ?? null,
        model: second?.model ?? null,
      },
    }
  }, [data, speechConfig, language, describeVoice])
}
