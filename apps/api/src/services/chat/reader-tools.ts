import { z } from "zod"
import { readerAllowedPackages, readerRuntimeDir } from "@adt/pipeline"
import { ReaderSourcePath, READER_SOURCE_MAX_BYTES } from "@adt/types"
import { createReaderSourceService } from "../reader-source-service.js"
import type { ChatToolkit } from "./chat-service.js"

export const READER_WRITE_TOOLS = ["writeReaderFile", "revertReaderFile"] as const

const PathArgs = z.object({ path: ReaderSourcePath.describe("File path relative to the reader's src/ folder, e.g. features/dock/components/Dock.tsx") })

export function createReaderToolkit(label: string, booksDir: string, webAssetsDir: string): ChatToolkit {
  const service = createReaderSourceService(booksDir, webAssetsDir)
  const runtimeDir = readerRuntimeDir(webAssetsDir)
  const libraries = runtimeDir ? readerAllowedPackages(runtimeDir).join(", ") : "unavailable"
  const currentVersion = (path: string) => service.history(label, path).at(-1)?.version ?? null

  return {
    requiresApproval: new Set(READER_WRITE_TOOLS),
    editTools: new Set(READER_WRITE_TOOLS),
    instructions: [
      "## Reader customization",
      "The user is customizing this book's reader (the interface around the pages). Its React + TypeScript source lives in src/ and every file there can be read and changed.",
      `Code may import only relative/@/ paths and these installed libraries: ${libraries}. Never add another dependency.`,
      "Style with Tailwind utility classes and the theme tokens in styles/globals.css; reuse the components in shared/ui.",
      "Do not add new user-visible text; reuse the reader's existing translation keys.",
      "Read a file before changing it, keep edits minimal, and call compileReader with your draft before proposing writeReaderFile. writeReaderFile replaces the whole file.",
    ].join("\n"),
    tools: {
      listReaderFiles: {
        description: "List every reader source file with the layer it comes from (base, global or book) and whether it is outdated.",
        parameters: z.object({}),
        execute: () => {
          const tree = service.tree(label)
          return { followsGlobal: tree.followsGlobal, files: tree.files.map(({ path, layer, outdated }) => ({ path, layer, outdated })) }
        },
      },
      readReaderFile: {
        description: "Read the effective content of one reader source file.",
        parameters: PathArgs,
        execute: ({ path }: z.infer<typeof PathArgs>) => {
          const { layer, version, content } = service.file(label, path)
          return { path, layer, version, content }
        },
      },
      searchReaderFiles: {
        description: "Search the effective reader source for a text (case-insensitive). Returns matching lines.",
        parameters: z.object({
          query: z.string().min(2).max(200),
          limit: z.number().int().min(1).max(100).nullable().describe("Maximum matches to return; null for 40"),
        }),
        execute: ({ query, limit }: { query: string; limit: number | null }) => ({ matches: service.search(label, query, limit ?? 40) }),
      },
      compileReader: {
        description: "Compile the reader with the saved overrides plus optional unsaved drafts. Returns compile errors with file, line and column.",
        parameters: z.object({
          drafts: z
            .array(z.object({ path: ReaderSourcePath, content: z.string().max(READER_SOURCE_MAX_BYTES) }))
            .nullable()
            .describe("Unsaved files to compile in place of the saved ones; null to compile only what is saved"),
        }),
        execute: ({ drafts }: { drafts: Array<{ path: string; content: string }> | null }) =>
          service.compile(label, Object.fromEntries((drafts ?? []).map((draft) => [draft.path, draft.content]))),
      },
      writeReaderFile: {
        description: "Replace a reader source file with new content. Waits for the user's approval and saves a new version in this book.",
        parameters: PathArgs.extend({ content: z.string().max(READER_SOURCE_MAX_BYTES) }),
        execute: ({ path, content }: { path: string; content: string }) => ({ version: service.save(label, path, content, currentVersion(path)) }),
      },
      revertReaderFile: {
        description: "Revert a reader source file in this book back to the base version. Waits for the user's approval.",
        parameters: PathArgs,
        execute: ({ path }: z.infer<typeof PathArgs>) => ({ version: service.revert(label, path, currentVersion(path)) }),
      },
    },
  }
}
