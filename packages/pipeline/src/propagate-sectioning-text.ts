import type {
  PageSectioningOutput,
  PageSectioningSection,
  SectionRendering,
  WebRenderingOutput,
} from "@adt/types"
import { buildRenderContext } from "./web-rendering.js"
import { collectOptionalTextIds } from "./render-llm.js"
import { validateSectionHtml } from "./validate-html.js"

/**
 * Why a section could not have its text propagated.
 *
 * - `structural`: the section tree and the rendered HTML no longer describe the
 *   same set of leaves (a node was added, deleted, pruned, or re-roled). Text
 *   substitution cannot express that — the section must be re-rendered.
 * - `invalid`: the stored HTML has a problem unrelated to our edit. We leave it
 *   untouched rather than write over a section we don't understand.
 */
export type SectionSkipReason = "structural" | "invalid"

export interface SkippedSection {
  sectionIndex: number
  reason: SectionSkipReason
  errors: string[]
}

export interface PropagateResult {
  /** Rendering with updated text. Same object identity as the input when nothing changed. */
  rendering: WebRenderingOutput
  /** True when at least one section's HTML was rewritten. */
  changed: boolean
  /** Section indices whose HTML now carries the edited text. */
  updatedSectionIndices: number[]
  /** Sections that could not be updated, with the reason. */
  skipped: SkippedSection[]
  /** True when any section drifted structurally and needs a re-render to resync. */
  needsRerender: boolean
}

/**
 * Errors that mean "the rendered text differs from the source text".
 *
 * This is the expected, benign case here: the user just changed the source
 * text, so of course the stored HTML no longer matches it. The validator
 * reports the mismatch *and* substitutes the correct text anyway, which is
 * precisely the behaviour we want.
 */
const TEXT_MISMATCH_PREFIX = "Text mismatch for data-id"

/**
 * Errors that mean the tree and the HTML disagree about which leaves exist.
 * Substituting text cannot reconcile this; only a re-render can.
 */
const STRUCTURAL_PREFIXES = [
  "Missing required text data-id",
  "Unknown data-id",
]

function classify(errors: string[]): SectionSkipReason | null {
  let structural = false
  for (const err of errors) {
    if (err.startsWith(TEXT_MISMATCH_PREFIX)) continue
    if (STRUCTURAL_PREFIXES.some((p) => err.startsWith(p))) {
      structural = true
      continue
    }
    // Anything else is a pre-existing defect in the stored HTML.
    return "invalid"
  }
  return structural ? "structural" : null
}

/**
 * Rewrite one stored section's HTML so its text matches the section tree.
 * Returns null when the section cannot be safely updated.
 */
function propagateSection(
  section: PageSectioningSection,
  stored: SectionRendering,
  label: string
): { html: string } | { skip: SectionSkipReason; errors: string[] } {
  // Images only contribute their ids here — the base64/dimension payload is
  // irrelevant because we never re-render, and passing no prefix leaves the
  // stored <img src> attributes untouched.
  const context = buildRenderContext(section, new Map(), label)

  const result = validateSectionHtml(
    stored.html,
    context.leaf_texts.map((t) => t.text_id),
    context.image_refs.map((i) => i.image_id),
    undefined,
    {
      // We are patching HTML that was already accepted at render time, not
      // gating new content. Allowing `activity_gen_*` ids keeps activity
      // sections from being misread as structural drift; it cannot admit bad
      // markup, because nothing new is being introduced here.
      allowActivityGeneratedIds: true,
      allowedContainerIds: context.group_ids,
      expectedTexts: new Map(
        context.leaf_texts.map((t) => [t.text_id, t.text])
      ),
      optionalTextIds: collectOptionalTextIds(context.leaf_texts),
      // Deliberately no expectedSectionType/expectedSectionId: we already know
      // which section this is (matched by sectionIndex), and asserting them
      // would fail on books whose sectionIds were renumbered by a split/merge.
    }
  )

  const skip = classify(result.errors)
  if (skip) return { skip, errors: result.errors }
  if (!result.sectionHtml) {
    return { skip: "invalid", errors: ["Validator returned no HTML"] }
  }
  return { html: result.sectionHtml }
}

/**
 * Propagate edited sectioning text into an already-rendered storyboard.
 *
 * The rendered HTML stored in `web-rendering` is a snapshot of the sectioning
 * text taken at render time, with each leaf's `nodeId` emitted as a `data-id`
 * attribute. Editing text in the Sectioning stage therefore leaves the
 * storyboard showing stale copy until the page is re-rendered.
 *
 * Rather than re-render (an LLM call that also discards the layout the renderer
 * produced), we reuse the substitution pass the renderer already applies to
 * fresh LLM output: `validateSectionHtml` rewrites each `[data-id]` element's
 * text to match the source tree. Running it over stored HTML is idempotent, so
 * sections whose text did not change come back byte-identical.
 *
 * Sections that drifted structurally cannot be reconciled this way and are
 * reported via `needsRerender` instead.
 */
export function propagateSectioningTextToRendering(
  sectioning: PageSectioningOutput,
  rendering: WebRenderingOutput,
  label: string
): PropagateResult {
  const updatedSectionIndices: number[] = []
  const skipped: SkippedSection[] = []
  let changed = false

  const nextSections = rendering.sections.map((stored) => {
    // `sectionIndex` indexes into sectioning.sections, but rendering.sections
    // is sparse — the renderer skips sections with no renderable content — so
    // match on the value rather than array position.
    const section = sectioning.sections[stored.sectionIndex]
    if (!section) {
      skipped.push({
        sectionIndex: stored.sectionIndex,
        reason: "structural",
        errors: [`No sectioning section at index ${stored.sectionIndex}`],
      })
      return stored
    }

    const outcome = propagateSection(section, stored, label)
    if ("skip" in outcome) {
      skipped.push({
        sectionIndex: stored.sectionIndex,
        reason: outcome.skip,
        errors: outcome.errors,
      })
      return stored
    }

    if (outcome.html === stored.html) return stored

    changed = true
    updatedSectionIndices.push(stored.sectionIndex)
    return { ...stored, html: outcome.html }
  })

  return {
    rendering: changed ? { ...rendering, sections: nextSections } : rendering,
    changed,
    updatedSectionIndices,
    skipped,
    needsRerender: skipped.some((s) => s.reason === "structural"),
  }
}
