// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

vi.mock("@lingui/react/macro", () => ({
  useLingui: () => ({
    t(strings: TemplateStringsArray, ...values: unknown[]) {
      let text = ""
      for (let index = 0; index < strings.length; index += 1) {
        text += strings[index]
        if (index < values.length) text += String(values[index])
      }
      return text
    },
  }),
  Trans: ({ children }: { children?: React.ReactNode }) => children ?? null,
}))

const { VoicePicker } = await import("./VoicePicker")

const OPTIONS = [
  { value: "es-UY-ValentinaNeural", label: "Valentina (Female)", detail: "es-UY" },
  { value: "es-ES-ElviraNeural", label: "Elvira (Female)", detail: "es-ES" },
]

function renderPicker(overrides: Partial<Parameters<typeof VoicePicker>[0]> = {}) {
  const onChange = vi.fn()
  render(
    <VoicePicker
      value=""
      onChange={onChange}
      options={OPTIONS}
      triggerLabel="Default voice"
      defaultOptionLabel="Default voice"
      freeTextPlaceholder="e.g. en-US-JennyNeural"
      {...overrides}
    />,
  )
  return { onChange }
}

const openList = () => fireEvent.click(screen.getByRole("button"))
const search = (text: string) =>
  fireEvent.change(screen.getByPlaceholderText("Search voices"), {
    target: { value: text },
  })

describe("VoicePicker", () => {
  afterEach(cleanup)

  it("picks a voice and reports its readable label", () => {
    const { onChange } = renderPicker()

    openList()
    fireEvent.click(screen.getByText("Valentina (Female)"))

    expect(onChange).toHaveBeenCalledWith("es-UY-ValentinaNeural", "Valentina (Female)")
  })

  it("filters the list by the search box", () => {
    renderPicker()

    openList()
    search("elvira")

    expect(screen.queryByText("Valentina (Female)")).toBeNull()
    expect(screen.getByText("Elvira (Female)")).toBeTruthy()
  })

  it("matches on the underlying value, not just the label", () => {
    renderPicker()

    openList()
    search("es-ES")

    expect(screen.getByText("Elvira (Female)")).toBeTruthy()
    expect(screen.queryByText("Valentina (Female)")).toBeNull()
  })

  // The whole point of the picker is that it never traps the user: a voice the
  // provider added after this list was built must still be reachable.
  it("offers a typed value that is not in the list", () => {
    const { onChange } = renderPicker()

    openList()
    search("es-MX-DaliaNeural")
    fireEvent.click(screen.getByText('Use "es-MX-DaliaNeural"'))

    expect(onChange).toHaveBeenCalledWith("es-MX-DaliaNeural", undefined)
  })

  it("does not offer a custom row when the typed value already exists", () => {
    renderPicker()

    openList()
    search("es-ES-ElviraNeural")

    expect(screen.queryByText(/^Use "/)).toBeNull()
  })

  it("clears back to the provider default", () => {
    // A distinct trigger label, as a real caller renders for a set value —
    // otherwise "Default voice" matches both the trigger and the row.
    const { onChange } = renderPicker({
      value: "es-ES-ElviraNeural",
      triggerLabel: "Elvira · es-ES",
    })

    openList()
    fireEvent.click(screen.getByText("Default voice"))

    expect(onChange).toHaveBeenCalledWith("", undefined)
  })

  // With no list at all the control must still accept a known voice name.
  it("falls back to a free-text input when there are no options", () => {
    const { onChange } = renderPicker({ options: [] })

    const input = screen.getByPlaceholderText("e.g. en-US-JennyNeural")
    fireEvent.change(input, { target: { value: "en-GB-SoniaNeural" } })

    expect(onChange).toHaveBeenCalledWith("en-GB-SoniaNeural")
    expect(screen.queryByRole("button")).toBeNull()
  })

  it("shows the unavailable hint only in free-text mode", () => {
    renderPicker({ options: [], unavailableHint: <span>Add a key</span> })

    expect(screen.getByText("Add a key")).toBeTruthy()
  })

  // An empty list that is merely still in flight is not "no list". Swapping to
  // the free-text input and back would jump the layout and drop focus from
  // anyone already typing.
  it("keeps the picker while the list is still loading", () => {
    renderPicker({ options: [], isLoading: true })

    expect(screen.getByRole("button")).toBeTruthy()
    expect(screen.queryByPlaceholderText("e.g. en-US-JennyNeural")).toBeNull()
  })

  it("falls back to free text once loading finishes empty", () => {
    renderPicker({ options: [], isLoading: false })

    expect(screen.getByPlaceholderText("e.g. en-US-JennyNeural")).toBeTruthy()
  })

  // The row label may carry list-only decoration, but the persisted label is
  // the narrator name end users read in the exported reader.
  it("persists the bare name rather than the decorated row label", () => {
    const { onChange } = renderPicker({
      options: [
        {
          value: "es-UY-ValentinaNeural",
          label: "Valentina (Female)",
          name: "Valentina",
          detail: "es-UY",
        },
      ],
    })

    openList()
    fireEvent.click(screen.getByText("Valentina (Female)"))

    expect(onChange).toHaveBeenCalledWith("es-UY-ValentinaNeural", "Valentina")
  })

  it("persists the bare name when picking with Enter", () => {
    const { onChange } = renderPicker({
      options: [
        {
          value: "es-UY-ValentinaNeural",
          label: "Valentina (Female)",
          name: "Valentina",
        },
      ],
    })

    openList()
    search("valentina")
    fireEvent.keyDown(screen.getByPlaceholderText("Search voices"), { key: "Enter" })

    expect(onChange).toHaveBeenCalledWith("es-UY-ValentinaNeural", "Valentina")
  })
})
