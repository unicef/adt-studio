import fs from "node:fs"
import { expect, it, vi } from "vitest"
import { setupFullResumeFixture } from "./fixtures/full-resume.js"
import {
  runFullPipeline,
  readGenerationCatalog,
  loadBookConfig,
  storyboardCoverage,
} from "../index.js"
it(
  "does not accept partial storyboard as current through keep",
  { timeout: 60000 },
  async () => {
    const f = setupFullResumeFixture()
    try {
      const first = await runFullPipeline(f.options())
      expect(f.errors(first)).toEqual([])
      const s = f.storage()
      const row = s.getLatestNodeData("page-sectioning", "pg001")!
      const data = row.data as any
      s.putNodeData("page-sectioning", "pg001", {
        ...data,
        sections: [
          ...data.sections,
          { ...data.sections[0], sectionId: "pg001_sec999", sectionIndex: 1 },
        ],
      })
      const read = () =>
        readGenerationCatalog({
          storage: s,
          config: loadBookConfig(
            "book",
            f.options().booksRoot,
            f.options().configPath,
          ),
          bookDir: s.bookDir!,
          promptsDir: f.options().promptsDir,
          templatesDir: f.options().templatesDir,
        }).find((o) => o.identity.kind === "storyboard")!
      const before = read()
      const html = s.getLatestNodeData("web-rendering", "pg001")!.data as any
      s.putNodeData("web-rendering", "pg001", { ...html, source: "manual" })
      const prior = read()
      s.putNodeData("web-rendering", "pg001", {
        ...html,
        source: "manual",
        generationEvidence: {
          ...html.generationEvidence,
          review: {
            signature: prior.signature,
            contentHash: prior.contentHash,
            action: "keep",
          },
        },
      })
      const coverage = storyboardCoverage(s)
      const output = read()
      s.close()
      const result = await runFullPipeline({
        ...f.options(),
        fromStage: "storyboard",
        toStage: "storyboard",
      })
      expect(coverage.complete).toBe(false)
      expect(output.current).toBe(false)
      expect(result.resume?.status).not.toBe("complete")
    } finally {
      vi.unstubAllGlobals()
      vi.unstubAllEnvs()
      fs.rmSync(f.root, { recursive: true, force: true })
    }
  },
)
