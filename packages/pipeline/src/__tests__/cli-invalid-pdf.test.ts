import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { afterEach, beforeEach, expect, it } from "vitest"

let root: string
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), "cli-invalid-pdf-")) })
afterEach(() => fs.rmSync(root, { recursive: true, force: true }))

it.each(["missing", "malformed"])("CLI identifies the %s PDF and leaves the fresh label available", kind => {
  const pdf = path.join(root, `${kind} source.pdf`)
  if (kind === "malformed") fs.writeFileSync(pdf, "not a PDF")
  const books = path.join(root, "books")
  const result = spawnSync(process.execPath, ["packages/pipeline/dist/cli.js", "fresh", pdf, "--books-dir", books], {
    cwd: process.cwd(), encoding: "utf8", timeout: 20_000,
  })
  expect(result.error).toBeUndefined()
  expect(result.status).toBe(1)
  expect(result.stderr).toContain("EXTRACTION_INPUT_INVALID")
  expect(result.stderr).toContain(pdf)
  expect(result.stderr).not.toContain("fresh, user-chosen label")
  expect(fs.existsSync(path.join(books, "fresh"))).toBe(false)
}, 25_000)
