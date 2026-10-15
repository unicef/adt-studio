import { useCallback, useMemo } from "react"
import { useLingui } from "@lingui/react/macro"
import { plural } from "@lingui/core/macro"
import { getStageDescriptionI18n, getStageLabelI18n } from "@/components/pipeline/pipeline-i18n"
import { createPersistentStore } from "@/hooks/create-persistent-store"
import { useFlowSim } from "@/components/app/lab/flowSim"
import type { DockSlug } from "./plugins"
import { usePipelineState, type DockItem } from "./usePipelineState"

export const TRANSLATION_SOURCES: readonly DockSlug[] = ["captions", "quizzes", "glossary", "toc", "easy-read"]
export const RECOMMENDED_ORDER: readonly DockSlug[] = ["captions", "toc", "easy-read", "sign-language"]

const IN_BOOK = new Set<DockItem["state"]>(["done", "running", "queued", "error"])

export function isInBook(item: DockItem | undefined): boolean {
  return !!item && IN_BOOK.has(item.state)
}

export interface OutOfDate {
  count: number
  source: DockSlug
}

export interface ContentFlow {
  unfinished: DockItem[]
  outOfDate: OutOfDate | null
}

export function useContentFlow(label: string): ContentFlow {
  const state = usePipelineState(label)
  const [sim] = useFlowSim()
  return useMemo(() => {
    const unfinished = state.plugins.filter(
      (item) => TRANSLATION_SOURCES.includes(item.slug) && (item.state === "running" || item.state === "queued" || item.state === "error"),
    )
    const translate = state.plugins.find((item) => item.slug === "translate")
    const outOfDate: OutOfDate | null = sim.changed === "terms" && translate?.state === "done" ? { count: 3, source: "glossary" } : null
    return { unfinished, outOfDate }
  }, [state.plugins, sim.changed])
}

export function useFlowCopy() {
  const { t } = useLingui()
  const names = (items: DockItem[]) => items.map((item) => getStageLabelI18n(item.slug)).join(", ")
  return {
    waitFor: (items: DockItem[]) =>
      items.some((item) => item.state === "error")
        ? t`${names(items)} didn't finish. Fix it first, or its text won't be translated.`
        : t`Wait for ${names(items)} to finish.`,
    outOfDate: (stale: OutOfDate) =>
      stale.source === "glossary"
        ? t`${plural(stale.count, { one: "# new term to translate", other: "# new terms to translate" })}`
        : t`${plural(stale.count, { one: "# new text to translate", other: "# new texts to translate" })}`,
    warningTitle: t`Your content is still changing`,
    warningBody: (items: DockItem[]) =>
      t`${names(items)} isn't final yet. Translation copies every text in the book, so anything that changes afterwards will need translating again.`,
  }
}

const skippedStore = createPersistentStore<Record<string, string[]>>(
  "adt.pipeline.next-skipped",
  {},
  (value): value is Record<string, string[]> => typeof value === "object" && value !== null && !Array.isArray(value),
)

export function resetNextSkipped() {
  skippedStore.set({})
}

export type NextGroup = "accessibility" | "localization"

export interface NextSuggestion {
  key: string
  group: NextGroup
  slug: DockSlug
  title: string
  body: string
}

export function useNextSuggestion(label: string): { next: NextSuggestion | null; skip: (key: string) => void } {
  const { t } = useLingui()
  const state = usePipelineState(label)
  const flow = useContentFlow(label)
  const [skippedAll, setSkipped] = skippedStore.use()
  const skipped = useMemo(() => skippedAll[label] ?? [], [skippedAll, label])

  const skip = useCallback(
    (key: string) => setSkipped((previous) => ({ ...previous, [label]: [...new Set([...(previous[label] ?? []), key])] })),
    [label, setSkipped],
  )

  const next = useMemo<NextSuggestion | null>(() => {
    if (!state.hasRendering) return null
    const find = (slug: DockSlug) => state.plugins.find((item) => item.slug === slug)
    const recommended = RECOMMENDED_ORDER.map(find).find((item) => item && !isInBook(item) && !skipped.includes(item.slug))
    if (recommended) {
      return {
        key: recommended.slug,
        group: "accessibility",
        slug: recommended.slug,
        title: getStageLabelI18n(recommended.slug),
        body: getStageDescriptionI18n(recommended.slug) ?? t`Recommended, so every reader can use the book.`,
      }
    }
    if (flow.unfinished.length > 0) return null
    if (flow.outOfDate && !skipped.includes("translate-update")) {
      return {
        key: "translate-update",
        group: "localization",
        slug: "translate",
        title: t`Update translations`,
        body: flow.outOfDate.source === "glossary" ? t`Your glossary changed after translating.` : t`Your content changed after translating.`,
      }
    }
    const translate = find("translate")
    if (translate && !isInBook(translate) && !skipped.includes("translate")) {
      return { key: "translate", group: "localization", slug: "translate", title: getStageLabelI18n("translate"), body: t`Your content is ready to translate.` }
    }
    const speech = find("speech")
    if (translate?.state === "done" && speech && !isInBook(speech) && !skipped.includes("speech")) {
      return { key: "speech", group: "localization", slug: "speech", title: getStageLabelI18n("speech"), body: t`Have the book read aloud in each language.` }
    }
    return null
  }, [state.hasRendering, state.plugins, flow, skipped, t])

  return { next, skip }
}
