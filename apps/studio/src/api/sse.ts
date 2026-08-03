export interface SseEvent {
  event: string
  data: string
}

const MESSAGE_BOUNDARY = /\r?\n\r?\n/

function parseMessage(chunk: string): SseEvent | null {
  let event = "message"
  const dataLines: string[] = []

  for (const line of chunk.split(/\r?\n/)) {
    if (!line || line.startsWith(":")) continue
    const separator = line.indexOf(":")
    const field = separator === -1 ? line : line.slice(0, separator)
    const rawValue = separator === -1 ? "" : line.slice(separator + 1)
    const value = rawValue.startsWith(" ") ? rawValue.slice(1) : rawValue
    if (field === "event") event = value
    else if (field === "data") dataLines.push(value)
  }

  if (dataLines.length === 0) return null
  return { event, data: dataLines.join("\n") }
}

/**
 * Consume a `text/event-stream` response body.
 *
 * `EventSource` cannot be used for streams opened with POST or with credential
 * headers, so streaming routes that take a body (or an `X-…` credential) are
 * read here instead.
 */
export async function readEventStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: SseEvent) => void,
): Promise<void> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const chunks = buffer.split(MESSAGE_BOUNDARY)
    buffer = chunks.pop() ?? ""
    for (const chunk of chunks) {
      const message = parseMessage(chunk)
      if (message) onEvent(message)
    }
  }

  buffer += decoder.decode()
  const trailing = parseMessage(buffer)
  if (trailing) onEvent(trailing)
}
