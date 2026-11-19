// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { getDefaultStore } from "jotai"
import { createRef } from "react"
import { TooltipProvider } from "@/shared/ui/tooltip"
import { DockContext } from "@/features/dock/context/dock-context"
import { dockMenuValueAtom, tocSearchTermAtom } from "@/shared/state/ui.atoms"
import { DockPanel } from "./DockPanel"
import { BookMetadata } from "./BookMetadata"

vi.mock("@/shared/hooks/use-is-mobile", () => ({ useIsMobile: () => false }))

const store = getDefaultStore()

/** The reader's page: `<main>` and the chrome's portal container, side by side in `<body>`. */
beforeEach(() => {
  document.body.innerHTML = '<main><p>Page one</p></main><div id="interface-container"></div>'
})

afterEach(() => {
  cleanup()
  document.body.innerHTML = ""
  store.set(dockMenuValueAtom, "")
  store.set(tocSearchTermAtom, "")
})

/** A mouse press on `el`, as Base UI's outside-press detection sees one. */
function press(el: Element) {
  fireEvent.pointerDown(el, { pointerType: "mouse", button: 0 })
  fireEvent.mouseDown(el, { button: 0 })
  fireEvent.pointerUp(el, { pointerType: "mouse", button: 0 })
  fireEvent.mouseUp(el, { button: 0 })
  fireEvent.click(el, { button: 0 })
}

/** What an in-place page turn does (page-swap.ts): a new `<main>`, focus on it, then the event. */
async function turnPage(): Promise<HTMLElement> {
  const next = document.createElement("main")
  next.innerHTML = "<p>Page two</p>"
  next.tabIndex = -1
  document.querySelector("main")!.replaceWith(next)
  next.focus()
  await act(async () => {
    document.dispatchEvent(new CustomEvent("adt:page-changed"))
  })
  return next
}

async function renderPanel(onClose = vi.fn()) {
  render(
    <DockPanel open onClose={onClose}>
      <input aria-label="Search" />
    </DockPanel>,
  )
  await screen.findByRole("textbox", { name: "Search" })
  return onClose
}

describe("dock panel across an in-place page turn (#1135)", () => {
  it("closes on a click on the page", async () => {
    const onClose = await renderPanel()
    press(screen.getByText("Page one"))
    expect(onClose).toHaveBeenCalled()
  })

  // Base UI ignores presses on elements that appeared after the panel opened,
  // and the page turn brings in a new <main>.
  it("still closes on a click on the page after the page turns", async () => {
    const onClose = await renderPanel()
    await turnPage()
    press(screen.getByText("Page two"))
    expect(onClose).toHaveBeenCalled()
  })

  it("leaves focus on the new page when it re-mounts", async () => {
    await renderPanel()
    const main = await turnPage()
    await act(async () => {})
    expect(document.activeElement).toBe(main)
    expect(screen.getByRole("textbox", { name: "Search" })).toBeTruthy()
  })
})

describe("contents search across an in-place page turn", () => {
  function renderContents() {
    return render(
      <TooltipProvider>
        <DockContext.Provider
          value={{
            ref: createRef<HTMLDivElement>(),
            popoverSide: "top",
            isSpread: false,
            isTop: false,
            isCompact: true,
            shouldHide: false,
          }}
        >
          <BookMetadata />
        </DockContext.Provider>
      </TooltipProvider>,
    )
  }

  it("keeps the search text while the panel stays open, and clears it when it closes", async () => {
    store.set(dockMenuValueAtom, "toc")
    renderContents()
    const search = await screen.findByRole("textbox")
    fireEvent.change(search, { target: { value: "water" } })

    await turnPage()
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("water")

    await act(async () => store.set(dockMenuValueAtom, ""))
    await act(async () => store.set(dockMenuValueAtom, "toc"))
    expect(((await screen.findByRole("textbox")) as HTMLInputElement).value).toBe("")
  })
})
