import { createBookStorage } from "@adt/storage"
import { STAGE_ORDER, StageName, WebRenderingOutput } from "@adt/types"
import { getBookConfig } from "../book-service.js"
import { getRunningSteps } from "../pipeline-run-guard.js"
import { planStageClear } from "../stage-clear.js"

export interface StageRunPreview {
  kind: "stage-run"
  fromStage: string
  toStage: string
  stagesInRange: string[]
  clearedNodes: string[]
  resetStages: string[]
  clearsExtractedData: boolean
}

export interface DiffPreview {
  kind: "diff"
  target: string
  before: string
  after: string | null
  /** Set when the new content is produced by the tool itself, not supplied up front. */
  note?: string
}

export interface ConfigPreview {
  kind: "config"
  changes: Array<{ key: string; before: unknown; after: unknown }>
}

export interface OpaquePreview {
  kind: "opaque"
  input: unknown
}

export type ToolPreviewBody = StageRunPreview | DiffPreview | ConfigPreview | OpaquePreview

export interface ToolPreview {
  toolName: string
  /** Steps running right now — the mutation will be refused while any are. */
  runningSteps: string[]
  preview: ToolPreviewBody
}

function sectionHtml(booksDir: string, safeLabel: string, pageId: string, sectionIndex: number) {
  const storage = createBookStorage(safeLabel, booksDir)
  try {
    const row = storage.getLatestNodeData("web-rendering", pageId)
    const parsed = row ? WebRenderingOutput.safeParse(row.data) : null
    if (!parsed?.success) return null
    return (
      parsed.data.sections.find((section) => section.sectionIndex === sectionIndex)?.html ?? null
    )
  } finally {
    storage.close()
  }
}

function translationText(
  booksDir: string,
  safeLabel: string,
  language: string,
  entryId: string,
) {
  const storage = createBookStorage(safeLabel, booksDir)
  try {
    const data = storage.getLatestNodeData("text-catalog-translation", language)?.data as
      | { entries?: Array<{ id: string; text: string }> }
      | undefined
    return data?.entries?.find((entry) => entry.id === entryId)?.text ?? null
  } finally {
    storage.close()
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {}
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : ""
}

function asIndex(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : -1
}

/**
 * Ground truth for an approval card: what the tool call would actually do,
 * computed from the book rather than from the assistant's description of it.
 * Book content comes from untrusted PDFs, so the human decision must never rest
 * on model prose.
 */
export function buildToolPreview(
  booksDir: string,
  safeLabel: string,
  toolName: string,
  rawInput: unknown,
): ToolPreview {
  const input = asRecord(rawInput)
  const storage = createBookStorage(safeLabel, booksDir)
  let runningSteps: string[]
  try {
    runningSteps = getRunningSteps(storage)
  } finally {
    storage.close()
  }

  const base = { toolName, runningSteps }

  switch (toolName) {
    case "run_stages": {
      const from = StageName.safeParse(input.fromStage)
      const to = StageName.safeParse(input.toStage)
      if (!from.success || !to.success) {
        return { ...base, preview: { kind: "opaque", input: rawInput } }
      }
      const plan = planStageClear(from.data, to.data)
      const fromIndex = STAGE_ORDER.indexOf(from.data)
      const toIndex = STAGE_ORDER.indexOf(to.data)
      return {
        ...base,
        preview: {
          kind: "stage-run",
          fromStage: from.data,
          toStage: to.data,
          stagesInRange:
            fromIndex <= toIndex ? STAGE_ORDER.slice(fromIndex, toIndex + 1) : [from.data],
          clearedNodes: plan.nodes,
          resetStages: plan.stages,
          clearsExtractedData: plan.clearsExtractedData,
        },
      }
    }

    case "update_stage_config": {
      const current = getBookConfig(safeLabel, booksDir) ?? {}
      const changes = Object.entries(asRecord(input.changes)).map(([key, after]) => ({
        key,
        before: current[key] ?? null,
        after,
      }))
      return { ...base, preview: { kind: "config", changes } }
    }

    case "edit_storyboard_section": {
      const pageId = asString(input.pageId)
      const sectionIndex = asIndex(input.sectionIndex)
      return {
        ...base,
        preview: {
          kind: "diff",
          target: `${pageId} · section ${sectionIndex + 1}`,
          before: sectionHtml(booksDir, safeLabel, pageId, sectionIndex) ?? "",
          after: asString(input.html),
        },
      }
    }

    case "rerun_with_instructions": {
      const pageId = asString(input.pageId)
      const sectionIndex = asIndex(input.sectionIndex)
      return {
        ...base,
        preview: {
          kind: "diff",
          target: `${pageId} · section ${sectionIndex + 1}`,
          before: sectionHtml(booksDir, safeLabel, pageId, sectionIndex) ?? "",
          after: null,
          note: asString(input.instruction),
        },
      }
    }

    case "edit_translation": {
      const language = asString(input.language)
      const entryId = asString(input.entryId)
      return {
        ...base,
        preview: {
          kind: "diff",
          target: `${language} · ${entryId}`,
          before: translationText(booksDir, safeLabel, language, entryId) ?? "",
          after: asString(input.text),
        },
      }
    }

    default:
      return { ...base, preview: { kind: "opaque", input: rawInput } }
  }
}
