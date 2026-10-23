import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { expect, it } from "vitest"
import { createBookStorage } from "@adt/storage"
import { SOURCE_GENERATION_RESET_STEPS } from "@adt/types"
import { createBookTools } from "../tools/book-tools.js"

it.each(["cosmetic", "legacy-cosmetic", "redistributed-text"])("preserves native source metadata or resets attempts for %s agent edits", async (mode) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "adt-update-compat-"))
  const storage = createBookStorage("book", root)
  storage.putExtractedPage({ pageId: "pg001", pageNumber: 1, text: "", pageImage: { imageId: "pg001_page", buffer: Buffer.from("page"), format: "png", hash: "fixture", width: 100, height: 100 }, images: [] })
  try {
    const ownedHtml = '<section data-section-id="pg001_sec001"><h2 data-id="pg001_t001">One</h2><p data-id="pg001_t002">Two</p></section>'
    const html = mode === "legacy-cosmetic" ? ownedHtml.replace(' data-section-id="pg001_sec001"', "") : ownedHtml
    const cosmetic = mode !== "redistributed-text"
    const source = { sectionId: "pg001_sec001", sectionType: "text", backgroundColor: "white", textColor: "black", pageNumber: 7, isPruned: false,
      nodes: [{ nodeId: "native_container", structure: "section", isPruned: false, children: [
        { nodeId: "pg001_t001", role: "heading", text: "One", headingLevel: 2, outlineEntryId: "outline-original", headingStyleClusterId: "style-original", isPruned: false },
        { nodeId: "pg001_t002", role: "text", text: "Two", isPruned: false },
        { nodeId: "pg001_t003", role: "text", text: "Retained pruned", isPruned: true },
      ] }] }
    storage.putNodeData("page-sectioning", "pg001", { reasoning: "native", sections: [source] })
    storage.putNodeData("web-rendering", "pg001", { sections: [{ sectionIndex: 0, sectionId: source.sectionId, sectionType: "text", reasoning: "native", html }] })
    for (const step of [...SOURCE_GENERATION_RESET_STEPS, "tts"]) storage.markStepCompleted(step)
    const { tools } = createBookTools({ storage, bookLabel: "book", booksDir: root, promptsDir: "", credentials: {}, restrictWritesToPageId: "pg001" })
    const next = cosmetic ? html.replace("<section", '<section style="margin:8px"') : html.replace(">One<", ">OneT<").replace(">Two<", ">wo<")
    const execute = tools.updateSection!.execute as (args: unknown, options: unknown) => Promise<{ ok: boolean }>
    expect(await execute({ pageId: "pg001", sectionIndex: 0, html: next, reasoning: mode, activityAnswers: null }, {})).toMatchObject({ ok: true })
    const current = storage.getLatestNodeData("page-sectioning", "pg001")?.data as { sections: typeof source[] }
    if (cosmetic) expect(current.sections[0]).toEqual(source)
    else expect(current.sections[0].nodes[0].children.map((node) => node.text)).toEqual(["OneT", "wo"])
    const steps = storage.getStepRuns().map((run) => run.step)
    for (const step of SOURCE_GENERATION_RESET_STEPS) expect(steps.includes(step)).toBe(step !== "toc-generation" || cosmetic)
    // Redistributing text between IDs changes the first TOC heading, but the
    // exact aggregate text sent to Quiz/Glossary remains "OneTwo".
    expect(steps).toContain("tts")
    expect(storage.getAllNodeVersions("page-sectioning", "pg001")[0].data).toEqual({ reasoning: "native", sections: [source] })
  } finally {
    storage.close()
    fs.rmSync(root, { recursive: true, force: true })
  }
})
