import { z } from "zod"

/**
 * The set of section types the templated path supports. These are the
 * activity_* types the pipeline has Liquid templates and renderer configs for.
 * Anything outside this set has to go through createCustomSection.
 */
export const TEMPLATED_ACTIVITY_TYPES = [
  "activity_multiple_choice",
  "activity_fill_in_the_blank",
  "activity_true_false",
  "activity_matching",
  "activity_sorting",
  "activity_ordering",
  "activity_open_ended_answer",
  "activity_fill_in_a_table",
] as const

export type TemplatedActivityType = (typeof TEMPLATED_ACTIVITY_TYPES)[number]

/**
 * Which write tools the generation agent is allowed to use for a run:
 *   - "auto":      both tools available; the agent chooses on fit (default).
 *   - "templated": only createTemplatedActivity is exposed.
 *   - "custom":    only createCustomSection is exposed.
 * The "templated"/"custom" modes restrict the toolset itself (not just the
 * prompt), so the choice is deterministic.
 */
export type ActivityGenMode = "auto" | "templated" | "custom"

export const ACTIVITY_GEN_MODES: readonly ActivityGenMode[] = [
  "auto",
  "templated",
  "custom",
] as const

/**
 * Container structures the agent may emit inside an activity tree. The
 * renderer's Liquid templates understand these.
 */
const ACTIVITY_STRUCTURES = ["activity", "activity_option", "image_group"] as const

/**
 * Leaf roles the agent may emit inside an activity tree.
 *   - activity_number: ordinal label ("1.", "2."). Optional.
 *   - activity_question: the prompt/instruction text.
 *   - activity_fill_in_the_blank: a blank to be filled with a determinable answer (word/number/date).
 *   - activity_open_ended_answer: a free-form textarea for composition (opinion/description).
 *   - text: generic body text inside option containers.
 *   - image: image leaf; nodeId must be a real imageId on the anchor page (see listPageImages).
 */
const ACTIVITY_LEAF_ROLES = [
  "activity_number",
  "activity_question",
  "activity_fill_in_the_blank",
  "activity_open_ended_answer",
  "text",
  "image",
] as const

export type ActivityNodeShape = {
  nodeId: string
  structure?: (typeof ACTIVITY_STRUCTURES)[number]
  role?: (typeof ACTIVITY_LEAF_ROLES)[number]
  text?: string
  children?: ActivityNodeShape[]
}

/**
 * Recursive Zod schema for activity sectioning trees. Uses z.lazy() so the
 * generated JSON schema uses $ref for the recursive position — matches how
 * `buildPageSectioningLLMSchema` in @adt/types handles the same problem.
 */
export const ActivityNodeShapeSchema: z.ZodType<ActivityNodeShape> = z.lazy(
  () =>
    z.object({
      nodeId: z
        .string()
        .describe(
          "Unique id within the section. Use `<pageId>_q<n>` for question/instruction leaves, `<pageId>_opt<n>` for option containers, `<pageId>_t<n>` for text leaves inside options. For image leaves, nodeId MUST equal a real imageId from listPageImages — never invent.",
        ),
      structure: z
        .enum(ACTIVITY_STRUCTURES)
        .optional()
        .describe(
          "Set on container nodes only. Use `activity` for the outer wrapper, `activity_option` for each choice in multiple-choice/true-false/matching/sorting, `image_group` only if grouping an image with adjacent caption/label leaves.",
        ),
      role: z
        .enum(ACTIVITY_LEAF_ROLES)
        .optional()
        .describe(
          "Set on leaf nodes only. Mutually exclusive with `structure`.",
        ),
      text: z
        .string()
        .optional()
        .describe(
          "Text content for non-image leaves. Required for activity_number, activity_question, activity_fill_in_the_blank, activity_open_ended_answer, and text roles.",
        ),
      children: z
        .array(ActivityNodeShapeSchema)
        .optional()
        .describe("Children of a container. Omit on leaves."),
    }),
)

export const TemplatedActivitySectioningSchema = z.object({
  reasoning: z
    .string()
    .describe("One sentence: what the activity is and why it suits the page."),
  nodes: z
    .array(ActivityNodeShapeSchema)
    .describe(
      "The top-level nodes of the activity section. Typically a single container with structure='activity' that wraps every other node.",
    ),
})

export type TemplatedActivitySectioning = z.infer<
  typeof TemplatedActivitySectioningSchema
>
