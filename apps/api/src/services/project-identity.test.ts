import { createHash } from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  PROJECT_IDENTITY_FILE,
  ensureProjectIdentity,
  readProjectIdentity,
} from "./project-identity.js"

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-project-identity-"))
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe("project identity", () => {
  it("lazily creates one stable identity and fingerprints the source PDF", () => {
    const bookDir = path.join(tmpDir, "hyena-and-raven")
    const pdf = Buffer.from("%PDF-1.0 stable source")
    fs.mkdirSync(bookDir)
    fs.writeFileSync(path.join(bookDir, "hyena-and-raven.pdf"), pdf)

    const first = ensureProjectIdentity(bookDir)
    const second = ensureProjectIdentity(bookDir)

    expect(second).toEqual(first)
    expect(first).toMatchObject({
      version: 1,
      sourceKind: "pdf",
      sourceFingerprint: createHash("sha256").update(pdf).digest("hex"),
    })
    expect(first.projectId).toMatch(/^[0-9a-f-]{36}$/)
    expect(readProjectIdentity(bookDir)).toEqual(first)
    expect(fs.existsSync(path.join(bookDir, PROJECT_IDENTITY_FILE))).toBe(true)
  })

  it("creates an imported-ADT identity without inventing a source PDF fingerprint", () => {
    const bookDir = path.join(tmpDir, "imported-book")
    fs.mkdirSync(bookDir)

    const identity = ensureProjectIdentity(bookDir, {
      sourceKind: "imported-adt",
      derivedFromProjectId: "234fdd34-315b-4c4d-a491-7708b22b45d2",
    })

    expect(identity).toMatchObject({
      sourceKind: "imported-adt",
      sourceFingerprint: null,
      derivedFromProjectId: "234fdd34-315b-4c4d-a491-7708b22b45d2",
    })
  })
})
