// @vitest-environment jsdom
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { ElementAudioPageView } from "@/api/client"

const calls = vi.hoisted(() => ({
  getElementAudio: vi.fn(),
  updateElementAudio: vi.fn(),
  getTextCatalog: vi.fn(),
  versionPicker: vi.fn(),
}))

const translate = (strings: TemplateStringsArray, ...values: unknown[]) =>
  strings.reduce((text, part, index) => text + part + (values[index] ?? ""), "")

vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useLingui: () => ({ t: translate }),
}))

vi.mock("@/api/client", () => ({
  api: {
    getElementAudio: calls.getElementAudio,
    updateElementAudio: calls.updateElementAudio,
    getTextCatalog: calls.getTextCatalog,
  },
}))

vi.mock("@/components/pipeline/components/VersionPicker", () => ({
  VersionPicker: (props: unknown) => {
    calls.versionPicker(props)
    return <div data-testid="version-picker" />
  },
}))

const { AudioSection } = await import("./AudioSection")
const { ElementProvider } = await import("../element-context")

let client: QueryClient

function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={client}>
      <ElementProvider
        value={{
          dataId: "pg001_im001",
          classes: [],
          onClassesChange: vi.fn(),
          deviceView: "desktop",
          bookLabel: "book",
        }}
      >
        {children}
      </ElementProvider>
    </QueryClientProvider>
  )
}

function view(entries: ElementAudioPageView["entries"]): ElementAudioPageView {
  return { pageId: "pg001", versions: { pg001: 1 }, entries }
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  calls.getElementAudio.mockReset()
  calls.updateElementAudio.mockReset()
  calls.getTextCatalog.mockReset()
  calls.versionPicker.mockReset()
  calls.getTextCatalog.mockResolvedValue(null)
})

afterEach(cleanup)

describe("AudioSection (SPEC-0014)", () => {
  it("loads the authored script, saves a new value and reports completion", async () => {
    calls.getElementAudio.mockResolvedValue(
      view([{ nodeId: "pg001_im001", text: "Mago", sourcePageId: "pg001" }]),
    )
    calls.updateElementAudio.mockResolvedValue(
      view([{ nodeId: "pg001_im001", text: "Maga", sourcePageId: "pg001" }]),
    )

    render(<AudioSection dataId="pg001_im001" pageId="pg001" />, { wrapper: Providers })

    const textarea = await screen.findByLabelText("Element audio script")
    expect((textarea as HTMLTextAreaElement).value).toBe("Mago")
    expect(calls.versionPicker).toHaveBeenCalledWith(
      expect.objectContaining({
        step: "element-audio",
        itemId: "pg001",
        currentVersion: 1,
        bookLabel: "book",
      }),
    )

    fireEvent.change(textarea, { target: { value: "Maga" } })
    fireEvent.click(screen.getByRole("button", { name: /Save/ }))

    await waitFor(() => {
      expect(calls.updateElementAudio).toHaveBeenCalledWith("book", "pg001", {
        versions: { pg001: 1 },
        entries: [{ nodeId: "pg001_im001", text: "Maga", sourcePageId: "pg001" }],
      })
    })
    await screen.findByText("Saved")
  })

  it("authors a new entry under the current page", async () => {
    calls.getElementAudio.mockResolvedValue({ pageId: "pg001", versions: {}, entries: [] })
    calls.updateElementAudio.mockResolvedValue(
      view([{ nodeId: "pg001_im001", text: "Nuevo", sourcePageId: "pg001" }]),
    )

    render(<AudioSection dataId="pg001_im001" pageId="pg001" />, { wrapper: Providers })

    const textarea = await screen.findByLabelText("Element audio script")
    fireEvent.change(textarea, { target: { value: "Nuevo" } })
    fireEvent.click(screen.getByRole("button", { name: /Save/ }))

    await waitFor(() => {
      expect(calls.updateElementAudio).toHaveBeenCalledWith("book", "pg001", {
        versions: {},
        entries: [{ nodeId: "pg001_im001", text: "Nuevo", sourcePageId: "pg001" }],
      })
    })
  })

  it("surfaces a save conflict instead of silently losing the draft", async () => {
    calls.getElementAudio.mockResolvedValue(
      view([{ nodeId: "pg001_im001", text: "Mago", sourcePageId: "pg001" }]),
    )
    calls.updateElementAudio.mockRejectedValue(new Error("Element audio changed. Refresh before saving."))

    render(<AudioSection dataId="pg001_im001" pageId="pg001" />, { wrapper: Providers })

    const textarea = await screen.findByLabelText("Element audio script")
    fireEvent.change(textarea, { target: { value: "Maga" } })
    fireEvent.click(screen.getByRole("button", { name: /Save/ }))

    await screen.findByText("Element audio changed. Refresh before saving.")
    expect((textarea as HTMLTextAreaElement).value).toBe("Maga")

    calls.getElementAudio.mockResolvedValueOnce(
      view([{ nodeId: "pg001_im001", text: "Maga", sourcePageId: "pg001" }]),
    )
    fireEvent.click(screen.getByRole("button", { name: "Retry" }))
    await waitFor(() => expect(calls.getElementAudio).toHaveBeenCalledTimes(2))
    expect((textarea as HTMLTextAreaElement).value).toBe("Maga")
  })

  it("discards the draft back to the saved script", async () => {
    calls.getElementAudio.mockResolvedValue(
      view([{ nodeId: "pg001_im001", text: "Mago", sourcePageId: "pg001" }]),
    )

    render(<AudioSection dataId="pg001_im001" pageId="pg001" />, { wrapper: Providers })

    const textarea = await screen.findByLabelText("Element audio script")
    fireEvent.change(textarea, { target: { value: "Maga" } })
    fireEvent.click(screen.getByRole("button", { name: "Discard" }))

    expect((textarea as HTMLTextAreaElement).value).toBe("Mago")
    expect(calls.updateElementAudio).not.toHaveBeenCalled()
  })

  it("keeps the draft's base versions when a background refetch advances the row", async () => {
    calls.getElementAudio.mockResolvedValue(
      view([{ nodeId: "pg001_im001", text: "Mago", sourcePageId: "pg001" }]),
    )
    calls.updateElementAudio.mockResolvedValue({
      pageId: "pg001",
      versions: { pg001: 2 },
      entries: [{ nodeId: "pg001_im001", text: "Maga", sourcePageId: "pg001" }],
    })

    render(<AudioSection dataId="pg001_im001" pageId="pg001" />, { wrapper: Providers })

    const textarea = await screen.findByLabelText("Element audio script")
    fireEvent.change(textarea, { target: { value: "Maga" } })

    // Another writer advances the row while the draft is open.
    client.setQueryData(["books", "book", "element-audio", "pg001"], {
      pageId: "pg001",
      versions: { pg001: 2 },
      entries: [{ nodeId: "pg001_im001", text: "Mago", sourcePageId: "pg001" }],
    })

    fireEvent.click(screen.getByRole("button", { name: /Save/ }))

    await waitFor(() => {
      expect(calls.updateElementAudio).toHaveBeenCalledWith("book", "pg001", {
        versions: { pg001: 1 },
        entries: [{ nodeId: "pg001_im001", text: "Maga", sourcePageId: "pg001" }],
      })
    })
  })

  it("keeps an unsaved draft when the author inspects another element and returns", async () => {
    calls.getElementAudio.mockResolvedValue(
      view([
        { nodeId: "pg001_im001", text: "Mago", sourcePageId: "pg001" },
        { nodeId: "pg001_im002", text: "Dragón", sourcePageId: "pg001" },
      ]),
    )

    const { rerender } = render(<AudioSection dataId="pg001_im001" pageId="pg001" />, {
      wrapper: Providers,
    })
    const first = await screen.findByLabelText("Element audio script")
    fireEvent.change(first, { target: { value: "Maga" } })

    rerender(<AudioSection dataId="pg001_im002" pageId="pg001" />)
    expect((screen.getByLabelText("Element audio script") as HTMLTextAreaElement).value).toBe(
      "Dragón",
    )

    rerender(<AudioSection dataId="pg001_im001" pageId="pg001" />)
    expect((screen.getByLabelText("Element audio script") as HTMLTextAreaElement).value).toBe(
      "Maga",
    )
  })

  it("keeps the draft's base versions across a selection switch after a refetch", async () => {
    calls.getElementAudio.mockResolvedValue(
      view([
        { nodeId: "pg001_im001", text: "Mago", sourcePageId: "pg001" },
        { nodeId: "pg001_im002", text: "Dragón", sourcePageId: "pg001" },
      ]),
    )
    calls.updateElementAudio.mockResolvedValue({
      pageId: "pg001",
      versions: { pg001: 2 },
      entries: [{ nodeId: "pg001_im001", text: "Maga", sourcePageId: "pg001" }],
    })

    const { rerender } = render(<AudioSection dataId="pg001_im001" pageId="pg001" />, {
      wrapper: Providers,
    })
    const first = await screen.findByLabelText("Element audio script")
    fireEvent.change(first, { target: { value: "Maga" } })

    // The row advances while the draft is open.
    client.setQueryData(["books", "book", "element-audio", "pg001"], {
      pageId: "pg001",
      versions: { pg001: 2 },
      entries: [
        { nodeId: "pg001_im001", text: "Mago", sourcePageId: "pg001" },
        { nodeId: "pg001_im002", text: "Dragón", sourcePageId: "pg001" },
      ],
    })

    rerender(<AudioSection dataId="pg001_im002" pageId="pg001" />)
    rerender(<AudioSection dataId="pg001_im001" pageId="pg001" />)

    fireEvent.click(screen.getByRole("button", { name: /Save/ }))
    await waitFor(() => {
      expect(calls.updateElementAudio).toHaveBeenCalledWith("book", "pg001", {
        versions: { pg001: 1 },
        entries: [{ nodeId: "pg001_im001", text: "Maga", sourcePageId: "pg001" }],
      })
    })
  })

  it("surfaces a failed Speech Preparation instead of silently dropping the audio", async () => {
    calls.getElementAudio.mockResolvedValue(
      view([{ nodeId: "pg001_im001", text: "Mago", sourcePageId: "pg001" }]),
    )
    calls.getTextCatalog.mockResolvedValue({
      entries: [],
      generatedAt: "now",
      version: 1,
      translations: {},
      speechTexts: {
        en: {
          version: 1,
          sourceSignature: "source",
          entries: [
            {
              id: "pg001_im001_audio",
              status: "failed",
              failureReason: "Unsupported symbol",
            },
          ],
        },
      },
    })

    render(<AudioSection dataId="pg001_im001" pageId="pg001" />, { wrapper: Providers })

    expect(await screen.findByText("Preparation failed")).toBeTruthy()
  })
})
