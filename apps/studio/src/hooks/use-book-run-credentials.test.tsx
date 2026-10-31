// @vitest-environment jsdom
import React, { type ReactNode } from "react"
import { afterEach, expect, it, vi } from "vitest"
import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { ProviderDescriptor } from "@adt/types"

vi.mock("@/api/client", () => ({
  BASE_URL: "",
  getProviders: vi.fn(),
  api: { getStepStatus: vi.fn(), getStagesStatus: vi.fn(), runStages: vi.fn() },
}))
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }))
vi.mock("./use-page-mutations", () => ({ invalidateStoryboardDependents: vi.fn() }))
vi.mock("@/components/a11y/LiveRegionAnnouncer", () => ({ useAnnouncer: () => ({ announce: vi.fn() }) }))
vi.mock("@/lib/completion-sound", () => ({ playCompletionSound: vi.fn(), playErrorSound: vi.fn() }))
vi.mock("sonner", () => ({ toast: { info: vi.fn(), error: vi.fn() } }))
vi.mock("@lingui/core/macro", () => ({ msg: (strings: TemplateStringsArray, ...values: unknown[]) => strings.reduce((text, part, index) => text + part + (values[index] ?? ""), "") }))
vi.mock("@lingui/core", () => ({ i18n: { _: () => "event" } }))
vi.mock("@/components/pipeline/pipeline-i18n", () => ({ getStageLabelI18n: (stage: string) => stage, getStageRunningLabelI18n: (stage: string) => stage }))
const { useBookRunStatus } = await import("./use-book-run")
const { useApiKey } = await import("./use-api-key")
const { api, getProviders } = await import("@/api/client")

class Events {
  static CLOSED = 2
  readyState = 1
  close() {}
  addEventListener() {}
}

function descriptor(id: string, header: string, sharedWith?: { providerId: string; fieldKey: string }): ProviderDescriptor {
  return {
    manifest: {
      id,
      displayName: id,
      modalities: [id === "gemini" ? "tts" : "structured-text"],
      credentialFields: [{
        key: "apiKey",
        kind: "secret",
        label: { en: "API key", "pt-BR": "k", es: "k", fr: "k", sq: "k" },
        required: true,
        header,
        legacyHeaders: [],
        storageKey: `adt-studio-${id}-key`,
        legacyStorageKeys: [],
        ...(sharedWith ? { sharedWith } : {}),
      }],
      capabilities: {},
      defaultModels: {},
    },
    configuredOnServer: false,
    fieldStatus: [{ key: "apiKey", configuredOnServer: false }],
  } as unknown as ProviderDescriptor
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); window.localStorage.clear() })

/** Only a Google key is stored; Gemini Speech borrows it via `sharedWith`. */
function setup() {
  vi.stubGlobal("EventSource", Events)
  vi.mocked(getProviders).mockResolvedValue({
    providers: [
      descriptor("google", "X-Google-API-Key"),
      descriptor("gemini", "X-Gemini-API-Key", { providerId: "google", fieldKey: "apiKey" }),
    ],
    defaults: {},
  })
  vi.mocked(api.getStepStatus).mockResolvedValue({ stages: {}, steps: {}, error: null } as never)
  vi.mocked(api.runStages).mockResolvedValue(undefined as never)
  window.localStorage.setItem("adt-studio-google-key", "AIza-google")
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  return renderHook(() => ({ run: useBookRunStatus("book"), keys: useApiKey() }), { wrapper })
}

it("reports Gemini as usable through the Google key without exposing it as Gemini's own", async () => {
  const { result } = setup()
  await waitFor(() => expect(result.current.keys.hasGeminiKey).toBe(true))
  expect(result.current.keys.geminiKey).toBe("")
  expect(result.current.keys.googleKey).toBe("AIza-google")
})

it("never sends the borrowed Google key as Gemini's own run credential", async () => {
  const { result } = setup()
  await waitFor(() => expect(result.current.keys.hasGeminiKey).toBe(true))

  act(() => result.current.run.queueRun({ fromStage: "speech", toStage: "speech", apiKey: "" }))

  await waitFor(() => expect(api.runStages).toHaveBeenCalled())
  const credentials = vi.mocked(api.runStages).mock.calls[0][3]
  // The API resolves `sharedWith` itself, after any server-side Gemini key; a
  // borrowed key sent as Gemini's own would outrank that server key.
  expect(credentials?.geminiApiKey).toBeUndefined()
  expect(credentials?.values?.gemini).toBeUndefined()
  expect(credentials?.values?.google).toEqual({ apiKey: "AIza-google" })
})
