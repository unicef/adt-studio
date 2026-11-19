/**
 * E10: E4 (4 questions, one call, same pages, same rulebook) with the questions rewritten in plain words a
 * teacher can answer by looking at the paper book, the same words the user would see. Changes vs E4:
 *  - positive questions, no double negatives, no jargon (preset, front matter, sections, render);
 *  - "things to do" defined: writing or marking answers counts; colouring and drawing pages do not
 *    (they cannot become interactive questions), so a colouring storybook is not a schoolbook;
 *  - "labelled pictures" defined: a caption under a photo does not count.
 * Purpose: check that the wording the user sees does not make the AI's own reading worse (one wording for both).
 * The answer keys are E4's, so rules.ts is reused unchanged.
 */
import { askJson } from "../llm.ts"
import { renderPages } from "../profile.ts"
import { choosePages, context, type Answer, type Answers, type QuestionId } from "../questions.ts"
import { decide } from "../rules.ts"
import { lowConfidence, semanticOf } from "./e4-one-call.ts"
import type { Variant, VariantContext } from "./types.ts"

export const PLAIN_QUESTIONS: Record<QuestionId, { ask: string; options: Record<string, string> }> = {
  genre: {
    ask: "What is this book mostly?",
    options: {
      story: "A story. Readers follow characters or events from start to end: a picture book, a tale or a novel. A story with a few colouring or drawing pages is still a story.",
      textbook: "A schoolbook. It teaches a subject in lessons and gives the learner tasks to do.",
      reference: "Something people read to find information: a report, an article, a manual or a guide. It has no tasks for the reader.",
    },
  },
  exercises: {
    ask: "Does the book ask the reader to write or mark answers? (Colouring and drawing do not count.)",
    options: {
      none: "No. The reader only reads, or colours and draws. Questions inside the story that nobody writes an answer to do not count.",
      some: "Yes, on a few pages: questions to answer, blanks to fill, things to match, circle or tick.",
      many: "Yes, on most pages.",
    },
  },
  composition: {
    ask: "Where are the words on a page?",
    options: {
      "text-in-art": "Printed on the picture itself, for example over the sky or the grass.",
      "text-beside-art": "In their own space: above, below or next to the picture, or on the opposite page.",
      "text-mostly": "It is mostly words. Pictures are few or small.",
    },
  },
  diagrams: {
    ask: "Are there pictures with labels that explain something, like maps, charts, diagrams or labelled drawings?",
    options: {
      none: "No. Only illustrations or photos. A caption under a photo does not count.",
      some: "Yes, a few.",
      many: "Yes, on many pages.",
    },
  },
}

const IDS = Object.keys(PLAIN_QUESTIONS) as QuestionId[]

/** E10 with a page chooser; E13 (round 3) reuses it with pages from the book's middle. */
export const makePlainWords = (id: string, label: string, choose: (ctx: VariantContext) => number[], img: { size: number; format: "png" | "jpeg"; detail?: "low" | "auto" } = { size: 1000, format: "png" }): Variant => ({
  id,
  label,
  deterministic: false,
  async run(ctx) {
    const pages = choose(ctx)
    const images = renderPages(ctx.buffer, pages, img.size, img.format)
    const questions = IDS.map((id) => `${id}: ${PLAIN_QUESTIONS[id].ask}\n${Object.entries(PLAIN_QUESTIONS[id].options).map(([k, v]) => `- ${k}: ${v}`).join("\n")}`).join("\n\n")
    const res = await askJson<Record<string, Answer>>({
      model: ctx.model,
      system:
        "You describe a book from a few of its pages so that a teacher can check your description against the paper book. Answer each question on its own. Base every answer on what you see; cite only the shown pages that support it. Use low confidence when the shown pages do not settle a question.",
      text: `${context(ctx.book, ctx.facts, pages)}\n\nAnswer every question below.\n\n${questions}`,
      images: pages.map((p) => ({ label: `Page ${p}:`, png: images.get(p)! })),
      detail: img.detail,
      schemaName: "book_facts_plain",
      schema: {
        type: "object",
        additionalProperties: false,
        required: IDS,
        properties: Object.fromEntries(IDS.map((id) => [id, {
          type: "object",
          additionalProperties: false,
          required: ["answer", "confidence", "evidencePages", "reason"],
          properties: {
            answer: { type: "string", enum: Object.keys(PLAIN_QUESTIONS[id].options) },
            confidence: { type: "string", enum: ["low", "medium", "high"] },
            evidencePages: { type: "array", items: { type: "integer", enum: pages } },
            reason: { type: "string", description: "One short sentence a teacher can check against the pages." },
          },
        }])),
      },
    })
    const answers = res.value as unknown as Answers
    const semantic = semanticOf(answers)
    return { settings: decide(ctx.facts, semantic), trace: { pages, answers, semantic, flags: lowConfidence(answers) }, usage: { ...res.usage, calls: 1 }, ms: res.ms }
  },
})

export const e10PlainWords = makePlainWords("e10-plain-words", "E4 with plain, positive questions (the words a user would see)", (ctx) => choosePages(ctx.book, ctx.facts))
