import { useCallback, useEffect, useMemo, useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { Loader2 } from "lucide-react"
import { useVariant } from "@/components/app/lab/variants"
import { useBook } from "@/hooks/use-books"
import type { PipelinePage } from "@/components/app/screens/pipeline/shared/usePipelineState"
import type { BannerModel } from "./banner/bannerModel"
import { BannerAccordion } from "./banner/BannerAccordion"
import { useSimulatedBanner } from "./banner/simulateState"
import type { CardLeftOut, RankedItem } from "./cards/cardModel"
import type { LeftOutPageApi } from "./LeftOutContext"
import { extractSignature, useAlertDismissed, useShowAll } from "./leftOutStore"
import { useJudging } from "./judge/useJudging"
import { buildSteps, rankItems, sortByTier, tierFrom } from "./ranking"
import { useSecondOpinion } from "./second-opinion/useSecondOpinion"
import { useBookOpinions } from "./second-opinion/opinionStore"
import { AiCheckSurface, AiPill } from "./second-opinion/AiCheck"
import { ReviewMenu } from "./focus/ReviewMenu"
import { usePageReview } from "./focus/usePageReview"
import { PageReviewColumn, type PageReviewState } from "./focus/PageReviewViews"
import { JudgePanel } from "./judge/JudgePanel"
import { useReviewSession } from "./step/useReviewSession"
import { splitTiers, type Tier } from "./tier"
import type { FilteredImage, FilteredImagesApi, PruneTotals } from "./useFilteredImages"

export function useLeftOutVariants() {
  const bannerState = useVariant("exbstate")
  return { bannerState }
}

export type LeftOutVariants = ReturnType<typeof useLeftOutVariants>

const EMPTY_OPEN = (): Record<Tier, RankedItem[]> => ({ needed: [], look: [], right: [] })

export function useLeftOutReview({
  label,
  hex,
  pages,
  totals,
  data,
  variants,
  pageId,
  openPage,
  stepPage,
  closeDetail,
}: {
  label: string
  hex: string
  pages: PipelinePage[]
  totals: PruneTotals | null
  data: FilteredImagesApi
  variants: LeftOutVariants
  pageId: string | null
  openPage: (pageId: string) => void
  stepPage: (pageId: string) => void
  closeDetail: () => void
}) {
  const { t } = useLingui()
  const [showAll, setShowAll] = useShowAll(label)
  const [pageFocus, setPageFocus] = useState<string | null>(null)
  const [lookAgain, setLookAgain] = useState(false)
  useEffect(() => {
    setPageFocus(null)
    setLookAgain(false)
  }, [pageId])
  const [dismissed, dismiss] = useAlertDismissed(label, extractSignature(pages))

  const { ranks, repeats } = useMemo(() => rankItems(data.items, data.contexts), [data.items, data.contexts])
  const tierOfItem = useMemo(() => tierFrom(ranks), [ranks])
  const live = useMemo(() => data.items.filter((item) => !item.restored), [data.items])
  const liveSplit = useMemo(() => splitTiers(live, tierOfItem), [live, tierOfItem])
  const counts = useMemo(() => ({ needed: liveSplit.needed.length, look: liveSplit.look.length, right: liveSplit.right.length }), [liveSplit])
  const [opinionsByKey] = useBookOpinions(label)
  const list = useMemo(() => {
    const scope = showAll ? data.items : data.items.filter((item) => {
      const tier = tierOfItem(item)
      return tier === "needed" || tier === "look"
    })
    const sorted = sortByTier(scope, ranks)
    const order = { keep: 0, unsure: 1, remove: 3 } as const
    const weight = (item: FilteredImage) => {
      const verdict = opinionsByKey[item.key]?.verdict
      return verdict ? order[verdict] : 2
    }
    return sorted.map((item, index) => ({ item, index })).sort((a, b) => weight(a.item) - weight(b.item) || a.index - b.index).map((entry) => entry.item)
  }, [showAll, data.items, tierOfItem, ranks, opinionsByKey])
  const steps = useMemo(() => buildSteps(list, ranks), [list, ranks])
  const repeatOf = useCallback((item: FilteredImage) => ranks.get(item.key)?.signals.repeat ?? null, [ranks])
  const opinion = useSecondOpinion(label, repeatOf)
  const opinionScope = useMemo(() => list.filter((item) => !item.restored), [list])
  const strip = useMemo(() => buildSteps(sortByTier(showAll ? live : [...liveSplit.needed, ...liveSplit.look], ranks), ranks).map((step) => step.lead), [showAll, live, liveSplit, ranks])

  const goToPage = useCallback((target: string) => (pageId ? stepPage(target) : openPage(target)), [pageId, stepPage, openPage])
  const session = useReviewSession({ label, steps, pageId, goToPage, data, keys: false })
  const pageReview = usePageReview({ session, data, pageId, pageNumber: pages.find((page) => page.pageId === pageId)?.pageNumber ?? null, keys: false })
  const askAi = useCallback(() => opinion.setView(opinion.running ? "live" : "intro"), [opinion])
  const { data: book } = useBook(label)
  const judge = useJudging({ label, title: book?.title || label, steps, all: data.items, ranks, totals: counts, loading: data.loading, session, keys: pageId !== null, opinionOf: opinion.opinionOf })


  const reviewFrom = useCallback(
    (key: string) => {
      session.start(key)
    },
    [session],
  )


  const filtered = totals?.filtered ?? live.length
  const reviewCount = steps.length
  const repeatCounts = useMemo(() => new Map(steps.map((step) => [step.lead.key, step.group?.count ?? 1])), [steps])
  const stepItems = useMemo(() => new Map(steps.map((step) => [step.lead.key, step.items])), [steps])
  const itemsOf = (item: FilteredImage) => stepItems.get(item.key) ?? [item]
  const reviewedSteps = steps.filter((step) => step.items.every((item) => item.restored || session.decisionOf(item.key) !== undefined)).length
  const bannerModel: BannerModel = {
    label,
    hex,
    rankOf: (item) => ranks.get(item.key),
    filtered,
    kept: totals?.kept ?? 0,
    counts,
    steps: steps.length,
    pages: new Set(steps.filter((step) => step.tier === "needed" || step.tier === "look").flatMap((step) => step.items.map((item) => item.pageId))).size,
    reviewed: reviewedSteps,
    needed: steps.filter((step) => step.tier === "needed").map((step) => step.lead),
    look: steps.filter((step) => step.tier === "look").map((step) => step.lead),
    repeatsOf: (item) => repeatCounts.get(item.key) ?? 1,
    rightKinds: liveSplit.rightKinds,
    loading: data.loading,
    session: { started: session.started, finished: session.finished, back: session.counts.back, kept: session.counts.kept },
    showAll,
    onShowAll: setShowAll,
    ai: { opinion, scope: opinionScope, onAsk: askAi },
    decisionOf: (item) => {
      const group = itemsOf(item)
      if (group.every((entry) => entry.restored)) return "back"
      if (group.every((entry) => session.decisionOf(entry.key) === "kept")) return "kept"
      return null
    },
    busyOf: (item) => itemsOf(item).some((entry) => data.busy.has(entry.key)),
    blocked: data.blocked,
    simulated: false,
    onBringBack: (item) => {
      const group = itemsOf(item).filter((entry) => !entry.restored)
      if (group.length === 0 || data.blocked) return
      void data.bringBack(group)
      for (const entry of group) session.record(entry.key, "back")
    },
    onLeaveOut: (item) => {
      for (const entry of itemsOf(item)) if (!entry.restored) session.record(entry.key, "kept")
    },
    onUndo: (item) => {
      const group = itemsOf(item)
      const restored = group.filter((entry) => entry.restored)
      if (restored.length > 0) void data.undo(restored)
      session.forget(group.map((entry) => entry.key))
    },
    onStart: () => session.start(),
    onOpen: (item) => reviewFrom(item.key),
    onDismiss: dismiss,
  }
  const shownModel = useSimulatedBanner(bannerModel, variants.bannerState)
  const simulated = variants.bannerState !== "real"
  const bannerOn = filtered > 0 && !dismissed && !pageId
  const alertCard =
    bannerOn ? (
      <BannerAccordion model={shownModel} simulated={simulated} startOpen={variants.bannerState === "open"} />
    ) : null
  const flaggedShown = [...shownModel.needed, ...shownModel.look]
  const aiKeep = flaggedShown.filter((item) => shownModel.ai.opinion.opinionOf(item)?.verdict === "keep").length
  const aiAnswered = flaggedShown.some((item) => shownModel.ai.opinion.opinionOf(item) !== null)
  const worthShown = shownModel.counts.needed + shownModel.counts.look
  const nextConfirm =
    bannerOn && !shownModel.session.started && (aiAnswered ? aiKeep > 0 : worthShown > 0)
      ? aiAnswered
        ? {
            title: t`The AI suggests bringing back ${aiKeep} pictures`,
            body: t`Sectioning only uses the pictures you keep, so any you leave out now will be missing from the storyboard. Check the AI's picks first, or go on and bring them back later from Extract.`,
            reviewLabel: t`Check the AI's picks`,
            onReview: () => session.start(),
          }
        : {
            title: t`${worthShown} left-out pictures could matter`,
            body: t`Sectioning only uses the pictures you keep, so any you leave out now will be missing from the storyboard. Check them first, or go on and bring them back later from Extract.`,
            reviewLabel: t`Check them first`,
            onReview: () => session.start(),
          }
      : null

  const reviewed = useCallback(
    (item: FilteredImage) => item.restored || session.decisionOf(item.key) !== undefined || judge.verdictOf(item.imageId) !== null,
    [session, judge],
  )

  const cardOpinion = shownModel.ai.opinion
  const cards = useMemo(() => {
    const byPage = new Map<string, FilteredImage[]>()
    for (const item of data.items) byPage.set(item.pageId, [...(byPage.get(item.pageId) ?? []), item])
    const map = new Map<string, CardLeftOut>()
    for (const page of pages) {
      const pending = page.filteredImageCount ?? 0
      const items = byPage.get(page.pageId) ?? []
      const loading = !data.contexts.has(page.pageId)
      if (loading && pending === 0) continue
      if (!loading && items.length === 0) continue
      const open = EMPTY_OPEN()
      let flagged = 0
      for (const item of sortByTier(items, ranks)) {
        const rank = ranks.get(item.key)
        if (!rank?.tier) continue
        if (rank.tier !== "right") flagged++
        if (!reviewed(item)) open[rank.tier].push({ item, rank })
      }
      map.set(page.pageId, {
        pageNumber: page.pageNumber,
        loading,
        pending,
        open,
        reviewed: flagged > 0 && open.needed.length === 0 && open.look.length === 0,
        showAll,
        kept: page.keptImageCount ?? 0,
        aiAsked: items.some((item) => cardOpinion.opinionOf(item) !== null),
        aiKeep: items.filter((item) => !reviewed(item) && cardOpinion.opinionOf(item)?.verdict === "keep").length,
        aiRunning: cardOpinion.running,
        label,
        checks: [...open.needed, ...open.look].map(({ item }) => ({ item, verdict: cardOpinion.opinionOf(item)?.verdict ?? null })),
        ai: (() => {
          const tally = { keep: 0, unsure: 0, remove: 0 }
          for (const { item } of [...open.needed, ...open.look]) {
            const verdict = cardOpinion.opinionOf(item)?.verdict
            if (verdict) tally[verdict]++
          }
          return tally
        })(),
        onOpenItem: (item: FilteredImage) => reviewFrom(item.key),
        onReview: (tier: Tier) => {
          const first = open[tier][0]?.item ?? items.find((item) => tierOfItem(item) === tier)
          if (first) reviewFrom(first.key)
        },
      })
    }
    return map
  }, [data.items, data.contexts, pages, ranks, reviewed, showAll, tierOfItem, reviewFrom, cardOpinion, label])

  const askable = opinionScope.some((item) => !opinion.opinionOf(item)) && !opinion.running ? askAi : null
  const menu = <ReviewMenu session={session} judge={judge} showAll={showAll} onShowAll={setShowAll} total={live.length} onAskAi={askable} onClose={null} />
  const judgePanel =
    judge.enabled && session.active && session.current ? (
      <div className="rounded-xl border bg-card px-3 pt-2.5 pb-3">
        <JudgePanel label={label} step={session.current} list={session.steps} session={session} judge={judge} />
      </div>
    ) : null
  const verdictRank = (item: FilteredImage) => {
    const verdict = shownModel.ai.opinion.opinionOf(item)?.verdict
    return verdict === "keep" ? 0 : verdict === "unsure" ? 1 : verdict === "remove" ? 3 : 2
  }
  const pageItems = pageId
    ? list
        .filter((item) => item.pageId === pageId)
        .map((item, index) => ({ item, index }))
        .sort((a, b) => verdictRank(a.item) - verdictRank(b.item) || a.index - b.index)
        .map((entry) => entry.item)
    : []
  const undecided = pageItems.filter((item) => shownModel.decisionOf(item) === null)
  const pageCurrent = pageItems.find((item) => item.key === pageFocus) ?? (lookAgain ? pageItems[0] : undecided[0]) ?? pageItems[0] ?? null
  const reviewState: PageReviewState | null =
    pageId !== null
      ? {
          model: shownModel,
          items: pageItems,
          current: pageCurrent,
          done: pageItems.length === 0 || (!lookAgain && undecided.length === 0),
          pick: (key) => setPageFocus(key),
          next: () => {
            const at = pageCurrent ? pageItems.findIndex((item) => item.key === pageCurrent.key) : -1
            const after = pageItems.slice(at + 1).find((item) => shownModel.decisionOf(item) === null)
            const before = pageItems.slice(0, Math.max(0, at)).find((item) => shownModel.decisionOf(item) === null)
            const target = after ?? before
            setLookAgain(false)
            setPageFocus(target ? target.key : null)
          },
          review: {
            ...pageReview,
            reopen: () => {
              setLookAgain(true)
              setPageFocus(pageItems[0]?.key ?? null)
            },
          },
        }
      : null
  const reviewRunning = !!reviewState && pageReview.running
  const reviewTab =
    reviewState && pageItems.length > 0
      ? {
          content: (
            <>
              {judgePanel}
              <PageReviewColumn state={reviewState} menu={menu} />
            </>
          ),
          left: undecided.length,
          keep: undecided.filter((item) => shownModel.ai.opinion.opinionOf(item)?.verdict === "keep").length,
          unsure: undecided.filter((item) => shownModel.ai.opinion.opinionOf(item)?.verdict === "unsure").length,
          asked: pageItems.some((item) => shownModel.ai.opinion.opinionOf(item) !== null),
          top: undecided[0] ?? null,
          label,
          running: reviewRunning,
          start: pageReview.start,
          pick: reviewState.pick,
          opinionOf: shownModel.ai.opinion.opinionOf,
        }
      : null
  const aiLayer = (
    <>
      <AiCheckSurface label={label} hex={hex} opinion={shownModel.ai.opinion} items={opinionScope} onReview={(item) => reviewFrom(item.key)} />
      <AiPill hex={hex} opinion={shownModel.ai.opinion} items={opinionScope} />
    </>
  )

  const focus = reviewRunning && pageId && pageCurrent ? { pageId, imageId: pageCurrent.imageId } : null
  const pageApi: LeftOutPageApi | null =
    reviewTab
      ? {
          hex,
          showAll,
          focus,
          ranks,
          repeats,
          model: shownModel,
          reviewTab,
        }
      : null

  return { alertCard, cards, pageApi, aiLayer, nextConfirm }
}
