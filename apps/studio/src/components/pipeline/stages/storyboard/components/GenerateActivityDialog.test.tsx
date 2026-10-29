// @vitest-environment jsdom
import React from "react"
import { afterEach, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"

const join = (strings: TemplateStringsArray, ...values: unknown[]) => strings.reduce((out, part, index) => out + part + (values[index] ?? ""), "")
vi.mock("@lingui/core/macro", () => ({ msg: (strings: TemplateStringsArray, ...values: unknown[]) => ({ message: join(strings, ...values) }) }))
vi.mock("@lingui/core", () => ({ i18n: { _: (message: { message: string }) => message.message } }))
vi.mock("@lingui/react/macro", () => ({ useLingui: () => ({ t: join }), Trans: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
const { GenerateActivityDialog } = await import("./GenerateActivityDialog")
afterEach(cleanup)
const setup = () => {
  const submit = vi.fn()
  const close = vi.fn()
  render(<GenerateActivityDialog anchorPageId="pg004" anchorPageNumber={4} onSubmit={submit} onClose={close} />)
  return { submit, close }
}
const select = (name: string) => fireEvent.click(screen.getByRole("button", { name, exact: true }))
const preview = () => within(screen.getByRole("region", { name: "Layout preview" }))

it("shows a layout without generating until the author explicitly submits", () => {
  const { submit } = setup()
  expect(screen.getByRole<HTMLButtonElement>("button", { name: "Generate", exact: true }).disabled).toBe(true)
  select("Use a standard layout")
  select("Multiple choice")
  expect(screen.getByRole("button", { name: "Multiple choice" }).getAttribute("aria-pressed")).toBe("true")
  expect(preview().getByText("Which animal lives in water?")).toBeTruthy()
  expect(preview().queryByRole("button")).toBeNull()
  expect(preview().queryByRole("radio")).toBeNull()
  expect(submit).not.toHaveBeenCalled()
  expect(screen.getByText(/Generate adds a new activity to page 4/)).toBeTruthy()
  const request = screen.getByLabelText<HTMLTextAreaElement>("Describe the activity").value
  select("Generate")
  expect(submit).toHaveBeenCalledExactlyOnceWith(request, { inclusiveDesign: true, mode: "templated" })
})

it.each([
  ["Select all that apply", "Select the animals that can fly."],
  ["True / false", "A butterfly is an insect."],
  ["Fill in the blank", "Complete the sentence."],
  ["Matching pairs", "Match each animal to its home."],
  ["Sorting", "Place each item in a group."],
  ["Ordering", "Put the stages of a plant in order."],
  ["Complete a table", "Complete the number pattern."],
  ["Mark words", "Select the action word."],
  ["Open-ended question", "What helps a plant grow?"],
])("shows the %s layout without interactive sample controls", (name, question) => {
  const { submit } = setup()
  select("Use a standard layout")
  select(name)
  expect(preview().getByText(question)).toBeTruthy()
  expect(screen.getByRole("region", { name: "Layout preview" }).querySelector("button,input,select,textarea,[tabindex]")).toBeNull()
  expect(submit).not.toHaveBeenCalled()
})

it("updates the preview and generates with the selected standard layout", () => {
  const { submit } = setup()
  select("Use a standard layout")
  select("Multiple choice")
  select("Matching pairs")
  expect(preview().queryByText("Which animal lives in water?")).toBeNull()
  expect(preview().getByText("Match each animal to its home.")).toBeTruthy()
  fireEvent.change(screen.getByLabelText("Describe the activity"), { target: { value: "  Match the words on this page.  " } })
  select("Generate")
  expect(submit).toHaveBeenCalledExactlyOnceWith("Match the words on this page.", { inclusiveDesign: true, mode: "templated" })
})

it("explains source recreation and cancels without generation", () => {
  const { submit, close } = setup()
  select("From the book")
  expect(screen.getByLabelText<HTMLTextAreaElement>("Describe the activity").value).toContain("Preserve its language, wording, numbers and learning objective")
  fireEvent.change(screen.getByLabelText("Describe the activity"), { target: { value: "   " } })
  expect(screen.getByRole<HTMLButtonElement>("button", { name: "Generate", exact: true }).disabled).toBe(true)
  select("Cancel")
  expect(close).toHaveBeenCalledOnce()
  expect(submit).not.toHaveBeenCalled()
})

it.each(["From the book", "Suggest an activity"])("offers %s in the AI path and submits in auto mode", (name) => {
  const { submit } = setup()
  expect(screen.getAllByRole("group")[0].textContent).toContain("Activity style")
  expect(screen.getByRole("button", { name: "Let AI choose the layout" }).getAttribute("aria-pressed")).toBe("true")
  expect(screen.queryByRole("button", { name: "Multiple choice" })).toBeNull()
  expect(screen.queryByRole("region", { name: "Layout preview" })).toBeNull()
  select(name)
  const request = screen.getByLabelText<HTMLTextAreaElement>("Describe the activity").value
  expect(request.trim()).not.toBe("")
  expect(submit).not.toHaveBeenCalled()
  select("Generate")
  expect(submit).toHaveBeenCalledExactlyOnceWith(request, { inclusiveDesign: true, mode: "auto" })
})

it("shows all ten standard templates and requires an explicit template selection", () => {
  setup()
  select("Use a standard layout")
  expect(within(screen.getByRole("group", { name: "Choose a template" })).getAllByRole("button")).toHaveLength(10)
  expect(screen.queryByRole("button", { name: "From the book" })).toBeNull()
  fireEvent.change(screen.getByLabelText("Describe the activity"), { target: { value: "An exercise" } })
  expect(screen.getByRole<HTMLButtonElement>("button", { name: "Generate", exact: true }).disabled).toBe(true)
})

it("keeps separate drafts and selections for AI, standard and prompt-only custom paths", () => {
  const { submit } = setup()
  select("From the book")
  fireEvent.change(screen.getByLabelText("Describe the activity"), { target: { value: "Recreate exercise 2" } })
  select("Use a standard layout")
  select("Matching pairs")
  fireEvent.change(screen.getByLabelText("Describe the activity"), { target: { value: "Match the animals" } })
  select("Create a custom layout")
  expect(screen.queryByRole("button", { name: "Matching pairs" })).toBeNull()
  expect(screen.queryByRole("button", { name: "From the book" })).toBeNull()
  expect(screen.queryByRole("region", { name: "Layout preview" })).toBeNull()
  expect(screen.getByLabelText<HTMLTextAreaElement>("Describe the activity").value).toBe("")
  expect(screen.getByRole<HTMLButtonElement>("button", { name: "Generate", exact: true }).disabled).toBe(true)
  fireEvent.change(screen.getByLabelText("Describe the activity"), { target: { value: "  Create a map with labeled regions  " } })
  select("Let AI choose the layout")
  expect(screen.getByLabelText<HTMLTextAreaElement>("Describe the activity").value).toBe("Recreate exercise 2")
  expect(screen.getByRole("button", { name: "From the book" }).getAttribute("aria-pressed")).toBe("true")
  select("Use a standard layout")
  expect(screen.getByLabelText<HTMLTextAreaElement>("Describe the activity").value).toBe("Match the animals")
  expect(screen.getByRole("button", { name: "Matching pairs" }).getAttribute("aria-pressed")).toBe("true")
  expect(preview().getByText("Match each animal to its home.")).toBeTruthy()
  select("Create a custom layout")
  expect(screen.getByLabelText<HTMLTextAreaElement>("Describe the activity").value).toBe("  Create a map with labeled regions  ")
  expect(submit).not.toHaveBeenCalled()
  select("Generate")
  expect(submit).toHaveBeenCalledExactlyOnceWith("Create a map with labeled regions", { inclusiveDesign: true, mode: "custom" })
})
