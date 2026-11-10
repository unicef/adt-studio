import { useMemo, type ReactNode } from "react"
import { useLingui } from "@lingui/react/macro"
import type { MessageDescriptor } from "@lingui/core"
import { rectOf } from "@/components/app/screens/pipeline/steps/shared/page-inspector/pageRect"
import type { BoxSelection } from "@/components/app/screens/pipeline/steps/shared/page-inspector/useBoxSelection"
import { humanReason } from "../../page-detail/humanReason"
import type { PageDetailData } from "../../page-detail/usePageDetailData"
import { useLeftOutPage } from "../LeftOutContext"
import { tierOf, whyText } from "../tier"
import type { FilteredImage } from "../useFilteredImages"
import { PageMarks, type PageMark } from "./PageMarks"

export function useLeftOutLayer({ pageId, data, selection, reviewing }: { pageId: string; data: PageDetailData; selection: BoxSelection; reviewing: boolean }) {
  const { i18n } = useLingui()
  const api = useLeftOutPage()
  const size = data.pageSize
  const ranks = api?.ranks
  const repeats = api?.repeats
  const showAll = api?.showAll ?? false
  const model = api?.model ?? null

  const marks = useMemo<PageMark[]>(() => {
    if (!size || !reviewing) return []
    const translate = (descriptor: MessageDescriptor) => i18n._(descriptor)
    const kept = data.entries.filter((entry) => !entry.isPruned && entry.bounds).flatMap((entry) => (entry.bounds ? [entry.bounds] : []))
    return data.entries
      .filter((entry) => entry.isPruned)
      .flatMap((entry) => {
        const reason = humanReason(entry.reason)
        const rank = ranks?.get(`${pageId}/${entry.imageId}`) ?? tierOf({ pageId, reason, width: entry.width, height: entry.height, bounds: entry.bounds }, { pageSize: size, kept, repeats })
        if (!showAll && rank.tier !== "needed" && rank.tier !== "look") return []
        const rect = rectOf(entry, size)
        const verdict = model?.ai.opinion.opinionOf({ key: `${pageId}/${entry.imageId}` } as FilteredImage)?.verdict ?? null
        return rect ? [{ imageId: entry.imageId, number: entry.number, rect, tier: rank.tier, why: whyText(translate, rank), reason, verdict }] : []
      })
  }, [size, reviewing, data.entries, ranks, repeats, pageId, showAll, model, i18n])

  const enabled = !!api && reviewing && marks.length > 0
  if (!enabled || !api) return { overlay: null as ReactNode }

  const focusId = api.focus?.pageId === pageId ? api.focus.imageId : null
  const pick = (imageId: string) => api.reviewTab?.pick(`${pageId}/${imageId}`)

  return {
    overlay: (
      <PageMarks
        marks={marks}
        hoverId={selection.hoverId}
        selectedId={focusId}
        onHover={selection.hover}
        onPick={pick}
      />
    ),
  }
}
