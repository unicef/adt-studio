import { useMemo, useState } from "react"
import type { CoreTtsCatalogEntry, TextCatalogEntry, TextCatalogResponse, TTSLanguageData, TTSResponse } from "@/api/client"
import { useBook } from "@/hooks/use-books"
import { useActiveConfig } from "@/hooks/use-debug"
import { normalizeLocale } from "@/lib/languages"
import { isBaseLanguage, resolveLanguages } from "../translate/translateState"
import { useEasyRead, useSpeech, useTextCatalog } from "../shared/queries"
import { buildSpeechRows, countCategories, countRows, type VoiceSlot } from "./speechRows"
import { useSpeechAudio } from "./useSpeechAudio"
import { useTtsExclusions } from "./useTtsExclusions"
import { useVoiceSlots } from "./useVoiceSlots"

const NONE: never[] = []

export function byLocale<T>(record: Record<string, T> | undefined, code: string): T | undefined {
  if (!record || !code) return undefined
  if (record[code]) return record[code]
  const wanted = normalizeLocale(code).toLowerCase()
  const key = Object.keys(record).find((candidate) => normalizeLocale(candidate.replace("_", "-")).toLowerCase() === wanted)
  return key ? record[key] : undefined
}

function speechEntriesFor(catalog: TextCatalogResponse | null | undefined, code: string): CoreTtsCatalogEntry[] {
  return byLocale(catalog?.speechTexts, code)?.entries ?? NONE
}

export function useSpeechModel(label: string) {
  const tts = useSpeech(label)
  const catalog = useTextCatalog(label)
  const easyRead = useEasyRead(label)
  const config = useActiveConfig(label)
  const book = useBook(label)
  const exclusions = useTtsExclusions(label)

  const merged = config.data?.merged as Record<string, unknown> | undefined
  const speechConfig = merged?.speech as Record<string, unknown> | undefined
  const data: TTSResponse | undefined = tts.data

  const { languages, baseLanguage } = useMemo(
    () =>
      resolveLanguages({
        configuredOutputs: merged?.output_languages as string[] | undefined,
        editingLanguage: merged?.editing_language as string | undefined,
        bookLanguage: book.data?.languageCode ?? book.data?.metadata?.language_code ?? null,
        translationCodes: [...Object.keys(catalog.data?.translations ?? {}), ...Object.keys(data?.languages ?? {})],
      }),
    [merged, book.data, catalog.data, data],
  )

  const [picked, setPicked] = useState<string | null>(null)
  const language = picked && languages.includes(picked) ? picked : (languages[0] ?? "")
  const isBase = isBaseLanguage(language, baseLanguage)
  const languageData: TTSLanguageData | undefined = byLocale(data?.languages, language)
  const baseData: TTSLanguageData | undefined = isBase ? undefined : byLocale(data?.languages, baseLanguage)

  const voices = useVoiceSlots(languageData, speechConfig, language)
  const [pickedSlot, setSlot] = useState<VoiceSlot>("primary")
  const slot: VoiceSlot = voices.hasSecondary ? pickedSlot : "primary"
  const audio = useSpeechAudio(label, language, slot)

  const sourceEntries = useMemo<TextCatalogEntry[]>(() => {
    const base = catalog.data?.entries ?? NONE
    const easy = (easyRead.data?.blocks ?? NONE).flatMap((block) => block.entries.map((entry) => ({ id: entry.easyReadId, text: entry.text })))
    return easy.length > 0 ? [...base, ...easy] : base
  }, [catalog.data, easyRead.data])

  const speechEntries = speechEntriesFor(catalog.data, language)
  const speechById = useMemo(() => new Map(speechEntries.map((entry) => [entry.id, entry])), [speechEntries])

  const translatedEntries = isBase ? null : (byLocale(catalog.data?.translations, language)?.entries ?? NONE)
  const live = data?.live === true

  const rows = useMemo(
    () =>
      buildSpeechRows({
        sourceEntries,
        translatedEntries,
        speechEntries,
        audio: languageData?.entries ?? NONE,
        baseAudio: baseData?.entries ?? NONE,
        failed: languageData?.failed ?? NONE,
        timingFailed: audio.timingFailed,
        slot,
        live,
        exclusionFor: exclusions.exclusionFor,
      }),
    [sourceEntries, translatedEntries, speechEntries, languageData, baseData, audio.timingFailed, slot, live, exclusions.exclusionFor],
  )

  const counts = useMemo(() => countRows(rows), [rows])
  const categories = useMemo(() => countCategories(rows), [rows])
  const hasAudio = useMemo(() => Object.values(data?.languages ?? {}).some((entry) => entry.entries.length > 0), [data])
  const audioCount = (code: string) => (byLocale(data?.languages, code)?.entries ?? NONE).filter((entry) => (entry.voiceSlot ?? "primary") === "primary").length

  return {
    tts,
    catalog,
    speechConfig,
    wordHighlighting: speechConfig?.word_highlighting === true,
    languages,
    baseLanguage,
    language,
    setLanguage: setPicked,
    isBase,
    languageData,
    voices,
    slot,
    setSlot,
    audio,
    exclusions,
    speechById,
    speechVersion: byLocale(catalog.data?.speechTexts, language)?.version ?? null,
    rows,
    counts,
    categories,
    live,
    hasAudio,
    audioCount,
    isLoading: tts.isPending || catalog.isPending,
  }
}
