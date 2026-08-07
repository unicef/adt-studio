import { describe, expect, it } from "vitest"

import {
  inspectImportedActivity,
  restoreImportedCustomActivityScripts,
} from "../imported-activity.js"

describe("inspectImportedActivity", () => {
  it("recognizes an explicit Studio activity and its editing capability", () => {
    const result = inspectImportedActivity(`
      <div id="content">
        <section data-section-id="pg001_sec001" data-section-type="activity_multiple_choice">
          <p data-id="question">Choose one</p>
          <label class="activity-option">
            <input type="radio" name="q1" data-activity-item="item-1" />
            <span data-id="answer">Answer</span>
          </label>
        </section>
      </div>
    `, "pg001_sec001")

    expect(result).toMatchObject({
      sectionType: "activity_multiple_choice",
      isActivity: true,
      isKnownType: true,
      isCustomType: false,
      supportsStudioEditing: true,
    })
    expect(result.signals).toEqual(expect.arrayContaining(["interactive-control", "activity-data"]))
  })

  it("reports interactive content without guessing that it is an activity", () => {
    const result = inspectImportedActivity(`
      <div id="content">
        <section data-section-id="pg002_sec001" data-section-type="content">
          <p data-id="prompt">Write your name</p>
          <input type="text" aria-label="Name" />
        </section>
      </div>
    `, "pg002_sec001")

    expect(result.isActivity).toBe(false)
    expect(result.sectionType).toBe("content")
    expect(result.signals).toContain("interactive-control")
    expect(result.textPreview).toContain("Write your name")
  })

  it("recognizes externally-authored custom activities without executing scripts", () => {
    const result = inspectImportedActivity(`
      <div id="content">
        <section aria-label="Crossword" data-section-id="pg003_sec001" data-section-type="activity_custom_crossword">
          <button aria-label="Check crossword">Check</button>
          <div role="status" aria-live="polite" data-activity-status></div>
          <script>window.adtRegisterCustomActivity(document.currentScript.parentElement, {})</script>
        </section>
      </div>
    `, "pg003_sec001")

    expect(result).toMatchObject({
      sectionType: "activity_custom_crossword",
      isActivity: true,
      isKnownType: false,
      isCustomType: true,
      supportsStudioEditing: false,
    })
    expect(result.signals).toContain("custom-registration")
  })

  it("restores documented custom registration scripts only for matching custom sections", () => {
    const source = `<html><body><section data-section-id="sec-1" data-section-type="activity_custom_crossword">
      <button>Check</button>
      <script>window.adtRegisterCustomActivity(document.currentScript.parentElement, {validate(){}})</script>
      <script>alert("unrelated")</script>
    </section></body></html>`
    const generated = `<html><body><section data-section-id="sec-1" data-section-type="activity_custom_crossword"><button>Check</button></section></body></html>`
    const restored = restoreImportedCustomActivityScripts(generated, source, "sec-1")

    expect(restored).toContain("adtRegisterCustomActivity")
    expect(restored).not.toContain("unrelated")
    expect(restoreImportedCustomActivityScripts(
      generated,
      source.replace("activity_custom_crossword", "content"),
      "sec-1",
    )).toContain("adtRegisterCustomActivity")
    expect(restoreImportedCustomActivityScripts(
      generated.replace("activity_custom_crossword", "content"),
      source,
      "sec-1",
    )).not.toContain("adtRegisterCustomActivity")
  })
})
