// @vitest-environment jsdom
import React from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { AvailableRelease } from "@/hooks/use-update-status"

vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

const { BetaReleaseInstallButton } = await import("./BetaReleaseInstallButton")

function renderButton(release: AvailableRelease, currentVersion: string) {
  const onInstall = vi.fn()
  render(
    <BetaReleaseInstallButton
      release={release}
      currentVersion={currentVersion}
      preparing={false}
      checking={false}
      onInstall={onInstall}
    />,
  )
  return onInstall
}

describe("BetaReleaseInstallButton", () => {
  afterEach(cleanup)

  it("asks before an older beta and warns about books", () => {
    renderButton({ version: "0.8.1-beta.2", direction: "downgrade" }, "0.8.1-beta.3")
    fireEvent.click(screen.getByRole("button", { name: /Install older version/ }))
    expect(screen.getByText("Install an older beta?")).toBeTruthy()
    expect(screen.getByText(/Back up your books/)).toBeTruthy()
  })

  it("treats another PR's preview as a preview, not an older version", () => {
    // The updater ranks a preview below a numbered beta of the same core, so it
    // arrives as a "downgrade" — that ordering means nothing across tracks.
    renderButton({ version: "0.8.1-beta-pr-900.2", direction: "downgrade" }, "0.8.1-beta.3")
    expect(screen.queryByRole("button", { name: /Install older version/ })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: /Install preview/ }))
    expect(screen.getByText("Install a preview build?")).toBeTruthy()
    expect(screen.getByText(/new builds of\s+this PR as updates/)).toBeTruthy()
    expect(screen.queryByText(/Back up your books/)).toBeNull()
  })

  it("asks before switching from one PR's preview to another's", () => {
    // Prerelease tags compare as strings, so pr-1000 ranks below pr-900.
    const onInstall = renderButton(
      { version: "0.9.1-beta-pr-1000", direction: "downgrade" },
      "0.9.1-beta-pr-900.2",
    )
    fireEvent.click(screen.getByRole("button", { name: /Install preview/ }))
    expect(onInstall).not.toHaveBeenCalled()
    expect(screen.getByText("Install a preview build?")).toBeTruthy()
    expect(screen.queryByText(/Back up your books/)).toBeNull()
  })

  it("keeps the books warning for a preview built on an older version", () => {
    renderButton({ version: "0.8.1-beta-pr-850.4", direction: "downgrade" }, "0.9.0-beta.3")
    fireEvent.click(screen.getByRole("button", { name: /Install preview/ }))
    expect(screen.getByText("Install a preview build?")).toBeTruthy()
    expect(screen.getByText(/Back up your books/)).toBeTruthy()
  })

  it("warns before going from a preview to an older beta of the same version", () => {
    // The desktop catalog marks betas published before the preview as older.
    const onInstall = renderButton({ version: "0.8.1-beta.1", direction: "downgrade" }, "0.8.1-beta-pr-867")
    fireEvent.click(screen.getByRole("button", { name: /Install older version/ }))
    expect(onInstall).not.toHaveBeenCalled()
    expect(screen.getByText(/Back up your books/)).toBeTruthy()
  })

  it("installs a newer build of the same PR without asking", () => {
    const onInstall = renderButton(
      { version: "0.8.1-beta-pr-900.3", direction: "upgrade" },
      "0.8.1-beta-pr-900.2",
    )
    fireEvent.click(screen.getByRole("button", { name: /Install update/ }))
    expect(onInstall).toHaveBeenCalledOnce()
  })
})
