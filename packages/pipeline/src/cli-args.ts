import path from "node:path"
import { z } from "zod"
import { BookLabel } from "@adt/types"

export const USAGE = `Usage: pnpm pipeline <label> <pdf-file> [options]

Arguments:
  label       Book label (used as directory name)
  pdf-file    Path to PDF file

Options:
  --start-page <n>  Start at page N (1-indexed)
  --end-page <n>    End at page N (inclusive)
  --books-dir <dir> Books root directory (default: books)
  -h, --help        Show this help`

const ParsedCliArgsSchema = z
  .object({
    label: BookLabel,
    pdfFile: z.string().min(1),
    startPage: z.coerce.number().int().positive().optional(),
    endPage: z.coerce.number().int().positive().optional(),
    booksDir: z.string().min(1).optional(),
  })
  .refine(
    (value) =>
      value.startPage === undefined ||
      value.endPage === undefined ||
      value.startPage <= value.endPage,
    {
      message: "--start-page must be less than or equal to --end-page",
      path: ["startPage"],
    }
  )

export interface ParsedCliArgs {
  label: string
  pdfPath: string
  startPage?: number
  endPage?: number
  booksRoot: string
}

export function parseCliArgs(args: string[]): ParsedCliArgs {
  const positional: string[] = []
  let startPageRaw: string | undefined
  let endPageRaw: string | undefined
  let booksDirRaw: string | undefined

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === "--start-page") {
      if (args[i + 1] === undefined) {
        throw new Error("Missing value for --start-page")
      }
      startPageRaw = args[++i]
      continue
    }
    if (arg === "--end-page") {
      if (args[i + 1] === undefined) {
        throw new Error("Missing value for --end-page")
      }
      endPageRaw = args[++i]
      continue
    }
    if (arg === "--books-dir") {
      if (args[i + 1] === undefined) {
        throw new Error("Missing value for --books-dir")
      }
      booksDirRaw = args[++i]
      continue
    }
    if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`)
    }
    positional.push(arg)
  }

  if (positional.length !== 2) {
    throw new Error("label and pdf-file are required")
  }

  const parsed = ParsedCliArgsSchema.safeParse({
    label: positional[0],
    pdfFile: positional[1],
    startPage: startPageRaw,
    endPage: endPageRaw,
    booksDir: booksDirRaw,
  })

  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => issue.message).join("; ")
    throw new Error(message)
  }

  return {
    label: parsed.data.label,
    pdfPath: path.resolve(parsed.data.pdfFile),
    startPage: parsed.data.startPage,
    endPage: parsed.data.endPage,
    booksRoot: path.resolve(parsed.data.booksDir ?? process.env.BOOKS_DIR ?? "books"),
  }
}
