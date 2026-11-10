import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { api, type TextCatalogEntry } from "@/api/client"
import { useBook } from "@/hooks/use-books"
import { useActiveConfig } from "@/hooks/use-debug"
import { normalizeLocale } from "@/lib/languages"
import { isTranslationEvaluationEnabled } from "@/components/pipeline/stages/languages/lib/translations-view-state"
import { useEasyRead } from "../shared/queries"
import { hasAnyTranslation, resolveLanguages } from "./translateState"

const LIVE_REFRESH_MS = 4000
const NO_EASY_READ: TextCatalogEntry[] = []

export function useTranslateData(label: string, running: boolean) {
  const catalogQuery = useQuery({
    queryKey: ["books", label, "text-catalog"],
    queryFn: () => api.getTextCatalog(label),
    enabled: !!label,
    refetchInterval: running ? LIVE_REFRESH_MS : false,
  })
  const easyReadQuery = useEasyRead(label)
  const imagesQuery = useQuery({
    queryKey: ["books", label, "translated-images"],
    queryFn: () => api.listTranslatedImages(label),
    enabled: !!label,
  })
  const config = useActiveConfig(label)
  const book = useBook(label)
  const catalog = catalogQuery.data ?? null
  const merged = config.data?.merged as Record<string, unknown> | undefined

  const { languages, baseLanguage } = useMemo(
    () =>
      resolveLanguages({
        configuredOutputs: merged?.output_languages as string[] | undefined,
        editingLanguage: merged?.editing_language as string | undefined,
        bookLanguage: book.data?.languageCode ?? book.data?.metadata?.language_code ?? null,
        translationCodes: Object.keys(catalog?.translations ?? {}),
      }),
    [merged, book.data, catalog],
  )

  const easyRead = useMemo(
    () =>
      easyReadQuery.data?.blocks.flatMap((block) => block.entries.map((entry) => ({ id: entry.easyReadId, text: entry.text }))) ??
      NO_EASY_READ,
    [easyReadQuery.data],
  )

  const translatedImages = useMemo(() => {
    const map = new Map<string, string>()
    for (const row of imagesQuery.data?.images ?? []) map.set(`${row.sourceImageId}::${normalizeLocale(row.language)}`, row.imageId)
    return map
  }, [imagesQuery.data])

  return {
    catalog,
    isLoading: catalogQuery.isLoading,
    easyRead,
    translatedImages,
    languages,
    baseLanguage,
    hasTranslations: hasAnyTranslation(catalog, baseLanguage),
    reviewEnabled: !!config.data && isTranslationEvaluationEnabled(merged?.translation_evaluation),
  }
}
