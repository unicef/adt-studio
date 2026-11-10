import { useMemo, useState } from "react"
import { msg } from "@lingui/core/macro"
import { useLingui } from "@lingui/react/macro"
import type { MessageDescriptor } from "@lingui/core"
import type { LeftOutCategory, LeftOutOpinionVerdict } from "@/api/client"
import type { Opinion } from "../second-opinion/opinionStore"
import type { AiRun, AiView } from "../second-opinion/runStore"
import type { FilteredImage } from "../useFilteredImages"
import type { BannerModel } from "./bannerModel"

export type BannerState =
  | "real"
  | "loading"
  | "before-ai"
  | "open"
  | "warning"
  | "ai-intro"
  | "ai-running"
  | "ai-background"
  | "ai-panel-done"
  | "ai-done"
  | "ai-other-language"
  | "checking"
  | "finished"
  | "fine"

const FAKE: Record<LeftOutOpinionVerdict, { category: LeftOutCategory; reasoning: MessageDescriptor }> = {
  keep: { category: "exercise-visual", reasoning: msg`Simulated: the exercise next to it asks the reader to look at this picture, so it should stay.` },
  unsure: { category: "illustration", reasoning: msg`Simulated: a small drawing near the text; it could help the story or be decoration.` },
  remove: { category: "logo-or-branding", reasoning: msg`Simulated: the publisher's logo, repeated on many pages; a reader does not need it.` },
}

/* eslint-disable lingui/no-unlocalized-strings -- simulated AI answers deliberately written in another language */
const OTHER_LANGUAGE_TEXT: Record<LeftOutOpinionVerdict, string> = {
  keep: "Simulado: o exercício ao lado pede que o leitor observe esta imagem, então ela deve ficar.",
  unsure: "Simulado: um pequeno desenho perto do texto; pode ajudar a história ou ser só decoração.",
  remove: "Simulado: o logotipo da editora, repetido em muitas páginas; o leitor não precisa dele.",
}
/* eslint-enable lingui/no-unlocalized-strings */

const AI_STATES: ReadonlySet<BannerState> = new Set(["ai-running", "ai-background", "ai-panel-done", "ai-done", "ai-other-language"])

function fakeVerdict(item: FilteredImage, index: number, needed: ReadonlySet<string>): LeftOutOpinionVerdict {
  if (needed.has(item.key)) return "keep"
  return (["keep", "unsure", "remove", "remove"] as const)[index % 4]
}

export function useSimulatedBanner(model: BannerModel, state: BannerState): BannerModel {
  const { i18n } = useLingui()
  const [local, setLocal] = useState<Record<string, "back" | "kept">>({})
  return useMemo(() => {
    if (state === "real") return model
    const decide = (item: FilteredImage, decision: "back" | "kept" | null) =>
      setLocal((previous) => {
        const next = { ...previous }
        if (decision) next[item.key] = decision
        else delete next[item.key]
        return next
      })
    const sim = {
      simulated: true,
      decisionOf: (item: FilteredImage) => local[item.key] ?? null,
      busyOf: () => false,
      onBringBack: (item: FilteredImage) => decide(item, "back"),
      onLeaveOut: (item: FilteredImage) => decide(item, "kept"),
      onUndo: (item: FilteredImage) => decide(item, null),
    }
    const real = model.ai.opinion
    const scope = model.ai.scope
    const keys = scope.map((item) => item.key)
    const needed = new Set(model.needed.map((item) => item.key))
    const half = Math.floor(scope.length / 2)
    const answered = !AI_STATES.has(state) ? 0 : state === "ai-running" || state === "ai-background" ? half : scope.length
    const otherLanguage = state === "ai-other-language"
    const language = otherLanguage ? (i18n.locale.startsWith("pt") ? "en" : "pt-BR") : i18n.locale
    const answers = new Map<string, Opinion>()
    scope.slice(0, answered).forEach((item, index) => {
      const verdict = fakeVerdict(item, index, needed)
      const reasoning = otherLanguage && language === "pt-BR" ? OTHER_LANGUAGE_TEXT[verdict] : i18n._(FAKE[verdict].reasoning)
      answers.set(item.key, { verdict, category: FAKE[verdict].category, reasoning, confidence: "high", modelId: "simulated", language, at: 0 })
    })
    const running = state === "ai-running" || state === "ai-background"
    const active = running ? keys.slice(half, half + 2) : []
    const run: AiRun | null =
      running || state === "ai-panel-done"
        ? {
            keys,
            done: keys.slice(0, answered),
            active,
            pageId: running ? (scope.find((item) => item.key === active[0])?.pageId ?? null) : null,
            stopping: false,
            finished: state === "ai-panel-done",
            error: null,
          }
        : null
    const view: AiView = state === "ai-intro" ? "intro" : state === "ai-running" || state === "ai-panel-done" ? "live" : state === "ai-background" ? "pill" : "closed"
    const opinion = {
      ...real,
      opinionOf: (item: Pick<FilteredImage, "key">) => answers.get(item.key) ?? null,
      running,
      run,
      view,
      progress: run ? { done: run.done.length, total: run.keys.length } : null,
      error: null,
    }
    const base: BannerModel = { ...model, ...sim, loading: false, ai: { ...model.ai, opinion }, session: { started: false, finished: false, back: 0, kept: 0 }, reviewed: 0 }
    if (state === "loading") return { ...base, loading: true }
    if (state === "checking") return { ...base, session: { started: true, finished: false, back: 1, kept: 4 }, reviewed: Math.min(5, model.steps) }
    if (state === "finished") return { ...base, session: { started: true, finished: true, back: 2, kept: Math.max(0, model.counts.needed + model.counts.look - 2) }, reviewed: model.steps }
    if (state === "fine") return { ...base, counts: { needed: 0, look: 0, right: model.filtered }, needed: [], look: [], steps: 0, pages: 0 }
    return base
  }, [model, state, i18n, local])
}
