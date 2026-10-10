/**
 * Dependency probe, deliberately outside the normal test suite.
 * Run after `pnpm build`: node scripts/probes/spec-0002-foundation.mjs
 * Exits 1 while the real HTTP run route destroys saved content/history before
 * the worker runs. Uses only a disposable book; never contacts a model provider.
 * This probes admission/preparation, not completed generation or preview/export.
 */
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createBookStorage } from "../../packages/storage/dist/index.js"
import { createTextCatalogRoutes } from "../../apps/api/dist/routes/text-catalog.js"
import { createTocRoutes } from "../../apps/api/dist/routes/toc.js"
import { createStageRoutes } from "../../apps/api/dist/routes/stages.js"
import { createStageService } from "../../apps/api/dist/services/stage-service.js"
import { createBookEventBus } from "../../apps/api/dist/services/book-event-bus.js"
import { createPageErrorDecisions } from "../../apps/api/dist/services/page-error-decisions.js"

const booksDir = fs.mkdtempSync(path.join(os.tmpdir(), "spec0002-foundation-"))
const configPath = path.join(booksDir, "config.yaml")
fs.writeFileSync(configPath, 'structure_types: {}\nrole_types: {}\ndefault_model: "ollama:llama3"\n')
const observations = []

try {
  for (const stage of ["translate", "toc", "sectioning"]) {
    const label = `probe-${stage}`
    const storage = createBookStorage(label, booksDir)
    storage.close()
    const eventBus = createBookEventBus()
    const decisions = createPageErrorDecisions(eventBus)
    const snapshot = () => {
      const book = createBookStorage(label, booksDir)
      try {
        return [
          ["text-catalog-translation", "fr"],
          ["toc-generation", "book"],
        ].map(([node, itemId]) => ({
          node,
          current: book.getLatestNodeData(node, itemId),
          history: book.getAllNodeVersions(node, itemId),
        }))
      } finally {
        book.close()
      }
    }
    let atWorkerEntry
    const service = createStageService({
      async run() {
        atWorkerEntry = snapshot()
        throw new Error("Intentional worker failure before generation")
      },
    }, eventBus, decisions)
    let dispose
    const failed = new Promise((resolve) => {
      dispose = eventBus.addListener(label, (event) => {
        if (event.type === "stage-run-error") resolve()
      })
    })
    const app = createTextCatalogRoutes(booksDir)
    app.route("/", createTocRoutes(booksDir))
    app.route("/", createStageRoutes(service, eventBus, decisions, booksDir, "", "", configPath))
    const put = async (suffix, data) => {
      const response = await app.request(`/books/${label}/${suffix}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      assert.equal(response.status, 200, await response.text())
    }
    for (const text of ["Initial translation", "Human correction"]) {
      await put("text-catalog-translation/fr", {
        entries: [{ id: "pg001_t001", text }],
        generatedAt: "2026-10-10T00:00:00.000Z",
      })
      await put("toc", {
        entries: [{ id: "toc_001", title: text, sectionId: "pg001_sec001", href: "pg001_sec001.html", chapterId: "ch1", level: 1 }],
        pageCount: 1,
        generatedAt: "2026-10-10T00:00:00.000Z",
      })
    }
    const before = snapshot()
    assert.ok(before.every((entry) => entry.current && entry.history.length === 2))
    const response = await app.request(`/books/${label}/stages/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromStage: stage, toStage: stage }),
    })
    assert.equal(response.status, 200, await response.text())
    await failed
    dispose()
    const after = snapshot()
    const preserved = JSON.stringify(before) === JSON.stringify(after)
    observations.push({ stage, preserved, before, atWorkerEntry, after })
  }
  console.log(JSON.stringify(observations, null, 2))
  if (observations.some((entry) => !entry.preserved)) {
    console.error("BLOCKED: SPEC-0001 preservation foundation is incomplete; saved output/history was lost before generation.")
    process.exitCode = 1
  }
} finally {
  fs.rmSync(booksDir, { recursive: true, force: true })
}
