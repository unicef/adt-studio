import { renderPages } from "../profile.ts"
import { choosePages } from "../questions.ts"
import { decide } from "../rules.ts"
import { lowConfidence, semanticOf } from "./e4-one-call.ts"
import { askCombined } from "./one-call.ts"
import type { Variant } from "./types.ts"

/**
 * E8: the user answers one question first ("What kind of book is this?", simulated with the
 * dataset's true fact), then one call answers the other 3 questions knowing it. Tests the
 * "user describes first" flow without free text: E3 showed a free-text hint does not override the pages.
 */
export const e8GenreFirst: Variant = {
  id: "e8-genre-first",
  label: "User picks the kind of book first, AI answers the other 3",
  deterministic: false,
  async run(ctx) {
    const genre = ctx.userFacts?.genre?.[0]
    if (!genre) throw new Error("dataset has no true genre for this book")
    const pages = choosePages(ctx.book, ctx.facts)
    const images = renderPages(ctx.buffer, pages)
    const res = await askCombined({ model: ctx.model, book: ctx.book, facts: ctx.facts, pages, images, given: { genre } })
    const semantic = semanticOf(res.answers, { genre: genre as never })
    return {
      settings: decide(ctx.facts, semantic),
      trace: { pages, given: { genre }, answers: res.answers, semantic, flags: lowConfidence(res.answers) },
      usage: { ...res.usage, calls: 1 },
      ms: res.ms,
    }
  },
}
