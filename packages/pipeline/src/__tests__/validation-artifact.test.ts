import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import { afterEach, expect, it } from "vitest"
import { createBookStorage } from "@adt/storage"
import { PageSectioningOutput } from "@adt/types"
import { stampGeneratedRendering } from "../sectioning-sync-evidence.js"
import { writeValidationArtifact, readValidationArtifact, validationArtifactHash } from "../validation-artifact.js"
import { runAccessibilityAssessment } from "../accessibility-assessment.js"

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }) })
it("a new validation run records separate evidence while original verdicts retain the tested artifact", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "validation-evidence-")); roots.push(root)
  const storage = createBookStorage("book", root), book = storage.bookDir!, adt = path.join(book, "adt")
  try {
    storage.putExtractedPage({ pageId: "pg001", pageNumber: 1, text: "Text", images: [], pageImage: { imageId: "pg001_page", buffer: Buffer.from("image"), format: "png", hash: "hash", width: 1, height: 1 } })
    const source = PageSectioningOutput.parse({ reasoning: "source", sections: [{ sectionId: "pg001_sec009", sectionType: "text", nodes: [{ nodeId: "text", role: "text", text: "Text", isPruned: false }], backgroundColor: "#fff", textColor: "#000", pageNumber: 1, isPruned: false }] })
    storage.putNodeData("page-sectioning", "pg001", source)
    storage.putNodeData("web-rendering", "pg001", stampGeneratedRendering({ sections: [{ sectionIndex: 0, sectionType: "text", reasoning: "AI", html: '<section data-section-id="pg001_sec009"><img src="missing.png"><p data-id="text">Text</p></section>' }] }, source, "pg001", 1))
    fs.mkdirSync(path.join(adt, "content"), { recursive: true })
    const entries = [{ section_id: "pg001_sec009", href: "page.html", page_number: 1 }]
    fs.writeFileSync(path.join(adt, "content/pages.json"), JSON.stringify(entries))
    const html = '<html lang="en"><head><title>Fixture</title></head><body><main><img src="missing.png"><p>Text</p></main></body></html>'
    fs.writeFileSync(path.join(adt, "page.html"), html); writeValidationArtifact(storage, adt, entries)
    const first = await runAccessibilityAssessment({ bookDir: book, config: { run_only_tags: ["wcag2a"], disabled_rules: [] } })
    expect(first.pages[0].violations.some((rule) => rule.id === "image-alt")).toBe(true)
    expect(first.artifact?.sections[0]).toMatchObject({ sectionId: "pg001_sec009", sourceVersion: 1, renderingVersion: 1 })
    for (const name of [".build-hash", ".build-version", ".build-warnings"]) fs.writeFileSync(path.join(adt, name), "packaging bookkeeping after assessment")
    expect(validationArtifactHash(adt)).toBe(first.artifactHash)
    const version = storage.putNodeData("accessibility-assessment", "book", first), original = JSON.stringify(first)
    fs.writeFileSync(path.join(adt, "page.html"), html.replace('<img src="missing.png">', '<img src="missing.png" alt="Meaningful description">'))
    expect(readValidationArtifact(adt)?.sections).toEqual([]) // Edited bytes do not retain old association.
    writeValidationArtifact(storage, adt, entries)
    const second = await runAccessibilityAssessment({ bookDir: book, config: { run_only_tags: ["wcag2a"], disabled_rules: [] } })
    expect(second.pages[0].violations.some((rule) => rule.id === "image-alt")).toBe(false)
    expect(second.artifactHash).not.toBe(first.artifactHash)
    expect(storage.putNodeData("accessibility-assessment", "book", second)).toBeGreaterThan(version)
    expect(JSON.stringify(storage.getAllNodeVersions("accessibility-assessment", "book")[0].data)).toBe(original)
  } finally { storage.close() }
})
