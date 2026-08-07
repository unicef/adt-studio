// @vitest-environment jsdom
import React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useLingui: () => ({ i18n: { _: (d: { id?: string }) => d?.id ?? "" } }),
}))

vi.mock("../pipeline-i18n", () => ({ getStageLabelI18n: (slug: string) => slug }))

const { CascadeResetDialog } = await import("./CascadeResetDialog")

function renderDialog(props: Partial<React.ComponentProps<typeof CascadeResetDialog>> = {}) {
  return render(
    <CascadeResetDialog
      open
      onOpenChange={() => {}}
      affectedStages={["storyboard", "captions"]}
      headerStageSlug="storyboard"
      title="Re-run Storyboard?"
      description="Your section edits are saved."
      confirmLabel="Re-run Storyboard"
      confirmColorClass="bg-violet-600"
      onConfirm={() => {}}
      {...props}
    />,
  )
}

const confirmButton = () => screen.getByRole("button", { name: /re-run storyboard/i })

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe("CascadeResetDialog", () => {
  it("lists the affected stages", () => {
    renderDialog()
    expect(screen.getByText("storyboard")).toBeTruthy()
    expect(screen.getByText("captions")).toBeTruthy()
  })

  it("leaves the confirm button enabled by default", () => {
    const onConfirm = vi.fn()
    renderDialog({ onConfirm })

    const btn = confirmButton() as HTMLButtonElement
    expect(btn.disabled).toBe(false)
    btn.click()
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it("disables confirm and explains why when a reason is given", () => {
    const onConfirm = vi.fn()
    renderDialog({ confirmDisabledReason: "Add an API key to re-run", onConfirm })

    const btn = confirmButton() as HTMLButtonElement
    expect(btn.disabled).toBe(true)
    btn.click()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it("omits the reset block when no stage would be affected", () => {
    // Structural ops confirm even with nothing downstream to lose; an empty
    // "Will be reset · 0" block would be misleading.
    renderDialog({ affectedStages: [] })

    expect(screen.queryByText(/will be reset/i)).toBeNull()
    expect(confirmButton()).toBeTruthy()
  })

  it("uses the given confirm icon instead of the default", () => {
    const Custom = () => <svg data-testid="custom-icon" />
    renderDialog({ confirmIcon: Custom })

    expect(screen.getByTestId("custom-icon")).toBeTruthy()
  })

  it("still lets the user dismiss when confirm is disabled", () => {
    const onOpenChange = vi.fn()
    renderDialog({ confirmDisabledReason: "Add an API key to re-run", onOpenChange })

    ;(screen.getByRole("button", { name: /cancel/i }) as HTMLButtonElement).click()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
