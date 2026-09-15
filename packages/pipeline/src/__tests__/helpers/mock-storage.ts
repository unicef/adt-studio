import fs from "node:fs"
import path from "node:path"
import type { Storage, PageData } from "@adt/storage"

/**
 * A `Storage` backed by plain objects, for packaging tests.
 *
 * Packaging only ever reads, so the write methods are no-ops and every node is
 * reported at version 1. `getNodeVersionFingerprint` is real enough for the
 * packaging input hash to be stable and to change when node data changes.
 *
 * Shared by the per-format packaging tests and by `export-order-agreement`,
 * which needs the exact same book to reach all four packagers.
 */
export function createMockStorage(
  pages: PageData[],
  nodeData: Record<string, Record<string, unknown>>,
): Storage {
  return {
    getLatestNodeData(node: string, itemId: string) {
      const data = nodeData[node]?.[itemId]
      return data !== undefined ? { version: 1, data } : null
    },
    getPages: () => pages,
    getPageImageBase64: () => "",
    getImageBase64: () => "",
    getPageImages: () => [],
    putNodeData: () => 1,
    clearExtractedData: () => {},
    putExtractedPage: () => {},
    appendLlmLog: () => {},
    getSignLanguageVideos: () => [],
    getSignLanguageVideoPath: () => null,
    getNodeVersionFingerprint: (excludeNodes: string[] = []) =>
      Object.entries(nodeData)
        .filter(([node]) => !excludeNodes.includes(node))
        .flatMap(([node, items]) =>
          Object.keys(items).map((itemId) => ({ node, itemId, version: 1 })),
        )
        .sort((a, b) => a.node.localeCompare(b.node) || a.itemId.localeCompare(b.itemId)),
    close: () => {},
  } as unknown as Storage
}

/**
 * Pre-built runtime bundles. In production these come from
 * apps/adt-runtime/build.config.mjs; in tests we write them directly so
 * buildJsBundle's "copy from webAssetsDir" path is exercised without pulling in
 * the real React build.
 */
export function createWebAssets(webAssetsDir: string): void {
  fs.mkdirSync(webAssetsDir, { recursive: true })
  const bundleStub = 'window.__ADT_BUNDLE_TEST__ = "ok";\n'
  fs.writeFileSync(path.join(webAssetsDir, "base.bundle.min.js"), bundleStub)
  fs.writeFileSync(path.join(webAssetsDir, "base.bundle.local.js"), bundleStub)
  fs.writeFileSync(
    path.join(webAssetsDir, "base.bundle.min.js.map"),
    '{"version":3,"sources":["base.tsx"],"mappings":""}',
  )
  fs.writeFileSync(path.join(webAssetsDir, "fonts.css"), "body { font-family: serif; }")
  fs.writeFileSync(
    path.join(webAssetsDir, "tailwind_css.css"),
    "@tailwind base;\n@tailwind components;\n@tailwind utilities;\n",
  )
}
