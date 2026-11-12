// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { JSDOM } from "jsdom"
import { createBrowserHistory } from "@tanstack/react-router"

const disposers: Array<() => void> = []
afterEach(() => {
  for (const dispose of disposers.splice(0).reverse()) dispose()
  vi.restoreAllMocks()
})

async function fixture() {
  const dom = new JSDOM("", { url: "http://localhost/books/book-a/page/0" })
  const history = createBrowserHistory({ window: dom.window })
  disposers.push(() => dom.window.close(), () => history.destroy())
  for (let index = 1; index <= 4; index++) {
    history.push(`/books/book-a/page/${index}`)
    await Promise.resolve()
  }
  return { win: dom.window, history }
}

// Exercises the installed history package, including the pinned pnpm rollback patch.
// The invalid-index cases retain its existing fallback; they do not promise repair
// of foreign/unindexed history entries.
describe("blocked browser history navigation", () => {
  it.each([-4, -1, 1, 4])("Stay restores the native URL and index after a %i-entry jump", async (delta) => {
    const { win, history } = await fixture()
    const ownerIndex = delta < 0 ? 4 : 0
    if (ownerIndex === 0) {
      history.go(-4)
      await vi.waitFor(() => expect(history.location.state.__TSR_index).toBe(0))
    }
    const ownerUrl = history.location.href
    let decide: (blocked: boolean) => void = () => {}
    const blockerFn = vi.fn(() => new Promise<boolean>((resolve) => { decide = resolve }))
    const unblock = history.block({ blockerFn })
    disposers.push(unblock)

    history.go(delta)
    await vi.waitFor(() => expect(blockerFn).toHaveBeenCalledOnce())
    expect(win.history.state.__TSR_index).toBe(ownerIndex + delta)
    // The editor's route remains on its source while the user decides.
    expect(history.location.href).toBe(ownerUrl)
    decide(true)
    await vi.waitFor(() => {
      expect(win.location.pathname).toBe(ownerUrl)
      expect(win.history.state.__TSR_index).toBe(ownerIndex)
    })
    expect(history.location.href).toBe(ownerUrl)
    expect(blockerFn).toHaveBeenCalledOnce()

    // A subsequent deliberate navigation must start from the restored entry.
    unblock()
    history.go(delta)
    await vi.waitFor(() => expect(history.location.state.__TSR_index).toBe(ownerIndex + delta))
    expect(win.location.pathname).toBe(history.location.href)
  })

  it.each([undefined, 0, Number.NaN, Number.POSITIVE_INFINITY, 0.5, 2 ** 31, -(2 ** 31), 2 ** 32, -(2 ** 32)])("keeps the existing non-reload fallback for an unindexed/invalid POP (%s)", async (index) => {
    const dom = new JSDOM("", { url: "http://localhost/books/book-a/page/0" })
    const sourcePath = "/books/book-a/page/0"
    let location = { href: sourcePath, pathname: sourcePath, search: "", hash: "", state: { key: "source", __TSR_key: "source", __TSR_index: 0 } }
    const history = createBrowserHistory({ window: dom.window, parseLocation: () => location })
    disposers.push(() => dom.window.close(), () => history.destroy())
    const go = vi.spyOn(dom.window.history, "go").mockImplementation(() => {})
    disposers.push(history.block({ blockerFn: () => true }))
    location = { ...location, href: "/foreign", pathname: "/foreign", state: { ...location.state, __TSR_index: index as number } }
    dom.window.dispatchEvent(new dom.window.PopStateEvent("popstate"))
    await vi.waitFor(() => expect(go).toHaveBeenCalledWith(1))
    expect(go).not.toHaveBeenCalledWith(0)
    expect(history.location.pathname).toBe(sourcePath)
  })
})
