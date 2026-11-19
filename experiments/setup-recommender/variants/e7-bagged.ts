import { renderPages } from "../profile.ts"
import { QUESTIONS, type Answer, type Answers, type QuestionId } from "../questions.ts"
import { decide } from "../rules.ts"
import { semanticOf } from "./e4-one-call.ts"
import { askCombined } from "./one-call.ts"
import type { Variant } from "./types.ts"

/**
 * E7: page bagging. The one-call questions are asked 3 times, each time on a different slice of the
 * book (interior pages dealt round-robin into 3 groups, max 4 each). Majority vote per fact; a fact
 * the 3 slices disagree on is flagged for the user. Disagreement between slices is a measured
 * uncertainty, unlike the model's self-reported confidence.
 */
export const e7Bagged: Variant = {
  id: "e7-bagged",
  label: "One-call questions on 3 page slices, majority vote, disagreement -> ask",
  deterministic: false,
  async run(ctx) {
    const all = ctx.book.pages.map((p) => p.page)
    const interior = all.length >= 7 ? all.slice(1, -1) : all
    const slices = [0, 1, 2].map((k) => interior.filter((_, i) => i % 3 === k).slice(0, 4)).filter((s) => s.length > 0)
    const images = renderPages(ctx.buffer, interior)
    const runs = await Promise.all(
      slices.map((pages) => askCombined({ model: ctx.model, book: ctx.book, facts: ctx.facts, pages, images: new Map(pages.map((p) => [p, images.get(p)!])) })),
    )
    const answers: Partial<Answers> = {}
    const votes: Record<string, string[]> = {}
    const flags: string[] = []
    for (const id of Object.keys(QUESTIONS) as QuestionId[]) {
      const vs = runs.map((r) => r.answers[id]!)
      votes[id] = vs.map((v) => v.answer as string)
      const counts = new Map<string, number>()
      for (const v of votes[id]) counts.set(v, (counts.get(v) ?? 0) + 1)
      const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]
      // On a 3-way tie, the first slice wins (it holds the earliest interior pages).
      const winner = best[1] > 1 ? best[0] : votes[id][0]
      if (counts.size > 1) flags.push(id)
      answers[id] = { ...(vs.find((v) => v.answer === winner) as Answer), confidence: counts.size === 1 ? "high" : best[1] > 1 ? "medium" : "low" } as never
    }
    const semantic = semanticOf(answers)
    return {
      settings: decide(ctx.facts, semantic),
      trace: { slices, votes, answers, semantic, flags, perSlice: runs.map((r) => r.answers) },
      usage: { inputTokens: runs.reduce((s, r) => s + r.usage.inputTokens, 0), outputTokens: runs.reduce((s, r) => s + r.usage.outputTokens, 0), calls: runs.length },
      ms: Math.max(...runs.map((r) => r.ms)),
    }
  },
}
