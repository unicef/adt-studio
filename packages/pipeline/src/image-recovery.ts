import { ImageClassificationOutput, OutputMetadata, type AppConfig } from "@adt/types"
import type { Storage, PageData } from "@adt/storage"
import type { PromptEngine } from "@adt/llm"
import { buildMeaningfulnessConfig } from "./image-meaningfulness.js"
import { deriveOutputStatus, inputSignature, outputEvidence } from "./output-freshness.js"

/** Same evidence/protection policy as other generated outputs, scoped to a page.
 * Input bytes matter even when a non-cooperating writer leaves IDs unchanged. */
export function filteringSignature(storage: Storage, page: PageData, config: AppConfig, engine: PromptEngine): string {
  const meaningfulness = buildMeaningfulnessConfig(config)
  return inputSignature({ page, filters: config.image_filters, meaningfulness,
    prompt: meaningfulness ? engine.fingerprint(meaningfulness.promptName, { modelId: meaningfulness.modelId }) : null,
    pageImage: inputSignature(storage.getPageImageBase64(page.pageId)),
    images: storage.getPageImages(page.pageId).map((image) => [image, inputSignature(storage.getImageBase64(image.imageId))]),
  })
}

export function filteringStatus(storage: Storage, pageId: string, signature: string, node = "image-filtering") {
  const row = storage.getLatestNodeData(node, pageId)
  const parsed = ImageClassificationOutput.safeParse(row?.data)
  const metadata = OutputMetadata.safeParse((row?.data as { generationEvidence?: unknown } | undefined)?.generationEvidence)
  return deriveOutputStatus({ identity: { kind: "extract-generation", id: pageId }, signature,
    content: row ? parsed.success ? parsed.data : row.data : undefined,
    metadata: metadata.success ? metadata.data : undefined, usable: parsed.success,
  })
}

export function filteringEvidence(output: ImageClassificationOutput, signature: string, incomplete: boolean) {
  return { ...output, generationEvidence: { source: "ai" as const, incomplete, input: outputEvidence(signature, output) } }
}

export function imagePassSignature(filtering: string, config: { promptName: string; modelId: string }, engine: PromptEngine) {
  return inputSignature({ filtering, config, prompt: engine.fingerprint(config.promptName, { modelId: config.modelId }) })
}
export function imagePassEvidence<T extends object>(output: T, signature: string) {
  return { ...output, generationEvidence: { source: "ai" as const, input: outputEvidence(signature, output) } }
}
export function imagePassCurrent(storage: Storage, node: string, pageId: string, signature: string) {
  const row = storage.getLatestNodeData(node, pageId)?.data as Record<string, unknown> | undefined
  if (!row) return false
  const { generationEvidence, ...content } = row
  const metadata = OutputMetadata.safeParse(generationEvidence)
  return deriveOutputStatus({ identity: { kind: "extract-generation", id: pageId }, signature, content, usable: true,
    metadata: metadata.success ? metadata.data : undefined }).current
}
