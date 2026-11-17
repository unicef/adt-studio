// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest"
import { getDefaultStore } from "jotai"
import { effectiveDockLayoutAtom, readerUiAtom } from "@/shared/state/ui.atoms"
import { READER_UI_STYLE_ID, applyReaderUi } from "./reader-ui"

const store = getDefaultStore()

afterEach(() => {
  applyReaderUi(null)
})

describe("applyReaderUi", () => {
  it("writes the token stylesheet last in <head> and stores the reader UI", () => {
    document.head.innerHTML = '<link rel="stylesheet" href="content/tailwind_output.css">'
    applyReaderUi({ light: { primary: "#0b5a55" }, radius: 1 })
    const style = document.getElementById(READER_UI_STYLE_ID)
    expect(style?.textContent).toContain("--primary: #0b5a55;")
    expect(document.head.lastElementChild).toBe(style)
    expect(store.get(readerUiAtom)).toEqual({ light: { primary: "#0b5a55" }, radius: 1 })
  })

  it("updates in place and removes the stylesheet when nothing is customised", () => {
    applyReaderUi({ light: { primary: "#000000" } })
    applyReaderUi({ light: { primary: "#ffffff" } })
    expect(document.querySelectorAll(`#${READER_UI_STYLE_ID}`)).toHaveLength(1)
    expect(document.getElementById(READER_UI_STYLE_ID)?.textContent).toContain("#ffffff")
    applyReaderUi({})
    expect(document.getElementById(READER_UI_STYLE_ID)).toBeNull()
  })

  it("lets a designed layout override the reader's persisted dock picker", () => {
    applyReaderUi({ layout: { dock_position: "left", dock_width: "compact" } })
    expect(store.get(effectiveDockLayoutAtom)).toEqual({ position: "left", width: "compact", align: "spread" })
    applyReaderUi(null)
    expect(store.get(effectiveDockLayoutAtom).position).toBe("bottom")
  })
})
