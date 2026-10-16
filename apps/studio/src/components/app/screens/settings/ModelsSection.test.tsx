// @vitest-environment jsdom
import React from "react"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ProviderDescriptor } from "@adt/types"

const SAVED_LLM = "openai:gpt-5.3"
const SAVED_IMAGE = "openai:gpt-image-2"

const localized = (en: string) => ({ en, "pt-BR": en, es: en, fr: en, sq: en })

function descriptor(
  id: string,
  modalities: ProviderDescriptor["manifest"]["modalities"],
): ProviderDescriptor {
  return {
    manifest: {
      id,
      displayName: id,
      modalities,
      credentialFields: [
        {
          key: "apiKey",
          kind: "secret",
          label: localized("API key"),
          required: true,
          header: `X-${id}-Key`,
          legacyHeaders: [],
          storageKey: `adt-studio-${id}-key`,
          legacyStorageKeys: [],
        },
      ],
      capabilities: Object.fromEntries(
        modalities.map((modality) => [
          modality,
          modality === "structured-text"
            ? { strategies: ["json-schema"], recursiveSchemas: true, imageInput: false, temperature: true }
            : modality === "image"
              ? { generate: true, edit: true, sizes: [], mimeTypes: [] }
              : { tools: true, streaming: true },
        ]),
      ) as ProviderDescriptor["manifest"]["capabilities"],
      defaultModels: {},
    },
    configuredOnServer: false,
    fieldStatus: [{ key: "apiKey", configuredOnServer: false }],
  }
}

const PROVIDERS = [
  descriptor("openai", ["structured-text", "agent", "image"]),
  descriptor("anthropic", ["structured-text", "agent"]),
]
PROVIDERS[0].manifest.capabilities["structured-text"]!.reasoningEfforts = [
  { models: "gpt-5.*", efforts: ["low", "medium", "high"], default: "medium" },
]

const updateDefaultModel = vi.fn(async (model: string) => ({ model }))
const taskModelsResponse = () => ({
  defaultModel: apiState.defaultModel,
  defaultReasoningEffort: null,
  tasks: [
    { id: "metadata", kind: "step", configKey: "metadata", step: "metadata", prompts: ["metadata_extraction"], model: null, reasoningEffort: null },
    { id: "render_strategies.llm", kind: "render-strategy", configKey: "llm", prompts: ["web_generation_html"], model: "openai:gpt-5.4", reasoningEffort: apiState.renderingEffort },
  ],
})
const updateTaskModel = vi.fn(async (_id: string, _change: Record<string, unknown>) => taskModelsResponse())
const apiState: {
  defaultModel: string
  promptModels: string[]
  prompts: Array<{ name: string; variants: string[] }>
  renderingEffort: string | null
} = { defaultModel: SAVED_LLM, promptModels: [SAVED_LLM], prompts: [], renderingEffort: null }

vi.mock("@lingui/core/macro", () => ({
  msg: (strings: TemplateStringsArray, ...values: unknown[]) => ({
    id: strings.reduce((text, part, i) => text + part + String(values[i] ?? ""), ""),
  }),
}))
vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Plural: () => null,
  useLingui: () => ({
    i18n: { locale: "en", _: (descriptor: { id: string }) => descriptor.id },
    t: (strings: TemplateStringsArray, ...values: unknown[]) =>
      strings.reduce((text, part, i) => text + part + String(values[i] ?? ""), ""),
  }),
}))
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}))
vi.mock("@/components/pipeline/pipeline-i18n", () => ({
  getStepLabelI18n: (name: string) => name,
  getStageLabelI18n: (name: string) => name,
}))
vi.mock("@/components/ui/sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock("@/hooks/use-discovered-models", () => ({
  useDiscoveredModelIds: () => ["anthropic:claude-from-discovery"],
}))
vi.mock("@/hooks/use-provider-credentials", () => ({
  useProviderCredentials: () => ({ providers: PROVIDERS, credentials: {}, defaults: {} }),
}))
vi.mock("@/api/client", () => ({
  api: {
    getDefaultModel: async () => ({ model: apiState.defaultModel }),
    listPromptModels: async () => ({ models: apiState.promptModels }),
    listPrompts: async () => ({ prompts: apiState.prompts }),
    getSpecializedModelDefaults: async () => ({
      imageGeneration: SAVED_IMAGE,
      speechGeneration: "gpt-4o-mini-tts",
    }),
    updateDefaultModel,
    updateSpecializedModelDefaults: async (value: unknown) => value,
    getTaskModels: async () => taskModelsResponse(),
    updateTaskModel,
  },
}))

const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query")
const { FloatingSaveProvider } = await import("@/components/pipeline/components/floating-save")
const { ModelsSection } = await import("./ModelsSection")

const byId = (id: string) => document.getElementById(id) as HTMLInputElement
const defaultLlmInput = () => byId("app-default-model")
const imageInput = () => byId("app-image-generation-model")
const saveButton = () => screen.getByRole("button", { name: "Save" })
const searchInput = () => screen.getByRole("searchbox", { name: "Search tasks, prompts or models" })

/**
 * Both settings queries have to land before typing — until they do, the drafts
 * still follow whatever the server last returned.
 */
async function renderLoaded() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <FloatingSaveProvider>
        <ModelsSection />
      </FloatingSaveProvider>
    </QueryClientProvider>,
  )
  await waitFor(() => expect(defaultLlmInput().value).toBe(SAVED_LLM))
  await waitFor(() => expect(imageInput().value).toBe(SAVED_IMAGE))
  await waitFor(() => expect(byId("task-model-metadata")).toBeTruthy())
}

beforeEach(() => {
  updateDefaultModel.mockClear()
  updateTaskModel.mockClear()
  apiState.defaultModel = SAVED_LLM
  apiState.promptModels = [SAVED_LLM]
  apiState.prompts = []
  apiState.renderingEffort = null
})

afterEach(cleanup)

describe("ModelsSection — provider-aware model defaults", () => {
  it("saves a qualified model id for a registered provider", async () => {
    await renderLoaded()

    fireEvent.change(defaultLlmInput(), { target: { value: "anthropic:claude-opus-4" } })
    await waitFor(() => expect(saveButton().hasAttribute("disabled")).toBe(false))
    fireEvent.click(saveButton())

    await waitFor(() =>
      expect(updateDefaultModel).toHaveBeenCalledWith("anthropic:claude-opus-4"),
    )
  })

  it("blocks the save and explains when the provider is not registered", async () => {
    await renderLoaded()

    fireEvent.change(defaultLlmInput(), { target: { value: "mistral:large" } })

    await waitFor(() =>
      expect(
        screen.getByText(
          'Provider "mistral" is not registered. Add its API keys in Settings or choose another model.',
        ),
      ).toBeTruthy(),
    )
    expect(saveButton().hasAttribute("disabled")).toBe(true)
    expect(updateDefaultModel).not.toHaveBeenCalled()
  })

  it("blocks the save when the provider does not declare the modality", async () => {
    await renderLoaded()

    fireEvent.change(imageInput(), { target: { value: "anthropic:claude-opus-4" } })

    await waitFor(() =>
      expect(
        screen.getByText('Provider "anthropic" does not support image generation.'),
      ).toBeTruthy(),
    )
    expect(saveButton().hasAttribute("disabled")).toBe(true)
  })

  it("offers discovered models in the default LLM picker", async () => {
    await renderLoaded()

    fireEvent.focus(defaultLlmInput())
    fireEvent.change(defaultLlmInput(), { target: { value: "claude-from-discovery" } })

    await waitFor(() =>
      expect(screen.getAllByText(/claude-from-discovery/).length).toBeGreaterThan(0),
    )
  })
})

describe("ModelsSection — model per task", () => {
  it("saves a task override and clears another back to the default", async () => {
    await renderLoaded()
    expect(byId("task-model-metadata").placeholder).toBe(SAVED_LLM)
    expect(byId("task-model-render_strategies-llm").value).toBe("openai:gpt-5.4")

    fireEvent.change(byId("task-model-metadata"), { target: { value: "anthropic:claude-opus-4" } })
    fireEvent.click(screen.getByRole("button", { name: "Use the default LLM for Web Rendering" }))
    await waitFor(() => expect(saveButton().hasAttribute("disabled")).toBe(false))
    fireEvent.click(saveButton())

    await waitFor(() => expect(updateTaskModel).toHaveBeenCalledTimes(2))
    expect(updateTaskModel).toHaveBeenNthCalledWith(1, "metadata", { model: "anthropic:claude-opus-4" })
    expect(updateTaskModel).toHaveBeenNthCalledWith(2, "render_strategies.llm", { model: null })
  })
})

describe("ModelsSection — reasoning effort", () => {
  const effortTrigger = (id: string) => document.getElementById(`${id}-effort`) as HTMLElement

  it("shows the inherited effort for the effective model", async () => {
    await renderLoaded()
    expect(effortTrigger("task-model-metadata").textContent).toContain("Default · Medium")
    expect(document.getElementById("app-default-reasoning-effort")?.textContent).toContain("Model default")
  })

  it("marks the effort as unsupported when the task model has no effort setting", async () => {
    await renderLoaded()
    fireEvent.change(byId("task-model-metadata"), { target: { value: "anthropic:claude-opus-4" } })
    await waitFor(() => expect(effortTrigger("task-model-metadata").textContent).toBe("Not supported"))
  })

  it("blocks saving an effort the task model does not support", async () => {
    apiState.renderingEffort = "xhigh"
    await renderLoaded()
    expect(screen.getByText("openai:gpt-5.4 does not support the Extra high effort. Choose another level.")).toBeTruthy()

    fireEvent.change(byId("task-model-metadata"), { target: { value: "anthropic:claude-opus-4" } })
    await waitFor(() => expect(saveButton().hasAttribute("disabled")).toBe(true))
  })
})

describe("ModelsSection — search", () => {
  it("filters rows by prompt name and by model", async () => {
    await renderLoaded()

    fireEvent.change(searchInput(), { target: { value: "web_generation" } })
    expect(byId("task-model-render_strategies-llm")).toBeTruthy()
    expect(byId("task-model-metadata")).toBeNull()
    expect(byId("app-default-model")).toBeNull()

    fireEvent.change(searchInput(), { target: { value: "gpt-5.4" } })
    expect(byId("task-model-render_strategies-llm")).toBeTruthy()
    expect(byId("task-model-metadata")).toBeNull()

    fireEvent.change(searchInput(), { target: { value: SAVED_LLM } })
    expect(byId("task-model-metadata")).toBeTruthy()
    expect(byId("app-default-model")).toBeTruthy()
  })

  it("shows an empty state that clears the search", async () => {
    await renderLoaded()

    fireEvent.change(searchInput(), { target: { value: "nothing-matches-this" } })
    expect(screen.getByText("No tasks, prompts or models match “nothing-matches-this”.")).toBeTruthy()

    fireEvent.click(screen.getAllByRole("button", { name: "Clear search" }).at(-1)!)
    expect(searchInput().value).toBe("")
    expect(byId("task-model-metadata")).toBeTruthy()
  })
})

describe("ModelsSection — tuned prompt warning", () => {
  const SOL = "openai:gpt-6.1-sol"
  const shippedSolPrompts = [
    { name: "web_generation_html", variants: ["web_generation_html__openai_gpt_6_1_sol"] },
  ]

  async function renderWithDefault(model: string) {
    apiState.defaultModel = model
    apiState.promptModels = []
    apiState.prompts = shippedSolPrompts
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <FloatingSaveProvider>
          <ModelsSection />
        </FloatingSaveProvider>
      </QueryClientProvider>,
    )
    await waitFor(() => expect(defaultLlmInput().value).toBe(model))
  }

  it("does not ask for new prompts when the model's variants ship in a model folder", async () => {
    await renderWithDefault(SOL)

    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(screen.queryByText("Generate global prompts")).toBeNull()
  })

  it("still asks for new prompts when the model has no tuned variants", async () => {
    await renderWithDefault("anthropic:claude-opus-4")

    expect(await screen.findByText("Generate global prompts")).toBeTruthy()
  })
})
