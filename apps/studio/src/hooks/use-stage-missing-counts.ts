import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { isTtsExcluded, type TtsExclusionConfig } from "@adt/types"
import { api } from "@/api/client"
import { useBook } from "@/hooks/use-books"
import { useActiveConfig } from "@/hooks/use-debug"
import { getBaseLanguage, normalizeLocale } from "@/lib/languages"

export function useStageMissingCounts(label: string): { translate: number; speech: number } {
  const { data: catalog } = useQuery({
    queryKey: ["books", label, "text-catalog"],
    queryFn: () => api.getTextCatalog(label),
    enabled: !!label,
  })

  const { data: tts } = useQuery({
    queryKey: ["books", label, "tts"],
    queryFn: () => api.getTTS(label),
    enabled: !!label,
  })

  const { data: activeConfig } = useActiveConfig(label)
  const { data: book } = useBook(label)

  return useMemo(() => {
    if (!catalog) return { translate: 0, speech: 0 }
    const catalogIds = new Set(catalog.entries.map((e) => e.id))
    const total = catalogIds.size
    if (total === 0) return { translate: 0, speech: 0 }

    const merged = (activeConfig as { merged?: Record<string, unknown> } | undefined)?.merged


    const sourceLanguage = normalizeLocale(
      (merged?.editing_language as string | undefined) ?? book?.languageCode ?? "en",
    )
    const sourceBase = getBaseLanguage(sourceLanguage)

    const outputLanguages = Array.from(
      new Set(((merged?.output_languages as string[] | undefined) ?? []).map((code) => normalizeLocale(code))),
    ).filter((lang) => getBaseLanguage(lang) !== sourceBase)

    if (outputLanguages.length === 0) return { translate: 0, speech: 0 }

    let translate = 0
    for (const lang of outputLanguages) {
      const langData = catalog.translations?.[lang]
      if (!langData) {
        translate += total
        continue
      }
      const filled = new Set<string>()
      for (const e of langData.entries) {
        if (catalogIds.has(e.id) && e.text && e.text.trim().length > 0) {
          filled.add(e.id)
        }
      }
      translate += Math.max(total - filled.size, 0)
    }

    // Entries excluded from read-aloud never need audio, so they don't count
    // as missing for the speech stage (translations are still expected).
    const speechExclusions = (merged?.speech ?? undefined) as TtsExclusionConfig | undefined
    const speakableIds = new Set(
      [...catalogIds].filter((id) => !isTtsExcluded(id, speechExclusions)),
    )
    const speakableTotal = speakableIds.size
    if (tts?.live) {
      return { translate, speech: 0 }
    }

    let speech = 0
    for (const lang of outputLanguages) {
      const langData = tts?.languages?.[lang]
      if (!langData) {
        speech += speakableTotal
        continue
      }
      const filled = new Set<string>()
      for (const e of langData.entries) {
        if (speakableIds.has(e.textId)) filled.add(e.textId)
      }
      speech += Math.max(speakableTotal - filled.size, 0)
    }

    return { translate, speech }
  }, [catalog, tts, activeConfig, book])
}
