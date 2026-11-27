import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { Hono } from "hono"
import type { RecommendSetupOptions } from "@adt/pipeline"
import { errorHandler } from "../middleware/error-handler.js"
import { createBookRoutes } from "./books.js"
import { createSetupRecommendationRoutes } from "./setup-recommendation.js"

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
  app.route("/", createSetupRecommendationRoutes(tmpDir, configPath))
  app.route("/", createBookRoutes(tmpDir))
})
afterEach(() => {
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
  return (await res.json()) as { setupRecommendationWarning?: string }
}

describe("POST /setup-recommendation", () => {
  it("refuses a file that isn't a PDF", async () => {
    const res = await app.request("/setup-recommendation", { method: "POST", body: pdfForm(new TextEncoder().encode("hello"), "notes.txt", "text/plain") })
    expect(res.status).toBe(400)
  })

  it("says the PDF is at fault (422, not a provider error) when its pages can't be drawn", async () => {
    recommend.impl = async (o) => {
      await o.renderPages([99], 100) // a page the 2-page PDF doesn't have
      return { id: o.id }
    }
    const res = await app.request("/setup-recommendation", { method: "POST", body: pdfForm(blankPdf(2)) })
    expect(res.status).toBe(422)
  })

  it("reports an AI service failure as 502", async () => {
    recommend.impl = async () => {
      throw new Error("HTTP 500 from the provider")
    }
    const res = await app.request("/setup-recommendation", { method: "POST", body: pdfForm(blankPdf(2)) })
    expect(res.status).toBe(502)
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
    expect(book.setupRecommendationWarning).toMatch(/different PDF/)
    expect(fs.existsSync(path.join(tmpDir, "other-pdf", "setup-recommendation.json"))).toBe(false)
  })
})
