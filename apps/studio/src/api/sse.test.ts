import { describe, expect, it } from "vitest"
import { readEventStream, type SseEvent } from "./sse"

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })
}

async function collect(chunks: string[]): Promise<SseEvent[]> {
  const events: SseEvent[] = []
  await readEventStream(streamOf(chunks), (event) => events.push(event))
  return events
}

describe("readEventStream", () => {
  it("parses named events with JSON payloads", async () => {
    const events = await collect([
      'event: progress\ndata: {"type":"step-start","step":1}\n\n',
      'event: complete\ndata: {"ok":true}\n\n',
    ])

    expect(events).toEqual([
      { event: "progress", data: '{"type":"step-start","step":1}' },
      { event: "complete", data: '{"ok":true}' },
    ])
  })

  it("reassembles messages split across chunk boundaries", async () => {
    const events = await collect(["event: progress\nda", 'ta: {"step":2}', "\n\n"])

    expect(events).toEqual([{ event: "progress", data: '{"step":2}' }])
  })

  it("defaults to the message event and joins multi-line data", async () => {
    const events = await collect(["data: first\ndata: second\n\n"])

    expect(events).toEqual([{ event: "message", data: "first\nsecond" }])
  })

  it("skips keep-alive comments and flushes a trailing message without a blank line", async () => {
    const events = await collect([": keep-alive\n\n", "event: done\ndata: {}"])

    expect(events).toEqual([{ event: "done", data: "{}" }])
  })

  it("tolerates CRLF line endings", async () => {
    const events = await collect(["event: progress\r\ndata: {}\r\n\r\n"])

    expect(events).toEqual([{ event: "progress", data: "{}" }])
  })
})
