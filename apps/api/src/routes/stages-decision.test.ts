// Decision validation adapted from PR #712; production Retry remains safely gated.
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { createBookStorage } from "@adt/storage"
import { createBookEventBus, type BookSSEEvent } from "../services/book-event-bus.js"
import { createPageErrorDecisions } from "../services/page-error-decisions.js"
import { createStageService } from "../services/stage-service.js"
import { createStageRoutes } from "./stages.js"

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})
function setup(retry?: { canRetry: boolean; validateRetry: () => void }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "spec0013-decisions-"))
  dirs.push(dir)
  const storage = createBookStorage("book", dir)
  storage.putNodeData("image-filtering", "pg001", {
    images: [{ imageId: "manual", isPruned: true }],
  })
  storage.putNodeData("image-filtering", "pg001", {
    images: [{ imageId: "manual", isPruned: false }],
  })
  storage.close()
  const before = fs.readFileSync(path.join(dir, "book", "book.db"))
  const bus = createBookEventBus()
  const events: BookSSEEvent[] = []
  bus.addListener("book", (event) => events.push(event))
  const broker = createPageErrorDecisions(bus)
  broker.beginRun("book", "run-1")
  const service = createStageService({ async run() {} }, bus, broker)
  const app = createStageRoutes(service, bus, broker, dir, "", "")
  const pending = broker.requestDecision({
    label: "book",
    runId: "run-1",
    step: "image-meaningfulness",
    pageId: "pg001",
    error: "Temporary provider failure",
    errorClass: "server-error",
    attemptCount: 3,
    ...retry,
  })
  const decision = broker.getPendingDecisions("book")[0]
  const post = (body: unknown, label = "book") =>
    app.request(`/books/${label}/stages/decision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  return { dir, before, broker, app, post, decision, pending, events }
}

describe("decision API ownership and fallback", () => {
  it("returns 400 for Retry and retry-all without consuming; valid Stop resolves exactly once", async () => {
    const f = setup()
    for (const body of [
      { decisionId: f.decision.decisionId, action: "retry" },
      { decisionId: f.decision.decisionId, action: "retry", applyToAll: true },
      { decisionId: f.decision.decisionId, action: "stop", unexpected: "field" },
    ]) {
      expect((await f.post(body)).status).toBe(400)
      expect(f.broker.getPendingDecisions("book")).toEqual([f.decision])
    }
    const body = {
      decisionId: f.decision.decisionId,
      runId: "run-1",
      step: "image-meaningfulness",
      pageId: "pg001",
      action: "stop",
    }
    const responses = await Promise.all([f.post(body), f.post(body)])
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409])
    await expect(f.pending).resolves.toBe("stop")
    expect(fs.readFileSync(path.join(f.dir, "book", "book.db"))).toEqual(f.before)
  })
  it("rejects wrong book/run/step/page ownership without consuming", async () => {
    const f = setup()
    const body = { decisionId: f.decision.decisionId, action: "skip" }
    expect((await f.post(body, "other-book")).status).toBe(409)
    for (const context of [
      { runId: "other-run" },
      { step: "page-sectioning" },
      { pageId: "pg002" },
    ]) {
      expect((await f.post({ ...body, ...context })).status).toBe(409)
    }
    expect(f.broker.getPendingDecisions("book")).toEqual([f.decision])
    f.broker.clearForRun("book")
    expect((await f.post(body)).status).toBe(409)
    await expect(f.pending).resolves.toBe("stop")
  })
  it("polling returns the same authoritative diagnostics as SSE, including consumed state", async () => {
    const f = setup()
    const emitted = f.events.find((event) => event.type === "decision-required")
    expect(emitted).toMatchObject({ ...f.decision, canRetry: false, attemptCount: 3 })
    const status = await (await f.app.request("/books/book/step-status")).json()
    expect(status.pendingDecisions).toEqual([f.decision])
    // Legacy clients may omit the additive context fields; the opaque decision
    // ID still belongs to the URL book and the broker's active run only.
    expect((await f.post({ decisionId: f.decision.decisionId, action: "stop" })).status).toBe(200)
    await f.pending
    expect(
      (await (await f.app.request("/books/book/step-status")).json()).pendingDecisions,
    ).toEqual([])
  })
})


it("rejects stale Retry without consuming the decision, and accepts only one refreshed decision submission", async () => {
  let stale = true
  const f = setup({ canRetry: true, validateRetry: () => { if (stale) throw new Error("input version changed") } })
  expect(f.decision.canRetry).toBe(true)
  const body = { decisionId: f.decision.decisionId, runId: "run-1", step: "image-meaningfulness", pageId: "pg001", action: "retry" }
  expect((await f.post({ ...body, applyToAll: true })).status).toBe(400)
  expect((await f.post(body)).status).toBe(409)
  expect(f.broker.getPendingDecisions("book")).toEqual([f.decision])
  stale = false
  const results = await Promise.all([f.post(body), f.post(body)])
  expect(results.map((response) => response.status).sort()).toEqual([200, 409])
  await expect(f.pending).resolves.toBe("retry")
  expect(fs.readFileSync(path.join(f.dir, "book", "book.db"))).toEqual(f.before)
})
