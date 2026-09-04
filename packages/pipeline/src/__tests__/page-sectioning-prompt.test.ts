import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

describe("page sectioning prompt", () => {
  it("detects TOC continuation pages without a repeated heading", () => {
    const prompt = fs.readFileSync(
      path.join(process.cwd(), "prompts", "page_sectioning.liquid"),
      "utf8",
    )

    expect(prompt).toContain("Table-of-contents continuation detection")
    expect(prompt).toContain("continuation pages often begin directly with the next chapter or unit")
    expect(prompt).toContain("This repeated row pattern is sufficient even when the TOC heading is absent")
    expect(prompt).toContain("NOT writable response lines")
  })

  it("classifies oral discussions and classroom projects as activities", () => {
    const prompt = fs.readFileSync(
      path.join(process.cwd(), "prompts", "page_sectioning.liquid"),
      "utf8",
    )
    const refinement = fs.readFileSync(
      path.join(process.cwd(), "prompts", "page_sectioning_refinement.liquid"),
      "utf8",
    )

    expect(prompt).toContain("ORAL / DISCUSSION ACTIVITY PRECEDENCE")
    expect(prompt).toContain("TROCANDO IDEIAS")
    expect(prompt).toContain("PROJECT / PRODUCTION ACTIVITY PRECEDENCE")
    expect(prompt).toContain("ACTIVITY / EXPOSITION BOUNDARY")
    expect(refinement).toContain("Unwritten activity detection")
    expect(refinement).toContain("Activity boundaries")
  })
})
