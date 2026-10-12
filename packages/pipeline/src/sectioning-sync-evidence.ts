import { DomUtils, parseDocument } from "htmlparser2"
import {
  PageSectioningOutput, WebRenderingOutput,
  type PageSectioningSection, type SectionRendering, type SectioningSyncInput,
  type SectionSyncProof,
} from "@adt/types"
import { classifySectioningSynchronization } from "./sectioning-sync.js"
import { deriveOutputStatus, inputSignature, outputEvidence } from "./output-freshness.js"

/** HTML identity is authoritative; sectionIndex is only a legacy display hint. */
export function renderedSectionId(section: SectionRendering): string | undefined {
  const roots = DomUtils.getElementsByTagName("section", parseDocument(section.html).children, true)
  return roots.length === 1 ? roots[0].attribs["data-section-id"] : undefined
}

export function sectionRenderingContent(section: SectionRendering) {
  const { generationEvidence: _evidence, ...content } = section
  return content
}

export function generatedSectionEvidence(section: SectionRendering, source: PageSectioningSection, pageId: string, version: number): SectionRendering {
  return { ...sectionRenderingContent(section), generationEvidence: { source: "ai", input: outputEvidence(
    inputSignature(source), sectionRenderingContent(section), [{ node: "page-sectioning", itemId: pageId, version }],
  ) } }
}

/** Stamp only output actually produced by generation. Untouched sections retain
 * their evidence, even when a sibling's source/projection cannot be patched. */
export function stampGeneratedRendering(rendering: WebRenderingOutput, source: PageSectioningOutput, pageId: string, version: number, generatedIds?: readonly string[]): WebRenderingOutput {
  return { ...rendering, sections: rendering.sections.map((section) => {
    const id = renderedSectionId(section)
    const matches = source.sections.filter((value) => value.sectionId === id && !value.isPruned)
    if (!id || matches.length !== 1 || (generatedIds && !generatedIds.includes(id))) return section
    return generatedSectionEvidence(section, matches[0], pageId, version)
  }) }
}

/** Pure adapter over retained version snapshots. Equality is not provenance:
 * shared generated-origin evidence, exact output hash and historical source
 * reference must all agree before the classifier receives a generated proof. */
export function classifyStoredSectioning(input: {
  pageId: string
  purpose?: "synchronization" | "validation"
  source: { version: number; data: unknown }
  proposed?: PageSectioningOutput
  rendering: { version: number; data: unknown } | null
  history: Array<{ version: number; data: unknown }>
  layout: SectioningSyncInput["layout"]
  sectionOwners: SectioningSyncInput["sectionOwners"]
}) {
  const source = PageSectioningOutput.parse(input.source.data)
  const rendering = WebRenderingOutput.safeParse(input.rendering?.data)
  const priorSources = input.history.flatMap((row) => {
    const parsed = PageSectioningOutput.safeParse(row.data)
    return parsed.success ? [{ version: row.version, source: parsed.data }] : []
  })
  const proofs: SectionSyncProof[] = []
  for (const section of rendering.success ? rendering.data.sections : []) {
    const sectionId = renderedSectionId(section)
    if (!sectionId) continue
    const metadata = section.generationEvidence
    const references = metadata?.input?.references.filter((ref) => ref.node === "page-sectioning" && ref.itemId === input.pageId) ?? []
    const reference = references.length === 1 ? references[0] : undefined
    const previous = priorSources.find((row) => row.version === reference?.version)?.source.sections.filter((value) => value.sectionId === sectionId)
    const status = deriveOutputStatus({ identity: { kind: "storyboard", id: sectionId },
      signature: inputSignature(previous?.[0]), content: sectionRenderingContent(section), metadata, usable: true })
    const generated = !status.protected && status.current && previous?.length === 1
    if (!generated && metadata?.source !== "manual") continue
    proofs.push({ pageId: input.pageId, sectionId, sourceVersion: generated ? reference!.version : input.source.version,
      renderingVersion: input.rendering!.version, origin: generated ? "generated" : "manual" })
  }
  const candidate = classifySectioningSynchronization({ pageId: input.pageId, source: input.proposed ?? source,
    priorSource: null, priorSources, rendering: rendering.success ? rendering.data : null,
    sourceVersion: input.source.version, renderingVersion: input.rendering?.version ?? null,
    layout: input.layout, sectionOwners: input.sectionOwners, proofs })
  candidate.sections = candidate.sections.map((result) => {
    const current = (input.proposed ?? source).sections.find((section) => section.sectionId === result.sectionId && !section.isPruned)
    const owned = input.sectionOwners[result.sectionId]?.length === 1 && input.sectionOwners[result.sectionId][0] === input.pageId
    const matches = rendering.success ? rendering.data.sections.filter((section) => renderedSectionId(section) === result.sectionId) : []
    const generated = proofs.some((proof) => proof.sectionId === result.sectionId && proof.origin === "generated")
    const reviewed = current && owned && matches.length === 1 && deriveOutputStatus({
      identity: { kind: "storyboard", id: result.sectionId }, signature: inputSignature(current),
      content: sectionRenderingContent(matches[0]), metadata: matches[0].generationEvidence, usable: true,
    }).current && matches[0].generationEvidence?.review?.action === "keep"
    if (reviewed && ["unknown-origin", "protected-divergence"].includes(result.status)) return { ...result, status: "current" as const, action: "none" as const,
      diagnostics: ["Explicitly reviewed rendering retained for these source inputs. Its origin remains protected."] }
    const custom = current?.sectionType.startsWith("activity_custom")
    // A missing projection is repairable only when the remaining document has
    // unambiguous owned identities; legacy bytes are never presumed unrelated.
    const ids = rendering.success ? rendering.data.sections.map(renderedSectionId) : []
    const missing = matches.length === 0 && (!input.rendering || (rendering.success && ids.every((id) => !!id && input.sectionOwners[id]?.length === 1 && input.sectionOwners[id][0] === input.pageId) && new Set(ids).size === ids.length))
    // Validation repair needs no semantic drift. It still requires the same
    // retained, exact generated proof; a manual Keep is never replacement consent.
    if (input.purpose === "validation") return { ...result, action:
      input.layout === "reflowable" && current && owned && !custom && generated && matches.length === 1
        ? "repair" as const : "review" as const }
    const resolved = result.status === "current" || (!!input.proposed && result.status === "text-patched")
    return { ...result,
      ...(!input.proposed && result.status === "text-patched" ? { status: "text-drift" as const, diagnostics: ["Stored rendering has not incorporated the current source text."] } : {}),
      action: resolved || input.layout !== "reflowable" || !current ? "none" as const
        : owned && !custom && (generated || missing) && !["protected-divergence", "unknown-origin"].includes(result.status) ? "repair" as const : "review" as const,
    }
  })
  return candidate
}
