// @vitest-environment jsdom
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useLingui: () => ({
    t: (strings: TemplateStringsArray, ...values: unknown[]) => strings.reduce((text, part, index) => text + part + (values[index] ?? ""), ""),
    i18n: { _: (value: { id?: string }) => value.id ?? "" },
  }),
}))
vi.mock("@/hooks/use-books", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/hooks/use-books")>(),
  useBook: () => ({ data: {
    title: "Retained book", pageCount: 1,
    metadata: { title: "Retained book", authors: [], publisher: null, language_code: "en", cover_page_number: 1, reasoning: "" },
    bookSummary: { summary: "Retained summary" },
  } }),
}))
vi.mock("@/hooks/use-api-key", () => ({ useApiKey: () => ({ apiKey: "local-test-key" }) }))
vi.mock("@/hooks/use-pages", () => ({ usePageImage: () => ({ data: undefined }) }))
vi.mock("@/hooks/use-downstream-with-output", () => ({ useDownstreamWithOutput: () => ["quizzes", "glossary", "speech"] }))
vi.mock("@/components/pipeline/pipeline-i18n", () => ({ getStageLabelI18n: (slug: string) => slug }))
// Language search is tested separately; retain the real metadata form, mutation,
// API client and confirmation dialog so a follow-on generation request is visible.
vi.mock("@/components/LanguagePicker", () => ({
  LanguagePicker: ({ label, selected, onSelect }: { label: string; selected: string; onSelect: (value: string) => void }) =>
    <label>{label}<select value={selected} onChange={event => onSelect(event.target.value)}><option value="en">English</option><option value="fr">French</option></select></label>,
}))
const { BookHeader } = await import("./BookHeader")
const requests: { url: string; method: string; body: unknown }[] = []
let queryClient: QueryClient
beforeEach(() => {
  requests.length = 0
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    requests.push({ url: String(url), method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : null })
    return new Response(JSON.stringify({ providers: [], version: 2, languageChanged: true, baseLanguageChanged: true, taskId: "unexpected-generation" }), { status: 200, headers: { "Content-Type": "application/json" } })
  }))
})
afterEach(() => { cleanup(); queryClient.clear(); vi.unstubAllGlobals() })
function mount() {
  render(<QueryClientProvider client={queryClient}><BookHeader bookLabel="retained" pages={[]} /></QueryClientProvider>)
  fireEvent.click(screen.getByRole("button", { name: "Edit book metadata" }))
}

describe("BookHeader metadata save", () => {
  it("confirms a language edit and sends only metadata, even with a configured provider key", async () => {
    mount()
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "fr" } })
    fireEvent.click(screen.getByRole("button", { name: /^save/i }))
    const dialog = screen.getByRole("dialog")
    expect(requests).toHaveLength(0)
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }))
    expect(requests).toHaveLength(0)
    expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("fr")
    fireEvent.click(screen.getByRole("button", { name: /^save/i }))
    await act(async () => { fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Change language" })) })
    await waitFor(() => expect(screen.getByRole("button", { name: "Edit book metadata" })).toBeTruthy())
    expect(requests).toEqual([{ url: "/api/books/retained/metadata", method: "PUT", body: { title: "Retained book", authors: [], publisher: null, language_code: "fr", cover_page_number: 1, reasoning: "" } }])
    expect(screen.getByText("Retained summary")).toBeTruthy()
  })
})
