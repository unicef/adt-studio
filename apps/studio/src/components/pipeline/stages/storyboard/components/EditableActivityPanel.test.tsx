// @vitest-environment jsdom
import React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { EditableActivity } from "@adt/types"

const mocks = vi.hoisted(() => ({
  save: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("@lingui/react/macro", () => ({
  useLingui: () => ({
    t(strings: TemplateStringsArray, ...values: unknown[]) {
      return strings.reduce(
        (result, part, index) => result + part + (index < values.length ? String(values[index]) : ""),
        "",
      )
    },
  }),
}))

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

vi.mock("@/api/client", () => ({ BASE_URL: "" }))

vi.mock("@/hooks/use-api-key", () => ({
  useApiKey: () => ({
    apiKey: "",
    hasApiKey: false,
    anthropicKey: "",
    googleKey: "",
    customBaseUrl: "",
    customApiKey: "",
    geminiKey: "",
  }),
}))

vi.mock("@/hooks/use-editable-activities", () => ({
  useSaveEditableActivities: () => ({
    mutateAsync: mocks.save,
    isPending: false,
  }),
  useGenerateActivityFeedback: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
}))

vi.mock("./ReplaceFromBookDialog", () => ({ ReplaceFromBookDialog: () => null }))
vi.mock("./style-editor/controls/ColorPicker", () => ({ ColorPicker: () => null }))
vi.mock("./style-editor/controls/Select", () => ({ Select: () => null }))

import { FloatingSaveProvider } from "@/components/pipeline/components/floating-save"
import { EditableActivityPanel } from "./EditableActivityPanel"

afterEach(() => {
  cleanup()
  mocks.save.mockClear()
})

const activity: EditableActivity = {
  kind: "open-ended",
  sectionType: "activity_open_ended_answer",
  enabled: true,
  steps: [{ id: "step-1", prompt: { text: "Original question" }, multiline: true }],
}

describe("EditableActivityPanel", () => {
  it("registers draft edits with the shared unsaved-changes save system", async () => {
    render(
      <FloatingSaveProvider>
        <EditableActivityPanel
          open
          onClose={vi.fn()}
          bookLabel="book"
          pageId="page-1"
          sectionIndex={0}
          activity={activity}
          activities={{ "0": activity }}
          paletteAccent="#2563EB"
        />
      </FloatingSaveProvider>,
    )

    expect(screen.queryByRole("button", { name: "Save" })).toBeNull()

    fireEvent.change(screen.getByPlaceholderText("Title"), {
      target: { value: "Unsaved title" },
    })

    const sharedSave = await screen.findByRole("button", { name: "Save" })
    fireEvent.click(sharedSave)

    await waitFor(() => {
      expect(mocks.save).toHaveBeenCalledWith({
        "0": expect.objectContaining({ title: { text: "Unsaved title" } }),
      })
    })
  })
})
