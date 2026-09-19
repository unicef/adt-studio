import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"
import { ollamaProvider } from "../providers/ollama/index.js"
import { toJsonSchema } from "../providers/shared/json-schema.js"

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal("fetch", fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const schema = z.object({ title: z.string() })
const serializedSchema = JSON.stringify(toJsonSchema(schema, "Structured output"))

function chatCompletion(content: string): Response {
  return new Response(
    JSON.stringify({
      id: "chatcmpl-1",
      object: "chat.completion",
      created: 0,
      model: "test",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  )
}

function requestMessages(call: number): Array<{ role: string; content: unknown }> {
  const body = JSON.parse(fetchMock.mock.calls[call]?.[1]?.body as string)
  return body.messages as Array<{ role: string; content: unknown }>
}

async function generate(system?: string) {
  const backend = ollamaProvider.createStructuredTextBackend!({
    providerId: "ollama",
    modelId: "tinyllama",
    modality: "structured-text",
    credentials: ollamaProvider.credentialSchema.parse({}),
  })
  return backend.generateStructured<{ title: string }>({
    system,
    messages: [{ role: "user", content: "hi" }],
    schema,
    strategy: "parse-repair",
  })
}

describe("ai-sdk parse-repair schema embedding", () => {
  it("embeds the serialized JSON Schema in the first request's instruction", async () => {
    fetchMock.mockResolvedValue(chatCompletion('{"title":"t"}'))

    const result = await generate("You are a librarian.")

    expect(result.object).toEqual({ title: "t" })
    const messages = requestMessages(0)
    const systemMessage = messages.find((message) => message.role === "system")
    expect(systemMessage?.content).toContain("You are a librarian.")
    expect(systemMessage?.content).toContain(
      "Reply with a single JSON object that validates against this JSON Schema.",
    )
    expect(systemMessage?.content).toContain(serializedSchema)
  })

  it("repeats the schema alongside the validation failure in the repair round", async () => {
    fetchMock
      .mockResolvedValueOnce(chatCompletion('{"title":42}'))
      .mockResolvedValueOnce(chatCompletion('{"title":"fixed"}'))

    const result = await generate()

    expect(result.object).toEqual({ title: "fixed" })
    expect(fetchMock).toHaveBeenCalledTimes(2)

    const repairMessages = requestMessages(1)
    const repairPrompt = repairMessages.at(-1)
    expect(repairPrompt?.role).toBe("user")
    expect(repairPrompt?.content).toContain(
      "That JSON did not match the required schema.",
    )
    expect(repairPrompt?.content).toContain(serializedSchema)
  })
})
