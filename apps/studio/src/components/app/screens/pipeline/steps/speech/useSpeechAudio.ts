import { useCallback, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { msg } from "@lingui/core/macro"
import { useLingui } from "@lingui/react/macro"
import { api, type WordTimestamp } from "@/api/client"
import { useApiKey } from "@/hooks/use-api-key"

// Dual narrator voices are a classic-UI feature; this step has no secondary
// slot surface yet, so every per-clip action targets the primary narrator.
const VOICE_SLOT = "primary" as const

/**
 * Per-clip audio actions for one language: regenerate, upload a replacement,
 * transcribe word timestamps, and correct them by hand. Errors are kept per
 * entry id so a failure on one clip annotates that row instead of the step.
 */
export function useSpeechAudio(label: string, language: string) {
  const { i18n } = useLingui()
  const queryClient = useQueryClient()
  const { apiKey, geminiKey, elevenLabsKey, azureKey, azureRegion } = useApiKey()

  const [errorById, setErrorById] = useState<Record<string, string>>({})

  const clearError = useCallback((textId: string) => {
    setErrorById((prev) => {
      if (!(textId in prev)) return prev
      const next = { ...prev }
      delete next[textId]
      return next
    })
  }, [])

  const recordError = useCallback((textId: string, error: unknown) => {
    setErrorById((prev) => ({
      ...prev,
      [textId]: error instanceof Error ? error.message : String(error),
    }))
  }, [])

  const timestamps = useQuery({
    queryKey: ["books", label, "tts-timestamps", language],
    queryFn: () => api.getWordTimestamps(label, language),
    enabled: !!label && !!language,
  })

  const invalidateAudio = useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["books", label, "tts"] }),
        queryClient.invalidateQueries({
          queryKey: ["books", label, "tts-timestamps", language],
        }),
        queryClient.invalidateQueries({ queryKey: ["books", label, "step-status"] }),
      ]),
    [queryClient, label, language],
  )

  const generate = useMutation({
    mutationFn: async (textId: string) => {
      if (!geminiKey) throw new Error(i18n._(msg`Gemini API key is required to generate audio.`))
      return api.generateGeminiTTSForItem(label, textId, language, VOICE_SLOT, {
        geminiApiKey: geminiKey,
        openaiApiKey: apiKey || undefined,
        azure: azureKey && azureRegion ? { key: azureKey, region: azureRegion } : undefined,
        elevenLabsApiKey: elevenLabsKey || undefined,
      })
    },
    onMutate: clearError,
    onSuccess: invalidateAudio,
    onError: (error, textId) => recordError(textId, error),
  })

  const upload = useMutation({
    mutationFn: ({ textId, file }: { textId: string; file: File }) =>
      api.uploadTTSForItem(label, textId, language, VOICE_SLOT, file),
    onMutate: ({ textId }) => clearError(textId),
    onSuccess: invalidateAudio,
    onError: (error, { textId }) => recordError(textId, error),
  })

  const transcribe = useMutation({
    mutationFn: async (textId: string) => {
      if (!apiKey) throw new Error(i18n._(msg`OpenAI API key is required for transcription.`))
      return api.transcribeOne(label, textId, language, VOICE_SLOT, apiKey)
    },
    onMutate: clearError,
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["books", label, "tts-timestamps", language],
      }),
    onError: (error, textId) => recordError(textId, error),
  })

  const saveTimestamps = useMutation({
    mutationFn: ({
      textId,
      words,
      duration,
    }: {
      textId: string
      words: WordTimestamp[]
      duration: number
    }) => api.saveWordTimestamps(label, language, textId, { words, duration }),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["books", label, "tts-timestamps", language],
      }),
    onError: (error, { textId }) => recordError(textId, error),
  })

  return {
    timestampsById: timestamps.data?.entries,
    errorById,
    hasOpenaiKey: apiKey.length > 0,
    hasGeminiKey: geminiKey.length > 0,
    generate,
    upload,
    transcribe,
    saveTimestamps,
  }
}
