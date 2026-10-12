import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, expect, it } from "vitest"
import { createBookStorage, withBookWriter } from "@adt/storage"
import { createGenerationPublication } from "../generation-publication.js"
import { assertPackageReadable, newPackageAttempt, publishPackageAttempt, recoverPackagePublication, PACKAGE_JOURNAL } from "../packaging/publication.js"

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }) })
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "generation-publication-")); roots.push(root)
  const storage = createBookStorage("book", root), book = storage.bookDir!
  return { storage, book }
}
it("failed staged transactions cannot leak content or completed step records", () => {
  const { storage } = fixture()
  const publication = createGenerationPublication(storage, () => {})
  try {
    expect(() => publication.storage.transaction(() => {
      publication.storage.putNodeData("book-summary", "book", { summary: "failed" })
      publication.storage.markStepCompleted("book-summary")
      throw new Error("rollback")
    })).toThrow("rollback")
    publication.publish()
    expect(storage.getLatestNodeData("book-summary", "book")).toBeNull()
    expect(storage.getStepRuns()).toEqual([])
  } finally { storage.close() }
})
it("an orphaned asset collision cannot overwrite bytes or advance content", () => {
  const { storage, book } = fixture()
  try {
    fs.writeFileSync(path.join(book, "images", "original_crop_v1.png"), "retained history")
    const publication = createGenerationPublication(storage, () => {})
    publication.storage.putCroppedImage({ imageId: "original", pageId: "pg001", version: 1, buffer: Buffer.from("new bytes"), width: 1, height: 1 })
    publication.storage.putNodeData("image-cropping", "pg001", { imageId: "original_crop_v1" })
    expect(() => publication.publish()).toThrow("identity collision")
    expect(fs.readFileSync(path.join(book, "images", "original_crop_v1.png"), "utf8")).toBe("retained history")
    expect(storage.getLatestNodeData("image-cropping", "pg001")).toBeNull()
  } finally { storage.close() }
})
it("artifact commit failure restores the previous bundle and retains the failed attempt", () => {
  const { storage, book } = fixture()
  try { withBookWriter(book, () => {
    fs.mkdirSync(path.join(book, "adt")); fs.writeFileSync(path.join(book, "adt/index.html"), "previous")
    const attempt = newPackageAttempt(book)
    fs.mkdirSync(path.join(attempt, "adt")); fs.writeFileSync(path.join(attempt, "adt/index.html"), "replacement")
    expect(() => publishPackageAttempt(book, attempt, () => { throw new Error("DB publication failed") })).toThrow("DB publication failed")
    expect(fs.readFileSync(path.join(book, "adt/index.html"), "utf8")).toBe("previous")
    expect(fs.readdirSync(attempt).some((file) => file.startsWith("uncommitted-"))).toBe(true)
    expect(() => assertPackageReadable(book)).not.toThrow()
  }) } finally { storage.close() }
})
it("a rename interruption blocks readers and restores the predecessor under writer admission", () => {
  const { storage, book } = fixture()
  try { withBookWriter(book, () => {
    fs.mkdirSync(path.join(book, "adt")); fs.writeFileSync(path.join(book, "adt/index.html"), "previous")
    const attempt = newPackageAttempt(book)
    fs.writeFileSync(path.join(book, PACKAGE_JOURNAL), JSON.stringify({ version: 1, attemptId: path.basename(attempt).replace(".package-attempt-", "") }))
    fs.renameSync(path.join(book, "adt"), path.join(attempt, "previous"))
    expect(() => assertPackageReadable(book)).toThrow("BOOK_BUSY")
    recoverPackagePublication(book)
    expect(fs.readFileSync(path.join(book, "adt/index.html"), "utf8")).toBe("previous")
    expect(() => assertPackageReadable(book)).not.toThrow()
  }) } finally { storage.close() }
})

it("a process killed after bundle activation leaves a reader barrier and recoverable predecessor", { timeout: 30000 }, async () => {
  const { spawnSync } = await import("node:child_process")
  const { pathToFileURL } = await import("node:url")
  const { storage, book } = fixture()
  storage.close()
  fs.mkdirSync(path.join(book, "adt")); fs.writeFileSync(path.join(book, "adt/index.html"), "previous")
  const repository = path.resolve(import.meta.dirname, "../../../..")
  const child = spawnSync(process.execPath, ["--input-type=module", "-e", `
    import fs from 'node:fs'; import path from 'node:path';
    import { withBookWriter } from ${JSON.stringify(pathToFileURL(path.join(repository, "packages/storage/dist/index.js")).href)};
    import { newPackageAttempt, publishPackageAttempt } from ${JSON.stringify(pathToFileURL(path.join(repository, "packages/pipeline/dist/packaging/publication.js")).href)};
    const book = ${JSON.stringify(book)};
    withBookWriter(book, () => {
      const attempt = newPackageAttempt(book);
      fs.mkdirSync(path.join(attempt, 'adt')); fs.writeFileSync(path.join(attempt, 'adt/index.html'), 'interrupted');
      publishPackageAttempt(book, attempt, () => process.kill(process.pid, 'SIGKILL'));
    });
  `], { encoding: "utf8", timeout: 15000 })
  expect(child.signal, child.stderr).toBe("SIGKILL")
  expect(() => assertPackageReadable(book)).toThrow("BOOK_BUSY")
  withBookWriter(book, () => recoverPackagePublication(book))
  expect(fs.readFileSync(path.join(book, "adt/index.html"), "utf8")).toBe("previous")
})
