import type { Storage } from "@adt/storage"
import type { OutputStatus } from "@adt/types"
import { inputSignature } from "./output-freshness.js"

/** Exact stored owners shown at review time. Content hashes alone miss an
 * intervening edit/restore with identical bytes. No provenance is inferred. */
export function bindOutputRevisions(
  storage: Storage,
  outputs: OutputStatus[],
): OutputStatus[] {
  const languageItem = (node: string, language = "") =>
    storage.getSelectedNodeVersion(node, language) !== null
      ? language
      : language.replace("-", "_")
  return outputs.map((output) => {
    const { kind, id, language } = output.identity
    let owners: Array<[string, string]>
    switch (kind) {
      case "extract-generation":
        owners = [
          ["metadata", "book"],
          ["book-summary", "book"],
          ["book-outline", "book"],
          ...storage
            .getPages()
            .flatMap((page) =>
              ["image-filtering", "image-segmentation", "image-cropping"].map(
                (node): [string, string] => [node, page.pageId],
              ),
            ),
        ]
        break
      case "sectioning":
        owners = [
          ["page-sectioning", id],
          ["web-rendering", id],
          ["fixed-layout-sectioning", id],
        ]
        break
      case "storyboard":
        owners = [
          ["web-rendering", id],
          ["fixed-layout-sectioning", id],
        ]
        break
      case "quizzes":
        owners = [["quiz-generation", "book"]]
        break
      case "glossary":
        owners = [["glossary", "book"]]
        break
      case "toc":
        owners = [["toc-generation", "book"]]
        break
      case "package":
        owners = [["accessibility-assessment", "book"]]
        break
      case "caption":
        owners = [
          [
            "image-captioning",
            storage.getImageMeta(id)?.pageId ?? output.pageIds[0] ?? "",
          ],
        ]
        break
      case "easy-read":
        owners = [["easy-read", "book"]]
        break
      case "image-translation":
        owners = [["image-translation", `${id}_tr_${language}`]]
        break
      case "translation":
        owners = [
          [
            "text-catalog-translation",
            languageItem("text-catalog-translation", language),
          ],
        ]
        break
      case "preparation":
        owners = [
          ["core-tts-catalog", languageItem("core-tts-catalog", language)],
        ]
        break
      case "audio":
        owners = [["tts", languageItem("tts", language)]]
        break
      case "timestamps":
        owners = [["tts-timestamps", languageItem("tts-timestamps", language)]]
        break
    }
    return {
      ...output,
      revision: inputSignature(
        owners.map(([node, item]) => [
          node,
          item,
          storage.getSelectedNodeVersion(node, item),
        ]),
      ),
    }
  })
}
