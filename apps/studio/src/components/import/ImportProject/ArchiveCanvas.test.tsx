// @vitest-environment jsdom
import React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

vi.mock("@lingui/react/macro", () => ({
  useLingui: () => ({
    t: (strings: TemplateStringsArray, ...values: unknown[]) =>
      strings.reduce((text, part, index) => text + part + (index < values.length ? String(values[index]) : ""), ""),
  }),
}))

import { ArchiveCanvas, type CanvasView } from "./ArchiveCanvas"

const view = (overrides: Partial<CanvasView>): CanvasView => ({
  state: "idle",
  tone: "idle",
  icon: "upload",
  iconTone: "neutral",
  title: "Drop a ZIP archive here",
  message: "Drag it anywhere in this window, or browse your files.",
  body: (
    <>
      <button type="button">Browse files</button>
      <span>One ZIP, up to 1 GiB</span>
    </>
  ),
  bodyKey: "idle",
  missingTypes: false,
  ...overrides,
})

afterEach(cleanup)

describe("ArchiveCanvas", () => {
  it("opens the file picker from the row around the Browse files button", () => {
    const onBrowse = vi.fn()
    render(<ArchiveCanvas view={view({})} onBrowse={onBrowse} />)

    fireEvent.click(screen.getByText("One ZIP, up to 1 GiB"))

    expect(onBrowse).toHaveBeenCalledTimes(1)
  })

  it("leaves a button in that row to handle its own click, so the picker opens once", () => {
    const onBrowse = vi.fn()
    render(<ArchiveCanvas
      view={view({ body: <button type="button" onClick={onBrowse}>Browse files</button> })}
      onBrowse={onBrowse}
    />)

    fireEvent.click(screen.getByRole("button", { name: "Browse files" }))

    expect(onBrowse).toHaveBeenCalledTimes(1)
  })

  it("keeps the row inert while the archive is being read", () => {
    const onBrowse = vi.fn()
    render(<ArchiveCanvas
      view={view({ state: "reading", body: <span>Reading the archive</span>, bodyKey: "reading" })}
      onBrowse={onBrowse}
    />)

    fireEvent.click(screen.getByText("Reading the archive"))

    expect(onBrowse).not.toHaveBeenCalled()
  })
})
