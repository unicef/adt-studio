import { adtTextFingerprint, projectImportedHtmlSection } from "@adt/pipeline"

import type { ReadAdtBundle } from "./bundle-reader.js"
import { importedSourceTextIsCurrent } from "./speech.js"

/**
 * The source texts with every image description edited after export applied.
 *
 * The catalog (`texts.json`) is the source of an image's description, and the
 * exported HTML alt may legitimately be a shorter fallback, so an HTML alt that
 * differs from the catalog proves nothing on its own. An export carrying
 * `frozen.imageAltFingerprints` says which alt it shipped: when the HTML alt no
 * longer matches that and the catalog entry was not edited too, the alt was
 * edited after export (as the bundled agent guide allows) and becomes the
 * image's description. Older exports are returned unchanged.
 */
export function sourceTextsWithEditedImageAlts(
  bundle: ReadAdtBundle,
  sourceTexts: Record<string, string>,
): Record<string, string> {
  const baseline = bundle.manifest.frozen?.imageAltFingerprints
  if (!baseline) return sourceTexts
  const textIsCurrent = importedSourceTextIsCurrent(bundle)
  let result: Record<string, string> | null = null
  for (const page of bundle.pages) {
    const html = bundle.pageHtml[page.href]
    if (!html) continue
    for (const image of projectImportedHtmlSection(html, page.section_id).images) {
      if (image.decorative || !image.alt.trim()) continue
      const expected = baseline[image.imageId]
      if (expected === undefined || adtTextFingerprint(image.alt) === expected) continue
      const catalogText = sourceTexts[image.imageId]
      if (catalogText !== undefined && !textIsCurrent(image.imageId, catalogText)) continue
      result ??= { ...sourceTexts }
      result[image.imageId] = image.alt
    }
  }
  return result ?? sourceTexts
}
