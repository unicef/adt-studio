import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { z } from "zod"
import { afterEach, expect, it, vi } from "vitest"
import { createLLMModel } from "../client.js"
import { createPromptEngine } from "../prompt.js"
import { initializePromptSelection, publishPromptSelection, savePromptVersion } from "../prompt-files.js"
import { randomUUID } from "node:crypto"
import type { LlmLogEntry } from "../log.js"
const roots: string[] = []
afterEach(() => { vi.unstubAllGlobals(); for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }) })

it("counts real transport calls for template/include changes and keeps in-flight logged bytes", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "prompt-cache-")); roots.push(root)
  const prompts = path.join(root, "prompts"), cache = path.join(root, "cache")
  fs.mkdirSync(prompts)
  fs.writeFileSync(path.join(prompts, "test.liquid"), '{% chat role: "user" %}{% include "_shared" %}{% endchat %}')
  fs.writeFileSync(path.join(prompts, "_shared.liquid"), "first")
  const requests: unknown[] = [], logs: LlmLogEntry[] = []
  let release: (() => void) | undefined
  let hold = false
  vi.stubGlobal("fetch", vi.fn(async (_url: unknown, init: RequestInit) => {
    requests.push(JSON.parse(String(init.body)))
    if (hold) await new Promise<void>((resolve) => { release = resolve })
    return new Response(JSON.stringify({
      id: "chatcmpl-contract", object: "chat.completion", created: 0, model: "gpt-4o",
      choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: '{"ok":true}' } }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    }), { status: 200, headers: { "content-type": "application/json" } })
  }))
  const model = createLLMModel({ modelId: "openai:gpt-4o", providerCredentials: { openai: { apiKey: "test-key" } }, cacheDir: cache, promptEngine: createPromptEngine(prompts), onLog: (entry) => logs.push(entry) })
  const generate = () => model.generateObject({ prompt: "test", schema: z.object({ ok: z.boolean() }), log: { taskType: "contract" } })
  await generate(); await generate()
  expect(requests).toHaveLength(1)
  const previous = initializePromptSelection(prompts, "_shared", null)
  const version = savePromptVersion(prompts, "_shared", "second")
  publishPromptSelection(prompts, "_shared", { format: 1, id: randomUUID(), previous: previous.id, kind: "version", version, modelId: null })
  hold = true
  const pending = generate()
  await vi.waitFor(() => expect(requests).toHaveLength(2))
  // Publishing while transport is pending must not change what the call log says
  // was sent, nor poison a subsequent request's content-based cache key.
  const third = savePromptVersion(prompts, "_shared", "third")
  publishPromptSelection(prompts, "_shared", { format: 1, id: randomUUID(), previous: previous.id, kind: "version", version: third, modelId: null })
  release!(); await pending
  expect(JSON.stringify(requests[1])).toContain("second")
  expect(JSON.stringify(logs.at(-1))).toContain("second")
  expect(JSON.stringify(logs.at(-1))).not.toContain("third")
  hold = false
  await generate(); await generate()
  expect(requests).toHaveLength(3)
  expect(JSON.stringify(requests[2])).toContain("third")

  // Changing a selected main template must invalidate only its rendered input.
  // Restoring the same effective bytes reuses the existing content cache even
  // though the immutable selection ID has changed.
  fs.writeFileSync(path.join(prompts, "unrelated.liquid"), '{% chat role: "user" %}unrelated{% endchat %}')
  const unrelated = () => model.generateObject({ prompt: "unrelated", schema: z.object({ ok: z.boolean() }), log: { taskType: "contract" } })
  await unrelated()
  expect(requests).toHaveLength(4)
  const original = initializePromptSelection(prompts, "test", null)
  const changed = savePromptVersion(prompts, "test", '{% chat role: "user" %}changed {% include "_shared" %}{% endchat %}')
  const changedId = randomUUID()
  publishPromptSelection(prompts, "test", { format: 1, id: changedId, previous: original.id, kind: "version", version: changed, modelId: null })
  await generate()
  expect(requests).toHaveLength(5)
  expect(JSON.stringify(requests[4])).toContain("changed third")
  await unrelated()
  expect(requests).toHaveLength(5)
  publishPromptSelection(prompts, "test", { format: 1, id: randomUUID(), previous: changedId, kind: "flat", modelId: null })
  await generate()
  expect(requests).toHaveLength(5)
  expect(JSON.stringify(logs.at(-1))).toContain("third")
  expect(JSON.stringify(logs.at(-1))).not.toContain("changed third")
})
