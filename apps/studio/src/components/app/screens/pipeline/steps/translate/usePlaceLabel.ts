import { useCallback, useMemo } from "react"
import { useLingui } from "@lingui/react/macro"
import type { PipelinePage } from "@/components/app/screens/pipeline/shared/usePipelineState"
import { entryPlace } from "./entryPlace"

export function usePlaceLabel(pages: readonly PipelinePage[], sourceById: ReadonlyMap<string, string>) {
  const { t } = useLingui()
  const pageNumbers = useMemo(() => new Map(pages.map((page) => [page.pageId, page.pageNumber])), [pages])

  return useCallback(
    (id: string): string => {
      const place = entryPlace(id)
      const pageOf = (pageId: string) => pageNumbers.get(pageId) ?? Number(pageId.slice(2, 5))
      switch (place.kind) {
        case "page-text":
          return t`Page ${pageOf(place.pageId)}`
        case "image":
          return t`Page ${pageOf(place.pageId)} · image description`
        case "easy-read":
          return t`Page ${pageOf(place.pageId)} · Easy Read`
        case "answer":
          return place.pageId ? t`Page ${pageOf(place.pageId)} · activity answer` : t`Activity answer`
        case "quiz-question":
          return t`Quiz ${place.quiz} · question`
        case "quiz-option":
          return t`Quiz ${place.quiz} · option ${place.option + 1}`
        case "quiz-explanation":
          return t`Quiz ${place.quiz} · why option ${place.option + 1}`
        case "glossary-term":
          return t`Glossary · term`
        case "glossary-definition": {
          const term = sourceById.get(place.termId)
          return term ? t`Glossary · definition of “${term}”` : t`Glossary · definition`
        }
        default:
          return id
      }
    },
    [t, pageNumbers, sourceById],
  )
}
