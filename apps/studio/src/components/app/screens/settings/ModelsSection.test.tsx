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

const updateDefaultModel = vi.fn(async (model: string) => ({ model }))

vi.mock("@lingui/core/macro", () => ({
  msg: (strings: TemplateStringsArray, ...values: unknown[]) => ({
    id: strings.reduce((text, part, i) => text + part + String(values[i] ?? ""), ""),
  }),
}))
vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Plural: () => null,
  useLingui: () => ({
    i18n: { locale: "en" },
    t: (strings: TemplateStringsArray, ...values: unknown[]) =>
      strings.reduce((text, part, i) => text + part + String(values[i] ?? ""), ""),
  }),
}))
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}))
vi.mock("@/components/pipeline/pipeline-i18n", () => ({
  getStepLabelI18n: (name: string) => name,
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
    getDefaultModel: async () => ({ model: SAVED_LLM }),
    listPromptModels: async () => ({ models: [SAVED_LLM] }),
    getSpecializedModelDefaults: async () => ({
      imageGeneration: SAVED_IMAGE,
      speechGeneration: "gpt-4o-mini-tts",
    }),
    updateDefaultModel,
    updateSpecializedModelDefaults: async (value: unknown) => value,
  },
}))

const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query")
const { ModelsSection } = await import("./ModelsSection")

const defaultLlmInput = () => screen.getByLabelText("LLM model") as HTMLInputElement
const imageInput = () =>
  screen.getByLabelText("Platform default", {
    selector: "#app-image-generation-model",
  }) as HTMLInputElement
const saveButtons = () => screen.getAllByRole("button", { name: "Save changes" })

/**
 * Both settings queries have to land before typing — until they do, the drafts
 * still follow whatever the server last returned.
 */
async function renderLoaded() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <ModelsSection />
    </QueryClientProvider>,
  )
  await waitFor(() => expect(defaultLlmInput().value).toBe(SAVED_LLM))
  await waitFor(() => expect(imageInput().value).toBe(SAVED_IMAGE))
}

beforeEach(() => {
  updateDefaultModel.mockClear()
})

afterEach(cleanup)

describe("ModelsSection — provider-aware model defaults", () => {
  it("saves a qualified model id for a registered provider", async () => {
    await renderLoaded()

    fireEvent.change(defaultLlmInput(), { target: { value: "anthropic:claude-opus-4" } })
    await waitFor(() => expect(saveButtons()[0].hasAttribute("disabled")).toBe(false))
    fireEvent.click(saveButtons()[0])

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
    expect(saveButtons()[0].hasAttribute("disabled")).toBe(true)
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
    expect(saveButtons()[1].hasAttribute("disabled")).toBe(true)
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
