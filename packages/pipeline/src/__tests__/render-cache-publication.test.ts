import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import { randomUUID } from "node:crypto"
import { afterEach, beforeEach, expect, it } from "vitest"
import { createBookStorage, withBookWriter } from "@adt/storage"
import { createRenderCachePublication, recoverRenderCachePublication, RENDER_CACHE_JOURNAL } from "../render-cache-publication.js"
import { inputSignature } from "../output-freshness.js"
import { assertCacheReadable } from "../../../llm/src/cache.js"
let root: string
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), "render-cache-")) })
afterEach(() => fs.rmSync(root, { recursive: true, force: true }))
const oldKey = "a".repeat(64), newKey = "b".repeat(64)
function setup() {
  const storage = createBookStorage("book", root), book = storage.bookDir!, cache = path.join(book, ".cache")
  fs.mkdirSync(cache, { recursive: true }); fs.writeFileSync(path.join(cache, `${oldKey}.json`), ' { "old": true }\n')
  storage.putNodeData("web-rendering", "page", { original: true })
  return { storage, book, cache }
}
it("does not touch cache while generating; commits validated cache with output and restores bytes on rejection", () => {
  const { storage, book, cache } = setup()
  try { withBookWriter(book, () => {
    const before = storage.getAllNodeVersions("web-rendering", "page"), data = { fresh: true }
    const pending = createRenderCachePublication(storage)
    pending.write(cache, oldKey, { fresh: true }); pending.write(cache, newKey, { second: true })
    expect(fs.readFileSync(path.join(cache, `${oldKey}.json`), "utf8")).toBe(' { "old": true }\n')
    expect(fs.existsSync(path.join(cache, `${newKey}.json`))).toBe(false)
    expect(() => pending.publish([{ pageId: "page", version: 2, signature: inputSignature(data) }], () => storage.transaction(() => {
      storage.putNodeData("web-rendering", "page", data); throw new Error("rollback")
    }))).toThrow("rollback")
    expect(storage.getAllNodeVersions("web-rendering", "page")).toEqual(before)
    expect(fs.readFileSync(path.join(cache, `${oldKey}.json`), "utf8")).toBe(' { "old": true }\n')
    expect(fs.existsSync(path.join(cache, `${newKey}.json`))).toBe(false)
    pending.publish([{ pageId: "page", version: 2, signature: inputSignature(data) }], () => { storage.putNodeData("web-rendering", "page", data) })
    expect(JSON.parse(fs.readFileSync(path.join(cache, `${oldKey}.json`), "utf8"))).toEqual(data)
    expect(fs.existsSync(path.join(book, RENDER_CACHE_JOURNAL))).toBe(false)
  }) } finally { storage.close() }
})
it.each([false, true])("recovers interrupted cache activation from the actual SQLite receipt (committed=%s)", (committed) => {
  const { storage, book, cache } = setup(), attemptId = randomUUID(), data = { fresh: true }
  const attempt = path.join(book, `.render-cache-attempt-${attemptId}`)
  fs.mkdirSync(attempt); fs.copyFileSync(path.join(cache, `${oldKey}.json`), path.join(attempt, `${oldKey}.previous`))
  fs.writeFileSync(path.join(cache, `${oldKey}.json`), JSON.stringify(data)); fs.writeFileSync(path.join(cache, `${newKey}.json`), "new")
  fs.writeFileSync(path.join(book, RENDER_CACHE_JOURNAL), JSON.stringify({ version: 1, attemptId,
    entries: [{ hash: oldKey, existed: true }, { hash: newKey, existed: false }],
    renderings: [{ pageId: "page", version: 2, signature: inputSignature(data) }] }))
  if (committed) storage.putNodeData("web-rendering", "page", data)
  storage.close()
  expect(() => assertCacheReadable(cache)).toThrow("recovery")
  const reopened = createBookStorage("book", root)
  try { withBookWriter(book, () => recoverRenderCachePublication(reopened)) }
  finally { reopened.close() }
  expect(() => assertCacheReadable(cache)).not.toThrow()
  expect(fs.readFileSync(path.join(cache, `${oldKey}.json`), "utf8")).toBe(committed ? JSON.stringify(data) : ' { "old": true }\n')
  expect(fs.existsSync(path.join(cache, `${newKey}.json`))).toBe(committed)
})

it.each([false, true])("recovers a process killed after cache activation and SQLite commit=%s without paid work", { timeout: 30000 }, async (committed) => {
  const { spawnSync } = await import("node:child_process"), { pathToFileURL } = await import("node:url")
  const { storage, book, cache } = setup(); storage.close()
  const repo = path.resolve(import.meta.dirname, "../../../..")
  const child = spawnSync(process.execPath, ["--input-type=module", "-e", `
    import { createBookStorage, withBookWriter } from ${JSON.stringify(pathToFileURL(path.join(repo, "packages/storage/dist/index.js")).href)};
    import { createRenderCachePublication } from ${JSON.stringify(pathToFileURL(path.join(repo, "packages/pipeline/dist/render-cache-publication.js")).href)};
    import { inputSignature } from ${JSON.stringify(pathToFileURL(path.join(repo, "packages/pipeline/dist/output-freshness.js")).href)};
    const storage = createBookStorage('book', ${JSON.stringify(root)});
    withBookWriter(storage.bookDir, () => {
      const pending = createRenderCachePublication(storage), data = { fresh: true };
      pending.write(${JSON.stringify(cache)}, ${JSON.stringify(oldKey)}, data);
      pending.publish([{ pageId: 'page', version: 2, signature: inputSignature(data) }], () => {
        if (${committed}) storage.putNodeData('web-rendering', 'page', data);
        process.kill(process.pid, 'SIGKILL');
      });
    });
  `], { encoding: "utf8", timeout: 15000 })
  expect(child.signal, child.stderr).toBe("SIGKILL")
  expect(() => assertCacheReadable(cache)).toThrow("recovery")
  const reopened = createBookStorage("book", root)
  try { withBookWriter(book, () => recoverRenderCachePublication(reopened)) }
  finally { reopened.close() }
  expect(JSON.parse(fs.readFileSync(path.join(cache, `${oldKey}.json`), "utf8"))).toEqual(committed ? { fresh: true } : { old: true })
})


it.each(["edit", "restore"])("later %s cannot undo a committed fresh cache while cleaning its journal", (action) => {
  const { storage, book, cache } = setup(), attemptId = randomUUID(), generated = { fresh: true }
  try {
    const attempt = path.join(book, `.render-cache-attempt-${attemptId}`)
    fs.mkdirSync(attempt); fs.copyFileSync(path.join(cache, `${oldKey}.json`), path.join(attempt, `${oldKey}.previous`))
    storage.putNodeData("web-rendering", "page", generated)
    fs.writeFileSync(path.join(cache, `${oldKey}.json`), JSON.stringify(generated))
    fs.writeFileSync(path.join(book, RENDER_CACHE_JOURNAL), JSON.stringify({ version: 1, attemptId,
      entries: [{ hash: oldKey, existed: true }], renderings: [{ pageId: "page", version: 2, signature: inputSignature(generated) }] }))
    if (action === "edit") storage.putNodeData("web-rendering", "page", { manual: "keep" })
    else storage.setCurrentNodeVersion("web-rendering", "page", 1)
    const current = storage.getLatestNodeData("web-rendering", "page"), history = storage.getAllNodeVersions("web-rendering", "page")
    withBookWriter(book, () => recoverRenderCachePublication(storage))
    expect(storage.getLatestNodeData("web-rendering", "page")).toEqual(current)
    expect(storage.getAllNodeVersions("web-rendering", "page")).toEqual(history)
    expect(JSON.parse(fs.readFileSync(path.join(cache, `${oldKey}.json`), "utf8"))).toEqual(generated)
  } finally { storage.close() }
})
