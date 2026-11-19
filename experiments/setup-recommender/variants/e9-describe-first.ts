import { askJson } from "../llm.ts"
import { renderPages } from "../profile.ts"
import { QUESTIONS, choosePages, type QuestionId } from "../questions.ts"
import { decide } from "../rules.ts"
import { lowConfidence, semanticOf } from "./e4-one-call.ts"
import { askCombined } from "./one-call.ts"
import type { Variant, VariantContext } from "./types.ts"

/**
 * E9: the user describes the book first, in their own words. Two steps:
 *  1. Text-only call: read ONLY the description and say, per fact, whether the words state it
 *     ("stated"), suggest it ("implied") or say nothing ("unknown"), quoting the words.
 *  2. Only "stated" facts are taken as the user's answer (they replace the fact, as E8 does with genre;
 *     E3 showed a hint does not override the pages). One E4-style call answers the rest from the pages.
 *     If the description states all 4 facts, step 2 is skipped.
 * Measures how many questions a description settles, so the flow knows how many it still has to ask.
 * Descriptions are simulated (datasets/poc.json: description = "short", descriptions.vague / .rich).
 */
type Parsed = Record<QuestionId, { status: "stated" | "implied" | "unknown"; answer: string; quote: string }>

const IDS = Object.keys(QUESTIONS) as QuestionId[]

export async function parseDescription(model: string, description: string) {
  const list = IDS.map((id) => `${id}: ${QUESTIONS[id].ask}\n${Object.entries(QUESTIONS[id].options).map(([k, v]) => `- ${k}: ${v}`).join("\n")}`).join("\n\n")
  const res = await askJson<Parsed>({
    model,
    system:
      "You read a short description that a person typed about a book they are adding. You have NOT seen the book. For each question, say what the description itself settles. 'stated': the words clearly say it. 'implied': the words make one option likely but do not say it. 'unknown': the words say nothing about it. Never guess from what books of that kind usually look like.",
    text: `Description: "${description}"\n\nQuestions:\n\n${list}\n\nFor 'unknown', set answer to the most common option and quote to "".`,
    images: [],
    schemaName: "description_facts",
    schema: {
      type: "object",
      additionalProperties: false,
      required: IDS,
      properties: Object.fromEntries(
        IDS.map((id) => [
          id,
          {
            type: "object",
            additionalProperties: false,
            required: ["status", "answer", "quote"],
            properties: {
              status: { type: "string", enum: ["stated", "implied", "unknown"] },
              answer: { type: "string", enum: Object.keys(QUESTIONS[id].options) },
              quote: { type: "string", description: "The exact words of the description that settle it, or empty." },
            },
          },
        ]),
      ),
    },
  })
  return res
}

function describeFirst(style: "short" | "vague" | "rich"): Variant {
  return {
    id: `e9-describe-${style}`,
    label: `User describes the book first (${style} description), AI answers what the words leave open`,
    deterministic: false,
    async run(ctx: VariantContext) {
      const description = style === "short" ? ctx.description : ctx.descriptions?.[style]
      if (!description) throw new Error(`no ${style} description for ${ctx.bookId}`)
      const parsed = await parseDescription(ctx.model, description)
      const given = Object.fromEntries(IDS.filter((id) => parsed.value[id].status === "stated").map((id) => [id, parsed.value[id].answer])) as Partial<Record<QuestionId, string>>
      const usage = { inputTokens: parsed.usage.inputTokens, outputTokens: parsed.usage.outputTokens, calls: 1 }
      let ms = parsed.ms
      let answers = {}
      let pages: number[] = []
      if (Object.keys(given).length < IDS.length) {
        pages = choosePages(ctx.book, ctx.facts)
        const res = await askCombined({ model: ctx.model, book: ctx.book, facts: ctx.facts, pages, images: renderPages(ctx.buffer, pages), given })
        answers = res.answers
        usage.inputTokens += res.usage.inputTokens
        usage.outputTokens += res.usage.outputTokens
        usage.calls++
        ms += res.ms
      }
      const semantic = semanticOf(answers, given as never)
      return {
        settings: decide(ctx.facts, semantic),
        trace: { description, style, parsed: parsed.value, given, settledByDescription: Object.keys(given), pages, answers, semantic, flags: lowConfidence(answers) },
        usage,
        ms,
      }
    },
  }
}

export const e9DescribeShort = describeFirst("short")
export const e9DescribeVague = describeFirst("vague")
export const e9DescribeRich = describeFirst("rich")
