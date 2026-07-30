// @vitest-environment jsdom
import React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

vi.mock("@lingui/react/macro", () => ({
  useLingui: () => ({
    t(strings: TemplateStringsArray, ...values: unknown[]) {
      let out = ""
      strings.forEach((s, i) => {
        out += s + (i < values.length ? String(values[i]) : "")
      })
      return out
    },
  }),
}))

import { ActivityAnswersEditor } from "./ActivityAnswersEditor"

afterEach(cleanup)

const JIGSAW_HTML = `
<section data-section-type="activity_custom_jigsaw">
  <div data-activity-target="slot-1" data-correct-items="item-1" aria-labelledby="l1">
    <div id="l1" class="font-semibold">Top left space</div><div class="drop-zone"></div>
  </div>
  <div data-activity-target="slot-2" data-correct-items="item-4" aria-labelledby="l2">
    <div id="l2" class="font-semibold">Top right space</div><div class="drop-zone"></div>
  </div>
  <div data-activity-item="item-1"><span>Tile D</span></div>
  <div data-activity-item="item-4"><span>Tile A</span></div>
</section>`

const SORTING_HTML = `
<section data-section-type="activity_custom_drag_drop">
  <div data-activity-target="bucket-1" data-correct-items="item-1,item-2" aria-labelledby="b1">
    <div id="b1" class="font-semibold">Autonomous systems</div><div class="drop-zone"></div>
  </div>
  <div data-activity-item="item-1"><span>Automatic sliding door</span></div>
  <div data-activity-item="item-2"><span>Sensor-based tap</span></div>
  <div data-activity-item="item-3"><span>Manual faucet</span></div>
</section>`

describe("ActivityAnswersEditor", () => {
  it("shows human-readable slot labels, keeping the raw id for reference", () => {
    render(
      <ActivityAnswersEditor
        answers={{ "slot-1": "item-1", "slot-2": "item-4" }}
        html={JIGSAW_HTML}
        onUpdateAnswer={vi.fn()}
      />,
    )
    expect(screen.getByText("Top left space")).toBeTruthy()
    expect(screen.getByText("Top right space")).toBeTruthy()
    // raw ids remain visible (muted) for both slots and tiles
    expect(screen.getByText("slot-1")).toBeTruthy()
    // selected tile shows BOTH label and id, e.g. "Tile D" + "item-1"
    expect(screen.getByText("Tile D")).toBeTruthy()
    expect(screen.getByText("item-1")).toBeTruthy()
  })

  it("displays the HTML answer key (grader truth), not a divergent activityAnswers", () => {
    // activityAnswers says slot-1 → item-4 (Tile A), but the HTML's
    // data-correct-items says item-1 (Tile D). The grader uses the HTML, so the
    // panel must show Tile D — surfacing the drift instead of hiding it.
    render(
      <ActivityAnswersEditor
        answers={{ "slot-1": "item-4", "slot-2": "item-4" }}
        html={JIGSAW_HTML}
        onUpdateAnswer={vi.fn()}
      />,
    )
    // slot-1's grader answer is item-1 = Tile D
    expect(screen.getByText("Tile D")).toBeTruthy()
  })

  it("renders multi-item buckets as labeled chips and removes by label", () => {
    const onUpdate = vi.fn()
    render(
      <ActivityAnswersEditor
        answers={{ "bucket-1": "item-1,item-2" }}
        html={SORTING_HTML}
        onUpdateAnswer={onUpdate}
      />,
    )
    expect(screen.getByText("Autonomous systems")).toBeTruthy()
    // tiles shown by label, not by "item-1"/"item-2"
    expect(screen.getByText("Automatic sliding door")).toBeTruthy()
    expect(screen.getByText("Sensor-based tap")).toBeTruthy()

    // Remove "Automatic sliding door" (item-1) → CSV drops to "item-2"
    fireEvent.click(screen.getByTitle("Automatic sliding door"))
    expect(onUpdate).toHaveBeenCalledWith("bucket-1", "item-2")
  })

  // --- Regression guard: templated activities must be unaffected. They carry
  // data-activity-item but NO data-activity-target / data-correct-items /
  // data-answer, so they keep rendering as literal text inputs sourced from
  // activityAnswers (never the new label dropdowns or HTML-sourced values).
  it("matching: renders item→dropzone as literal inputs from activityAnswers", () => {
    const html = `<section data-section-type="activity_matching">
      <div data-activity-item="item-1">Apple</div>
      <div data-activity-item="item-2">Dog</div>
    </section>`
    const onUpdate = vi.fn()
    render(
      <ActivityAnswersEditor
        answers={{ "item-1": "dropzone-1", "item-2": "dropzone-2" }}
        html={html}
        onUpdateAnswer={onUpdate}
      />,
    )
    // Editable text inputs holding the activityAnswers values — NOT dropdowns.
    expect(screen.getByDisplayValue("dropzone-1")).toBeTruthy()
    expect(screen.getByDisplayValue("dropzone-2")).toBeTruthy()
    fireEvent.change(screen.getByDisplayValue("dropzone-1"), {
      target: { value: "dropzone-3" },
    })
    expect(onUpdate).toHaveBeenCalledWith("item-1", "dropzone-3")
  })

  it("multiple choice: boolean answers render from activityAnswers unchanged", () => {
    const html = `<section data-section-type="activity_multiple_choice"><div data-activity-item="item-1">A</div></section>`
    render(
      <ActivityAnswersEditor
        answers={{ "item-1": false }}
        html={html}
        onUpdateAnswer={vi.fn()}
      />,
    )
    expect(screen.getByDisplayValue("false")).toBeTruthy()
  })

  it("falls back to a text input for literal (crossword) answers", () => {
    const onUpdate = vi.fn()
    render(
      <ActivityAnswersEditor
        answers={{ r2c2: "B" }}
        html={`<input data-cell="r2c2" data-answer="B">`}
        onUpdateAnswer={onUpdate}
      />,
    )
    fireEvent.change(screen.getByDisplayValue("B"), { target: { value: "Z" } })
    expect(onUpdate).toHaveBeenCalledWith("r2c2", "Z")
  })
})
