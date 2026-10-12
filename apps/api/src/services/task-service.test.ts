import { afterEach, beforeEach, expect, it, vi } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { randomUUID } from "node:crypto"
import { createBookStorage, readTaskLedger, withBookWriter } from "@adt/storage"
import { createTaskService } from "./task-service.js"
import { createBookEventBus } from "./book-event-bus.js"

let root: string
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), "task-receipt-")); createBookStorage("book", root).close() })
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }) })
const request = () => ({ id: randomUUID(), fingerprint: "a".repeat(64) })

it("accepts one durable request across duplicate submission, completion and service recreation", async () => {
  const tasks = createTaskService(createBookEventBus(), root), req = request()
  let release!: () => void
  const executor = vi.fn(async () => { await new Promise<void>((resolve) => { release = resolve }); return { version: 2 } })
  const accepted = tasks.submitTask("book", "re-render", "Repair", executor, { request: req })
  expect(tasks.getRequest!("book", req.id)?.status).toBe("queued")
  expect(tasks.submitTask("book", "re-render", "Repair", executor, { request: req })).toEqual(accepted)
  await vi.waitFor(() => expect(tasks.getRequest!("book", req.id)?.status).toBe("running"))
  expect(executor).toHaveBeenCalledTimes(1)
  release()
  await vi.waitFor(() => expect(tasks.getRequest!("book", req.id)).toMatchObject({ status: "completed", result: { version: 2 } }))
  const reopened = createTaskService(createBookEventBus(), root)
  expect(reopened.submitTask("book", "re-render", "Repair", executor, { request: req })).toEqual(accepted)
  expect(executor).toHaveBeenCalledTimes(1)
  expect(() => reopened.submitTask("book", "re-render", "Different", executor,
    { request: { ...req, fingerprint: "b".repeat(64) } })).toThrow("different inputs")
})

it("rejects conflicting live work without any running step row or accepted second receipt", async () => {
  const tasks = createTaskService(createBookEventBus(), root), req = request(), second = request()
  let release!: () => void
  tasks.submitTask("book", "re-render", "Repair", async () => new Promise<void>((resolve) => { release = resolve }), { request: req })
  await vi.waitFor(() => expect(release).toBeTypeOf("function"))
  const storage = createBookStorage("book", root)
  expect(storage.getStepRuns()).toEqual([])
  storage.close()
  expect(() => tasks.submitTask("book", "re-render", "Other", async () => {}, { request: second })).toThrow("BOOK_BUSY")
  expect(tasks.getRequest!("book", second.id)).toBeUndefined()
  release()
  await vi.waitFor(() => expect(tasks.getRequest!("book", req.id)?.status).toBe("completed"))
})

it("cancels queued work before its executor starts and retains the same receipt on retry", async () => {
  const tasks = createTaskService(createBookEventBus(), root), req = request(), executor = vi.fn(async () => {})
  const result = tasks.submitTask("book", "re-render", "Repair", executor, { request: req, cancellable: true })
  expect(tasks.cancelTask!("foreign", result.taskId)).toBe(false)
  expect(tasks.cancelTask!("book", result.taskId)).toBe(true)
  await vi.waitFor(() => expect(tasks.getRequest!("book", req.id)?.status).toBe("cancelled"))
  expect(tasks.submitTask("book", "re-render", "Repair", executor, { request: req })).toEqual(result)
  expect(executor).not.toHaveBeenCalled()
  expect(readTaskLedger(path.join(root, "book"))[0].task.status).toBe("cancelled")
})

it("preserves content/history through failed admission and failed tasks", async () => {
  const storage = createBookStorage("book", root)
  storage.putNodeData("web-rendering", "pg001", { manual: "keep" })
  const before = storage.getAllNodeVersions("web-rendering", "pg001")
  storage.close()
  const tasks = createTaskService(createBookEventBus(), root), invalid = request(), accepted = request()
  expect(() => tasks.submitTask("book", "re-render", "Repair", async () => {}, {
    request: invalid, admit() { throw new Error("Source changed") },
  })).toThrow("Source changed")
  expect(tasks.getRequest!("book", invalid.id)).toBeUndefined()
  tasks.submitTask("book", "re-render", "Repair", async () => { throw new Error("Provider unavailable") }, { request: accepted })
  await vi.waitFor(() => expect(tasks.getRequest!("book", accepted.id)?.status).toBe("failed"))
  const reopened = createBookStorage("book", root)
  expect(reopened.getAllNodeVersions("web-rendering", "pg001")).toEqual(before)
  reopened.close()
  // The task's terminal write released the same book lease.
  expect(() => withBookWriter(path.join(root, "book"), () => {})).not.toThrow()
})

it("reports a killed worker from persisted history without executing its accepted request again", { timeout: 30000 }, async () => {
  const { spawnSync } = await import("node:child_process"), { pathToFileURL } = await import("node:url")
  const repo = path.resolve(import.meta.dirname, "../../../.."), req = request()
  const child = spawnSync(process.execPath, ["--input-type=module", "-e", `
    import { createTaskService } from ${JSON.stringify(pathToFileURL(path.join(repo, "apps/api/dist/services/task-service.js")).href)};
    import { createBookEventBus } from ${JSON.stringify(pathToFileURL(path.join(repo, "apps/api/dist/services/book-event-bus.js")).href)};
    const service = createTaskService(createBookEventBus(), ${JSON.stringify(root)});
    service.submitTask('book', 're-render', 'Interrupted', async () => process.kill(process.pid, 'SIGKILL'), { request: ${JSON.stringify(req)} });
  `], { encoding: "utf8", timeout: 15000 })
  expect(child.signal, child.stderr).toBe("SIGKILL")
  const service = createTaskService(createBookEventBus(), root), executor = vi.fn(async () => {})
  const receipt = service.getRequest!("book", req.id)!
  expect(receipt).toMatchObject({ status: "failed", interrupted: true })
  expect(service.submitTask("book", "re-render", "Retry", executor, { request: req }).taskId).toBe(receipt.taskId)
  expect(executor).not.toHaveBeenCalled()
})

it("treats imported foreign receipts as interrupted history once their lease is absent", async () => {
  const { appendTaskEvent } = await import("@adt/storage"), os = await import("node:os")
  const req = request(), book = path.join(root, "book")
  withBookWriter(book, () => appendTaskEvent(book, { requestId: req.id, fingerprint: req.fingerprint,
    owner: { host: `${os.hostname()}-another-machine`, pid: process.pid, runtime: randomUUID(), writerToken: randomUUID() },
    task: { taskId: "imported", kind: "re-render", description: "Interrupted on another machine", status: "running" },
  }))
  const tasks = createTaskService(createBookEventBus(), root)
  expect(tasks.getRequest!("book", req.id)).toMatchObject({ status: "failed", interrupted: true })
  const fresh = request(); tasks.submitTask("book", "re-render", "Explicit new task", async () => {}, { request: fresh })
  await vi.waitFor(() => expect(tasks.getRequest!("book", fresh.id)?.status).toBe("completed"))
})

it.each(["completed", "failed", "cancelled"] as const)("keeps a known %s outcome visible when its terminal receipt cannot be written", async (status) => {
  const storageModule = await import("@adt/storage"), append = storageModule.appendTaskEvent
  const tasks = createTaskService(createBookEventBus(), root), req = request()
  const log = vi.spyOn(console, "error").mockImplementation(() => {})
  const write = vi.spyOn(storageModule, "appendTaskEvent").mockImplementation((book, record) => {
    if (["completed", "failed", "cancelled"].includes(record.task.status)) throw new Error("Injected terminal disk failure")
    return append(book, record)
  })
  try {
    const accepted = tasks.submitTask("book", "re-render", "Repair", async () => {
      if (status === "failed") throw new Error("Provider failed")
      return { version: 2 }
    }, { request: req, cancellable: true })
    if (status === "cancelled") tasks.cancelTask!("book", accepted.taskId)
    await vi.waitFor(() => expect(tasks.getRequest!("book", req.id)?.status).toBe(status))
    expect(tasks.getActiveTasks("book")[0].status).toBe(status)
    expect(tasks.submitTask("book", "re-render", "Same", async () => { throw new Error("Must not rerun") }, { request: req })).toEqual(accepted)
    expect(tasks.getActiveTasks("book").some((task) => ["queued", "running"].includes(task.status))).toBe(false)
  } finally { write.mockRestore(); log.mockRestore() }
})
