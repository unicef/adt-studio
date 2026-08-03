// @vitest-environment jsdom
import type { ReactNode } from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { KidsInterfaceStatus } from "@adt/types"

vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: ReactNode }) => <>{children}</>,
  Plural: ({
    value,
    one,
    other,
  }: {
    value: number
    one: string
    other: string
  }) => <>{(value === 1 ? one : other).replace("#", String(value))}</>,
}))

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    params,
  }: {
    children: ReactNode
    params: { label: string }
  }) => <a href={`/books/${params.label}/kids`}>{children}</a>,
}))

afterEach(cleanup)

const status: KidsInterfaceStatus = {
  ready: false,
  sourceKeyCount: 24,
  languages: [
    { language: "en", ready: true, missingKeys: [] },
    {
      language: "pt-BR",
      ready: false,
      missingKeys: ["kids-a", "kids-b"],
    },
  ],
}

describe("KidsPreviewLanguageGate", () => {
  it("explains the recovery path and links directly to Kids Mode", async () => {
    const { KidsPreviewLanguageGate } = await import(
      "./KidsPreviewLanguageGate"
    )
    render(
      <KidsPreviewLanguageGate
        bookLabel="volcanoes"
        error="Kids Mode requires complete interface translations"
        status={status}
      />,
    )

    expect(
      screen.getByRole("alert", { name: "Finish translating Kids Mode" }),
    ).toBeTruthy()
    expect(screen.getByText("pt-BR")).toBeTruthy()
    expect(screen.getByText("2 messages missing")).toBeTruthy()
    expect(
      screen.getByRole("link", { name: "Go to Kids Mode" }).getAttribute("href"),
    ).toBe("/books/volcanoes/kids")

    const details = screen.getByText("View technical details").closest("details")
    expect(details?.open).toBe(false)
    fireEvent.click(screen.getByText("View technical details"))
    expect(details?.open).toBe(true)
    expect(
      screen.getByText("Kids Mode requires complete interface translations"),
    ).toBeTruthy()
  })
})
