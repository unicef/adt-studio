import path from "node:path"
import { randomUUID } from "node:crypto"
import { z } from "zod"
import type { Storage } from "@adt/storage"
import { WebRenderingOutput, PageSectioningOutput } from "@adt/types"
import { createLLMModel } from "@adt/llm"
import type { AgentCredentials } from "./resolve-model.js"
import { buildSectioningSectionFromHtml } from "./tools/build-sectioning.js"
import {
  LAYOUT_MIRROR_SYSTEM_PROMPT,
  buildLayoutMirrorUserPrompt,
} from "./prompts/layout-mirror.js"

export interface LayoutMirrorTarget {
  pageId: string
  sectionIndex: number
}

export interface LayoutMirrorOptions {
  storage: Storage
  bookLabel: string
  booksDir: string
  source: LayoutMirrorTarget
  targets: LayoutMirrorTarget[]
  /** Free-text refinement (e.g. "keep the image on the right"). Optional. */
  instruction?: string
  modelId: string
  credentials?: AgentCredentials
  /** Per-call timeout for the underlying LLM request. Default 90s. */
  timeoutMs?: number
  /** Optional per-target progress callback. */
  onProgress?: (message: string) => void
}

export interface LayoutMirrorTargetResult {
  pageId: string
  sectionIndex: number
  ok: boolean
  version?: number
  reasoning?: string
  /** Set on failure (missing data-ids, LLM error, etc.). */
  error?: string
}

export interface LayoutMirrorResult {
  results: LayoutMirrorTargetResult[]
}

const LAYOUT_MIRROR_LLM_SCHEMA = z.object({
  reasoning: z.string(),
  content: z.string(),
})

function loadSectionHtml(
  storage: Storage,
  pageId: string,
  sectionIndex: number,
): { html: string; rendering: WebRenderingOutput } {
  const row = storage.getLatestNodeData("web-rendering", pageId)
  if (!row) {
    throw new Error(`Page ${pageId} has no web-rendering data`)
  }
  const parsed = WebRenderingOutput.safeParse(row.data)
  if (!parsed.success) {
    throw new Error(`Invalid web-rendering data for ${pageId}`)
  }
  const section = parsed.data.sections.find(
    (s) => s.sectionIndex === sectionIndex,
  )
  if (!section) {
    throw new Error(
      `Section ${sectionIndex} not found on page ${pageId}`,
    )
  }
  return { html: section.html, rendering: parsed.data }
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

function extractDataIds(html: string): Set<string> {
  const ids = new Set<string>()
  const re = /data-id="([^"]+)"/g
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    ids.add(m[1])
  }
  return ids
}

function stripHtmlFence(raw: string): string {
  return raw
    .replace(/^```(?:html)?\s*\n?/i, "")
    .replace(/\n?```\s*$/, "")
    .trim()
}

/**
 * Rewrite each target section to match the source section's layout while
 * keeping the target's content and data-ids. Each target gets its own LLM
 * call (one source HTML, one target HTML in, one rewritten target HTML out).
 * Successful targets are saved as a new web-rendering version per page.
 */
export async function mirrorLayout(
  opts: LayoutMirrorOptions,
): Promise<LayoutMirrorResult> {
  const { storage, source, targets, instruction, modelId, credentials } = opts

  const { html: sourceHtml } = loadSectionHtml(
    storage,
    source.pageId,
    source.sectionIndex,
  )

  // Go through @adt/llm rather than the AI SDK directly: it writes every call
  // to the book's LLM log (so the run is inspectable in Debug → LLM Logs like
  // every other LLM path), caches on an input hash, and retries transient API
  // errors instead of failing the target outright.
  const model = createLLMModel({
    modelId,
    cacheDir: path.join(path.resolve(opts.booksDir), opts.bookLabel, ".cache"),
    onLog: (entry) => storage.appendLlmLog(entry),
    credentials,
  })
  // One correlationId groups every target's call under a single mirror run.
  const correlationId = randomUUID()
  const results: LayoutMirrorTargetResult[] = []

  // Process targets sequentially: each target write produces a new version,
  // and if two targets land on the same page we want deterministic version
  // numbering. Parallelism here is not worth the complexity.
  for (const [idx, target] of targets.entries()) {
    opts.onProgress?.(
      `Mirroring layout onto ${target.pageId} section ${target.sectionIndex} (${idx + 1}/${targets.length})`,
    )
    try {
      const { html: targetHtml, rendering } = loadSectionHtml(
        storage,
        target.pageId,
        target.sectionIndex,
      )
      const targetIds = extractDataIds(targetHtml)

      const { object } = await model.generateObject<
        z.infer<typeof LAYOUT_MIRROR_LLM_SCHEMA>
      >({
        schema: LAYOUT_MIRROR_LLM_SCHEMA,
        system: LAYOUT_MIRROR_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: buildLayoutMirrorUserPrompt({
              sourceHtml,
              targetHtml,
              extraInstruction: instruction,
            }),
          },
        ],
        maxRetries: 2,
        timeoutMs: opts.timeoutMs ?? 90_000,
        log: {
          taskType: "layout-mirror",
          pageId: target.pageId,
          promptName: "layout-mirror",
          sectionIndex: target.sectionIndex,
          correlationId,
        },
      })

      const cleaned = stripHtmlFence(object.content)
      if (!cleaned.includes("<section")) {
        results.push({
          ...target,
          ok: false,
          error: "LLM output did not contain a <section> wrapper",
        })
        continue
      }

      const resultIds = extractDataIds(cleaned)
      const missing = [...targetIds].filter((id) => !resultIds.has(id))
      // Allow up to a quarter of data-ids to drop, since the SOURCE layout may
      // legitimately not have a slot for every TARGET element. Fail hard if
      // more than that is missing — at that point the LLM has lost content.
      if (missing.length > Math.ceil(targetIds.size / 4)) {
        results.push({
          ...target,
          ok: false,
          error: `LLM dropped too many data-ids (${missing.length} of ${targetIds.size}): ${missing.slice(0, 5).join(", ")}…`,
        })
        continue
      }

      const updated: WebRenderingOutput = {
        sections: rendering.sections.map((s) =>
          s.sectionIndex === target.sectionIndex
            ? { ...s, html: cleaned, reasoning: object.reasoning || s.reasoning }
            : s,
        ),
      }

      // Rebuild the sectioning tree from the rewritten HTML so it stays in sync
      // with the section's markup — updateSection in book-tools does the same.
      // Without this, a mirror that legitimately drops elements (allowed up to
      // the ¼ threshold above) leaves orphaned sectioning leaves keyed by
      // data-ids no longer present, which desyncs the edit panel and corrupts
      // downstream text-catalog / TTS / translation.
      const targetSection = rendering.sections.find(
        (s) => s.sectionIndex === target.sectionIndex,
      )
      const sectioning = loadSectioning(storage, target.pageId)
      const oldSection = sectioning.sections[target.sectionIndex]
      const sectionId =
        oldSection?.sectionId ?? `${target.pageId}_s${target.sectionIndex}`
      const sectionType =
        targetSection?.sectionType ?? oldSection?.sectionType ?? "content"
      const newSectioningSection = buildSectioningSectionFromHtml({
        html: cleaned,
        sectionId,
        sectionType,
        // A mirror rewrites an existing section — carry its pageNumber,
        // palette, source pages, placement, and leaf roles across rather than
        // rebuilding from defaults (that dropped TOC entries and page numbers).
        base: oldSection,
      })
      const updatedSectioning: PageSectioningOutput = {
        ...sectioning,
        sections: sectioning.sections.map((s, i) =>
          i === target.sectionIndex ? newSectioningSection : s,
        ),
      }
      storage.putNodeData("page-sectioning", target.pageId, updatedSectioning)
      const version = storage.putNodeData(
        "web-rendering",
        target.pageId,
        updated,
      )
      results.push({
        ...target,
        ok: true,
        version,
        reasoning: object.reasoning,
      })
    } catch (err) {
      results.push({
        ...target,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return { results }
}
