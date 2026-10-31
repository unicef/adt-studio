import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { requireSafePathSegment, resolvePathWithin } from "./path-security.js"

describe("resolvePathWithin", () => {
  let root: string
  let base: string
  let outside: string
  beforeEach(() => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "adt-path-security-")))
    base = path.join(root, "base")
    outside = path.join(root, "base-private")
    fs.mkdirSync(base)
    fs.mkdirSync(outside)
  })
  afterEach(() => {
    vi.restoreAllMocks()
    fs.rmSync(root, { recursive: true, force: true })
  })

  it("rejects lexical traversal, prefix siblings and absolute escapes", () => {
    expect(resolvePathWithin(base, "../base-private/secret")).toBeNull()
    expect(resolvePathWithin(base, outside)).toBeNull()
    expect(resolvePathWithin(base, "audio", "../images/secret")).toBeNull()
  })

  it("allows missing nested directories and files beneath a checked ancestor", () => {
    const target = resolvePathWithin(base, "audio", "en", "new.wav")
    expect(target).toBe(path.join(base, "audio", "en", "new.wav"))
    expect(fs.existsSync(path.join(base, "audio"))).toBe(false)
    fs.mkdirSync(path.dirname(target!), { recursive: true })
    fs.writeFileSync(target!, "audio")
    expect(fs.readFileSync(target!, "utf8")).toBe("audio")
  })

  it("preserves a configured root that is itself a symlink", () => {
    fs.symlinkSync(base, path.join(root, "configured"), "junction")
    expect(resolvePathWithin(path.join(root, "configured"), "new.wav"))
      .toBe(path.join(root, "configured", "new.wav"))
  })

  it("preserves contained file and directory aliases after canonical checks", () => {
    fs.mkdirSync(path.join(base, "actual"))
    fs.writeFileSync(path.join(base, "actual", "sound.wav"), "audio")
    fs.symlinkSync(path.join(base, "actual"), path.join(base, "alias"), "junction")
    fs.symlinkSync(path.join(base, "actual", "sound.wav"), path.join(base, "sound.wav"))
    expect(resolvePathWithin(base, "alias", "new.wav")).toBe(path.join(base, "alias", "new.wav"))
    expect(resolvePathWithin(base, "sound.wav")).toBe(path.join(base, "sound.wav"))
  })

  it("rejects existing file links outside the base", () => {
    fs.writeFileSync(path.join(outside, "secret"), "secret")
    fs.symlinkSync(path.join(outside, "secret"), path.join(base, "sound.wav"))
    expect(resolvePathWithin(base, "sound.wav")).toBeNull()
  })

  it("checks existing ancestors of missing files", () => {
    fs.symlinkSync(outside, path.join(base, "alias"), "junction")
    expect(resolvePathWithin(base, "alias/new.wav")).toBeNull()
    expect(resolvePathWithin(base, "alias/missing/deeper/new.wav")).toBeNull()
    expect(fs.readdirSync(outside)).toEqual([])
  })

  it("rejects dangling leaf and ancestor links, including in-base destinations", () => {
    fs.symlinkSync(path.join(outside, "new.wav"), path.join(base, "sound.wav"))
    fs.symlinkSync(path.join(base, "missing"), path.join(base, "directory"), "junction")
    expect(resolvePathWithin(base, "sound.wav")).toBeNull()
    expect(resolvePathWithin(base, "directory/new.wav")).toBeNull()
  })

  it("rejects a linked intermediate boundary even when the final file returns inside", () => {
    fs.writeFileSync(path.join(base, "inside.wav"), "audio")
    fs.symlinkSync(outside, path.join(base, "audio"), "junction")
    fs.symlinkSync(path.join(base, "inside.wav"), path.join(outside, "sound.wav"))
    expect(resolvePathWithin(base, "audio", "sound.wav")).toBeNull()
  })

  it("rejects symlink cycles and non-directory ancestors", () => {
    fs.symlinkSync(path.join(base, "loop"), path.join(base, "loop"))
    fs.writeFileSync(path.join(base, "file"), "file")
    expect(resolvePathWithin(base, "loop")).toBeNull()
    expect(resolvePathWithin(base, "file/child")).toBeNull()
    expect(resolvePathWithin(base, "bad\0name")).toBeNull()
  })

  it.each(["EACCES", "EIO"])("fails closed on %s", (code) => {
    vi.spyOn(fs, "realpathSync").mockImplementation(() => { throw Object.assign(new Error(code), { code }) })
    expect(resolvePathWithin(base, "new.wav")).toBeNull()
  })
})

describe("requireSafePathSegment", () => {
  it.each(["en", "pt-BR", "pt_BR"])("accepts locale %s", (value) => {
    expect(requireSafePathSegment(value, "language")).toBe(value)
  })
  it.each(["../outside", "..\\outside", "/outside", "..", "", "en\0"])("rejects unsafe segment %j", (value) => {
    expect(() => requireSafePathSegment(value, "language")).toThrow()
  })
})
