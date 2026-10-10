import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { storeImmutableAsset } from "../immutable-assets.js"

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }) })
function book() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "adt-retained-assets-"))
  roots.push(root)
  return root
}

describe("retained physical assets", () => {
  it("keeps prior playable bytes when a new result is abandoned and after cache cleanup", () => {
    const root = book()
    const first = storeImmutableAsset(root, ["audio", "fr"], "pg001_tx001", "mp3", Buffer.from("old audio"))
    const second = storeImmutableAsset(root, ["audio", "fr"], "pg001_tx001", "mp3", Buffer.from("new audio"))
    fs.mkdirSync(path.join(root, ".cache"))
    fs.rmSync(path.join(root, ".cache"), { recursive: true })
    expect(second.fileName).not.toBe(first.fileName)
    expect(fs.readFileSync(path.join(root, "audio/fr", first.fileName), "utf8")).toBe("old audio")
    expect(fs.readFileSync(path.join(root, "audio/fr", second.fileName), "utf8")).toBe("new audio")
    expect(storeImmutableAsset(root, ["audio", "fr"], "pg001_tx001", "mp3", Buffer.from("old audio"))).toEqual(first)
    expect(fs.readdirSync(path.join(root, "audio/fr")).some((name) => name.startsWith(".pending-"))).toBe(false)
  })

  it("rejects corruption and never overwrites a retained file", () => {
    const root = book()
    const result = storeImmutableAsset(root, ["audio", "en"], "text", "wav", Buffer.from("recording"))
    const file = path.join(root, "audio/en", result.fileName)
    fs.writeFileSync(file, "corrupted")
    expect(() => storeImmutableAsset(root, ["audio", "en"], "text", "wav", Buffer.from("recording"))).toThrow("content identity")
    expect(fs.readFileSync(file, "utf8")).toBe("corrupted")
  })

  it.each(["escape", "dangling"])("fails closed on %s directory symlinks", (kind) => {
    const root = book()
    const outside = book()
    fs.symlinkSync(kind === "escape" ? outside : path.join(outside, "missing"), path.join(root, "audio"))
    expect(() => storeImmutableAsset(root, ["audio", "en"], "text", "mp3", Buffer.from("new"))).toThrow()
    expect(fs.readdirSync(outside)).toEqual([])
  })
})
