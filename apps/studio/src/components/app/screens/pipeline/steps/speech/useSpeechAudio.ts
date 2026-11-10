import { useCallback, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api, type WordTimestamp, type WordTimestampEntry } from "@/api/client"
import { useApiKey } from "@/hooks/use-api-key"
import type { VoiceSlot } from "./speechRows"

export type ClipErrorKind = "generate" | "upload" | "transcribe" | "timing"

export interface ClipError {
  kind: ClipErrorKind
  message: string
}

const errorKey = (slot: VoiceSlot, textId: string) => `${slot}:${textId}`

/**
 * Per-clip audio actions for one language and narrator voice: create, upload a
 * replacement, transcribe word timing and correct it by hand, plus the
 * whole-language Transcribe all and the book-wide Delete all. Credentials ride
 * the request headers the client already builds, so a key configured on the
 * server works without a browser key.
 */
export function useSpeechAudio(label: string, language: string, slot: VoiceSlot) {
  const queryClient = useQueryClient()
  const { apiKey, geminiKey, elevenLabsKey, azureKey, azureRegion } = useApiKey()
  const [errors, setErrors] = useState<Record<string, ClipError>>({})

  const clearError = useCallback(
    (textId: string) =>
      setErrors((prev) => {
        const key = errorKey(slot, textId)
        if (!(key in prev)) return prev
        const next = { ...prev }
        delete next[key]
        return next
      }),
    [slot],
  )

  const recordError = useCallback(
    (textId: string, kind: ClipErrorKind, error: unknown) =>
      setErrors((prev) => ({ ...prev, [errorKey(slot, textId)]: { kind, message: error instanceof Error ? error.message : String(error) } })),
    [slot],
  )

  const timestamps = useQuery({
    queryKey: ["books", label, "tts-timestamps", language],
    queryFn: () => api.getWordTimestamps(label, language),
    enabled: !!label && !!language,
  })

  const timestampsById = useMemo(() => {
    const map: Record<string, WordTimestampEntry> = {}
    for (const entry of Object.values(timestamps.data?.entries ?? {})) {
      if ((entry.voiceSlot ?? "primary") === slot) map[entry.textId] = entry
    }
    return map
  }, [timestamps.data, slot])

  const invalidateAudio = useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["books", label, "tts"] }),
        queryClient.invalidateQueries({ queryKey: ["books", label, "tts-timestamps", language] }),
        queryClient.invalidateQueries({ queryKey: ["books", label, "step-status"] }),
      ]),
    [queryClient, label, language],
  )

  const invalidateTimestamps = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ["books", label, "tts-timestamps", language] }),
    [queryClient, label, language],
  )

  const generate = useMutation({
    mutationFn: (textId: string) =>
      api.generateGeminiTTSForItem(label, textId, language, slot, {
        geminiApiKey: geminiKey,
        openaiApiKey: apiKey || undefined,
        azure: azureKey && azureRegion ? { key: azureKey, region: azureRegion } : undefined,
        elevenLabsApiKey: elevenLabsKey || undefined,
      }),
    onMutate: clearError,
    onSuccess: invalidateAudio,
    onError: (error, textId) => recordError(textId, "generate", error),
  })

  const upload = useMutation({
    mutationFn: ({ textId, file }: { textId: string; file: File }) => api.uploadTTSForItem(label, textId, language, slot, file),
    onMutate: ({ textId }) => clearError(textId),
    onSuccess: invalidateAudio,
    onError: (error, { textId }) => recordError(textId, "upload", error),
  })

  const transcribe = useMutation({
    mutationFn: (textId: string) => api.transcribeOne(label, textId, language, slot, apiKey),
    onMutate: clearError,
    onSuccess: invalidateTimestamps,
    onError: (error, textId) => recordError(textId, "transcribe", error),
  })

  const saveTimestamps = useMutation({
    mutationFn: ({ textId, words, duration }: { textId: string; words: WordTimestamp[]; duration: number }) =>
      api.saveWordTimestamps(label, language, textId, { words, duration, voiceSlot: slot }),
    onMutate: ({ textId }) => clearError(textId),
    onSuccess: invalidateTimestamps,
    onError: (error, { textId }) => recordError(textId, "timing", error),
  })

  const transcribeAll = useMutation({
    mutationFn: () => api.transcribeAll(label, language, apiKey),
    onSuccess: invalidateTimestamps,
  })

  const deleteAll = useMutation({
    mutationFn: () => api.deleteTTS(label),
    onSuccess: invalidateAudio,
  })

  const errorFor = useCallback((textId: string) => errors[errorKey(slot, textId)], [errors, slot])

  return {
    timestampsById,
    timingFailed: timestamps.data?.failed,
    errorFor,
    generate,
    upload,
    transcribe,
    saveTimestamps,
    transcribeAll,
    deleteAll,
  }
}
