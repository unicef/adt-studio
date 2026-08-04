import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { createBookEventBus } from "../services/book-event-bus.js"
import { createPageErrorDecisions } from "../services/page-error-decisions.js"
import { createStageService, type StageRunner } from "../services/stage-service.js"
import { createStageRoutes } from "./stages.js"

interface ParsedSSEEvent {
  event: string
  data: unknown
}

function createSSEReader(reader: ReadableStreamDefaultReader<Uint8Array>) {
  const decoder = new TextDecoder()
  let buffer = ""

  return async (): Promise<ParsedSSEEvent> => {
    while (!buffer.includes("\n\n")) {
      const result = await new Promise<ReadableStreamReadResult<Uint8Array>>(
        (resolve, reject) => {
          const timer = setTimeout(
            () => reject(new Error("Timed out waiting for SSE event")),
            2_000,
          )
          reader.read().then(
            (value) => {
              clearTimeout(timer)
              resolve(value)
            },
            (error: unknown) => {
              clearTimeout(timer)
              reject(error)
            },
          )
        },
      )
      if (result.done) throw new Error("SSE stream closed before an event arrived")
      buffer += decoder.decode(result.value, { stream: true }).replaceAll("\r\n", "\n")
    }

    const delimiter = buffer.indexOf("\n\n")
    const rawEvent = buffer.slice(0, delimiter)
    buffer = buffer.slice(delimiter + 2)
    const event = rawEvent
      .split("\n")
      .find((line) => line.startsWith("event:"))
      ?.slice("event:".length)
      .trim()
    const data = rawEvent
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice("data:".length).trim())
      .join("\n")

    if (!event || !data) throw new Error(`Malformed SSE event: ${rawEvent}`)
    return { event, data: JSON.parse(data) as unknown }
  }
}

async function waitForListener(
  hasListener: () => boolean,
): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (hasListener()) return
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error("SSE listener did not connect")
}

describe("page retry decision route", () => {
  let tmpDir = ""

  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it("streams retry metadata, rejects bulk retry, and resumes the active run", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "stage-decision-route-"))
    const label = "retry-route"
    const eventBus = createBookEventBus()
    const decisions = createPageErrorDecisions(eventBus)
    let continued = false
    const runner: StageRunner = {
      async run(_label, options) {
        const action = await options.requestPageDecision?.({
          step: "image-meaningfulness",
          pageId: "pg024",
          error: "Cannot connect to API: other side closed",
          canRetry: true,
          errorClass: "connection-closed",
          attempts: 3,
        })
        if (action !== "retry") throw new Error(`Unexpected decision: ${action}`)
        continued = true
      },
    }
    const stageService = createStageService(runner, eventBus, decisions)
    const app = createStageRoutes(
      stageService,
      eventBus,
      decisions,
      tmpDir,
      "",
      "",
    )

    const sseResponse = await app.request(`/books/${label}/stages/status`, {
      headers: { Accept: "text/event-stream" },
    })
    expect(sseResponse.status).toBe(200)
    expect(sseResponse.headers.get("content-type")).toContain("text/event-stream")
    const streamReader = sseResponse.body?.getReader()
    if (!streamReader) throw new Error("SSE response has no body")
    const nextEvent = createSSEReader(streamReader)

    try {
      await waitForListener(() => eventBus.hasListeners(label))
      const runResponse = await app.request(`/books/${label}/stages/run`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-OpenAI-Key": "sk-test",
        },
        body: JSON.stringify({
          fromStage: "extract",
          toStage: "extract",
          pageErrorPolicy: "ask",
        }),
      })
      expect(runResponse.status).toBe(200)

      const decisionEvent = await nextEvent()
      expect(decisionEvent).toEqual({
        event: "decision-required",
        data: expect.objectContaining({
          decisionId: expect.any(String),
          step: "image-meaningfulness",
          pageId: "pg024",
          canRetry: true,
          errorClass: "connection-closed",
          attempts: 3,
        }),
      })
      const decisionId = (decisionEvent.data as { decisionId: string }).decisionId

      const bulkRetry = await app.request(`/books/${label}/stages/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decisionId, action: "retry", applyToAll: true }),
      })
      expect(bulkRetry.status).toBe(400)
      expect(decisions.getPendingDecisions(label)).toHaveLength(1)

      const retryResponse = await app.request(`/books/${label}/stages/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decisionId, action: "retry" }),
      })
      expect(retryResponse.status).toBe(200)

      expect(await nextEvent()).toEqual({
        event: "complete",
        data: { label },
      })
      expect(continued).toBe(true)
      expect(decisions.getPendingDecisions(label)).toHaveLength(0)
    } finally {
      await streamReader.cancel()
      decisions.clearForRun(label)
    }
  })
})
