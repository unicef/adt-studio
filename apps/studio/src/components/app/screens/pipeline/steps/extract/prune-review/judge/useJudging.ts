import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useLingui } from "@lingui/react/macro"
import { plural } from "@lingui/core/macro"
import type { MessageDescriptor } from "@lingui/core"
import { humanReason, type HumanReason } from "../../page-detail/humanReason"
import { overlayOpen } from "../../../shared/usePageDetailKeys"
import { reasonLabel } from "../ReasonChip"
import type { Ranks, ReviewStep } from "../ranking"
import { isAiJudged, RANKING_VERSION, whyText, type Tier } from "../tier"
import { TIER_LABEL } from "../tierTone"
import type { FilteredImage } from "../useFilteredImages"
import { typing, type ReviewSession } from "../step/useReviewSession"
import { copyText } from "./copyText"
import { buildJudgeReport, localDate, trimText, reportCounts, signalText, type ReportCopy, type ReportEntry, type SignalCopy, type TierCounts } from "./judgeReport"
import { CATEGORY_LABEL, VERDICT_LABEL } from "../second-opinion/opinionCopy"
import type { Opinion } from "../second-opinion/opinionStore"
import { useBookJudgements, useJudgeMode, type Judgement, type Verdict } from "./judgeStore"

const RIGHT_KEYS = new Set(["a", "A", "1"])
const WRONG_KEYS = new Set(["d", "D", "2"])

export function aiTextOf(reason: HumanReason): string | null {
  return reason.detail && (isAiJudged(reason.kind) || reason.kind === "guard-kept") ? reason.detail : null
}

function snapshot(item: FilteredImage, tier: Tier | null, previous: Judgement | undefined): Judgement {
  return {
    verdict: previous?.verdict ?? null,
    comment: previous?.comment ?? "",
    pageNumber: item.pageNumber,
    number: item.number,
    width: item.width,
    height: item.height,
    reason: item.rawReason ?? null,
    tier,
    at: Date.now(),
  }
}

function empty(judgement: Judgement): boolean {
  return judgement.verdict === null && judgement.comment.trim() === ""
}

export interface TierAgreement {
  tier: Tier
  judged: number
  wrong: number
}

export function useJudging({
  label,
  title,
  steps,
  all,
  ranks,
  totals,
  loading,
  session,
  keys,
  opinionOf,
}: {
  label: string
  title: string
  steps: readonly ReviewStep[]
  all: readonly FilteredImage[]
  ranks: Ranks
  totals: TierCounts
  loading: boolean
  session: ReviewSession
  keys: boolean
  opinionOf?: (item: FilteredImage) => Opinion | null
}) {
  const { t, i18n } = useLingui()
  const [judgements, update] = useBookJudgements(label)
  const [enabled, setEnabled] = useJudgeMode(label)
  const [copied, setCopied] = useState(false)
  const copiedTimer = useRef<number | undefined>(undefined)
  const images = useMemo(() => steps.flatMap((step) => step.items), [steps])

  const writeAll = useCallback(
    (items: readonly FilteredImage[], change: (judgement: Judgement) => Judgement) =>
      update((previous) => {
        const rest = { ...previous }
        for (const item of items) {
          const next = change(snapshot(item, ranks.get(item.key)?.tier ?? null, previous[item.imageId]))
          if (empty(next)) delete rest[item.imageId]
          else rest[item.imageId] = next
        }
        return rest
      }),
    [update, ranks],
  )

  const setVerdict = useCallback(
    (step: ReviewStep, verdict: Verdict) => {
      const next = judgements[step.lead.imageId]?.verdict === verdict ? null : verdict
      writeAll(step.items, (judgement) => ({ ...judgement, verdict: next }))
    },
    [judgements, writeAll],
  )
  const setComment = useCallback((step: ReviewStep, comment: string) => writeAll(step.items, (judgement) => ({ ...judgement, comment })), [writeAll])
  const clear = useCallback(() => update(() => ({})), [update])

  const verdictOf = useCallback((imageId: string): Verdict | null => judgements[imageId]?.verdict ?? null, [judgements])
  const commentOf = useCallback((imageId: string): string => judgements[imageId]?.comment ?? "", [judgements])
  const stepVerdict = useCallback((step: ReviewStep): Verdict | null => judgements[step.lead.imageId]?.verdict ?? null, [judgements])

  const scope = useMemo(() => {
    let right = 0
    let wrong = 0
    for (const item of images) {
      const verdict = judgements[item.imageId]?.verdict
      if (verdict === "right") right++
      else if (verdict === "wrong") wrong++
    }
    const judged = right + wrong
    return { judged, right, wrong, total: images.length, open: images.length - judged }
  }, [images, judgements])

  const agreement = useMemo<TierAgreement[]>(() => {
    const byTier = new Map<Tier, TierAgreement>()
    const byId = new Map(all.map((item) => [item.imageId, item]))
    for (const [imageId, judgement] of Object.entries(judgements)) {
      if (!judgement.verdict) continue
      const item = byId.get(imageId)
      const tier = (item ? ranks.get(item.key)?.tier : judgement.tier) ?? null
      if (!tier) continue
      const entry = byTier.get(tier) ?? { tier, judged: 0, wrong: 0 }
      entry.judged++
      if (judgement.verdict === "wrong") entry.wrong++
      byTier.set(tier, entry)
    }
    return (["needed", "look", "right"] as const).flatMap((tier) => byTier.get(tier) ?? [])
  }, [judgements, all, ranks])

  const nextUnjudged = useMemo(() => {
    if (steps.length === 0) return -1
    for (let offset = 1; offset <= steps.length; offset++) {
      const index = (session.index + offset) % steps.length
      if (!judgements[steps[index].lead.imageId]?.verdict) return index
    }
    return -1
  }, [steps, judgements, session.index])

  const signalCopy = useMemo<SignalCopy>(
    () => ({
      area: (pct) => t`area ${pct}%`,
      ratio: (value) => t`ratio ${value}`,
      side: (side, min) => t`side ${side} of ${min} px`,
      inside: t`inside a kept picture`,
      words: (list) => t`words: ${list}`,
      repeat: (count, pages) => t`same picture ${count} times on ${pages} pages`,
      notEnglish: t`AI text not in English, words skipped`,
    }),
    [t],
  )

  const entries = useMemo<ReportEntry[]>(() => {
    const translate = (descriptor: MessageDescriptor) => i18n._(descriptor)
    const byId = new Map(all.map((item) => [item.imageId, item]))
    const groupOf = new Map<string, { key: string; title: string }>()
    for (const step of steps) {
      if (!step.group) continue
      const { count, pages } = step.group
      const groupTitle = t`Same picture on ${plural(pages, { one: "# page", other: "# pages" })} (${count})`
      for (const item of step.items) groupOf.set(item.key, { key: step.group.key, title: groupTitle })
    }
    const picked = new Map<string, ReportEntry>()
    const secondOf = (item: FilteredImage): ReportEntry["second"] => {
      const answer = opinionOf?.(item)
      if (!answer) return null
      return { verdict: answer.verdict, text: `${i18n._(VERDICT_LABEL[answer.verdict])} (${i18n._(CATEGORY_LABEL[answer.category])}) "${trimText(answer.reasoning)}"` }
    }
    const fromItem = (item: FilteredImage): ReportEntry => {
      const judgement = judgements[item.imageId]
      const rank = ranks.get(item.key)
      return {
        imageId: item.imageId,
        pageNumber: item.pageNumber,
        number: item.number,
        width: item.width,
        height: item.height,
        reason: reasonLabel(translate, item.reason),
        aiText: aiTextOf(item.reason),
        tier: rank?.tier ?? null,
        why: whyText(translate, rank),
        signals: rank ? signalText(rank.signals, item.reason.kind === "too-small", signalCopy) : "",
        group: groupOf.get(item.key) ?? null,
        verdict: judgement?.verdict ?? null,
        comment: judgement?.comment ?? "",
        gone: item.restored,
        second: secondOf(item),
      }
    }
    for (const item of images) picked.set(item.imageId, fromItem(item))
    for (const [imageId, judgement] of Object.entries(judgements)) {
      if (picked.has(imageId)) continue
      const item = byId.get(imageId)
      if (item) {
        picked.set(imageId, { ...fromItem(item), outside: true })
        continue
      }
      const reason = humanReason(judgement.reason)
      picked.set(imageId, {
        imageId,
        pageNumber: judgement.pageNumber,
        number: judgement.number,
        width: judgement.width,
        height: judgement.height,
        reason: reasonLabel(translate, reason),
        aiText: aiTextOf(reason),
        tier: judgement.tier ?? null,
        why: "",
        signals: "",
        group: null,
        verdict: judgement.verdict,
        comment: judgement.comment,
        gone: !loading,
        outside: true,
      })
    }
    return [...picked.values()]
  }, [all, images, steps, ranks, judgements, loading, i18n, t, signalCopy, opinionOf])

  const report = useMemo(() => reportCounts(entries.filter((entry) => !entry.outside)), [entries])

  const copyCopy = useMemo<ReportCopy>(
    () => ({
      title: (book, date) => t`Left-out image review: ${book} · ${date}`,
      ranking: (version, counts) =>
        t`Ranking v${version} · probably needed ${counts.needed} · worth a look ${counts.look} · probably right ${counts.right}`,
      summary: ({ judged, total, right, wrong }) => t`Judged ${judged} of ${total} · Should be kept ${wrong} · Right to leave out ${right}`,
      tierHeading: (tier, count, judged, wrong) =>
        tier === "right" ? t`${i18n._(TIER_LABEL[tier])} (${count}) · judged ${judged}` : t`${i18n._(TIER_LABEL[tier])} (${count}) · judged ${judged} · should be kept ${wrong}`,
      openHeading: (count) => t`Not judged (${count})`,
      unranked: t`Removed by you`,
      image: (page, number) => t`Page ${page} · image ${number}`,
      why: t`Why flagged`,
      signals: t`signals`,
      ai: t`AI`,
      comment: t`Comment`,
      verdict: { right: t`Right to leave out`, wrong: t`Should be kept` },
      gone: t`no longer left out`,
      second: t`Second opinion`,
      secondSummary: ({ keep, remove, unsure, judged, agree }) =>
        t`AI second opinion · bring back ${keep} · leave out ${remove} · not sure ${unsure} · agrees with you on ${agree} of ${judged} judged`,
    }),
    [t, i18n],
  )

  const copyResults = useCallback(() => {
    const text = buildJudgeReport({ book: title, date: localDate(), version: RANKING_VERSION, totals, entries, copy: copyCopy })
    copyText(text)
    setCopied(true)
    window.clearTimeout(copiedTimer.current)
    copiedTimer.current = window.setTimeout(() => setCopied(false), 1800)
    return text
  }, [title, totals, entries, copyCopy])

  useEffect(() => () => window.clearTimeout(copiedTimer.current), [])

  const current = session.active && !session.finished ? session.current : null
  const live = keys && enabled && current !== null
  useEffect(() => {
    if (!live || !current) return
    const onKey = (event: KeyboardEvent) => {
      const verdict: Verdict | null = RIGHT_KEYS.has(event.key) ? "right" : WRONG_KEYS.has(event.key) ? "wrong" : null
      if (!verdict) return
      if (event.defaultPrevented || event.repeat || event.metaKey || event.ctrlKey || event.altKey || typing(event.target) || overlayOpen()) return
      event.preventDefault()
      setVerdict(current, verdict)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [live, current, setVerdict])

  return {
    enabled,
    setEnabled,
    verdictOf,
    commentOf,
    stepVerdict,
    setVerdict,
    setComment,
    clear,
    scope,
    agreement,
    report,
    stored: Object.keys(judgements).length,
    nextUnjudged,
    copyResults,
    copied,
  }
}

export type JudgingApi = ReturnType<typeof useJudging>
