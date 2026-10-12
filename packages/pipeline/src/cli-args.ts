import path from "node:path"
import { z } from "zod"
import { BookLabel, StageName, STAGE_ORDER } from "@adt/types"

export const USAGE = `Usage: pnpm pipeline <label> <pdf-file> [options]

Arguments:
  label       Book label (used as directory name)
  pdf-file    Path to PDF file

Options:
  --start-page <n>    Start at page N (1-indexed)
  --end-page <n>      End at page N (inclusive)
  --books-dir <dir>   Books root directory (default: books)
  --concurrency <n>   Max parallel LLM calls (default: from config or 5)
  --from-stage <s>    Resume a supported stage from verified extraction
  --to-stage <s>      Last resumed stage (both range flags required)
  --output-scope <file>  Catalog selection/replacement decisions as OutputRunScope JSON
  --protected-replacements <file>  Confirm exact protected records from a JSON array
  -h, --help          Show this help`

const ParsedCliArgsSchema = z
  .object({
    label: BookLabel,
    pdfFile: z.string().min(1),
    startPage: z.coerce.number().int().positive().optional(),
    endPage: z.coerce.number().int().positive().optional(),
    booksDir: z.string().min(1).optional(),
    concurrency: z.coerce.number().int().positive().optional(),
    fromStage: StageName.optional(),
    toStage: StageName.optional(),
    protectedReplacementsFile: z.string().min(1).optional(),
    outputScopeFile: z.string().min(1).optional(),
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
  fromStage?: StageName
  toStage?: StageName
  protectedReplacementsFile?: string
  outputScopeFile?: string
  label: string
  pdfPath: string
  startPage?: number
  endPage?: number
  booksRoot: string
  concurrency?: number
}

export function parseCliArgs(args: string[]): ParsedCliArgs {
  const positional: string[] = []
  const resume: Record<string, string> = {}
  let startPageRaw: string | undefined
  let endPageRaw: string | undefined
  let booksDirRaw: string | undefined
  let concurrencyRaw: string | undefined

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    const resumeKeys: Record<string, string> = { "--from-stage": "fromStage", "--to-stage": "toStage", "--protected-replacements": "protectedReplacementsFile", "--output-scope": "outputScopeFile" }
    if (resumeKeys[arg]) {
      if (!args[i + 1] || args[i + 1].startsWith("--")) throw new Error(`Missing value for ${arg}`)
      resume[resumeKeys[arg]] = args[++i]
      continue
    }
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
    if (arg === "--concurrency") {
      if (args[i + 1] === undefined) {
        throw new Error("Missing value for --concurrency")
      }
      concurrencyRaw = args[++i]
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
    ...resume,
    label: positional[0],
    pdfFile: positional[1],
    startPage: startPageRaw,
    endPage: endPageRaw,
    booksDir: booksDirRaw,
    concurrency: concurrencyRaw,
  })

  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => issue.message).join("; ")
    throw new Error(message)
  }
  const { fromStage, toStage, protectedReplacementsFile, outputScopeFile } = parsed.data
  if ((fromStage === undefined) !== (toStage === undefined)
    || (fromStage && toStage && STAGE_ORDER.indexOf(fromStage) > STAGE_ORDER.indexOf(toStage))
    || (protectedReplacementsFile && !fromStage)
    || (outputScopeFile && !fromStage)) {
    throw new Error("Specify an ordered --from-stage and --to-stage range for scoped output or protected replacement decisions")
  }

  return {
    fromStage, toStage,
    outputScopeFile: outputScopeFile ? path.resolve(outputScopeFile) : undefined,
    protectedReplacementsFile: protectedReplacementsFile ? path.resolve(protectedReplacementsFile) : undefined,
    label: parsed.data.label,
    pdfPath: path.resolve(parsed.data.pdfFile),
    startPage: parsed.data.startPage,
    endPage: parsed.data.endPage,
    booksRoot: path.resolve(parsed.data.booksDir ?? process.env.BOOKS_DIR ?? "books"),
    concurrency: parsed.data.concurrency,
  }
}
