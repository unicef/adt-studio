import { useCallback, useMemo } from "react"
import { useLingui } from "@lingui/react/macro"
import { api } from "@/api/client"
import { useApiKey } from "@/hooks/use-api-key"
import type { FilteredImage } from "../useFilteredImages"
import { useBookOpinions, type Opinion } from "./opinionStore"
import { patchRun, readAiRun, updateAiRun, useAiRun, type AiView } from "./runStore"

const CONCURRENCY = 3
const PER_CALL = 12

export function useSecondOpinion(label: string, repeatOf?: (item: FilteredImage) => { count: number; pages: number } | null) {
  const { apiKey } = useApiKey()
  const { i18n } = useLingui()
  const locale = i18n.locale
  const [opinions, setOpinions] = useBookOpinions(label)
  const { view, run } = useAiRun(label)

  const opinionOf = useCallback((item: Pick<FilteredImage, "key">): Opinion | null => opinions[item.key] ?? null, [opinions])

  const setView = useCallback((next: AiView) => updateAiRun(label, (previous) => ({ ...previous, view: next })), [label])

  const ask = useCallback(
    async (items: readonly FilteredImage[], force = false) => {
      const current = readAiRun(label).run
      if (current && !current.finished) return
      const todo = items.filter((item) => !item.restored && (force || !opinions[item.key]))
      if (todo.length === 0) return
      const byPage = new Map<string, FilteredImage[]>()
      for (const item of todo) byPage.set(item.pageId, [...(byPage.get(item.pageId) ?? []), item])
      const calls = [...byPage].flatMap(([pageId, list]) => {
        const chunks: Array<{ pageId: string; items: FilteredImage[] }> = []
        for (let index = 0; index < list.length; index += PER_CALL) chunks.push({ pageId, items: list.slice(index, index + PER_CALL) })
        return chunks
      })
      updateAiRun(label, (previous) => ({
        view: previous.view === "closed" || previous.view === "intro" ? "live" : previous.view,
        run: { keys: calls.flatMap((call) => call.items.map((item) => item.key)), done: [], active: [], pageId: null, stopping: false, finished: false, error: null },
      }))
      let cursor = 0
      const worker = async () => {
        while (cursor < calls.length) {
          if (readAiRun(label).run?.stopping) return
          const call = calls[cursor++]
          const keys = call.items.map((item) => item.key)
          patchRun(label, (state) => ({ ...state, active: [...state.active, ...keys], pageId: call.pageId }))
          try {
            const repeats: Record<string, { count: number; pages: number }> = {}
            for (const item of call.items) {
              const repeat = repeatOf?.(item)
              if (repeat && repeat.count > 1) repeats[item.imageId] = repeat
            }
            const response = await api.askLeftOutSecondOpinion(label, call.pageId, call.items.map((item) => item.imageId), apiKey, repeats, locale)
            const at = Date.now()
            setOpinions((previous) => {
              const next = { ...previous }
              for (const result of response.results) {
                next[`${call.pageId}/${result.imageId}`] = { verdict: result.verdict, category: result.category, reasoning: result.reasoning, confidence: result.confidence, modelId: response.modelId, promptVersion: response.promptVersion, language: response.language ?? locale, at }
              }
              return next
            })
          } catch (cause) {
            const message = cause instanceof Error ? cause.message : String(cause)
            patchRun(label, (state) => ({ ...state, error: state.error ?? message }))
          }
          patchRun(label, (state) => ({ ...state, active: state.active.filter((key) => !keys.includes(key)), done: [...state.done, ...keys] }))
        }
      }
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, calls.length) }, worker))
      patchRun(label, (state) => ({ ...state, finished: true, active: [], pageId: null }))
    },
    [apiKey, label, opinions, setOpinions, repeatOf, locale],
  )

  const stop = useCallback(() => patchRun(label, (state) => ({ ...state, stopping: true })), [label])

  const dismiss = useCallback(() => updateAiRun(label, (previous) => ({ view: "closed", run: previous.run && !previous.run.finished ? previous.run : null })), [label])

  const clear = useCallback(() => {
    setOpinions(() => ({}))
    updateAiRun(label, () => ({ view: "closed", run: null }))
  }, [label, setOpinions])

  const running = !!run && !run.finished
  const counts = useMemo(() => {
    const tally = { keep: 0, remove: 0, unsure: 0 }
    for (const opinion of Object.values(opinions)) tally[opinion.verdict]++
    return tally
  }, [opinions])

  return {
    opinions,
    opinionOf,
    ask,
    stop,
    dismiss,
    clear,
    view,
    setView,
    run,
    running,
    progress: run ? { done: run.done.length, total: run.keys.length } : null,
    error: run?.error ?? null,
    counts,
    asked: Object.keys(opinions).length,
    locale,
  }
}

export type SecondOpinionApi = ReturnType<typeof useSecondOpinion>
