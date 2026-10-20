import { DomUtils, parseDocument } from "htmlparser2"
import { PageSectioningOutput, WebRenderingOutput } from "@adt/types"
import type { Storage } from "@adt/storage"
import { inputSignature } from "./output-freshness.js"
import { renderedSectionId, withLegacyRenderingOwnership } from "./render-sectioning.js"
import { SourceGenerationState, SourceGeneratorStep, QuizGenerationOutput, SourceGenerationPolicy, type SourceGenerationReceipt } from "@adt/types"
import { collectPageTexts } from "./glossary.js"
import { collectHeadingsAndToc } from "./toc-generation.js"
import { resolveReadingOrder } from "./reading-order.js"
import { batchPages, collectQuizPages, collectQuizPageTexts } from "./quiz-generation.js"

/** Semantic inputs only: no CSS, placement, reasoning, media bytes or URLs.
 * Used by assistant editing to distinguish source edits from styling. Generator
 * reset decisions below use each generator's own collectors instead. */
export function sourceGenerationBasis(node: string, data: unknown): unknown {
  if (node === "page-sectioning" || node === "fixed-layout-sectioning") {
    const parsed = PageSectioningOutput.safeParse(data)
    return parsed.success ? parsed.data.sections.map((section) => ({
      sectionId: section.sectionId, sectionType: section.sectionType,
      pageNumber: section.pageNumber, isPruned: section.isPruned,
      nodes: section.nodes, sourcePageIds: section.sourcePageIds,
    })) : null
  }
  if (node !== "web-rendering") return null
  const parsed = WebRenderingOutput.safeParse(data)
  if (!parsed.success) return null
  return parsed.data.sections.map((section) => {
    const doc = parseDocument(section.html)
    for (const element of DomUtils.findAll((element) => ["style", "script", "head"].includes(element.name), doc.children)) DomUtils.removeElement(element)
    const owners = DomUtils.findAll((element) => element.attribs["data-section-id"] !== undefined, doc.children)
    const sectionId = renderedSectionId(section)
    // Stamping an already-proven owner adds no source input. Keep conflicting
    // or multiple owner declarations visible; never infer ownership by index.
    const extraOwner = (element: (typeof owners)[number]) => {
      const owner = element.attribs["data-section-id"]
      return sectionId && owners.length === 1 && owner === sectionId ? undefined : owner
    }
    const identities = DomUtils.findAll((element) => !!element.attribs["data-id"] || extraOwner(element) !== undefined || /^h[1-6]$/.test(element.name) || element.name === "img", doc.children)
      .map((element) => ({ id: element.attribs["data-id"], owner: extraOwner(element),
        // Moving text between stable IDs is a source edit even when the
        // concatenated section text stays identical.
        text: DomUtils.textContent(element).replace(/\s+/g, " ").trim(),
        role: element.attribs["data-role"] ?? element.attribs.role,
        heading: /^h[1-6]$/.test(element.name) ? element.name : undefined,
        image: element.name === "img", alt: element.name === "img" ? element.attribs.alt : undefined }))
    return { sectionId, sectionIndex: section.sectionIndex, sectionType: section.sectionType,
      text: DomUtils.textContent(doc).replace(/\s+/g, " ").trim(), identities,
      activityAnswers: section.activityAnswers }
  })
}

const STATE_NODE = "source-generation-state"

function state(storage: Storage, step: SourceGeneratorStep): SourceGenerationState {
  const parsed = SourceGenerationState.safeParse(storage.getLatestNodeData(STATE_NODE, step)?.data)
  return parsed.success ? parsed.data : { version: 1, needsUpdate: false, policy: {} }
}

/** Existing reset metadata, kept separately from transient run attempts so
 * starting, skipping, cancelling or failing a run cannot certify old content. */
export function getSourceGenerationUpdates(storage: Storage): SourceGeneratorStep[] {
  return SourceGeneratorStep.options.filter(step => state(storage, step).needsUpdate && !!storage.getLatestNodeData(step, "book"))
}

function sourceInputs(storage: Storage, step: SourceGeneratorStep, policy: SourceGenerationPolicy): unknown {
  const pages = storage.getPages()
  if (step === "glossary") return collectPageTexts(storage, pages)
  if (step === "toc-generation") {
    const { headings, originalTocText } = collectHeadingsAndToc(storage, pages)
    return { headings, originalTocText: policy.tocMode === "dynamic" ? null : originalTocText,
      pages: pages.map(page => page.pageId),
      // Section membership/order changes can retire links even in sections
      // without a heading. Do not include their body text or image metadata.
      sections: resolveReadingOrder(storage, { includeQuizzes: false }).items
        .filter(item => item.kind === "section").map(item => ({ pageId: item.pageId, sectionId: item.section.sectionId })) }
  }
  const quizPages = collectQuizPages(storage)
  if (policy.quiz) return batchPages(quizPages, policy.quiz.pagesPerQuiz, policy.quiz.quizSectionTypes).map(collectQuizPageTexts)
  // Legacy output does not record the section-type filter. Its pageIds prove
  // the text coverage; new/removed/eligible pages conservatively reset batching
  // until a successful run records its exact selection policy. Never infer
  // coverage from quiz position or fixed-layout section types.
  const saved = QuizGenerationOutput.safeParse(storage.getLatestNodeData(step, "book")?.data)
  const covered = saved.success ? new Set(saved.data.quizzes.flatMap(quiz => quiz.pageIds)) : null
  return {
    eligibleTypes: quizPages.map(page => ({ pageId: page.pageId, types: [...new Set(page.sectioning.sections.filter(section => !section.isPruned).map(section => section.sectionType))].sort() })),
    membership: batchPages(quizPages, saved.success && saved.data.pagesPerQuiz > 0 ? saved.data.pagesPerQuiz : 3).map(batch => batch.map(page => page.pageId)),
    pageTexts: collectQuizPageTexts(covered?.size ? quizPages.filter(page => covered.has(page.pageId)) : quizPages),
  }
}

export function captureSourceGeneration(storage: Storage, step: SourceGeneratorStep, policy: SourceGenerationPolicy = {}): SourceGenerationReceipt {
  const selection = SourceGenerationPolicy.parse(policy)
  return { step, policy: selection, inputSignature: inputSignature(sourceInputs(storage, step, selection)) }
}

/** Call only for complete generator output, under existing writer admission.
 * Check the inputs captured before provider calls and publish the output and
 * its clean state together. Manual edits and generic completion never call it. */
export function publishSourceGeneration<T>(storage: Storage, receipt: SourceGenerationReceipt, publish: () => T): T {
  return storage.transaction(() => {
    if (captureSourceGeneration(storage, receipt.step, receipt.policy).inputSignature !== receipt.inputSignature) {
      throw new Error("Source inputs changed during generation. Run this stage again.")
    }
    const result = publish()
    storage.putNodeData(STATE_NODE, receipt.step, { version: 1, needsUpdate: false, policy: receipt.policy, inputSignature: receipt.inputSignature } satisfies SourceGenerationState)
    return result
  })
}

/** The signature tracking and Keep compare. A malformed retained rendering
 * cannot prove generator inputs; its page basis stands in so an editor save
 * beside it still succeeds. Storage/IO failures propagate and roll back. */
export function currentSourceInputSignature(storage: Storage, step: SourceGeneratorStep, policy: SourceGenerationPolicy): string {
  try { return captureSourceGeneration(storage, step, policy).inputSignature }
  catch (error) {
    if (error instanceof Error && error.message.startsWith("Invalid web-rendering output")) {
      return inputSignature({ unprovable: true, pages: storage.getPages().map(page => ({
        pageId: page.pageId, pageNumber: page.pageNumber,
        source: ["page-sectioning", "fixed-layout-sectioning", "web-rendering"].map(node =>
          sourceGenerationBasis(node, storage.getLatestNodeData(node, page.pageId)?.data)),
      })) })
    }
    throw error
  }
}

/** Accept retained content as current for the inputs at this moment. Records
 * that baseline, clears the warning and restores the stage's completed status.
 * Nothing is generated and no content version is written; the next source
 * change compares against this baseline and warns again. */
export function keepSourceGeneration(storage: Storage, step: SourceGeneratorStep): SourceGenerationState {
  return storage.transaction(() => {
    if (!storage.getLatestNodeData(step, "book")) throw new Error("No retained content to keep. Run this stage to generate it.")
    const previous = state(storage, step)
    const kept: SourceGenerationState = { version: 1, needsUpdate: false, policy: previous.policy,
      inputSignature: currentSourceInputSignature(storage, step, previous.policy) }
    storage.putNodeData(STATE_NODE, step, kept)
    storage.markStepCompleted(step)
    return kept
  })
}

export function markSourceGenerationNeedsUpdate(storage: Storage, step: SourceGeneratorStep): void {
  storage.clearStepRuns([step])
  const previous = state(storage, step)
  if (!previous.needsUpdate && storage.getLatestNodeData(step, "book")) {
    storage.putNodeData(STATE_NODE, step, { ...previous, needsUpdate: true })
  }
}

// Coalesce paired sectioning/rendering writes and page membership mutations.
// This only scopes input comparison, and is not a writer lock.
const tracking = new WeakSet<Storage>()
export function withSourceGenerationTracking<T>(storage: Storage, mutate: () => T): T {
  if (tracking.has(storage)) return mutate()
  return storage.transaction(() => {
    const attempted = new Set(storage.getStepRuns().map(run => run.step))
    const steps = SourceGeneratorStep.options.filter(step => attempted.has(step) || storage.getLatestNodeData(step, "book"))
    const read = (step: SourceGeneratorStep) => currentSourceInputSignature(storage, step, state(storage, step).policy)
    const before = new Map(steps.map(step => [step, read(step)]))
    tracking.add(storage)
    try {
      const result = mutate()
      for (const step of steps) {
        const after = read(step)
        if (before.get(step) !== after) markSourceGenerationNeedsUpdate(storage, step)
      }
      return result
    } finally { tracking.delete(storage) }
  })
}

/** Publish source and reset only the separate source generators atomically.
 * Catalog-managed attempts, entity versions and physical assets are retained. */
/** Freeze uniquely inferred ownership against the pre-edit source snapshot.
 * Call inside the source mutation transaction, including version restores. */
export function preserveRenderedOwnership(storage: Storage, itemId: string): void {
  const retained = WebRenderingOutput.safeParse(storage.getLatestNodeData("web-rendering", itemId)?.data)
  if (!retained.success) return
  const resolved = withLegacyRenderingOwnership(storage, itemId, retained.data)
  if (resolved.sections.some((entry, index) => entry.sectionId !== retained.data.sections[index].sectionId)) {
    storage.putNodeData("web-rendering", itemId, resolved)
  }
}

export function putSourceNodeData(storage: Storage, node: string, itemId: string, data: unknown): number {
  const write = () => {
    if (node === "page-sectioning" || node === "fixed-layout-sectioning") {
      // Capture ownership while all original leaves are still in their source
      // sections. Otherwise a successful reorder/split/move could change what
      // the next read infers. This metadata-only version stays in this transaction.
      preserveRenderedOwnership(storage, itemId)
    }
    return storage.putNodeData(node, itemId, data)
  }
  const previous = storage.getLatestNodeData(node, itemId)?.data
  // Fast path also protects cosmetic saves in malformed legacy books.
  return inputSignature(sourceGenerationBasis(node, previous)) === inputSignature(sourceGenerationBasis(node, data))
    ? storage.transaction(write) : withSourceGenerationTracking(storage, write)
}

/** A successful strategy switch replaces the old positioned/read-model pair
 * together. Until this transaction commits, failed reflow keeps the fixed book
 * readable. HTML-only edits must not call this strategy-changing operation. */
export function putReflowableRendering(storage: Storage, itemId: string, data: unknown): number {
  return withSourceGenerationTracking(storage, () => {
    storage.clearNodesByType(["fixed-layout-sectioning"], itemId)
    return putSourceNodeData(storage, "web-rendering", itemId, data)
  })
}
