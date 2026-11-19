/**
 * Shared: the 4 plain questions of E2 asked in ONE call (one JSON object, one answer per question).
 * Used by e4 (one call), e6 (text only), e7 (page bagging) and e8 (user states the genre first).
 */
import { askJson } from "../llm.ts"
import type { BookProfile } from "../profile.ts"
import type { DeterministicFacts } from "../facts.ts"
import { QUESTIONS, context, type Answer, type Answers, type QuestionId } from "../questions.ts"

const SYSTEM =
  "You describe a book from a few of its pages so that a person can confirm your description. Answer each question on its own. Base every answer on what you see; cite only the shown pages that support it. Use low confidence when the shown pages do not settle a question."

export async function askCombined(opts: {
  model: string
  book: BookProfile
  facts: DeterministicFacts
  pages: number[]
  /** Omit for text only. */
  images?: Map<number, Uint8Array>
  description?: string
  /** Facts the user already stated; not asked again, given to the model as true. */
  given?: Partial<Record<QuestionId, string>>
}): Promise<{ answers: Partial<Answers>; usage: { inputTokens: number; outputTokens: number }; ms: number }> {
  const ids = (Object.keys(QUESTIONS) as QuestionId[]).filter((id) => !opts.given?.[id])
  const answerSchema = (id: QuestionId) => ({
    type: "object",
    additionalProperties: false,
    required: ["answer", "confidence", "evidencePages", "reason"],
    properties: {
      answer: { type: "string", enum: Object.keys(QUESTIONS[id].options) },
      confidence: { type: "string", enum: ["low", "medium", "high"] },
      evidencePages: { type: "array", items: { type: "integer", enum: opts.pages } },
      reason: { type: "string", description: "One sentence a non-expert can check against the pages." },
    },
  })
  const questions = ids
    .map((id) => {
      const q = QUESTIONS[id]
      return `${id}: ${q.ask}\n${Object.entries(q.options).map(([k, v]) => `- ${k}: ${v}`).join("\n")}`
    })
    .join("\n\n")
  const given = opts.given
    ? Object.entries(opts.given)
        .map(([id, v]) => `The person adding the book says: ${QUESTIONS[id as QuestionId].ask} -> ${v} (${(QUESTIONS[id as QuestionId].options as Record<string, string>)[v!]}). Treat this as true.`)
        .join("\n")
    : ""
  const text = [
    context(opts.book, opts.facts, opts.pages, opts.description),
    opts.images ? "" : "You are not shown page images, only the measurements and the extracted text above.",
    given,
    `Answer every question below.\n\n${questions}`,
  ]
    .filter(Boolean)
    .join("\n\n")
  const res = await askJson<Record<string, Answer>>({
    model: opts.model,
    system: SYSTEM,
    text,
    images: opts.images ? opts.pages.map((p) => ({ label: `Page ${p}:`, png: opts.images!.get(p)! })) : [],
    schemaName: "book_facts",
    schema: { type: "object", additionalProperties: false, required: ids, properties: Object.fromEntries(ids.map((id) => [id, answerSchema(id)])) },
  })
  return { answers: res.value as Partial<Answers>, usage: res.usage, ms: res.ms }
}
