import {
  BookOutlineOutput,
  BookOutlineProposalOutput,
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
export const BOOK_OUTLINE_CHUNK_PAGE_LIMIT = 24

const BOOK_OUTLINE_CHUNK_PROMPT = "book_outline_chunk"
const BOOK_OUTLINE_SYNTHESIS_PROMPT = "book_outline_synthesis"
const BOOK_OUTLINE_CHUNK_MAX_TOKENS = 16_384
const DEFAULT_OPENAI_BOOK_OUTLINE_MODEL_ID = "openai:gpt-5.4-mini"

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
  const inheritedModel = appConfig.default_model ?? DEFAULT_LLM_MODEL_ID
  return {
    promptName: config?.prompt ?? "book_outline",
    // Whole-book hierarchy is a bounded classification/extraction task, not a
    // frontier-model task. Keep non-OpenAI selections intact, but use the fast
    // multimodal mini variant for the shipped OpenAI default. A per-step model
    // override remains authoritative when a book genuinely needs the full model.
    modelId: config?.model ?? (
      inheritedModel === DEFAULT_LLM_MODEL_ID
        ? DEFAULT_OPENAI_BOOK_OUTLINE_MODEL_ID
        : inheritedModel
    ),
    maxRetries: config?.max_retries ?? DEFAULT_LLM_MAX_RETRIES,
    timeoutMs: (config?.timeout ?? 300) * 1000,
  }
}

function outlineIdForIndex(index: number): string {
  return `outline-${String(index + 1).padStart(3, "0")}`
}

function normalizedHeadingKey(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function headingKeyVariants(value: string): Set<string> {
  const normalized = normalizedHeadingKey(value)
  const variants = new Set([normalized])
  // Match a TOC row such as "CAPÍTULO 1 Experiências..." to the visible
  // chapter opener "EXPERIÊNCIAS..." without depending on one language.
  variants.add(
    normalized.replace(
      /^[\p{L}]+\s+(?:\d+|[ivxlcdm]+)\s+/u,
      "",
    ),
  )
  variants.add(normalized.replace(/^(?:\d+|[ivxlcdm]+)\s+/u, ""))
  variants.delete("")
  return variants
}

function tocLevelForTitle(title: string, evidence: BookOutlineEvidence): number | null {
  const titleKeys = headingKeyVariants(title)
  const matchingLevels = new Set(
    evidence.tocHierarchy
      .filter((entry) => entry.confidence >= 0.9)
      .filter((entry) => {
        const tocKeys = headingKeyVariants(entry.title)
        return [...titleKeys].some((key) => tocKeys.has(key))
      })
      .map((entry) => entry.suggestedLevel),
  )
  return matchingLevels.size === 1 ? [...matchingLevels][0] : null
}

function proposalToOutline(
  proposal: BookOutlineProposalOutput,
  evidence: BookOutlineEvidence,
): { outline: BookOutlineOutput | null; errors: string[] } {
  const errors: string[] = []
  const candidates = new Map(
    evidence.candidates.map((candidate) => [candidate.candidateId, candidate]),
  )
  const candidateOrder = new Map(
    evidence.candidates.map((candidate, index) => [candidate.candidateId, index]),
  )
  const entries: BookOutlineEntry[] = []
  let adjustedTocLevels = 0

  proposal.entries.forEach((entry, index) => {
    const sourceCandidates = entry.sourceCandidateIds.flatMap((candidateId) => {
      const candidate = candidates.get(candidateId)
      if (!candidate) {
        errors.push(
          `Outline proposal entry ${index} references unknown candidate "${candidateId}".`,
        )
        return []
      }
      return [candidate]
    })
    if (sourceCandidates.length !== entry.sourceCandidateIds.length) return

    const first = sourceCandidates[0]
    if (sourceCandidates.some((candidate) => candidate.pageId !== first.pageId)) {
      errors.push(`Outline proposal entry ${index} combines candidates from different pages.`)
      return
    }
    const title = sourceCandidates
      .sort(
        (a, b) =>
          (candidateOrder.get(a.candidateId) ?? 0) -
          (candidateOrder.get(b.candidateId) ?? 0),
      )
      .map((candidate) => candidate.text)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim()
    const tocLevel = tocLevelForTitle(title, evidence)
    const level = tocLevel ?? entry.level
    if (tocLevel !== null && tocLevel !== entry.level) adjustedTocLevels++

    let parentId: string | null = null
    for (let previous = entries.length - 1; previous >= 0; previous--) {
      if (entries[previous].level < level) {
        parentId = entries[previous].outlineId
        break
      }
    }

    entries.push({
      outlineId: outlineIdForIndex(index),
      title,
      level,
      kind: entry.kind,
      pageId: first.pageId,
      pageNumber: first.pageNumber,
      sourceCandidateIds: [...entry.sourceCandidateIds],
      parentId,
      styleClusterId: entry.styleClusterId,
      confidence: entry.confidence,
    })
  })

  if (errors.length > 0 || entries.length !== proposal.entries.length) {
    return { outline: null, errors }
  }
  const tocNote = adjustedTocLevels > 0
    ? ` Applied ${adjustedTocLevels} deterministic TOC hierarchy correction${adjustedTocLevels === 1 ? "" : "s"}.`
    : ""
  const reasoning = tocNote
    ? `${proposal.reasoning.slice(0, Math.max(0, 600 - tocNote.length))}${tocNote}`
    : proposal.reasoning.slice(0, 600)
  return {
    outline: {
      reasoning,
      entries,
      styleClusters: proposal.styleClusters.map((cluster) => ({ ...cluster })),
    },
    errors: [],
  }
}

function validateBookOutlineProposal(
  raw: unknown,
  evidence: BookOutlineEvidence,
): ValidationResult {
  const parsed = BookOutlineProposalOutput.safeParse(raw)
  if (!parsed.success) {
    return {
      valid: false,
      errors: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
    }
  }
  const converted = proposalToOutline(parsed.data, evidence)
  if (!converted.outline) return { valid: false, errors: converted.errors }

  // Deterministic cleanup is applied again after generation. At validation
  // time only its validity matters; the compact proposal remains the model's
  // response and the stored entity is the expanded authoritative outline.
  const validation = validateBookOutline(converted.outline, evidence)
  return validation.valid
    ? { valid: true, errors: [] }
    : validation
}

function finalizeBookOutlineProposal(
  proposal: BookOutlineProposalOutput,
  evidence: BookOutlineEvidence,
): BookOutlineOutput {
  const converted = proposalToOutline(proposal, evidence)
  if (!converted.outline) {
    throw new Error(`Invalid book outline proposal: ${converted.errors.join(" ")}`)
  }
  const validation = validateBookOutline(converted.outline, evidence)
  if (!validation.valid) {
    throw new Error(`Invalid expanded book outline: ${validation.errors.join(" ")}`)
  }
  return (validation.cleaned as BookOutlineOutput | undefined) ?? converted.outline
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
  let cleaned = false
  const output: BookOutlineOutput = {
    ...parsed.data,
    entries: parsed.data.entries.map((entry) => ({ ...entry })),
    styleClusters: parsed.data.styleClusters.map((cluster) => ({ ...cluster })),
  }
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

  // A cluster/entry level mismatch does not require another semantic pass.
  // Preserve the model's hierarchy and split a reused visual style into one
  // cluster per semantic level, which is exactly the representation the
  // schema requires. If every use agrees on a level other than the cluster's
  // declared level, simply correct the unused declaration.
  if (clusters.size === output.styleClusters.length) {
    const usedLevels = new Map<string, Set<number>>()
    for (const entry of output.entries) {
      if (!clusters.has(entry.styleClusterId)) continue
      const levels = usedLevels.get(entry.styleClusterId) ?? new Set<number>()
      levels.add(entry.level)
      usedLevels.set(entry.styleClusterId, levels)
    }

    for (const [clusterId, levels] of usedLevels) {
      const cluster = clusters.get(clusterId)!
      if (!levels.has(cluster.level)) {
        cluster.level = levels.values().next().value!
        cleaned = true
      }
      if (levels.size === 1) {
        const [usedLevel] = levels
        cluster.level = usedLevel
        continue
      }

      for (const level of levels) {
        if (level === cluster.level) continue
        const baseId = `${clusterId}-level-${level}`
        let derivedId = baseId
        let suffix = 2
        while (clusters.has(derivedId)) derivedId = `${baseId}-${suffix++}`
        const derived: BookOutlineStyleCluster = {
          styleClusterId: derivedId,
          description: `${cluster.description} (level ${level} variant)`,
          level,
        }
        output.styleClusters.push(derived)
        clusters.set(derivedId, derived)
        for (const entry of output.entries) {
          if (entry.styleClusterId === clusterId && entry.level === level) {
            entry.styleClusterId = derivedId
          }
        }
        cleaned = true
      }
    }
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
        // Candidate text is authoritative and this correction contains no
        // semantic judgment. Repair it locally instead of paying for another
        // complete multimodal outline call.
        entry.title = visibleTitle
        cleaned = true
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

  if (errors.length > 0) return { valid: false, errors }
  return {
    valid: true,
    errors: [],
    ...(cleaned && { cleaned: output }),
  }
}

function promptContext(evidence: BookOutlineEvidence): Record<string, unknown> {
  return {
    pages: evidence.pages,
    candidates: evidence.candidates,
    toc_hierarchy: evidence.tocHierarchy,
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
    // The compact TOC is book-wide guidance. Every chunk needs it so later
    // chapter pages retain the hierarchy established in the front matter.
    tocHierarchy: evidence.tocHierarchy,
    // Default proof sheets contain 24 pages, matching the chunk boundary. Keep
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
  const result = await llmModel.generateObject<BookOutlineProposalOutput>({
    schema: BookOutlineProposalOutput,
    prompt,
    context: promptContext(evidence),
    validate: (raw) => validateBookOutlineProposal(raw, evidence),
    maxRetries: config.maxRetries,
    maxTokens,
    timeoutMs: config.timeoutMs,
    log: {
      taskType,
      promptName: prompt,
    },
  })

  return finalizeBookOutlineProposal(result.object, evidence)
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

  const chunkSpecs: Array<{
    chunkId: string
    pageNumbers: number[]
    evidence: BookOutlineEvidence
  }> = []

  for (let start = 0; start < evidence.pages.length; start += BOOK_OUTLINE_CHUNK_PAGE_LIMIT) {
    const pages = evidence.pages.slice(start, start + BOOK_OUTLINE_CHUNK_PAGE_LIMIT)
    const chunk = evidenceChunk(evidence, pages)
    const chunkNumber = chunkSpecs.length + 1
    chunkSpecs.push({
      chunkId: `chunk-${String(chunkNumber).padStart(3, "0")}`,
      pageNumbers: pages.map((page) => page.pageNumber),
      evidence: chunk,
    })
  }

  const chunks: Array<{
    chunkId: string
    pageNumbers: number[]
    output: BookOutlineOutput
  }> = []
  const prompt = config.promptName === "book_outline"
    ? BOOK_OUTLINE_CHUNK_PROMPT
    : config.promptName

  // Chunk calls are independent. A small bound cuts wall-clock time for long
  // books without flooding the provider or making retry spikes unbounded.
  for (let start = 0; start < chunkSpecs.length; start += 2) {
    const batch = chunkSpecs.slice(start, start + 2)
    const outputs = await Promise.all(batch.map((chunk) =>
      generateOutlinePass(
        chunk.evidence,
        config,
        llmModel,
        prompt,
        "book-outline",
        BOOK_OUTLINE_CHUNK_MAX_TOKENS,
      )
    ))
    batch.forEach((chunk, index) => {
      chunks.push({
        chunkId: chunk.chunkId,
        pageNumbers: chunk.pageNumbers,
        output: outputs[index],
      })
    })
  }

  const result = await llmModel.generateObject<BookOutlineProposalOutput>({
    schema: BookOutlineProposalOutput,
    prompt: BOOK_OUTLINE_SYNTHESIS_PROMPT,
    context: {
      chunks: chunks.map((chunk) => ({
        chunk_id: chunk.chunkId,
        page_numbers: chunk.pageNumbers,
        entries: chunk.output.entries,
        style_clusters: chunk.output.styleClusters,
      })),
      toc_hierarchy: evidence.tocHierarchy,
      type_scale: evidence.typeScale,
    },
    validate: (raw) => validateBookOutlineProposal(raw, evidence),
    maxRetries: config.maxRetries,
    maxTokens: 32_768,
    timeoutMs: config.timeoutMs,
    log: {
      taskType: "book-outline",
      promptName: BOOK_OUTLINE_SYNTHESIS_PROMPT,
    },
  })

  return finalizeBookOutlineProposal(result.object, evidence)
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
