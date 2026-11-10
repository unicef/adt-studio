// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { act, cleanup, render, screen, within } from "@testing-library/react"
import { getDefaultStore } from "jotai"
import { glossaryDataAtom } from "@/features/glossary/state/glossary.atoms"
import { pageEpochAtom } from "@/features/navigation/state/nav.atoms"
import { GlossaryPanel } from "./GlossaryPanel"

const store = getDefaultStore()

function setPageText(text: string): void {
  document.getElementById("content")!.textContent = text
}

function pageTabTerms(): string[] {
  const panel = screen.getByRole("tabpanel")
  return within(panel)
    .queryAllByRole("listitem")
    .map((item) => item.textContent ?? "")
}

beforeEach(() => {
  const content = document.createElement("div")
  content.id = "content"
  document.body.appendChild(content)
  store.set(glossaryDataAtom, {
    cloud: { word: "cloud", definition: "A shape in the sky", variations: [], emoji: "" },
    shout: { word: "shout", definition: "To call out loudly", variations: [], emoji: "" },
  })
  store.set(pageEpochAtom, 1)
})

afterEach(() => {
  cleanup()
  document.getElementById("content")?.remove()
  store.set(glossaryDataAtom, {})
  store.set(pageEpochAtom, 0)
})

describe("GlossaryPanel", () => {
  it("re-reads the page's terms after an in-place page turn", () => {
    setPageText("Hyena thought the cloud would hold him.")
    render(<GlossaryPanel />)
    expect(pageTabTerms()).toEqual([expect.stringContaining("cloud")])

    act(() => {
      setPageText("Help! he shouted.")
      store.set(pageEpochAtom, 2)
    })

    expect(pageTabTerms()).toEqual([expect.stringContaining("shout")])
  })
})
