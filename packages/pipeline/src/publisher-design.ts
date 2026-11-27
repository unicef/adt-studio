import { createHash } from "node:crypto"
import type { Storage } from "@adt/storage"
import { PageSectioningOutput, PositionedTextOutput, PublisherDesignVersion, type AppConfig, type PublisherSource } from "@adt/types"

/** Book-local inputs shared by discovery, saving and the rendering preflight. */
export function readPublisherSources(storage: Pick<Storage, "getPages" | "getLatestNodeData">) {
  const sources: PublisherSource[] = storage.getPages().map((page) => {
    const sectioning = storage.getLatestNodeData("page-sectioning", page.pageId)
    const positioned = storage.getLatestNodeData("positioned-text", page.pageId)
    return {
      pageId: page.pageId, pageNumber: page.pageNumber,
      ...(sectioning ? { sectioning: PageSectioningOutput.parse(sectioning.data) } : {}),
      ...(positioned ? { positioned: PositionedTextOutput.parse(positioned.data) } : {}),
    }
  })
  return { sources, fingerprint: createHash("sha256").update(JSON.stringify(sources)).digest("hex") }
}

/** Pin one saved version for the entire run. Never substitute a fixed template
 * when the publisher's design is missing or its source content has changed.
 */
export function readPublisherDesignForRendering(storage: Pick<Storage, "getPages" | "getLatestNodeData">, config: AppConfig): PublisherDesignVersion | undefined {
  const names = [config.default_render_strategy, ...Object.entries(config.section_render_strategies ?? {})
    .filter(([type]) => config.generate_activities !== false || !type.startsWith("activity_"))
    .map(([, name]) => name)]
  const selected = names.some((name) => {
    const strategy = name ? config.render_strategies?.[name] : undefined
    return strategy?.render_type === "template" && strategy.config?.template === "publisher_styles"
  })
  if (!selected) return undefined
  const row = storage.getLatestNodeData("publisher-styles-prototype", "book")
  if (!row) throw new Error("Save a design in Storyboard → Settings → Styles before using Publisher styles — mixed layouts.")
  const design = PublisherDesignVersion.parse({ version: row.version, document: row.data })
  if (design.document.sourceFingerprint !== readPublisherSources(storage).fingerprint) {
    throw new Error("The source content changed since this Styles design was saved. Analyze and save it again before rendering.")
  }
  if (design.document.pages.some((page) => !page.regions)) {
    throw new Error("Detect mixed layouts in Styles and save the design before rendering.")
  }
  return design
}
