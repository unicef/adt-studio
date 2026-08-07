import {
  BookOutlineOutput,
  DEFAULT_LLM_MAX_RETRIES,
  DEFAULT_LLM_MODEL_ID,
  type AppConfig,
  type BookOutlineEntry,
  type BookOutlineStyleCluster,
} from "@adt/types"
import type { LLMModel, ValidationResult } from "@adt/llm"
import type { Storage } from "@adt/storage"
import type { BookOutlineEvidence } from "./book-outline-evidence.js"

export const BOOK_OUTLINE_NODE = "book-outline"
export const BOOK_OUTLINE_ITEM = "book"
export const BOOK_OUTLINE_CHUNK_PAGE_LIMIT = 16

const BOOK_OUTLINE_CHUNK_PROMPT = "book_outline_chunk"
const BOOK_OUTLINE_SYNTHESIS_PROMPT = "book_outline_synthesis"
const BOOK_OUTLINE_CHUNK_MAX_TOKENS = 16_384

export interface BookOutlineConfig {
  promptName: string
  modelId: string
  maxRetries: number
  timeoutMs: number
}

export interface PageOutlineContext {
  entries: BookOutlineEntry[]
  ancestors: BookOutlineEntry[]
  styleClusters: BookOutlineStyleCluster[]
}

export function buildBookOutlineConfig(appConfig: AppConfig): BookOutlineConfig {
  const config = appConfig.book_outline
  return {
    promptName: config?.prompt ?? "book_outline",
    modelId: config?.model ?? appConfig.default_model ?? DEFAULT_LLM_MODEL_ID,
    maxRetries: config?.max_retries ?? DEFAULT_LLM_MAX_RETRIES,
    timeoutMs: (config?.timeout ?? 300) * 1000,
  }
}

function validateBookOutline(
  raw: unknown,
  evidence: BookOutlineEvidence,
): ValidationResult {
  const parsed = BookOutlineOutput.safeParse(raw)
  if (!parsed.success) {
    return {
      valid: false,
      errors: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
    }
  }

  const errors: string[] = []
  const output = parsed.data
  const pages = new Map(evidence.pages.map((page) => [page.pageId, page]))
  const candidates = new Map(evidence.candidates.map((candidate) => [candidate.candidateId, candidate]))
  const candidateOrder = new Map(
    evidence.candidates.map((candidate, index) => [candidate.candidateId, index]),
  )
  const clusters = new Map<string, BookOutlineStyleCluster>()
  const entryIds = new Set<string>()
  const usedCandidates = new Set<string>()
  let previousPageNumber = 0

  for (const cluster of output.styleClusters) {
    if (clusters.has(cluster.styleClusterId)) {
      errors.push(`Duplicate styleClusterId "${cluster.styleClusterId}".`)
    }
    clusters.set(cluster.styleClusterId, cluster)
  }

  for (const entry of output.entries) {
    if (entryIds.has(entry.outlineId)) {
      errors.push(`Duplicate outlineId "${entry.outlineId}".`)
    }
    const page = pages.get(entry.pageId)
    if (!page) {
      errors.push(`Outline entry "${entry.outlineId}" references unknown pageId "${entry.pageId}".`)
    } else if (page.pageNumber !== entry.pageNumber) {
      errors.push(
        `Outline entry "${entry.outlineId}" has pageNumber ${entry.pageNumber}; ` +
          `${entry.pageId} is page ${page.pageNumber}.`,
      )
    }
    if (entry.pageNumber < previousPageNumber) {
      errors.push("Outline entries must be in page order.")
    }
    previousPageNumber = Math.max(previousPageNumber, entry.pageNumber)

    const sourceCandidates: typeof evidence.candidates = []
    for (const candidateId of entry.sourceCandidateIds) {
      const candidate = candidates.get(candidateId)
      if (!candidate) {
        errors.push(`Outline entry "${entry.outlineId}" references unknown candidate "${candidateId}".`)
        continue
      }
      if (candidate.pageId !== entry.pageId) {
        errors.push(
          `Candidate "${candidateId}" belongs to ${candidate.pageId}, not ${entry.pageId}.`,
        )
      }
      sourceCandidates.push(candidate)
      if (usedCandidates.has(candidateId)) {
        errors.push(`Candidate "${candidateId}" is used by more than one outline entry.`)
      }
      usedCandidates.add(candidateId)
    }
    if (sourceCandidates.length === entry.sourceCandidateIds.length) {
      const visibleTitle = sourceCandidates
        .sort(
          (a, b) =>
            (candidateOrder.get(a.candidateId) ?? 0) -
            (candidateOrder.get(b.candidateId) ?? 0),
        )
        .map((candidate) => candidate.text)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim()
      if (entry.title.replace(/\s+/g, " ").trim() !== visibleTitle) {
        errors.push(
          `Outline entry "${entry.outlineId}" title must exactly match its source candidates: ` +
            `"${visibleTitle}".`,
        )
      }
    }

    if (entry.parentId !== null) {
      if (!entryIds.has(entry.parentId)) {
        errors.push(
          `Parent "${entry.parentId}" for "${entry.outlineId}" must reference an earlier outline entry.`,
        )
      } else {
        const parent = output.entries.find((candidate) => candidate.outlineId === entry.parentId)
        if (parent && parent.level >= entry.level) {
          errors.push(
            `Parent "${entry.parentId}" must have a shallower level than "${entry.outlineId}".`,
          )
        }
      }
    }

    const cluster = clusters.get(entry.styleClusterId)
    if (!cluster) {
      errors.push(
        `Outline entry "${entry.outlineId}" references unknown style cluster "${entry.styleClusterId}".`,
      )
    } else if (cluster.level !== entry.level) {
      errors.push(
        `Style cluster "${entry.styleClusterId}" is level ${cluster.level}, ` +
          `but "${entry.outlineId}" is level ${entry.level}.`,
      )
    }

    entryIds.add(entry.outlineId)
  }

  return { valid: errors.length === 0, errors }
}

function promptContext(evidence: BookOutlineEvidence): Record<string, unknown> {
  return {
    pages: evidence.pages,
    candidates: evidence.candidates,
    proof_sheets: evidence.proofSheets.map((sheet) => ({
      sheet_id: sheet.sheetId,
      page_ids: sheet.pageIds,
      page_numbers: sheet.pageNumbers,
      image_base64: sheet.imageBase64,
    })),
    type_scale: evidence.typeScale,
  }
}

function evidenceChunk(
  evidence: BookOutlineEvidence,
  pages: BookOutlineEvidence["pages"],
): BookOutlineEvidence {
  const pageIds = new Set(pages.map((page) => page.pageId))
  return {
    pages,
    candidates: evidence.candidates.filter((candidate) => pageIds.has(candidate.pageId)),
    // Default proof sheets contain 16 pages, matching the chunk boundary. Keep
    // only sheets wholly represented by this request so visual evidence never
    // leaks in from a neighboring chunk.
    proofSheets: evidence.proofSheets.filter((sheet) =>
      sheet.pageIds.every((pageId) => pageIds.has(pageId)),
    ),
    typeScale: evidence.typeScale,
  }
}

async function generateOutlinePass(
  evidence: BookOutlineEvidence,
  config: BookOutlineConfig,
  llmModel: LLMModel,
  prompt: string,
  taskType: string,
  maxTokens: number,
): Promise<BookOutlineOutput> {
  const result = await llmModel.generateObject<BookOutlineOutput>({
    schema: BookOutlineOutput,
    prompt,
    context: promptContext(evidence),
    validate: (raw) => validateBookOutline(raw, evidence),
    maxRetries: config.maxRetries,
    maxTokens,
    timeoutMs: config.timeoutMs,
    log: {
      taskType,
      promptName: prompt,
    },
  })

  return result.object
}

/**
 * Generate one authoritative hierarchy from all extracted book evidence.
 * Small books keep the original single-call path. Larger books are analyzed in
 * deterministic proof-sheet-sized chunks, then normalized in one compact
 * global synthesis call. No request receives unbounded raw book text/images.
 */
export async function generateBookOutline(
  evidence: BookOutlineEvidence,
  config: BookOutlineConfig,
  llmModel: LLMModel,
): Promise<BookOutlineOutput> {
  if (evidence.pages.length <= BOOK_OUTLINE_CHUNK_PAGE_LIMIT) {
    return generateOutlinePass(
      evidence,
      config,
      llmModel,
      config.promptName,
      "book-outline",
      32_768,
    )
  }

  const chunks: Array<{
    chunkId: string
    pageNumbers: number[]
    output: BookOutlineOutput
  }> = []

  for (let start = 0; start < evidence.pages.length; start += BOOK_OUTLINE_CHUNK_PAGE_LIMIT) {
    const pages = evidence.pages.slice(start, start + BOOK_OUTLINE_CHUNK_PAGE_LIMIT)
    const chunk = evidenceChunk(evidence, pages)
    const chunkNumber = chunks.length + 1
    const prompt = config.promptName === "book_outline"
      ? BOOK_OUTLINE_CHUNK_PROMPT
      : config.promptName
    const output = await generateOutlinePass(
      chunk,
      config,
      llmModel,
      prompt,
      "book-outline",
      BOOK_OUTLINE_CHUNK_MAX_TOKENS,
    )
    chunks.push({
      chunkId: `chunk-${String(chunkNumber).padStart(3, "0")}`,
      pageNumbers: pages.map((page) => page.pageNumber),
      output,
    })
  }

  const result = await llmModel.generateObject<BookOutlineOutput>({
    schema: BookOutlineOutput,
    prompt: BOOK_OUTLINE_SYNTHESIS_PROMPT,
    context: {
      chunks: chunks.map((chunk) => ({
        chunk_id: chunk.chunkId,
        page_numbers: chunk.pageNumbers,
        entries: chunk.output.entries,
        style_clusters: chunk.output.styleClusters,
      })),
      type_scale: evidence.typeScale,
    },
    validate: (raw) => validateBookOutline(raw, evidence),
    maxRetries: config.maxRetries,
    maxTokens: 32_768,
    timeoutMs: config.timeoutMs,
    log: {
      taskType: "book-outline",
      promptName: BOOK_OUTLINE_SYNTHESIS_PROMPT,
    },
  })

  return result.object
}

export function readBookOutline(storage: Storage): BookOutlineOutput | null {
  const row = storage.getLatestNodeData(BOOK_OUTLINE_NODE, BOOK_OUTLINE_ITEM)
  if (!row) return null
  const parsed = BookOutlineOutput.safeParse(row.data)
  return parsed.success ? parsed.data : null
}

/** Small authoritative slice supplied to a page-level sectioning call. */
export function outlineContextForPage(
  outline: BookOutlineOutput | null,
  pageId: string,
): PageOutlineContext | null {
  if (!outline) return null
  const entries = outline.entries.filter((entry) => entry.pageId === pageId)
  if (entries.length === 0) return null

  const byId = new Map(outline.entries.map((entry) => [entry.outlineId, entry]))
  const ancestorIds = new Set<string>()
  for (const entry of entries) {
    let parentId = entry.parentId
    while (parentId) {
      if (ancestorIds.has(parentId)) break
      ancestorIds.add(parentId)
      parentId = byId.get(parentId)?.parentId ?? null
    }
  }
  const ancestors = outline.entries.filter((entry) => ancestorIds.has(entry.outlineId))
  const clusterIds = new Set(
    [...entries, ...ancestors].map((entry) => entry.styleClusterId),
  )
  const styleClusters = outline.styleClusters.filter((cluster) =>
    clusterIds.has(cluster.styleClusterId),
  )

  return { entries, ancestors, styleClusters }
}
