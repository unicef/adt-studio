// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { ReactNode } from "react"
import type { PromptResponse } from "@/api/client"
import { api, ApiError } from "@/api/client"
import { useGlobalPrompts } from "./globalPrompts"

vi.mock("@lingui/react/macro", () => ({ useLingui: () => ({ t: (parts: TemplateStringsArray, ...args: unknown[]) => parts.reduce((s, p, i) => s + p + (args[i] ?? ""), "") }) }))
vi.mock("@/components/ui/sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock("@/hooks/use-effective-base-prompt-model", () => ({ useEffectiveBasePromptModel: () => "openai:gpt-5.4" }))
vi.mock("@/api/client", () => ({
  api: { listPrompts: vi.fn(), listPromptModels: vi.fn(), getDefaultModel: vi.fn(), getPrompt: vi.fn(), updatePrompt: vi.fn(), resetPrompt: vi.fn() },
  ApiError: class extends Error { constructor(message: string, public status: number, public body: unknown) { super(message) } },
}))
const initial: PromptResponse = {
  name: "test", resolvedName: "test", modelId: null, content: "original", revision: "a".repeat(64), source: "bundled",
  persistence: { source: "bundled", saveTarget: "global", logicalPath: ".versions/test" },
}
function setup() {
  vi.mocked(api.listPrompts).mockResolvedValue({ prompts: [{ name: "test", variants: [] }] })
  vi.mocked(api.listPromptModels).mockResolvedValue({ models: [] })
  vi.mocked(api.getDefaultModel).mockResolvedValue({ model: "openai:gpt-5.4" })
  vi.mocked(api.getPrompt).mockResolvedValue(initial)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  return renderHook(() => useGlobalPrompts(), { wrapper })
}
afterEach(() => { cleanup(); vi.clearAllMocks() })

describe("prompt editor submitted revision", () => {
  it("keeps typing during save dirty and advances its revision only after commit", async () => {
    let finish!: (prompt: PromptResponse) => void
    vi.mocked(api.updatePrompt).mockImplementation(() => new Promise((resolve) => { finish = resolve }))
    const { result } = setup()
    await waitFor(() => expect(result.current.currentContent).toBe("original"))
    act(() => result.current.setDraft("submitted"))
    let saving!: Promise<void>
    act(() => { saving = result.current.save() })
    await waitFor(() => expect(api.updatePrompt).toHaveBeenCalledTimes(1))
    act(() => result.current.setDraft("new typing"))
    const saved = { ...initial, content: "submitted", revision: "b".repeat(64) }
    vi.mocked(api.getPrompt).mockResolvedValue(saved)
    await act(async () => { finish(saved); await saving })
    expect(result.current.displayContent).toBe("new typing")
    expect(result.current.isDirty).toBe(true)
    expect(result.current.revision).toBe(saved.revision)
    expect(api.updatePrompt).toHaveBeenCalledWith("test", "submitted", undefined, null, initial.revision)
  })
  it("retains a stale draft on conflict until explicitly reviewed or reloaded", async () => {
    const newer = { ...initial, content: "someone else's edit", revision: "c".repeat(64) }
    vi.mocked(api.updatePrompt).mockRejectedValue(new ApiError("conflict", 409, { current: newer }))
    const { result } = setup()
    await waitFor(() => expect(result.current.currentContent).toBe("original"))
    act(() => result.current.setDraft("my draft"))
    await act(async () => { await expect(result.current.save()).rejects.toThrow("conflict") })
    expect(result.current.displayContent).toBe("my draft")
    expect(result.current.isDirty).toBe(true)
    await waitFor(() => expect(result.current.conflict).toBe(true))
    expect(result.current.revision).toBe(initial.revision)
    act(() => result.current.keepDraft())
    expect(result.current.revision).toBe(newer.revision)
    expect(result.current.displayContent).toBe("my draft")
  })
  it("keeps draft and revision on network failure", async () => {
    vi.mocked(api.updatePrompt).mockRejectedValue(new Error("connection lost"))
    const { result } = setup()
    await waitFor(() => expect(result.current.currentContent).toBe("original"))
    act(() => result.current.setDraft("unsent"))
    await act(async () => { await expect(result.current.save()).rejects.toThrow("connection lost") })
    expect(result.current.displayContent).toBe("unsent")
    expect(result.current.isDirty).toBe(true)
    expect(result.current.revision).toBe(initial.revision)
  })
})
