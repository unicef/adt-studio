/**
 * E2 — the LLM answers plain questions about the book, one call per question, never about settings.
 * Each answer is a fact the user can confirm ("This is a story", "Text sits on the pictures").
 */
import { askJson } from "./llm.ts"
import type { BookProfile } from "./profile.ts"
import type { DeterministicFacts } from "./facts.ts"

export const QUESTIONS = {
  genre: {
    ask: "What kind of book is this?",
    options: {
      story: "A narrative: picture book, storybook, novel or tale. Readers follow a story.",
      textbook: "Learning material for students: lessons that teach and practise, usually with activities or exercises for the learner.",
      reference: "Informational or academic material read for information: articles, reports, manuals, guides. No learner exercises.",
    },
  },
  exercises: {
    ask: "Does the book contain exercises or activities that the reader is meant to do (answer questions, fill in blanks, match, circle, write)?",
    options: {
      none: "No exercises, or only rhetorical questions inside the text.",
      some: "A few exercises, on a minority of pages.",
      many: "Exercises are a core part of most lessons or pages.",
    },
  },
  composition: {
    ask: "How are the text and the pictures arranged on the pages?",
    options: {
      "text-in-art": "Text is placed on top of or woven into the illustrations; where it sits on the picture is part of the design.",
      "text-beside-art": "Text sits in its own area, next to, above or below the pictures (or on facing pages), not on them.",
      "text-mostly": "Mostly text; pictures are small, occasional or absent.",
    },
  },
  diagrams: {
    ask: "Does the book contain diagrams, charts, maps, labelled figures or infographics whose labels carry meaning?",
    options: {
      none: "No such figures; only photos, illustrations or decoration.",
      some: "A few meaningful figures.",
      many: "Meaningful figures appear throughout.",
    },
  },
} as const

export type QuestionId = keyof typeof QUESTIONS
export type Answer<Q extends QuestionId = QuestionId> = {
  answer: keyof (typeof QUESTIONS)[Q]["options"]
  confidence: "low" | "medium" | "high"
  evidencePages: number[]
  reason: string
}
export type Answers = { [Q in QuestionId]: Answer<Q> }

/** Pages the model sees: chosen from the deterministic facts, not spaced evenly. Max 6. */
export function choosePages(b: BookProfile, f: DeterministicFacts): number[] {
  const all = b.pages.map((p) => p.page)
  const interior = all.length >= 7 ? all.slice(1, -1) : all
  const picks = new Set<number>()
  const add = (n?: number) => n !== undefined && interior.includes(n) && picks.size < 6 && picks.add(n)
  add(interior[0])
  add(f.exerciseCues.evidence[0])
  add(f.textOverPictures.evidence[0])
  add(f.vectorDiagrams.evidence[0])
  add(interior[Math.floor(interior.length / 2)])
  add(interior.at(-1))
  for (const n of interior) add(n) // fill up for short books
  return [...picks].sort((a, c) => a - c)
}

export function context(b: BookProfile, f: DeterministicFacts, pages: number[], description?: string): string {
  const lines = [
    `The book has ${b.pageCount} pages. You are shown pages ${pages.join(", ")}.`,
    `Measured from the PDF: median ${f.textDensity.medianChars} visible characters per page; pictures cover a median ${Math.round(f.pictureHeavy.medianCoverage * 100)}% of a page; text sits over a large picture on ${Math.round(f.textOverPictures.share * 100)}% of text pages; ${f.exerciseCues.pagesWithCues} pages show exercise cues (numbered items, blanks, instructions).`,
  ]
  if (description) lines.push(`The person adding the book describes it as: "${description}"`)
  for (const p of pages) {
    const page = b.pages.find((x) => x.page === p)
    if (page) lines.push(`Text of page ${p} (first 600 characters): ${page.text.slice(0, 600)}`)
  }
  return lines.join("\n")
}

export async function askAll(opts: {
  model: string
  book: BookProfile
  facts: DeterministicFacts
  images: Map<number, Uint8Array>
  description?: string
}): Promise<{ answers: Answers; usage: { inputTokens: number; outputTokens: number }; ms: number }> {
  const pages = [...opts.images.keys()]
  const ctx = context(opts.book, opts.facts, pages, opts.description)
  const images = pages.map((p) => ({ label: `Page ${p}:`, png: opts.images.get(p)! }))
  const usage = { inputTokens: 0, outputTokens: 0 }
  let ms = 0
  const entries = await Promise.all(
    (Object.keys(QUESTIONS) as QuestionId[]).map(async (id) => {
      const q = QUESTIONS[id]
      const options = Object.entries(q.options).map(([k, v]) => `- ${k}: ${v}`).join("\n")
      const res = await askJson<Answer>({
        model: opts.model,
        system:
          "You describe a book from a few of its pages so that a person can confirm your description. Answer only the question asked. Base the answer on what you see; cite only the shown pages that support it. Use low confidence when the shown pages do not settle the question.",
        text: `${ctx}\n\nQuestion: ${q.ask}\nOptions:\n${options}`,
        images,
        schemaName: id,
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["answer", "confidence", "evidencePages", "reason"],
          properties: {
            answer: { type: "string", enum: Object.keys(q.options) },
            confidence: { type: "string", enum: ["low", "medium", "high"] },
            evidencePages: { type: "array", items: { type: "integer", enum: pages } },
            reason: { type: "string", description: "One sentence a non-expert can check against the pages." },
          },
        },
      })
      usage.inputTokens += res.usage.inputTokens
      usage.outputTokens += res.usage.outputTokens
      ms = Math.max(ms, res.ms)
      return [id, res.value] as const
    }),
  )
  return { answers: Object.fromEntries(entries) as Answers, usage, ms }
}
