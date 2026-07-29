import { z } from "zod"
import { tool, type CoreTool } from "ai"
import type { Storage } from "@adt/storage"
import {
  PageSectioningOutput,
  WebRenderingOutput,
  type ContentNodeData,
  type PageSectioningSection,
  type SectionRendering,
} from "@adt/types"
import { buildSectioningSectionFromHtml } from "./build-sectioning.js"
import {
  TEMPLATED_ACTIVITY_TYPES,
  TemplatedActivitySectioningSchema,
  type ActivityNodeShape,
  type ActivityGenMode,
} from "./activity-schema.js"
import { renderSyntheticActivity } from "./render-section.js"
import { extractAnswersFromHtml } from "./extract-custom-answers.js"
import type { AgentCredentials } from "../resolve-model.js"

const activityAnswersSchema = z
  .record(z.string(), z.union([z.string(), z.boolean(), z.number()]))
  .describe(
    "Answer key for activity sections. Keys are data-activity-item values from the HTML (e.g. 'item-1', 'item-2'). Values: boolean for multiple-choice/true-false (true = correct), string for fill-in-the-blank (the correct text), number for ordering (the correct position 1-based). Omit for non-activity sections.",
  )

export interface BookToolsContext {
  storage: Storage
  bookLabel: string
  booksDir: string
  promptsDir: string
  configPath?: string
  /**
   * Book styleguide markdown. Used only when invoking the renderer for the
   * templated activity path; the custom path receives this content via the
   * agent's system prompt instead.
   */
  styleguide?: string
  /** Per-provider keys forwarded to the renderer's LLM client. */
  credentials: AgentCredentials
  /** When set, write tools refuse to touch any other page. Read tools are unrestricted. */
  restrictWritesToPageId?: string
  /**
   * Which create tools to expose. "auto" (default) exposes both; "templated"
   * drops createCustomSection; "custom" drops createTemplatedActivity. This
   * makes a forced choice deterministic — the agent physically cannot reach
   * for the other path.
   */
  activityMode?: ActivityGenMode
}

export interface BookToolCallRecord {
  name: string
  args: unknown
  result: unknown
  error?: string
}

export interface BookToolsResult {
  tools: Record<string, CoreTool>
  /** Ordered log of tool invocations made during the agent run. */
  calls: BookToolCallRecord[]
  /** Set of pageIds the agent wrote to. */
  touchedPageIds: Set<string>
}

interface PageSummary {
  pageId: string
  pageNumber: number
  sectionCount: number
  sectionTypes: string[]
}

interface SectionSummary {
  sectionIndex: number
  sectionId: string
  sectionType: string
  html: string
  dataIds: string[]
}

function extractDataIds(html: string): string[] {
  const ids = new Set<string>()
  const re = /data-id="([^"]+)"/g
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    ids.add(m[1])
  }
  return [...ids]
}

function loadSectioning(
  storage: Storage,
  pageId: string,
): PageSectioningOutput {
  const row = storage.getLatestNodeData("page-sectioning", pageId)
  if (!row) {
    throw new Error(`Page ${pageId} has no page-sectioning data`)
  }
  const parsed = PageSectioningOutput.safeParse(row.data)
  if (!parsed.success) {
    throw new Error(`Invalid page-sectioning data for ${pageId}`)
  }
  return parsed.data
}

function loadRendering(storage: Storage, pageId: string): WebRenderingOutput {
  const row = storage.getLatestNodeData("web-rendering", pageId)
  if (!row) {
    throw new Error(`Page ${pageId} has no web-rendering data`)
  }
  const parsed = WebRenderingOutput.safeParse(row.data)
  if (!parsed.success) {
    throw new Error(`Invalid web-rendering data for ${pageId}`)
  }
  return parsed.data
}

function ensureWritable(ctx: BookToolsContext, pageId: string): void {
  if (
    ctx.restrictWritesToPageId !== undefined &&
    ctx.restrictWritesToPageId !== pageId
  ) {
    throw new Error(
      `Write blocked: this agent run is restricted to page ${ctx.restrictWritesToPageId}, attempted ${pageId}`,
    )
  }
}

/**
 * Build the tool surface the generative agent operates through. The agent
 * never touches storage directly — every read and write goes through one of
 * these tools. This is the entire blast radius.
 *
 * The wrapping in `executeWithLog` records every call (args + result/error)
 * so the calling service can attribute work and surface a transcript to the
 * UI without the agent having to emit it.
 */
export function createBookTools(ctx: BookToolsContext): BookToolsResult {
  const calls: BookToolCallRecord[] = []
  const touchedPageIds = new Set<string>()

  function executeWithLog<TArgs, TResult>(
    name: string,
    fn: (args: TArgs) => Promise<TResult> | TResult,
  ): (args: TArgs) => Promise<TResult | { ok: false; error: string }> {
    return async (args: TArgs) => {
      try {
        const result = await fn(args)
        calls.push({ name, args, result })
        return result
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        calls.push({ name, args, result: null, error: message })
        // Return the error to the model as this tool's result instead of
        // throwing. In the AI SDK, a thrown execute() rejects generateText and
        // aborts the WHOLE run — so a single recoverable failure (malformed
        // sectioningJson, a missing <script>, a write to the wrong page) would
        // kill the run with no chance for the model to self-correct. Returning
        // the error lets the model retry on the next step; maxSteps still
        // bounds the loop, and the failure is recorded in `calls` for the caller.
        return { ok: false as const, error: message }
      }
    }
  }

  const tools: Record<string, CoreTool> = {
    listPages: tool({
      description:
        "List every page in this book with its page number, section count, and section types. Use to understand what already exists before generating a new activity.",
      parameters: z.object({}),
      execute: executeWithLog<Record<string, never>, { pages: PageSummary[] }>(
        "listPages",
        () => {
          const pages = ctx.storage.getPages()
          const summaries = pages.map((p): PageSummary => {
            const row = ctx.storage.getLatestNodeData(
              "page-sectioning",
              p.pageId,
            )
            const parsed = row ? PageSectioningOutput.safeParse(row.data) : null
            const sections = parsed?.success
              ? parsed.data.sections.filter((s) => !s.isPruned)
              : []
            return {
              pageId: p.pageId,
              pageNumber: p.pageNumber,
              sectionCount: sections.length,
              sectionTypes: sections.map((s) => s.sectionType),
            }
          })
          return { pages: summaries }
        },
      ),
    }),

    getPage: tool({
      description:
        "Get the full sectioning and rendering for a page: every section's HTML, sectionType, sectionId, and the data-ids used. Use to inspect a page before editing or to find layout to mimic.",
      parameters: z.object({
        pageId: z.string(),
      }),
      execute: executeWithLog<
        { pageId: string },
        {
          pageId: string
          pageNumber: number
          extractedText: string
          sections: SectionSummary[]
        }
      >("getPage", ({ pageId }) => {
        const pages = ctx.storage.getPages()
        const page = pages.find((p) => p.pageId === pageId)
        if (!page) throw new Error(`Page ${pageId} not found`)
        const rendering = loadRendering(ctx.storage, pageId)
        const sectioning = loadSectioning(ctx.storage, pageId)
        const sections = rendering.sections.map((r): SectionSummary => {
          const s = sectioning.sections[r.sectionIndex] as
            | PageSectioningSection
            | undefined
          return {
            sectionIndex: r.sectionIndex,
            sectionId: s?.sectionId ?? `unknown_${r.sectionIndex}`,
            sectionType: r.sectionType,
            html: r.html,
            dataIds: extractDataIds(r.html),
          }
        })
        return {
          pageId,
          pageNumber: page.pageNumber,
          extractedText: page.text,
          sections,
        }
      }),
    }),

    getSection: tool({
      description:
        "Get a single section's HTML and metadata. Cheaper than getPage when you know exactly which section you need.",
      parameters: z.object({
        pageId: z.string(),
        sectionIndex: z.number().int().nonnegative(),
      }),
      execute: executeWithLog<
        { pageId: string; sectionIndex: number },
        SectionSummary
      >("getSection", ({ pageId, sectionIndex }) => {
        const rendering = loadRendering(ctx.storage, pageId)
        const r = rendering.sections.find((s) => s.sectionIndex === sectionIndex)
        if (!r) {
          throw new Error(
            `Section ${sectionIndex} not found on page ${pageId}`,
          )
        }
        const sectioning = loadSectioning(ctx.storage, pageId)
        const s = sectioning.sections[sectionIndex]
        return {
          sectionIndex: r.sectionIndex,
          sectionId: s?.sectionId ?? `unknown_${sectionIndex}`,
          sectionType: r.sectionType,
          html: r.html,
          dataIds: extractDataIds(r.html),
        }
      }),
    }),

    listPageImages: tool({
      description:
        "List image ids available on a page (these are the only image src values you may reference; do not invent image ids).",
      parameters: z.object({
        pageId: z.string(),
      }),
      execute: executeWithLog<
        { pageId: string },
        {
          images: Array<{ imageId: string; width: number; height: number }>
        }
      >("listPageImages", ({ pageId }) => {
        const images = ctx.storage.getPageImages(pageId)
        return {
          images: images.map((i) => ({
            imageId: i.imageId,
            width: i.width,
            height: i.height,
          })),
        }
      }),
    }),

    updateSection: tool({
      description:
        "Rewrite a section's HTML. Creates a new version (the previous version is preserved). Preserve existing data-id values on any element you keep. Use this when you want to modify a section in place.",
      parameters: z.object({
        pageId: z.string(),
        sectionIndex: z.number().int().nonnegative(),
        html: z
          .string()
          .describe("The full replacement HTML, starting with <section>."),
        reasoning: z
          .string()
          .describe("One-sentence summary of what changed and why."),
        activityAnswers: activityAnswersSchema.nullable(),
      }),
      execute: executeWithLog<
        {
          pageId: string
          sectionIndex: number
          html: string
          reasoning: string
          activityAnswers: Record<string, string | boolean | number> | null
        },
        { ok: true; version: number; sectionIndex: number }
      >(
        "updateSection",
        ({ pageId, sectionIndex, html, reasoning, activityAnswers }) => {
          ensureWritable(ctx, pageId)
          const rendering = loadRendering(ctx.storage, pageId)
          const sectioning = loadSectioning(ctx.storage, pageId)
          const found = rendering.sections.find(
            (s) => s.sectionIndex === sectionIndex,
          )
          if (!found) {
            throw new Error(
              `Section ${sectionIndex} not found on page ${pageId}`,
            )
          }

          // Mirror the createCustomSection extraction so an in-place edit of a
          // custom activity also refreshes the answer key derived from the
          // markup. Agent-supplied activityAnswers still wins.
          const isCustomActivityUpdate =
            found.sectionType === "activity_custom" ||
            found.sectionType.startsWith("activity_custom_")
          const derivedAnswers =
            isCustomActivityUpdate && !activityAnswers
              ? extractAnswersFromHtml(html)
              : undefined
          const effectiveAnswers = activityAnswers ?? derivedAnswers ?? null

          const updatedRendering: WebRenderingOutput = {
            sections: rendering.sections.map((s) =>
              s.sectionIndex === sectionIndex
                ? {
                    ...s,
                    html,
                    reasoning: reasoning || s.reasoning,
                    ...(effectiveAnswers ? { activityAnswers: effectiveAnswers } : {}),
                  }
                : s,
            ),
          }

          // Refresh the sectioning tree so the edit panel and downstream
          // steps stay in sync with the rewritten HTML.
          const oldSection = sectioning.sections[sectionIndex]
          const sectionId =
            oldSection?.sectionId ?? `${pageId}_s${sectionIndex}`
          const sectionType = found.sectionType
          const newSectioningSection = buildSectioningSectionFromHtml({
            html,
            sectionId,
            sectionType,
            // Rewriting in place — keep the section's pageNumber, palette,
            // placement, and prior leaf roles instead of resetting to defaults.
            base: oldSection,
          })
          const updatedSectioning: PageSectioningOutput = {
            ...sectioning,
            sections: sectioning.sections.map((s, i) =>
              i === sectionIndex ? newSectioningSection : s,
            ),
          }
          ctx.storage.putNodeData(
            "page-sectioning",
            pageId,
            updatedSectioning,
          )
          const version = ctx.storage.putNodeData(
            "web-rendering",
            pageId,
            updatedRendering,
          )
          touchedPageIds.add(pageId)
          return { ok: true, version, sectionIndex }
        },
      ),
    }),

    createTemplatedActivity: tool({
      description:
        `PREFERRED tool for known activity types. Use this whenever the user's request maps to one of: ${TEMPLATED_ACTIVITY_TYPES.join(", ")}. You provide the sectioning tree as a JSON-encoded string (activity / activity_option containers, activity_question / activity_number / activity_fill_in_the_blank / activity_open_ended_answer / text leaves) and the pipeline's renderer produces HTML that follows the book's styleguide and the activity templates' built-in accessibility patterns. The activityAnswers key is extracted automatically — do not supply it.`,
      parameters: z.object({
        pageId: z.string(),
        sectionType: z.enum(TEMPLATED_ACTIVITY_TYPES),
        sectioningJson: z
          .string()
          .describe(
            `JSON-encoded sectioning tree. Shape: {"reasoning": string, "nodes": [<node>, ...]} where each node has nodeId (string), optional structure ("activity" | "activity_option" | "image_group") for containers, optional role ("activity_number" | "activity_question" | "activity_fill_in_the_blank" | "activity_open_ended_answer" | "text" | "image") for leaves, optional text (string), and optional children (array of nodes). See the system prompt's worked examples for exact shape per activity type. The string MUST be valid JSON.`,
          ),
        userInstructions: z
          .string()
          .nullable()
          .describe(
            "Free-text guidance forwarded to the renderer (e.g. 'use a card-style layout', 'keep the question short'). Pass null when there are no extra instructions.",
          ),
      }),
      execute: executeWithLog<
        {
          pageId: string
          sectionType: (typeof TEMPLATED_ACTIVITY_TYPES)[number]
          sectioningJson: string
          userInstructions: string | null
        },
        {
          ok: true
          sectionIndex: number
          sectionId: string
          version: number
          activityAnswers?: Record<string, string | boolean | number>
        }
      >(
        "createTemplatedActivity",
        async ({ pageId, sectionType, sectioningJson, userInstructions }) => {
          ensureWritable(ctx, pageId)

          // Parse + validate the JSON-encoded tree. Tool params can't express
          // recursive types as native JSON Schema (OpenAI's API rejects $ref
          // in items positions), so the agent emits the tree as a string and
          // we validate it with Zod server-side. Errors here flow back to the
          // agent as a tool error, which lets it retry with a fixed shape.
          let sectioning: { reasoning: string; nodes: ActivityNodeShape[] }
          try {
            const parsed = JSON.parse(sectioningJson)
            const result = TemplatedActivitySectioningSchema.safeParse(parsed)
            if (!result.success) {
              throw new Error(
                `Invalid sectioning shape: ${result.error.errors
                  .map((e) => `${e.path.join(".")}: ${e.message}`)
                  .join("; ")}`,
              )
            }
            sectioning = result.data
          } catch (err) {
            if (err instanceof SyntaxError) {
              throw new Error(
                `sectioningJson is not valid JSON: ${err.message}. Emit a JSON-encoded string, not an object.`,
              )
            }
            throw err
          }

          const rendering = loadRendering(ctx.storage, pageId)
          const existingSectioning = loadSectioning(ctx.storage, pageId)
          // sectionIndex is the index into page-sectioning.sections (that is
          // how renderPage assigns it and how getPage/getSection/updateSection
          // map back). renderPage SKIPS pruned/empty sections, so
          // rendering.sections can have gaps and be shorter than the sectioning
          // array — using its length here would collide with an existing
          // section's index. The new section is appended at the end of the
          // sectioning array, so its index is the sectioning array's length.
          const nextIndex = existingSectioning.sections.length
          const sectionId = `${pageId}_s${nextIndex}`

          // Promote agent-emitted nodes (no isPruned) to ContentNodeData.
          const promote = (n: ActivityNodeShape): ContentNodeData => ({
            nodeId: n.nodeId,
            isPruned: false,
            ...(n.structure ? { structure: n.structure } : {}),
            ...(n.role ? { role: n.role } : {}),
            ...(n.text !== undefined ? { text: n.text } : {}),
            ...(n.children ? { children: n.children.map(promote) } : {}),
          })
          const nodes = sectioning.nodes.map(promote)

          const { section, rendering: newRendering } =
            await renderSyntheticActivity({
              storage: ctx.storage,
              bookLabel: ctx.bookLabel,
              booksDir: ctx.booksDir,
              promptsDir: ctx.promptsDir,
              configPath: ctx.configPath,
              anchorPageId: pageId,
              sectionIndex: nextIndex,
              sectionId,
              sectionType,
              nodes,
              userInstructions: userInstructions ?? undefined,
              styleguide: ctx.styleguide,
              credentials: ctx.credentials,
            })

          // The renderer returns sectionIndex/sectionType etc., but its
          // sectionIndex is whatever we asked for. Persist alongside the
          // existing sections.
          const updatedRendering: WebRenderingOutput = {
            sections: [...rendering.sections, newRendering],
          }
          const updatedSectioning: PageSectioningOutput = {
            ...existingSectioning,
            sections: [...existingSectioning.sections, section],
          }
          ctx.storage.putNodeData(
            "page-sectioning",
            pageId,
            updatedSectioning,
          )
          const version = ctx.storage.putNodeData(
            "web-rendering",
            pageId,
            updatedRendering,
          )
          touchedPageIds.add(pageId)
          return {
            ok: true,
            sectionIndex: nextIndex,
            sectionId,
            version,
            ...(newRendering.activityAnswers
              ? { activityAnswers: newRendering.activityAnswers }
              : {}),
          }
        },
      ),
    }),

    createCustomSection: tool({
      description:
        "ESCAPE HATCH for fully-interactive custom activities. Use when the user wants something that does NOT map to a templated activity type (crossword, word search, drag-and-drop, custom widget). The sectionType MUST start with 'activity_custom' (e.g. activity_custom_drag_drop). The HTML must include an embedded <script> that calls window.adtRegisterCustomActivity(section, { validate, reset }) — the runtime dispatches custom-activity sections to that registration. See the 'Custom-section rules' part of the system prompt for the full contract and a worked example.",
      parameters: z.object({
        pageId: z.string(),
        sectionType: z
          .string()
          .describe(
            "MUST start with 'activity_custom'. Use a descriptive suffix like activity_custom_drag_drop, activity_custom_crossword, activity_custom_word_search. Do NOT use one of the templated activity types here — use createTemplatedActivity for those.",
          ),
        html: z
          .string()
          .describe(
            "The new section's HTML, starting with <section ...>. Include data-section-type matching sectionType.",
          ),
        reasoning: z
          .string()
          .describe("One-sentence summary of what was created."),
        activityAnswers: activityAnswersSchema.nullable(),
      }),
      execute: executeWithLog<
        {
          pageId: string
          sectionType: string
          html: string
          reasoning: string
          activityAnswers: Record<string, string | boolean | number> | null
        },
        { ok: true; sectionIndex: number; sectionId: string; version: number }
      >(
        "createCustomSection",
        ({ pageId, sectionType, html, reasoning, activityAnswers }) => {
          ensureWritable(ctx, pageId)

          // The runtime dispatches custom-activity sections by prefix-matching
          // data-section-type. Reject anything else so the agent gets a fast,
          // actionable tool error rather than producing a section the runtime
          // will silently ignore at "Try Activity" time.
          const isCustomActivity =
            sectionType === "activity_custom" ||
            sectionType.startsWith("activity_custom_")
          if (!isCustomActivity && sectionType !== "content") {
            throw new Error(
              `Invalid sectionType "${sectionType}" for createCustomSection. Use "activity_custom" or "activity_custom_<suffix>" (e.g. activity_custom_drag_drop). For non-interactive layout use "content". For templated activity types use createTemplatedActivity.`,
            )
          }

          // Custom activities are interactive by contract: the runtime only
          // knows how to grade them via window.adtRegisterCustomActivity, which
          // can only be called by an inline <script> in the section. If the
          // script is missing, the Submit button is wired but does nothing —
          // the worst possible failure mode. Catch it at write time so the
          // agent retries with the script attached.
          if (isCustomActivity && !/<script\b/i.test(html)) {
            throw new Error(
              `createCustomSection for activity_custom requires an embedded <script> that calls window.adtRegisterCustomActivity(section, { validate, reset }). Without it, the runtime will recognise this as an activity, show a Submit button, but no validation will run. Include the script before retrying.`,
            )
          }

          const rendering = loadRendering(ctx.storage, pageId)
          const sectioning = loadSectioning(ctx.storage, pageId)
          // sectionIndex is the index into page-sectioning.sections (see
          // createTemplatedActivity for the full rationale). rendering.sections
          // can be shorter than the sectioning array because renderPage skips
          // pruned/empty sections, so basing the index on it collides with an
          // existing section. Append at the sectioning array's length instead.
          const nextIndex = sectioning.sections.length
          const sectionId = `${pageId}_s${nextIndex}`

          // For custom activities, the script encodes correctness — but we
          // also surface a JSON answer key derived from the markup so the EDIT
          // sidebar / text-catalog / translation pipeline can see what's being
          // graded. Agent-supplied activityAnswers wins; otherwise we extract
          // from data-answer / data-correct-items attributes.
          const derivedAnswers =
            isCustomActivity && !activityAnswers
              ? extractAnswersFromHtml(html)
              : undefined
          const effectiveAnswers = activityAnswers ?? derivedAnswers ?? null

          const newRendering: SectionRendering = {
            sectionIndex: nextIndex,
            sectionType,
            reasoning,
            html,
            ...(effectiveAnswers ? { activityAnswers: effectiveAnswers } : {}),
          }
          const newSectioningSection: PageSectioningSection =
            buildSectioningSectionFromHtml({ html, sectionId, sectionType })

          const updatedRendering: WebRenderingOutput = {
            sections: [...rendering.sections, newRendering],
          }
          const updatedSectioning: PageSectioningOutput = {
            ...sectioning,
            sections: [...sectioning.sections, newSectioningSection],
          }
          ctx.storage.putNodeData(
            "page-sectioning",
            pageId,
            updatedSectioning,
          )
          const version = ctx.storage.putNodeData(
            "web-rendering",
            pageId,
            updatedRendering,
          )
          touchedPageIds.add(pageId)
          return {
            ok: true,
            sectionIndex: nextIndex,
            sectionId,
            version,
          }
        },
      ),
    }),
  }

  // Restrict the create surface so a forced mode is deterministic — the agent
  // can't fall back to the path the user disabled.
  if (ctx.activityMode === "templated") {
    delete tools.createCustomSection
  } else if (ctx.activityMode === "custom") {
    delete tools.createTemplatedActivity
  }

  return { tools, calls, touchedPageIds }
}
