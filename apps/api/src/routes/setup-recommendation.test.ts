import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { Hono } from "hono"
import { extractPDF, prepareExtractionAdmission, type RecommendSetupOptions } from "@adt/pipeline"
import { AiProviderError } from "@adt/llm"
import { createBookStorage, openBookDb, readExtractionManifest, withBookWriter } from "@adt/storage"
import { z } from "zod"
import { errorHandler } from "../middleware/error-handler.js"
import { createBookRoutes } from "./books.js"
import { createDebugRoutes } from "./debug.js"
import { createSetupRecommendationRoutes, pruneSetupCache, SETUP_CACHE_MAX_AGE_MS, SETUP_PDF_MAX_BYTES } from "./setup-recommendation.js"

// Writing into the book can be made to fail.
const storageFails = vi.hoisted(() => ({ on: false }))
vi.mock("@adt/storage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@adt/storage")>()
  return {
    ...actual,
    createBookStorage: (...args: Parameters<typeof actual.createBookStorage>) => {
      if (storageFails.on) throw new Error("disk full")
      return actual.createBookStorage(...args)
    },
  }
})

// The AI readings are replaced: each test says what recommendSetup does with the PDF it is given.
const recommend = vi.hoisted(() => ({ impl: async (o: RecommendSetupOptions): Promise<unknown> => ({ id: o.id }) }))
vi.mock("@adt/pipeline", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@adt/pipeline")>()),
  recommendSetup: (o: RecommendSetupOptions) => recommend.impl(o),
}))

/** A real PDF of `pages` blank pages (mupdf has to open it). */
function blankPdf(pages: number): Uint8Array {
  const objs = ["<< /Type /Catalog /Pages 2 0 R >>", `<< /Type /Pages /Kids [${Array.from({ length: pages }, (_, i) => `${3 + i} 0 R`).join(" ")}] /Count ${pages} >>`]
  for (let i = 0; i < pages; i++) objs.push("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] >>")
  let out = "%PDF-1.4\n"
  const offsets: number[] = []
  objs.forEach((o, i) => {
    offsets.push(out.length)
    out += `${i + 1} 0 obj\n${o}\nendobj\n`
  })
  const xref = out.length
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return new TextEncoder().encode(out)
}

let tmpDir: string
let configPath: string
let app: Hono

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-setup-route-"))
  configPath = path.join(tmpDir, "config.yaml")
  fs.writeFileSync(configPath, "structure_types: {}\nrole_types: {}\n")
  app = new Hono()
  app.onError(errorHandler)
  app.route("/", createSetupRecommendationRoutes(tmpDir, path.resolve("prompts"), configPath))
  app.route("/", createBookRoutes(tmpDir))
  app.route("/", createDebugRoutes(tmpDir, path.resolve("prompts"), configPath))
})
afterEach(() => {
  storageFails.on = false
  fs.rmSync(tmpDir, { recursive: true, force: true })
  recommend.impl = async (o) => ({ id: o.id })
})

const pdfForm = (bytes: Uint8Array, name = "book.pdf", type = "application/pdf") => {
  const f = new FormData()
  f.append("pdf", new Blob([bytes], { type }), name)
  return f
}
const recommendFor = async (bytes: Uint8Array) => {
  const res = await app.request("/setup-recommendation", { method: "POST", body: pdfForm(bytes) })
  expect(res.status).toBe(200)
  return ((await res.json()) as { id: string }).id
}
const createBook = async (label: string, bytes: Uint8Array, id: string) => {
  const f = pdfForm(bytes)
  f.append("label", label)
  f.append("setupRecommendationId", id)
  const res = await app.request("/books", { method: "POST", body: f })
  expect(res.status).toBe(201)
  return (await res.json()) as { setupRecommendationWarning?: { reason: string; message: string } }
}

describe("POST /setup-recommendation", () => {
  const failure = async (res: Response) => ({ status: res.status, ...((await res.json()) as { code?: string; error: string }) })

  it("refuses a file that isn't a PDF", async () => {
    const res = await app.request("/setup-recommendation", { method: "POST", body: pdfForm(new TextEncoder().encode("hello"), "notes.txt", "text/plain") })
    expect(await failure(res)).toMatchObject({ status: 400, code: "pdf-invalid" })
  })

  it("refuses a PDF over the size cap before reading it (413)", async () => {
    let called = false
    recommend.impl = async (o) => {
      called = true
      return { id: o.id }
    }
    const res = await app.request("/setup-recommendation", {
      method: "POST",
      body: pdfForm(blankPdf(1)),
      headers: { "content-length": String(SETUP_PDF_MAX_BYTES + 2 * 1024 * 1024) },
    })
    expect(await failure(res)).toMatchObject({ status: 413, code: "pdf-too-large" })
    expect(called).toBe(false)
  })

  it("refuses a PDF with no pages without calling the AI (422)", async () => {
    let called = false
    recommend.impl = async (o) => {
      called = true
      return { id: o.id }
    }
    const res = await app.request("/setup-recommendation", { method: "POST", body: pdfForm(blankPdf(0)) })
    expect(await failure(res)).toMatchObject({ status: 422, code: "pdf-no-pages" })
    expect(called).toBe(false)
  })

  it("stops the readings when the client goes away, and keeps nothing", async () => {
    const controller = new AbortController()
    let seen: AbortSignal | undefined
    recommend.impl = (o) =>
      new Promise((_, reject) => {
        seen = o.signal
        o.signal?.addEventListener("abort", () => reject(o.signal?.reason))
        controller.abort()
      })
    const errors = vi.spyOn(console, "error").mockImplementation(() => {})
    const res = await app.request("/setup-recommendation", { method: "POST", body: pdfForm(blankPdf(1)), signal: controller.signal })
    errors.mockRestore()
    expect(seen?.aborted).toBe(true)
    expect(res.status).not.toBe(200)
  })

  it("passes a missing provider key on with its code (400), not as a 502", async () => {
    recommend.impl = async () => {
      throw new AiProviderError("missing-credential", "OpenAI needs an API key.", { providerId: "openai", credentialKey: "apiKey" })
    }
    const res = await app.request("/setup-recommendation", { method: "POST", body: pdfForm(blankPdf(2)) })
    expect(await failure(res)).toMatchObject({ status: 400, code: "missing-credential" })
  })

  it("says the PDF is at fault (422, not a provider error) when its pages can't be drawn", async () => {
    recommend.impl = async (o) => {
      await o.renderPages([{ pages: [99], size: 100 }]) // a page the 2-page PDF doesn't have
      return { id: o.id }
    }
    const res = await app.request("/setup-recommendation", { method: "POST", body: pdfForm(blankPdf(2)) })
    expect(await failure(res)).toMatchObject({ status: 422, code: "pdf-pages-unreadable" })
  })

  it("reports an AI service failure as 502", async () => {
    recommend.impl = async () => {
      throw new Error("HTTP 500 from the provider")
    }
    const res = await app.request("/setup-recommendation", { method: "POST", body: pdfForm(blankPdf(2)) })
    expect(await failure(res)).toMatchObject({ status: 502, code: "ai-provider-failed", error: "HTTP 500 from the provider" })
  })
})

describe("saving the recommendation with the book", () => {
  it("saves it into a book made from the same PDF", async () => {
    const pdf = blankPdf(2)
    const id = await recommendFor(pdf)
    const book = await createBook("same-pdf", pdf, id)
    expect(book.setupRecommendationWarning).toBeUndefined()
    expect(fs.existsSync(path.join(tmpDir, "same-pdf", "setup-recommendation.json"))).toBe(true)
  })

  it("doesn't save it into a book made from a different PDF", async () => {
    const id = await recommendFor(blankPdf(2))
    const book = await createBook("other-pdf", blankPdf(3), id)
    expect(book.setupRecommendationWarning).toMatchObject({ reason: "other-pdf", message: expect.stringMatching(/different PDF/) })
    expect(fs.existsSync(path.join(tmpDir, "other-pdf", "setup-recommendation.json"))).toBe(false)
  })

  it("writes the readings' AI calls into the book's LLM log, and the recommendation alone into its folder", async () => {
    // A model id no provider knows: the call fails before any network, and is still logged.
    fs.writeFileSync(configPath, "structure_types: {}\nrole_types: {}\ndefault_model: nowhere:model\n")
    recommend.impl = async (o) => {
      await o.model
        .generateObject({ schema: z.object({}), prompt: "setup_recommender_questions", context: { pages: [] }, log: { taskType: "setup-recommender", promptName: "setup_recommender_questions" } })
        .catch(() => undefined)
      return { id: o.id }
    }
    const pdf = blankPdf(2)
    await createBook("logged", pdf, await recommendFor(pdf))
    const db = openBookDb(path.join(tmpDir, "logged", "logged.db"))
    try {
      const rows = db.all("SELECT step, data FROM llm_log") as { step: string; data: string }[]
      expect(rows).toHaveLength(1)
      expect(rows[0].step).toBe("setup-recommender")
      expect(JSON.parse(rows[0].data).promptName).toBe("setup_recommender_questions")
    } finally {
      db.close()
    }
    const saved = JSON.parse(fs.readFileSync(path.join(tmpDir, "logged", "setup-recommendation.json"), "utf8"))
    expect(saved.recommendation.id).toBeTruthy()
    expect(saved.llmLog).toBeUndefined()
  })

  it("saves the page images the AI was sent into the book, under the hash its LLM log names them by", async () => {
    fs.writeFileSync(configPath, "structure_types: {}\nrole_types: {}\ndefault_model: nowhere:model\n")
    recommend.impl = async (o) => {
      // Two pages are drawn, only the first is sent: only that one is saved.
      const [drawn] = await o.renderPages([{ pages: [1, 2], size: 64 }])
      const image = Buffer.from(drawn!.get(1)!).toString("base64")
      await o.model
        .generateObject({ schema: z.object({}), prompt: "setup_recommender_questions", context: { page_count: 2, shown_pages: [1], pages: [{ number: 1, text: "", image }] }, log: { taskType: "setup-recommender", promptName: "setup_recommender_questions" } })
        .catch(() => undefined)
      return { id: o.id }
    }
    const pdf = blankPdf(2)
    await createBook("imaged", pdf, await recommendFor(pdf))
    const db = openBookDb(path.join(tmpDir, "imaged", "imaged.db"))
    let hashes: string[]
    try {
      const [row] = db.all("SELECT data FROM llm_log") as { data: string }[]
      const entry = JSON.parse(row!.data) as { messages: { content: { type: string; hash?: string }[] }[] }
      hashes = entry.messages.flatMap((m) => m.content.filter((p) => p.type === "image").map((p) => p.hash!))
    } finally {
      db.close()
    }
    expect(hashes).toHaveLength(1)
    expect(fs.readdirSync(path.join(tmpDir, "imaged", ".debug-images"))).toEqual([`${hashes[0]}.png`])
    const res = await app.request(`/books/imaged/debug/llm-image/${hashes[0]}`)
    expect(res.status).toBe(200)
  })

  describe("a book made with the setup notes can still be extracted", () => {
    /** A book made from a recommendation whose AI call was sent page 1's image: notes, log row and image saved. */
    const bookWithNotes = async (label: string) => {
      fs.writeFileSync(configPath, "structure_types: {}\nrole_types: {}\ndefault_model: nowhere:model\n")
      recommend.impl = async (o) => {
        const [drawn] = await o.renderPages([{ pages: [1], size: 64 }])
        const image = Buffer.from(drawn!.get(1)!).toString("base64")
        await o.model
          .generateObject({ schema: z.object({}), prompt: "setup_recommender_questions", context: { page_count: 2, shown_pages: [1], pages: [{ number: 1, text: "", image }] }, log: { taskType: "setup-recommender", promptName: "setup_recommender_questions" } })
          .catch(() => undefined)
        return { id: o.id }
      }
      const pdf = blankPdf(2)
      await createBook(label, pdf, await recommendFor(pdf))
      const bookDir = path.join(tmpDir, label)
      expect(fs.readdirSync(path.join(bookDir, ".debug-images"))).toHaveLength(1)
      return { bookDir, storage: createBookStorage(label, tmpDir), options: { pdfPath: path.join(bookDir, `${label}.pdf`), startPage: 1, endPage: 2 } }
    }

    it("extracts, keeping the notes, their LLM log and their images", async () => {
      const { bookDir, storage, options } = await bookWithNotes("noted")
      try {
        expect(await extractPDF(options, storage, { emit() {} })).toBe("extracted")
      } finally {
        storage.close()
      }
      expect(readExtractionManifest(bookDir)?.status).toBe("complete")
      expect(fs.existsSync(path.join(bookDir, "setup-recommendation.json"))).toBe(true)
      expect(fs.readdirSync(path.join(bookDir, ".debug-images"))).toHaveLength(1)
    })

    it("still refuses an image the setup notes' AI calls don't name", async () => {
      const { bookDir, storage, options } = await bookWithNotes("stray")
      storage.close()
      fs.writeFileSync(path.join(bookDir, ".debug-images", "0123456789abcdef.png"), "x")
      expect(() => withBookWriter(bookDir, () => prepareExtractionAdmission(bookDir, options))).toThrow("EXTRACTION_LEGACY")
    })

    it("still refuses LLM log rows from any other step", async () => {
      const { bookDir, storage, options } = await bookWithNotes("other-step")
      try {
        storage.appendLlmLog({ requestId: "r", timestamp: new Date().toISOString(), taskType: "image-filtering", promptName: "p", modelId: "m", cacheHit: false, success: true, errorCount: 0, attempt: 0, durationMs: 1, messages: [] } as never)
      } finally {
        storage.close()
      }
      expect(() => withBookWriter(bookDir, () => prepareExtractionAdmission(bookDir, options))).toThrow("EXTRACTION_LEGACY")
    })
  })

  it("still makes the book, with a warning, when saving the recommendation into it fails", async () => {
    const pdf = blankPdf(2)
    const id = await recommendFor(pdf)
    storageFails.on = true
    const book = await createBook("unsaved", pdf, id)
    expect(book.setupRecommendationWarning).toMatchObject({ reason: "failed", message: expect.stringMatching(/disk full/) })
    expect(fs.existsSync(path.join(tmpDir, "unsaved", "unsaved.pdf"))).toBe(true)
    expect(fs.existsSync(path.join(tmpDir, "unsaved", "setup-recommendation.json"))).toBe(false)
  })
})

describe("the shared AI cache", () => {
  it("removes entries written longer ago than the cap, and keeps the rest", () => {
    const dir = path.join(tmpDir, ".cache", "setup-recommender")
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, "old.json"), "{}")
    fs.writeFileSync(path.join(dir, "new.json"), "{}")
    const old = new Date(Date.now() - SETUP_CACHE_MAX_AGE_MS - 60_000)
    fs.utimesSync(path.join(dir, "old.json"), old, old)
    pruneSetupCache(dir)
    expect(fs.readdirSync(dir)).toEqual(["new.json"])
    pruneSetupCache(path.join(tmpDir, "missing"))
  })
})
