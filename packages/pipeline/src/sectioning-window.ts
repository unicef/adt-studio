import fs from "node:fs"
import path from "node:path"
import { PartManifest, type AppConfig } from "@adt/types"
import type { Storage } from "@adt/storage"
import { SectioningSafetyError } from "./sectioning-errors.js"

export function requiredPartRange(bookDir: string) {
  const partFile = path.join(bookDir, "part.json")
  try { return PartManifest.parse(JSON.parse(fs.readFileSync(partFile, "utf8"))).range }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null
    throw new SectioningSafetyError("SECTIONING_WINDOW_INVALID", "The saved part window is invalid or unreadable. Restore a valid part manifest before running this book. Saved content is retained.")
  }
}

export function activeSectioningPages(storage: Storage, config: AppConfig, bookDir: string) {
  const range = requiredPartRange(bookDir)
  const start = range?.startPage ?? config.start_page ?? 1
  const end = range?.endPage ?? config.end_page ?? Infinity
  return storage.getPages().filter((page) => page.pageNumber >= start && page.pageNumber <= end)
}
