// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest"
import { render } from "@testing-library/react"
import { useForceLightTheme } from "./use-force-light-theme"

function Pipeline() {
  useForceLightTheme()
  return <div>pipeline</div>
}

afterEach(() => {
  document.documentElement.classList.remove("dark")
})

describe("useForceLightTheme", () => {
  it("drops dark while mounted and restores it on the way out", () => {
    document.documentElement.classList.add("dark")
    const view = render(<Pipeline />)
    expect(document.documentElement.classList.contains("dark")).toBe(false)
    view.unmount()
    expect(document.documentElement.classList.contains("dark")).toBe(true)
  })

  it("never adds dark to an app that was already light", () => {
    expect(document.documentElement.classList.contains("dark")).toBe(false)
    const view = render(<Pipeline />)
    expect(document.documentElement.classList.contains("dark")).toBe(false)
    // the important half: unmounting must not switch a light app to dark
    view.unmount()
    expect(document.documentElement.classList.contains("dark")).toBe(false)
  })

  it("leaves the theme alone once the pipeline is gone, across mounts", () => {
    document.documentElement.classList.add("dark")
    render(<Pipeline />).unmount()
    render(<Pipeline />).unmount()
    expect(document.documentElement.classList.contains("dark")).toBe(true)
  })
})
