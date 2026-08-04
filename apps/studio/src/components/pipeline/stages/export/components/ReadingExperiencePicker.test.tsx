// @vitest-environment jsdom
import type { ReactNode } from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { KidsExportReadiness } from "@/lib/kids-export-readiness"

vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: ReactNode }) => <>{children}</>,
  useLingui: () => ({
    t: (parts: TemplateStringsArray) => parts.join(""),
  }),
}))

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    params,
    search,
  }: {
    children: ReactNode
    params: { label: string }
    search: { returnTo?: string }
  }) => (
    <a
      href={`/books/${params.label}/kids${search.returnTo ? `?returnTo=${search.returnTo}` : ""}`}
    >
      {children}
    </a>
  ),
}))

afterEach(cleanup)

const incomplete: KidsExportReadiness = {
  ready: false,
  setupEnabled: true,
  interfaceReady: true,
  voicesReady: false,
  buddyCount: 2,
  languageCount: 2,
  readyVoiceLanguageCount: 1,
  missingInterfaceLanguages: [],
  missingVoiceLanguages: ["fr"],
}

describe("ReadingExperiencePicker", () => {
  it("keeps Standard selectable and gives incomplete Kids Mode a recovery path", async () => {
    const { ReadingExperiencePicker } = await import(
      "./ReadingExperiencePicker"
    )
    const onSelect = vi.fn()
    render(
      <ReadingExperiencePicker
        bookLabel="volcanoes"
        selected="kids"
        onSelect={onSelect}
        readiness={incomplete}
        loading={false}
        disabled={false}
      />,
    )

    expect(screen.getByRole("alert")).toBeTruthy()
    expect(screen.getByText(/Generate complete buddy voices/)).toBeTruthy()
    expect(
      screen
        .getByRole("link", { name: "Finish Kids Mode setup" })
        .getAttribute("href"),
    ).toBe("/books/volcanoes/kids?returnTo=export")

    fireEvent.click(screen.getByRole("radio", { name: /Standard/ }))
    expect(onSelect).toHaveBeenCalledWith("standard")
  })
})
