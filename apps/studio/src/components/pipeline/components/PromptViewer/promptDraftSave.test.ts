import { QueryClient } from "@tanstack/react-query"
import { describe, expect, it, vi } from "vitest"
import { api } from "@/api/client"
import { savePromptDraft } from "./promptDraftSave"
import type { PromptDraft } from "./types"
vi.mock("@lingui/core", () => ({ i18n: { _: (message: unknown) => message } }))
vi.mock("@lingui/core/macro", () => ({ msg: (parts: TemplateStringsArray) => parts.join("") }))
vi.mock("@/components/ui/sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
vi.mock("@/api/client", () => ({ api: { updatePrompt: vi.fn() }, ApiError: class extends Error {} }))

it("uses the book draft's loaded revision and keeps newer keystrokes after save", async () => {
  const client = new QueryClient()
  const draft: PromptDraft = { content: "sent", modelId: null, revision: "old" }
  let current: PromptDraft | null = draft
  let finish!: (value: unknown) => void
  vi.mocked(api.updatePrompt).mockImplementation(() => new Promise((resolve) => { finish = resolve }))
  client.setQueryData(["prompts", "test", "book", null], { revision: "background refetch" })
  const saving = savePromptDraft(client, "test", "book", draft, (update) => { current = update(current) })
  await vi.waitFor(() => expect(api.updatePrompt).toHaveBeenCalled())
  current = { ...draft, content: "new typing" }
  finish({ content: "sent", revision: "new" })
  await saving
  expect(api.updatePrompt).toHaveBeenCalledWith("test", "sent", "book", null, "old")
  expect(current).toEqual({ content: "new typing", modelId: null, revision: "new" })
})
