import { describe, expect, it } from "vitest"
import { buildUnreadableRepairPrompt, canRepairByEditing } from "./repair-prompt"

describe("canRepairByEditing", () => {
  it("accepts errors in the archive's files", () => {
    expect(canRepairByEditing("Archive file is not valid JSON: manifest.json")).toBe(true)
    expect(canRepairByEditing("ADT bundle is missing page HTML: 12.html")).toBe(true)
    expect(canRepairByEditing("Legacy ADT export is missing assets/config.json")).toBe(true)
  })

  it("rejects a corrupt ZIP and size or entry limits", () => {
    expect(canRepairByEditing("Invalid or unsupported ADT ZIP bundle")).toBe(false)
    expect(canRepairByEditing("ADT bundle exceeds the expanded archive size limit")).toBe(false)
    expect(canRepairByEditing("ADT bundle contains too many archive entries")).toBe(false)
    expect(canRepairByEditing("ADT bundle file exceeds its size limit: a.png")).toBe(false)
  })
})

describe("buildUnreadableRepairPrompt", () => {
  it("quotes the error as data and points at the archive's guide", () => {
    const prompt = buildUnreadableRepairPrompt("book.zip", "Archive file is not valid JSON: manifest.json")
    expect(prompt).toContain("book.zip")
    expect(prompt).toContain("<import_error>\nArchive file is not valid JSON: manifest.json\n</import_error>")
    expect(prompt).toContain("AGENTS.md")
    expect(prompt).not.toContain("editingContract.pageOrder")
  })

  it("explains the editing contract rules when the error is in it", () => {
    const prompt = buildUnreadableRepairPrompt(
      "book.zip",
      "Archive file has an invalid shape: manifest.json at editingContract.nonActivities.0.sectionId: Section cannot be both an activity and a non-activity: pg012_sec002",
    )
    expect(prompt).toContain("a section id may appear in only one of the two lists")
    expect(prompt).toContain("editingContract.pageOrder")
  })
})
