// @vitest-environment jsdom
import React from "react"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ProviderDescriptor, ProviderHealthResponse } from "@adt/types"

const localized = (en: string) => ({ en, "pt-BR": en, es: en, fr: en, sq: en })

function descriptor(
  id: string,
  overrides: Partial<ProviderDescriptor["manifest"]> = {},
): ProviderDescriptor {
  const manifest = {
    id,
    displayName: id,
    modalities: ["structured-text" as const],
    credentialFields: [
      {
        key: "apiKey",
        kind: "secret" as const,
        label: localized("API key"),
        required: true,
        header: `X-${id}-Key`,
        legacyHeaders: [],
        storageKey: `adt-studio-${id}-key`,
        legacyStorageKeys: [],
      },
    ],
    capabilities: {
      "structured-text": {
        strategies: ["json-schema" as const],
        recursiveSchemas: true,
        imageInput: false,
        temperature: true,
      },
    },
    defaultModels: {},
    ...overrides,
  }
  return {
    manifest,
    configuredOnServer: false,
    fieldStatus: manifest.credentialFields.map((field) => ({
      key: field.key,
      configuredOnServer: false,
    })),
  }
}

const OLLAMA = descriptor("ollama", {
  displayName: "Ollama",
  credentialFields: [
    {
      key: "baseUrl",
      kind: "url",
      label: localized("Base URL"),
      required: false,
      header: "X-ADT-Provider-Ollama-Base-URL",
      legacyHeaders: [],
      storageKey: "adt-studio-ollama-base-url",
      legacyStorageKeys: [],
    },
  ],
})

let providers: ProviderDescriptor[] = []
let health: ProviderHealthResponse = { providerId: "openai", ok: true, code: "ok", modelCount: 3 }

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
  useLocation: () => ({ hash: "" }),
}))
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))
vi.mock("@/components/ui/sonner", () => ({ toast: { success: vi.fn() } }))
vi.mock("@/hooks/use-provider-health", () => ({
  useProviderHealth: (providerId: string, _draft: unknown, enabled: boolean) => ({
    data: enabled ? { ...health, providerId } : undefined,
    isFetching: false,
    refetch: vi.fn(),
  }),
}))
const cliLogin = {
  status: null as null | { providerId: string; state: string; url?: string; detail?: string },
  start: vi.fn(),
  cancel: vi.fn(),
  logout: vi.fn(),
  isStarting: false,
  isLoggingOut: false,
}
vi.mock("@/hooks/use-cli-login", () => ({ useCliLogin: () => cliLogin }))
vi.mock("@/hooks/use-provider-credentials", () => ({
  useProviderCredentials: () => ({
    providers,
    credentials: {},
    credentialValue: () => "",
    setCredential,
    isLoading: false,
    error: null,
  }),
}))

const setCredential = vi.fn()

const { ProvidersList } = await import("./ProvidersList")

/** The expanded card's own region, so collapsed siblings' controls stay out of reach. */
function panelFor(cardKey: string): HTMLElement {
  const toggle = document.querySelector<HTMLElement>(
    `[aria-controls="prov-panel-${cardKey}"][aria-expanded]`,
  )
  const panel = document.getElementById(`prov-panel-${cardKey}`)
  if (!toggle || !panel) throw new Error(`no card for ${cardKey}`)
  fireEvent.click(toggle)
  return panel
}

beforeEach(() => {
  providers = [descriptor("openai", { displayName: "OpenAI" }), OLLAMA]
})

afterEach(() => {
  cleanup()
  setCredential.mockClear()
  cliLogin.status = null
  cliLogin.start.mockClear()
  cliLogin.logout.mockClear()
})

const CODEX: ProviderDescriptor = {
  ...descriptor("codex", {
    displayName: "OpenAI Codex",
    credentialFields: [
      {
        key: "apiKey",
        kind: "secret",
        label: localized("API key"),
        required: false,
        header: "X-ADT-Provider-Codex-Key",
        legacyHeaders: [],
        storageKey: "adt-studio-codex-key",
        legacyStorageKeys: [],
      },
    ],
  }),
  supportsCliLogin: true,
}

describe("ProvidersList — CLI sign-in", () => {
  beforeEach(() => {
    providers = [descriptor("openai", { displayName: "OpenAI" }), CODEX]
  })

  it("offers an in-app ChatGPT sign-in when the Codex CLI has no login", () => {
    health = { providerId: "codex", ok: false, code: "not-logged-in" }
    render(<ProvidersList />)
    const panel = panelFor("openai")

    const button = within(panel).getByRole("button", { name: /Sign in with ChatGPT/ })
    fireEvent.click(button)

    expect(cliLogin.start).toHaveBeenCalledTimes(1)
    // The terminal instructions are replaced by the button for a missing login.
    expect(within(panel).queryByText(/codex login/)).toBeNull()
  })

  it("shows the waiting state with a fallback link while the CLI waits for the browser", () => {
    health = { providerId: "codex", ok: false, code: "not-logged-in" }
    cliLogin.status = {
      providerId: "codex",
      state: "pending",
      url: "https://auth.openai.com/oauth/authorize?client_id=x",
    }
    render(<ProvidersList />)
    const panel = panelFor("openai")

    expect(within(panel).getByText(/Finish signing in with ChatGPT/)).toBeTruthy()
    const link = within(panel).getByRole("link", { name: /Use this link/ })
    expect(link.getAttribute("href")).toBe("https://auth.openai.com/oauth/authorize?client_id=x")
    expect(within(panel).queryByRole("button", { name: /Sign in with ChatGPT/ })).toBeNull()
  })

  it("offers to sign out once the CLI login is detected", () => {
    health = { providerId: "codex", ok: true, code: "local-login", detail: "ChatGPT account" }
    render(<ProvidersList />)
    const panel = panelFor("openai")

    fireEvent.click(within(panel).getByRole("button", { name: /Sign out/ }))

    expect(cliLogin.logout).toHaveBeenCalledTimes(1)
    expect(within(panel).queryByRole("button", { name: /Sign in with ChatGPT/ })).toBeNull()
  })

  it("warns that a server-side key outranks the sign-in", () => {
    health = { providerId: "codex", ok: true, code: "ok", detail: "API key" }
    providers = [
      descriptor("openai", { displayName: "OpenAI" }),
      { ...CODEX, fieldStatus: [{ key: "apiKey", configuredOnServer: true }] },
    ]
    render(<ProvidersList />)
    const panel = panelFor("openai")

    expect(within(panel).getByText(/server environment takes precedence/)).toBeTruthy()
    expect(within(panel).getByRole("button", { name: /Sign in with ChatGPT/ })).toBeTruthy()
    expect(within(panel).queryByRole("button", { name: /Sign out/ })).toBeNull()
  })
})

describe("ProvidersList — live manifests", () => {
  it("marks a card whose backend the server does not register", () => {
    render(<ProvidersList />)

    // Google has no descriptor in this fixture.
    expect(screen.getAllByText("Not available on this server").length).toBeGreaterThan(0)
  })

  it("renders the credential fields declared by the live manifest", async () => {
    render(<ProvidersList />)

    const panel = panelFor("ollama")
    await waitFor(() => expect(within(panel).getByLabelText("Base URL")).toBeTruthy())
  })

  it("saves a typed credential under the manifest field key", async () => {
    render(<ProvidersList />)

    const panel = panelFor("openai")
    const input = await waitFor(() => within(panel).getByLabelText("API key"))
    fireEvent.change(input, { target: { value: "sk-live" } })
    fireEvent.click(within(panel).getByRole("button", { name: "Save" }))

    expect(setCredential).toHaveBeenCalledWith("openai", "apiKey", "sk-live")
  })

  it("blocks the save when a url field fails client validation", async () => {
    render(<ProvidersList />)

    const panel = panelFor("ollama")
    const input = await waitFor(() => within(panel).getByLabelText("Base URL"))
    fireEvent.change(input, { target: { value: "not-a-url" } })

    expect(within(panel).getByText("Enter a valid HTTP or HTTPS URL.")).toBeTruthy()
    expect(within(panel).getByRole("button", { name: "Save" }).hasAttribute("disabled")).toBe(true)
  })

  it("shows the live health verdict for a probed backend", async () => {
    health = { providerId: "ollama", ok: false, code: "unreachable" }
    render(<ProvidersList />)

    const panel = panelFor("ollama")
    await waitFor(() =>
      expect(within(panel).getByText("The provider could not be reached.")).toBeTruthy(),
    )
  })
})
