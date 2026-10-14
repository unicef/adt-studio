import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { openBookDb } from "@adt/storage"
import { createBookEventBus, type BookSSEEvent } from "./book-event-bus.js"
import { createStageRoutes } from "../routes/stages.js"
import { createPageErrorDecisions } from "./page-error-decisions.js"
import {
  createStageService,
  type StageRunner,
  type StageRunOptions,
  type StageRunProgress,
} from "./stage-service.js"

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-stage-service-"))
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

function makeBook(label: string): void {
  const bookDir = path.join(tmpDir, label)
  fs.mkdirSync(bookDir, { recursive: true })
  const db = openBookDb(path.join(bookDir, `${label}.db`))
  // A step left "running" — the cancel cleanup should delete it.
  db.run(
    "INSERT INTO step_runs (step, status, started_at) VALUES (?, 'running', ?)",
    ["page-sectioning", new Date().toISOString()]
  )
  db.close()
}

function stepRunStatuses(label: string): Map<string, string> {
  const db = openBookDb(path.join(tmpDir, label, `${label}.db`))
  try {
    const rows = db.all("SELECT step, status FROM step_runs") as Array<{
      step: string
      status: string
    }>
    return new Map(rows.map((r) => [r.step, r.status]))
  } finally {
    db.close()
  }
}

/** A runner whose run() blocks until we resolve it, and observes the signal. */
function controllableRunner() {
  let resolveRun: (() => void) | undefined
  let rejectRun: ((err: unknown) => void) | undefined
  let capturedSignal: AbortSignal | undefined
  let started = false
  const runner: StageRunner = {
    run(_label: string, options: StageRunOptions, _progress: StageRunProgress) {
      started = true
      capturedSignal = options.signal
      return new Promise<void>((resolve, reject) => {
        resolveRun = resolve
        rejectRun = reject
      })
    },
  }
  return {
    runner,
    finish: () => resolveRun?.(),
    fail: (err: unknown) => rejectRun?.(err),
    signal: () => capturedSignal,
    hasStarted: () => started,
  }
}

const baseOptions = (label: string): StageRunOptions => ({
  booksDir: tmpDir,
  credentials: { openai: { apiKey: "sk-test" } },
  promptsDir: "",
  fromStage: "storyboard",
  toStage: "storyboard",
})

async function tick(): Promise<void> {
  // Let setImmediate-deferred jobs and microtasks run.
  await new Promise((r) => setTimeout(r, 10))
}

describe("stage-service cancellation", () => {
  it("cancelling an active run: cancelling → cancelled, resets running steps, no error event", async () => {
    const label = "cancel-active"
    makeBook(label)
    const bus = createBookEventBus()
    const events: BookSSEEvent[] = []
    bus.addListener(label, (e) => events.push(e))
    const rc = controllableRunner()
    const svc = createStageService(rc.runner, bus)

    svc.startStageRun(label, baseOptions(label))
    await tick()
    expect(rc.hasStarted()).toBe(true)

    const result = svc.cancelStageRun(label)
    expect(result).toEqual({ status: "cancelling" })
    expect(svc.getStatus(label).active?.status).toBe("cancelling")
    expect(rc.signal()?.aborted).toBe(true)

    // The abort branch only runs after runner.run() settles.
    rc.fail(new Error("aborted mid-run"))
    await tick()

    expect(events.some((e) => e.type === "stage-run-cancelled")).toBe(true)
    expect(events.some((e) => e.type === "stage-run-error")).toBe(false)
    // Cancelled job is cleared from active (fully captured in DB).
    expect(svc.getStatus(label).active).toBeNull()
    // The running step returned to idle (row deleted).
    expect(stepRunStatuses(label).has("page-sectioning")).toBe(false)
  })

  it("preserves queued jobs when cancelling the active run and drains them after cancel", async () => {
    const label = "cancel-active-preserve-queue"
    makeBook(label)
    const bus = createBookEventBus()
    const runInvocations: string[] = []
    let rejectFirst: ((err: unknown) => void) | undefined
    let calls = 0
    const runner: StageRunner = {
      run(_label: string, options: StageRunOptions) {
        calls++
        runInvocations.push(`${options.fromStage}->${options.toStage}`)
        return new Promise<void>((resolve, reject) => {
          if (calls === 1) {
            rejectFirst = reject
            return
          }
          resolve()
        })
      },
    }
    const svc = createStageService(runner, bus)

    svc.startStageRun(label, {
      ...baseOptions(label),
      fromStage: "captions",
      toStage: "captions",
    })
    await tick()
    const queued = svc.startStageRun(label, {
      ...baseOptions(label),
      fromStage: "glossary",
      toStage: "glossary",
    })
    expect(queued.status).toBe("queued")
    expect(svc.getStatus(label).queue).toHaveLength(1)

    svc.cancelStageRun(label)
    expect(svc.getStatus(label).active?.status).toBe("cancelling")
    expect(svc.getStatus(label).queue).toEqual([
      expect.objectContaining({ fromStage: "glossary", toStage: "glossary" }),
    ])
    expect(runInvocations).toEqual(["captions->captions"])

    rejectFirst?.(new Error("cancelled"))
    await tick()

    expect(runInvocations).toEqual(["captions->captions", "glossary->glossary"])
    expect(svc.getStatus(label).queue).toHaveLength(0)
  })

  it("a start during cancelling queues (never runs in parallel) and drains after cancel", async () => {
    const label = "start-during-cancel"
    makeBook(label)
    const bus = createBookEventBus()
    const runInvocations: number[] = []
    let resolveFirst: (() => void) | undefined
    let calls = 0
    const runner: StageRunner = {
      run() {
        const n = ++calls
        runInvocations.push(n)
        return new Promise<void>((resolve, reject) => {
          if (n === 1) resolveFirst = () => reject(new Error("cancelled"))
          else resolve()
        })
      },
    }
    const svc = createStageService(runner, bus)

    svc.startStageRun(label, baseOptions(label))
    await tick()
    svc.cancelStageRun(label)
    // Start arrives while the first run is still unwinding.
    const during = svc.startStageRun(label, baseOptions(label))
    expect(during.status).toBe("queued")
    // Only the first run has started so far — no parallel second runner.
    expect(runInvocations).toEqual([1])

    // First run settles → drainQueue starts the queued one.
    resolveFirst?.()
    await tick()
    expect(runInvocations).toEqual([1, 2])
  })

  it("cancel with a hung failed job and empty queue returns null (→ 404)", async () => {
    const label = "cancel-failed"
    makeBook(label)
    const bus = createBookEventBus()
    const rc = controllableRunner()
    const svc = createStageService(rc.runner, bus)

    svc.startStageRun(label, baseOptions(label))
    await tick()
    rc.fail(new Error("boom"))
    await tick()
    expect(svc.getStatus(label).active?.status).toBe("failed")

    expect(svc.cancelStageRun(label)).toBeNull()
  })

  it("a second cancel while cancelling is an idempotent no-op", async () => {
    const label = "double-cancel"
    makeBook(label)
    const bus = createBookEventBus()
    const rc = controllableRunner()
    const svc = createStageService(rc.runner, bus)

    svc.startStageRun(label, baseOptions(label))
    await tick()
    expect(svc.cancelStageRun(label)).toEqual({ status: "cancelling" })
    expect(svc.cancelStageRun(label)).toEqual({ status: "cancelling" })
  })

  it("run() that resolves with the signal aborted is treated as completed (no cancelled event)", async () => {
    const label = "resolve-after-abort"
    makeBook(label)
    const bus = createBookEventBus()
    const events: BookSSEEvent[] = []
    bus.addListener(label, (e) => events.push(e))
    const rc = controllableRunner()
    const svc = createStageService(rc.runner, bus)

    svc.startStageRun(label, baseOptions(label))
    await tick()
    svc.cancelStageRun(label)
    // The run finished all remaining work before the abort took effect.
    rc.finish()
    await tick()

    expect(events.some((e) => e.type === "stage-run-complete")).toBe(true)
    expect(events.some((e) => e.type === "stage-run-cancelled")).toBe(false)
  })

  it("cancel resolves pending page-error decisions as stop", async () => {
    const label = "cancel-decisions"
    makeBook(label)
    const bus = createBookEventBus()
    // A listener so the broker arms the decision instead of waiting a grace period.
    bus.addListener(label, () => {})
    const decisions = createPageErrorDecisions(bus)
    const rc = controllableRunner()
    const svc = createStageService(rc.runner, bus, decisions)

    svc.startStageRun(label, baseOptions(label))
    await tick()

    const decisionPromise = decisions.requestDecision({
      label,
      step: "web-rendering",
      pageId: "pg001",
      error: "boom",
    })

    svc.cancelStageRun(label)
    await expect(decisionPromise).resolves.toBe("stop")
  })
})

describe("catalog run admission and skip scope", () => {
  it("refuses a competing writer before preparing or announcing a run", async () => {
    const { withBookWriter } = await import("@adt/storage")
    const label = "competing"
    makeBook(label)
    let release!: () => void
    const lease = withBookWriter(path.join(tmpDir, label), () => new Promise<void>((resolve) => { release = resolve }))
    const prepare = vi.fn()
    const run = vi.fn(async () => {})
    const svc = createStageService({ run }, createBookEventBus())
    try {
      expect(() => svc.startStageRun(label, { ...baseOptions(label), beforeRun: prepare })).toThrow(/busy|writer/i)
      expect(prepare).not.toHaveBeenCalled()
      expect(run).not.toHaveBeenCalled()
      expect(svc.getStatus(label).active).toBeNull()
    } finally { release(); await lease }
  })

  it("delivers late skip to the active executor without carrying it into a later run", async () => {
    const label = "skip-run"
    makeBook(label)
    const scopes: import("@adt/types").OutputRunScope[] = []
    let finish: (() => void) | undefined
    const svc = createStageService({ run: async (_label, options) => {
      scopes.push(options.outputScope!)
      await new Promise<void>((resolve) => { finish = resolve })
    } }, createBookEventBus())
    const identity = { kind: "translation" as const, id: "a", language: "fr" }
    svc.startStageRun(label, baseOptions(label))
    await tick()
    expect(svc.skipStageOutputs?.(label, [identity])).toBe(true)
    expect(scopes[0].skip).toEqual([identity])
    finish!(); await tick()
    svc.startStageRun(label, baseOptions(label)); await tick()
    expect(scopes[1].skip).toBeUndefined()
    finish!(); await tick()
  })
})

it("rejects a deleted book before admission without recreating its directory", () => {
  const run = vi.fn(async () => {})
  const service = createStageService({ run }, createBookEventBus())
  expect(() => service.startStageRun("deleted", baseOptions("deleted"))).toThrow("Book not found")
  expect(fs.existsSync(path.join(tmpDir, "deleted"))).toBe(false)
  expect(run).not.toHaveBeenCalled()
})

it("rechecks a queued book before preparation after an external deletion", async () => {
  const label = "deleted-queued"
  makeBook(label)
  const runner = controllableRunner()
  const service = createStageService(runner.runner, createBookEventBus())
  service.startStageRun(label, baseOptions(label))
  await tick()
  const beforeRun = vi.fn()
  service.startStageRun(label, { ...baseOptions(label), beforeRun })
  fs.rmSync(path.join(tmpDir, label), { recursive: true, force: true })
  runner.finish()
  await tick()
  await tick()
  expect(beforeRun).not.toHaveBeenCalled()
  expect(fs.existsSync(path.join(tmpDir, label))).toBe(false)
  expect(service.getStatus(label).active?.status).toBe("failed")
})


it("exposes the accepted run identity through HTTP before and after queue promotion", async () => {
  const label = "review-run-identity"
  makeBook(label)
  const runner = controllableRunner()
  const bus = createBookEventBus()
  const service = createStageService(runner.runner, bus)
  const app = createStageRoutes(service, bus, createPageErrorDecisions(bus), tmpDir, path.resolve("prompts"), path.resolve("assets/adt"))
  const status = async () => (await (await app.request(`/books/${label}/stages/status`)).json())
  const first = service.startStageRun(label, baseOptions(label))
  await tick()
  const second = service.startStageRun(label, baseOptions(label))
  expect(await status()).toMatchObject({ id: first.id, status: "running", queue: [{ id: second.id }] })
  runner.finish()
  await tick()
  expect(await status()).toMatchObject({ id: second.id, status: "running", queue: [] })
  runner.finish()
  await tick()
  expect(await status()).toMatchObject({ status: "idle", queue: [] })
})


it.each(["completed", "cancelled", "failed"])("retains a publication receipt for %s after queue drain and exposes it to polling", async (outcome) => {
  const label = `receipt-${outcome}`
  makeBook(label)
  const bus = createBookEventBus()
  const rc = controllableRunner()
  const service = createStageService(rc.runner, bus)
  const age = vi.spyOn(performance, "now")
  age.mockReturnValue(100)
  const before = service.getStatus(label).runRevision
  let receiptAtEvent: string | undefined
  bus.addListener(label, (event) => {
    if (event.type.startsWith("stage-run-")) receiptAtEvent = service.getStatus(label).runRevision
  })
  const run = service.startStageRun(label, baseOptions(label))
  await tick()
  expect(service.getStatus(label).runRevision).toBe(before)
  age.mockReturnValue(150)
  if (outcome === "completed") rc.finish()
  else {
    if (outcome === "cancelled") service.cancelStageRun(label)
    rc.fail(new Error(outcome))
  }
  await tick()
  expect(receiptAtEvent).toBe(run.id)
  expect(service.getStatus(label).runRevision).toBe(run.id)
  const routes = createStageRoutes(service, bus, createPageErrorDecisions(), tmpDir, "", "")
  const response = await routes.request(`/books/${label}/step-status`)
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ runRevision: run.id, publicationAgeMs: 0 })
  age.mockReturnValue(250)
  const second = service.startStageRun(label, baseOptions(label))
  await tick()
  expect(service.getStatus(label).runRevision).toBe(run.id)
  expect(service.getStatus(label).publicationAgeMs).toBe(100)
  rc.finish()
  await tick()
  expect(service.getStatus(label).runRevision).toBe(second.id)
  expect(createStageService(rc.runner, bus).getStatus(label).runRevision).not.toBe(run.id)
  age.mockRestore()
})
