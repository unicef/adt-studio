// @vitest-environment jsdom
import { expect, it } from "vitest"
import type { PageSectioningOutput } from "@adt/types"
import { backPropagateTextChanges } from "./back-propagate-text"

function source(text = "The sky is ______."): PageSectioningOutput {
  return { reasoning: "fixture", sections: [{ sectionId: "pg001_sec001", sectionType: "activity_fill_in_the_blank",
    pageNumber: 1, isPruned: false, backgroundColor: "white", textColor: "black",
    nodes: [{ nodeId: "question", role: "body_text", isPruned: false, text },
      { nodeId: "neighbor", role: "body_text", isPruned: false, text: "Unchanged source spelling" }] }] }
}
const input = '<p data-id="question">The sky is <input data-activity-item="item-1">.</p><p data-id="neighbor">Renderer spelling</p>'

it.each([input, '<p data-id="question">The sky is [[blank:item-1]].</p>', '<p data-id="question">The sky is blue.</p>'])("does not copy renderer differences into source on a cosmetic save", saved => {
  const original = source()
  expect(backPropagateTextChanges(original, 0, saved.replace('<p ', '<p style="color:red" '), saved)).toBe(original)
})

it("preserves response spaces and unrelated renderer differences when the user edits surrounding text", () => {
  const original = source()
  const next = backPropagateTextChanges(original, 0, input.replace("The sky is", "The evening sky is"), input)
  expect(next.sections[0].nodes[0].text).toBe("The evening sky is ______.")
  expect(next.sections[0].nodes[1]).toBe(original.sections[0].nodes[1])
  expect(original.sections[0].nodes[0].text).toBe("The sky is ______.")
})

it("retains named placeholders when a blank marker is surrounded by a genuine edit", () => {
  const original = source("The sky is [placeholder:blue].")
  const saved = '<p data-id="question">The sky is [[blank:item-1]].</p>'
  expect(backPropagateTextChanges(original, 0, saved.replace("sky", "ocean"), saved).sections[0].nodes[0].text)
    .toBe("The ocean is [placeholder:blue].")
})

it("updates only changed IDs, including intentionally empty text, and ignores images", () => {
  const original = source("Plain text")
  const saved = '<p data-id="question">Plain text</p><p data-id="neighbor">Renderer spelling</p>'
  const next = backPropagateTextChanges(original, 0, '<p data-id="question"></p><p data-id="neighbor">Renderer spelling</p>', saved)
  expect(next.sections[0].nodes[0].text).toBe("")
  expect(next.sections[0].nodes[1]).toBe(original.sections[0].nodes[1])
})

it("keeps mixed blank markers and native controls in document order and excludes entered answers", () => {
  const original = source("First [placeholder:one], then [placeholder:two], then ____.")
  const saved = '<p data-id="question">First [[blank:1]], then <input type="TEXT" data-activity-item="2" value="learner answer">, then <textarea data-activity-item="3">another answer</textarea>.</p>'
  const next = backPropagateTextChanges(original, 0, saved.replace("First", "Initially"), saved)
  expect(next.sections[0].nodes[0].text).toBe("Initially [placeholder:one], then [placeholder:two], then ____.")
})

it("does not back-propagate a leaf without a saved rendering baseline", () => {
  const original = source()
  expect(backPropagateTextChanges(original, 0, input, "")).toBe(original)
})
