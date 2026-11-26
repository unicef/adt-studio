import { describe, expect, it } from "vitest"
import { MockLanguageModelV1 } from "ai/test"
import type { LanguageModelV1CallOptions } from "ai"
import { createAiSdkAgentBackend } from "../providers/shared/ai-sdk/agent.js"

const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="

describe("createAiSdkAgentBackend", () => {
  it("sends attached images as image parts after the user's text", async () => {
    const calls: LanguageModelV1CallOptions[] = []
    const model = new MockLanguageModelV1({
      doGenerate: async (options) => {
        calls.push(options)
        return {
          text: "A volcano.",
          finishReason: "stop",
          usage: { promptTokens: 1, completionTokens: 1 },
          rawCall: { rawPrompt: null, rawSettings: {} },
        }
      },
    })

    await createAiSdkAgentBackend(model).generateTurn({
      system: "s",
      tools: [],
      messages: [{ role: "user", content: "What is this?", images: [`data:image/png;base64,${PNG}`] }],
    })

    const user = calls[0]?.prompt.find((message) => message.role === "user")
    expect(user?.content).toEqual([
      { type: "text", text: "What is this?" },
      expect.objectContaining({ type: "image", mimeType: "image/png" }),
    ])
  })
})
