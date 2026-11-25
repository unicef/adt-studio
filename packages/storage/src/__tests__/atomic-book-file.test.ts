import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, expect, it } from "vitest"
import { atomicBookFile } from "../sectioning-transition.js"
const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }) })
it.skipIf(process.platform === "win32").each([0o644, 0o664])("preserves existing config permissions %i across atomic replacement", mode => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "book-file-mode-")); roots.push(root)
  const file = path.join(root, "config.yaml")
  fs.writeFileSync(file, "before"); fs.chmodSync(file, mode)
  atomicBookFile(file, "after")
  expect(fs.readFileSync(file, "utf8")).toBe("after")
  expect(fs.statSync(file).mode & 0o777).toBe(mode)
  expect(fs.readdirSync(root)).toEqual(["config.yaml"])
})
it("keeps new bookkeeping private and preserves aliased files", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "book-file-mode-")); roots.push(root)
  const file = path.join(root, "private.json"), alias = path.join(root, "alias.json")
  atomicBookFile(file, "before")
  if (process.platform !== "win32") expect(fs.statSync(file).mode & 0o777).toBe(0o600)
  fs.symlinkSync(file, alias)
  expect(() => atomicBookFile(alias, "after")).toThrow()
  expect(fs.readFileSync(file, "utf8")).toBe("before")
  expect(fs.lstatSync(alias).isSymbolicLink()).toBe(true)
})
