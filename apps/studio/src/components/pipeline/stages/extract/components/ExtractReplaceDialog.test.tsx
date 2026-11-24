// @vitest-environment jsdom
import React, { type ReactNode } from "react"
import { afterEach, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"

vi.mock("@lingui/react/macro", () => ({ Trans: ({ children }: { children: ReactNode }) => <>{children}</>, useLingui: () => ({ t: (strings: TemplateStringsArray) => strings.join("") }) }))
const { ExtractReplaceDialog } = await import("./ExtractReplaceDialog")
afterEach(cleanup)

const discards = { pages: 12, extractedImages: 34, addedImages: 5 }
function open(counts: typeof discards | null = discards) {
  const onCancel = vi.fn(), onConfirm = vi.fn()
  render(<ExtractReplaceDialog open discards={counts} onCancel={onCancel} onConfirm={onConfirm} />)
  return { onCancel, onConfirm, dialog: screen.getByRole("dialog", { name: "Extract this book again?" }) }
}

it("RAC-23: states what is discarded, with counts, and what is kept", () => {
  const { dialog } = open()
  const text = dialog.textContent ?? ""
  expect(text).toContain("The extracted pages, their images and the edits made in Extract will be discarded.")
  for (const edit of ["image decisions", "crops", "segments", "added images", "book details"]) expect(text).toContain(edit)
  expect(text).toContain("The PDF, settings, fonts and prompts are kept.")
  const counts = Object.fromEntries(within(dialog).getAllByRole("term").map(term => [term.textContent, term.nextElementSibling?.textContent]))
  expect(counts).toEqual({
    "Extracted pages": "12",
    "Images taken from the PDF": "34",
    "Images added in Extract (crops, segments and uploads)": "5",
  })
  // The description is the accessible description of the dialog.
  expect(document.getElementById(dialog.getAttribute("aria-describedby")!)?.textContent).toContain("will be discarded")
})

it("RAC-23: the default action is Cancel and the destructive button is the only way to confirm", () => {
  const { dialog, onCancel, onConfirm } = open()
  const cancel = within(dialog).getByRole("button", { name: "Cancel" })
  const confirm = within(dialog).getByRole("button", { name: "Discard and extract again" })
  expect(document.activeElement).toBe(cancel)
  expect(confirm.getAttribute("type")).not.toBe("submit")
  expect(dialog.querySelector("form")).toBeNull()
  fireEvent.keyDown(document.activeElement!, { key: "Enter" })
  expect(onConfirm).not.toHaveBeenCalled()
  fireEvent.click(cancel)
  expect(onCancel).toHaveBeenCalledTimes(1)
  expect(onConfirm).not.toHaveBeenCalled()
  fireEvent.click(confirm)
  expect(onConfirm).toHaveBeenCalledTimes(1)
})

it("RAC-23: Escape and the close button cancel without confirming", () => {
  const { dialog, onCancel, onConfirm } = open()
  fireEvent.keyDown(dialog, { key: "Escape" })
  expect(onCancel).toHaveBeenCalledTimes(1)
  fireEvent.click(within(dialog).getByRole("button", { name: "Close" }))
  expect(onCancel).toHaveBeenCalledTimes(2)
  expect(onConfirm).not.toHaveBeenCalled()
})

it("names no numbers when the counts are unavailable, and renders nothing while closed", () => {
  const { dialog } = open(null)
  expect(within(dialog).queryAllByRole("term")).toEqual([])
  expect(dialog.textContent).toContain("The PDF, settings, fonts and prompts are kept.")
  cleanup()
  render(<ExtractReplaceDialog open={false} discards={discards} onCancel={() => {}} onConfirm={() => {}} />)
  expect(screen.queryByRole("dialog")).toBeNull()
})

it("RAC-23: while the settings are being saved nothing can be pressed, and a failed save is announced", () => {
  const onCancel = vi.fn(), onConfirm = vi.fn()
  const view = render(<ExtractReplaceDialog open busy discards={discards} onCancel={onCancel} onConfirm={onConfirm} />)
  const dialog = screen.getByRole("dialog", { name: "Extract this book again?" })
  const cancel = within(dialog).getByRole("button", { name: "Cancel" }) as HTMLButtonElement
  const confirm = within(dialog).getByRole("button", { name: "Discard and extract again" }) as HTMLButtonElement
  expect(cancel.disabled).toBe(true)
  expect(confirm.disabled).toBe(true)
  fireEvent.keyDown(dialog, { key: "Escape" })
  expect(onCancel).not.toHaveBeenCalled()
  expect(within(dialog).queryByRole("alert")).toBeNull()
  view.rerender(<ExtractReplaceDialog open error="Config could not be saved" discards={discards} onCancel={onCancel} onConfirm={onConfirm} />)
  expect(within(dialog).getByRole("alert").textContent).toBe("Config could not be saved")
  expect(confirm.disabled).toBe(false)
})
