import fs from "node:fs"
import { expect, it, vi } from "vitest"
import { setupFullResumeFixture } from "./fixtures/full-resume.js"
import { runFullPipeline } from "../index.js"
it(
  "targeted missing sectioning does not fill unselected page",
  { timeout: 60000 },
  async () => {
    const f = setupFullResumeFixture()
    try {
      fs.writeFileSync(
        f.options().configPath,
        fs
          .readFileSync(f.options().configPath, "utf8")
          .replace("end_page: 1", "end_page: 2"),
      )
      const initial = await runFullPipeline({
        ...f.options(),
        toStage: "extract",
      })
      expect(f.errors(initial)).toEqual([])
      const seed = f.storage()
      for (const page of seed.getPages())
        seed.putNodeData("web-rendering", page.pageId, { sections: [] })
      seed.close()
      const calls = f.transport.mock.calls.length
      const result = await runFullPipeline({
        ...f.options(),
        fromStage: "sectioning",
        toStage: "sectioning",
        outputScope: {
          selection: { identities: [{ kind: "sectioning", id: "pg001" }] },
        },
      })
      const s = f.storage()
      const pages = s.getPages()
      const versions = pages.map((p) => [
        p.pageId,
        s.getSelectedNodeVersion("page-sectioning", p.pageId),
      ])
      s.close()
      expect(versions).toEqual([
        ["pg001", 1],
        ["pg002", null],
      ])
    } finally {
      vi.unstubAllGlobals()
      vi.unstubAllEnvs()
      fs.rmSync(f.root, { recursive: true, force: true })
    }
  },
)
