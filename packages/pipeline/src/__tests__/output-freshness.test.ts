import { describe, expect, it } from "vitest"
import { deriveOutputStatus, inputSignature, needsOutputGeneration, outputEvidence, selectedOutput, summarizeOutputs } from "../output-freshness.js"

const identity = { kind: "translation" as const, id: "pg001_tx001", language: "fr" }
describe("catalog output freshness", () => {
  it("canonicalizes object keys but preserves input reading order and context", () => {
    expect(inputSignature({ text: "A", language: "fr" })).toBe(inputSignature({ language: "fr", text: "A" }))
    expect(inputSignature(["A", "B"])).not.toBe(inputSignature(["B", "A"]))
    expect(inputSignature({ text: "A", voice: "one" })).not.toBe(inputSignature({ text: "A", voice: "two" }))
  })

  it("keeps unknown authorship protected and makes review independent from authorship", () => {
    const options = { identity, signature: "new", content: "Bonjour", usable: true }
    expect(deriveOutputStatus(options)).toMatchObject({ protected: true, current: false, updateNeeded: false, warnings: [{ reason: "legacy" }] })
    const reviewed = deriveOutputStatus({ ...options, metadata: { review: { signature: "new", contentHash: inputSignature("Bonjour"), action: "keep" } } })
    expect(reviewed).toMatchObject({ protected: true, manual: false, current: true, warnings: [] })
    expect(needsOutputGeneration(reviewed)).toBe(false)
    expect(deriveOutputStatus({ ...options, signature: "changed-again", metadata: { review: { signature: "new", contentHash: inputSignature("Bonjour"), action: "keep" } } }).current).toBe(false)
  })

  it("does not regenerate matching audio solely to clear an upstream review warning", () => {
    const upstream = deriveOutputStatus({ identity, signature: "new source", content: "French edit", metadata: { source: "manual" }, usable: true })
    const metadata = { source: "ai" as const, input: outputEvidence("speech inputs", "audio bytes") }
    const status = deriveOutputStatus({ identity: { kind: "audio", id: identity.id, language: "fr" }, signature: "speech inputs", content: "audio bytes", metadata, usable: true, upstream: [upstream] })
    expect(status).toMatchObject({ current: false, warnings: [{ reason: "upstream", source: identity }] })
    expect(needsOutputGeneration(status, metadata)).toBe(false)
  })

  it("a checked fallback cannot accept changed audio or approve an upstream translation", () => {
    const metadata = { source: "ai" as const, input: outputEvidence("inputs", "audio"), review: { signature: "inputs", contentHash: inputSignature("audio"), action: "checked" as const } }
    const upstream = deriveOutputStatus({ identity, signature: "new", content: "French", usable: true })
    const status = deriveOutputStatus({ identity, signature: "inputs", content: "audio", usable: true, fallback: "failed", metadata, upstream: [upstream] })
    expect(status.warnings).toEqual([{ reason: "upstream", source: identity }])
    expect(status.current).toBe(false)
    expect(deriveOutputStatus({ identity, signature: "changed", content: "audio", usable: true, fallback: "failed", metadata }).warnings).toEqual([{ reason: "preparation-failed" }])
  })

  it("counts each output once in each applicable category and excludes pruned work", () => {
    const status = deriveOutputStatus({ identity, signature: "new", content: null, usable: false, fallback: "missing" })
    expect(summarizeOutputs([status, status, { ...status, identity: { ...identity, id: "excluded" }, excluded: true }])).toEqual({ updates: 0, warnings: 1, missing: 1 })
    expect(selectedOutput({ ...status, pageIds: ["pg001"] }, { pageIds: ["pg002"] })).toBe(false)
    expect(selectedOutput({ ...status, sectionIds: ["stable-section"] }, { sectionIds: ["stable-section"] })).toBe(true)
  })
})
