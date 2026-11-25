import { z } from "zod"

export const READER_SOURCE_NODE = "reader-source"
export const READER_SOURCE_MODE_NODE = "reader-source-mode"
export const READER_SOURCE_MAX_BYTES = 512 * 1024

const SOURCE_PATH = /^(?:[A-Za-z0-9_@-][A-Za-z0-9_.@-]*\/)*[A-Za-z0-9_@-][A-Za-z0-9_.@-]*\.(?:tsx?|jsx?|css|json)$/

export const ReaderSourcePath = z
  .string()
  .max(300)
  .refine((value) => SOURCE_PATH.test(value) && !value.split("/").some((segment) => segment === ".." || segment === "."), {
    message: "Reader source paths are relative to src/ and end in .ts, .tsx, .js, .jsx, .css or .json",
  })

export const ReaderSourceLayer = z.enum(["base", "global", "book"])
export type ReaderSourceLayer = z.infer<typeof ReaderSourceLayer>

export const ReaderSourceVersionData = z.object({
  content: z.string(),
  baseHash: z.string().nullable(),
  deleted: z.boolean().optional(),
})
export type ReaderSourceVersionData = z.infer<typeof ReaderSourceVersionData>

export const ReaderSourceMode = z.object({ followsGlobal: z.boolean() })
export type ReaderSourceMode = z.infer<typeof ReaderSourceMode>

export const ReaderSourceTreeEntry = z.object({
  path: z.string(),
  layer: ReaderSourceLayer,
  version: z.number().int().nullable(),
  outdated: z.boolean(),
})
export type ReaderSourceTreeEntry = z.infer<typeof ReaderSourceTreeEntry>

export const ReaderSourceTree = z.object({
  followsGlobal: z.boolean(),
  files: z.array(ReaderSourceTreeEntry),
})
export type ReaderSourceTree = z.infer<typeof ReaderSourceTree>

export const ReaderSourceFile = ReaderSourceTreeEntry.extend({
  headVersion: z.number().int().nullable(),
  content: z.string(),
  baseHash: z.string().nullable(),
})
export type ReaderSourceFile = z.infer<typeof ReaderSourceFile>

export const ReaderSourceHistoryEntry = z.object({
  version: z.number().int(),
  content: z.string().nullable(),
  deleted: z.boolean(),
})
export type ReaderSourceHistoryEntry = z.infer<typeof ReaderSourceHistoryEntry>

const SourceContent = z.string().refine((value) => new TextEncoder().encode(value).length <= READER_SOURCE_MAX_BYTES, {
  message: `Reader source files are limited to ${READER_SOURCE_MAX_BYTES} bytes`,
})

export const ReaderSourceSaveRequest = z.object({
  path: ReaderSourcePath,
  content: SourceContent,
  baseVersion: z.number().int().nullable(),
})
export type ReaderSourceSaveRequest = z.infer<typeof ReaderSourceSaveRequest>

export const ReaderSourceRevertRequest = z.object({
  path: ReaderSourcePath,
  baseVersion: z.number().int().nullable(),
})
export type ReaderSourceRevertRequest = z.infer<typeof ReaderSourceRevertRequest>

export const ReaderSourceRestoreRequest = z.object({
  path: ReaderSourcePath,
  version: z.number().int().positive(),
  baseVersion: z.number().int().nullable(),
})
export type ReaderSourceRestoreRequest = z.infer<typeof ReaderSourceRestoreRequest>

export const ReaderSourceCompileRequest = z.object({
  drafts: z.record(ReaderSourcePath, SourceContent).optional(),
})
export type ReaderSourceCompileRequest = z.infer<typeof ReaderSourceCompileRequest>

export const ReaderSourceCompileError = z.object({
  path: z.string(),
  line: z.number().int(),
  column: z.number().int(),
  message: z.string(),
})
export type ReaderSourceCompileError = z.infer<typeof ReaderSourceCompileError>

export const ReaderSourceCompileResult = z.object({
  ok: z.boolean(),
  hash: z.string(),
  errors: z.array(ReaderSourceCompileError),
})
export type ReaderSourceCompileResult = z.infer<typeof ReaderSourceCompileResult>
