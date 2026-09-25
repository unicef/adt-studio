import { z } from "zod"

export const ExtractionErrorCode = z.enum([
  "BOOK_BUSY", "EXTRACTION_LEGACY", "EXTRACTION_INCOMPLETE",
  "EXTRACTION_SOURCE_CHANGED", "EXTRACTION_INPUTS_CHANGED",
  "EXTRACTION_ASSETS_INVALID", "EXTRACTION_INPUT_INVALID",
  "UNSAFE_RESUME_UNAVAILABLE",
])
export type ExtractionErrorCode = z.infer<typeof ExtractionErrorCode>

/** Bump when extraction output or identity semantics change. Not an app version. */
export const EXTRACTION_CONTRACT_VERSION = 1
export const ExtractionInputs = z.object({
  contractVersion: z.number().int().positive(),
  startPage: z.number().int().positive(),
  endPage: z.number().int().positive(),
  spreadMode: z.boolean(),
  spreadPairs: z.array(z.number().int().positive()),
  vectorTextGrouping: z.boolean(),
  keepCoveredRasters: z.boolean(),
  removeWatermarks: z.boolean(),
  fixedLayout: z.boolean(),
}).strict()
export type ExtractionInputs = z.infer<typeof ExtractionInputs>

const Digest = z.string().regex(/^[a-f0-9]{64}$/)
const RelativeAssetPath = z.string().min(1).refine(
  (value) => !value.startsWith("/") && !value.includes("\\") &&
    !value.split("/").some((part) => part === ".." || part === "." || part === "") &&
    !value.includes(":"),
)
export const ExtractionManifest = z.object({
  schemaVersion: z.literal(1),
  attemptId: z.string().uuid(),
  status: z.enum(["extracting", "failed", "complete"]),
  sourceHash: Digest,
  inputs: ExtractionInputs,
  inputFingerprint: Digest,
  pages: z.array(z.object({ pageId: z.string().min(1), pageNumber: z.number().int().positive(), textHash: Digest })),
  assets: z.array(z.object({ path: RelativeAssetPath, hash: Digest })),
  images: z.array(z.object({ imageId: z.string(), pageId: z.string(), path: RelativeAssetPath, width: z.number().positive(), height: z.number().positive() })),
  nodes: z.array(z.object({ node: z.string(), itemId: z.string(), version: z.number().int().positive(), hash: Digest })),
}).strict().superRefine((value, ctx) => {
  if (value.status === "complete" && (value.pages.length === 0 || value.assets.length === 0 || value.nodes.length === 0 || value.images.length === 0)) {
    ctx.addIssue({ code: "custom", message: "Complete extraction requires pages, assets and metadata" })
  }
  for (const keys of [value.pages.map((p) => p.pageId), value.assets.map((a) => a.path), value.images.map((image) => image.imageId), value.nodes.map((node) => `${node.node}/${node.itemId}/${node.version}`)]) {
    if (new Set(keys).size !== keys.length) ctx.addIssue({ code: "custom", message: "Duplicate extraction inventory entry" })
  }
})
export type ExtractionManifest = z.infer<typeof ExtractionManifest>

export const BookWriterOwner = z.object({
  token: z.string().uuid(),
  pid: z.number().int().positive(),
  host: z.string().min(1),
}).strict()
export type BookWriterOwner = z.infer<typeof BookWriterOwner>
