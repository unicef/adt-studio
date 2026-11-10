import { useMemo } from "react"
import { useLingui } from "@lingui/react/macro"
import type { RailEntry } from "../shared/ui"
import { ALL_VIDEOS, NOT_PLACED, type SignLanguageModel } from "./useSignLanguageModel"

export function useSignLanguageRail(model: SignLanguageModel): RailEntry[] {
  const { t } = useLingui()
  return useMemo(() => {
    const byPage = new Map<number, string[]>()
    for (const video of model.videos) {
      const page = model.pageOf(video)
      if (page === null) continue
      byPage.set(page, [...(byPage.get(page) ?? []), video.originalName])
    }
    const pages: RailEntry[] = [...byPage.entries()]
      .sort(([a], [b]) => a - b)
      .map(([pageNumber, names]) => ({
        key: String(pageNumber),
        title: t`Page ${pageNumber}`,
        count: names.length,
        pageNumber,
        subtitle: names.join(", "),
        searchText: names.join(" "),
      }))
    const unplaced = model.unplaced
    return [
      { key: ALL_VIDEOS, title: t`All videos`, count: model.videos.length },
      ...(unplaced.length > 0
        ? [
            {
              key: NOT_PLACED,
              title: t`Not on a page`,
              count: unplaced.length,
              subtitle: model.orphans.length > 0 ? t`Includes videos whose section was removed` : t`Choose a page for each one`,
              searchText: unplaced.map((video) => video.originalName).join(" "),
            },
          ]
        : []),
      ...pages,
    ]
  }, [model, t])
}
