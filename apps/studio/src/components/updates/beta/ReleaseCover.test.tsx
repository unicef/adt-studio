// @vitest-environment jsdom
import React from "react"
import { setupI18n } from "@lingui/core"
import { I18nProvider } from "@lingui/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ReleaseCover } from "./ReleaseCover"

let imageShouldFail = false

class MockImage {
  onload: (() => void) | null = null
  onerror: (() => void) | null = null

  set src(_url: string) {
    queueMicrotask(() => {
      if (imageShouldFail) this.onerror?.()
      else this.onload?.()
    })
  }
}

beforeEach(() => {
  imageShouldFail = false
  vi.stubGlobal("Image", MockImage)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function renderCover(
  release: React.ComponentProps<typeof ReleaseCover>["release"],
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const i18n = setupI18n({ locale: "en", messages: {} })

  render(
    <I18nProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <ReleaseCover release={release} />
      </QueryClientProvider>
    </I18nProvider>,
  )

  return queryClient
}

describe("ReleaseCover", () => {
  it("renders the fallback banner when artwork is absent", () => {
    renderCover({
      version: "0.7.4-beta.4",
      title: "Reliable translations",
      direction: "upgrade",
    })

    expect(screen.getByText("Preview")).toBeTruthy()
    expect(screen.getByText("v0.7.4-beta.4")).toBeTruthy()
  })

  it("falls back to the banner when remote artwork fails", async () => {
    imageShouldFail = true
    const coverUrl = "https://github.com/user-attachments/assets/cover"
    const queryClient = renderCover({
      version: "0.7.4-beta.4",
      title: "Reliable translations",
      coverUrl,
      coverAlt: "Translation cover",
      direction: "upgrade",
    })

    await waitFor(() => {
      expect(
        queryClient.getQueryState([
          "desktop-updates",
          "release-cover",
          coverUrl,
        ])?.status,
      ).toBe("error")
    })
    expect(screen.getByText("v0.7.4-beta.4")).toBeTruthy()
  })

  it("shows remote artwork after TanStack Query preloads it", async () => {
    renderCover({
      version: "0.7.4-beta.4",
      title: "Reliable translations",
      coverUrl: "https://github.com/user-attachments/assets/cover",
      coverAlt: "Translation cover",
      direction: "upgrade",
    })

    await waitFor(() => {
      expect(screen.getByAltText("Translation cover").tagName).toBe("IMG")
    })
  })
})
