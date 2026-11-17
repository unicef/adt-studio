import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { randomUUID } from "node:crypto"
import { afterEach, expect, it } from "vitest"
import { withBookWriter } from "@adt/storage"
import { createPackageStaging, openPackageWork, removePackageStaging } from "../packaging/publication-directory.js"

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }) })
function fixture() { const root = fs.mkdtempSync(path.join(os.tmpdir(), "package-staging-")); roots.push(root); return root }

it("resumes an empty unmarked work directory but preserves a nonempty one and directory aliases", () => {
  const root = fixture(), work = path.join(root, ".adt-package-work")
  fs.mkdirSync(work)
  withBookWriter(root, () => expect(openPackageWork(root)).toBe(work))
  expect(fs.readFileSync(path.join(work, "format"), "utf8")).toBe("adt-web-stage-v1\n")
  fs.unlinkSync(path.join(work, "format"))
  fs.writeFileSync(path.join(work, "owner-data"), "keep")
  withBookWriter(root, () => expect(() => openPackageWork(root)).toThrow("Unrecognized"))
  expect(fs.readFileSync(path.join(work, "owner-data"), "utf8")).toBe("keep")
  fs.rmSync(work, { recursive: true })
  const outside = fixture()
  fs.symlinkSync(outside, work, "junction")
  withBookWriter(root, () => expect(() => openPackageWork(root)).toThrow("Unrecognized"))
  expect(fs.readdirSync(outside)).toEqual([])
})

it("requires admission and retains active stages across reentrant opens", async () => {
  const root = fixture()
  expect(() => openPackageWork(root)).toThrow("BOOK_BUSY")
  expect(fs.readdirSync(root)).toEqual([])
  let finish!: () => void, stage = ""
  const running = withBookWriter(root, async () => {
    const work = openPackageWork(root)
    stage = createPackageStaging(work)
    fs.writeFileSync(path.join(stage, "active-output"), "in flight")
    openPackageWork(root)
    expect(fs.readFileSync(path.join(stage, "active-output"), "utf8")).toBe("in flight")
    await new Promise<void>(resolve => { finish = resolve })
    removePackageStaging(stage)
  })
  expect(() => withBookWriter(root, () => openPackageWork(root))).toThrow("BOOK_BUSY")
  expect(fs.existsSync(stage)).toBe(true)
  finish(); await running
  expect(fs.existsSync(stage)).toBe(false)
})

it("cleans exact marked abandoned stages without age checks and preserves unknown entries and previous output", () => {
  const root = fixture()
  withBookWriter(root, () => {
    const work = openPackageWork(root)
    const owned: string[] = [], unknown: string[] = []
    for (const prefix of ["build-", ".preparing-"]) {
      const token = randomUUID(), stage = path.join(work, prefix + token)
      fs.mkdirSync(stage); fs.writeFileSync(path.join(stage, ".stage-owner"), `adt-web-build-v1\n${token}\n`)
      fs.writeFileSync(path.join(stage, "large-content"), Buffer.alloc(1024 * 1024)); owned.push(stage)
    }
    for (const marker of [undefined, "unknown", `adt-web-build-v1\n${randomUUID()}\n`]) {
      const stage = path.join(work, "build-" + randomUUID()); fs.mkdirSync(stage)
      if (marker) fs.writeFileSync(path.join(stage, ".stage-owner"), marker)
      fs.writeFileSync(path.join(stage, "owner-data"), "keep"); unknown.push(stage)
    }
    const previous = path.join(work, "previous"); fs.mkdirSync(previous); fs.writeFileSync(path.join(previous, "index.html"), "prior output")
    const alias = path.join(work, "build-" + randomUUID()); fs.symlinkSync(unknown[0], alias)
    const token = randomUUID(), linkedMarker = path.join(work, "build-" + token); fs.mkdirSync(linkedMarker)
    const outside = path.join(root, "owner-marker"); fs.writeFileSync(outside, `adt-web-build-v1\n${token}\n`)
    fs.symlinkSync(outside, path.join(linkedMarker, ".stage-owner"))
    openPackageWork(root)
    expect(owned.every(stage => !fs.existsSync(stage))).toBe(true)
    for (const stage of unknown) expect(fs.readFileSync(path.join(stage, "owner-data"), "utf8")).toBe("keep")
    expect(fs.lstatSync(alias).isSymbolicLink()).toBe(true)
    expect(fs.lstatSync(path.join(linkedMarker, ".stage-owner")).isSymbolicLink()).toBe(true)
    expect(fs.readFileSync(path.join(previous, "index.html"), "utf8")).toBe("prior output")
  })
})
