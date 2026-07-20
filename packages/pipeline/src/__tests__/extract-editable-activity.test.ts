import { describe, expect, it } from "vitest"
import { extractEditableActivity, supportsEditableActivity } from "../extract-editable-activity.js"
import {
  renderEditableActivityHtml,
  replaceStepperShellsWithStaticHtml,
} from "../render-editable-activity.js"
import { DEFAULT_QUIZ_PALETTE } from "../quiz-palette.js"

// ---------------------------------------------------------------------------
// Fixtures follow the DOM contracts from prompts/activity_multiple_choice.liquid
// and prompts/activity_fill_in_the_blank.liquid.
// ---------------------------------------------------------------------------

const MC_IMAGE_OPTIONS = `
<section class="section mb-8" data-section-type="activity_multiple_choice" data-section-id="sec-1">
  <h2 data-id="text-1">Choose the right animal</h2>
  <div class="questions grow space-y-4" role="group">
    <p data-id="text-2">Which picture shows a lion?</p>
    <div class="grid grid-cols-2 gap-4">
      <label class="activity-option flex items-start gap-4 p-4 rounded-lg cursor-pointer">
        <div class="option-letter">1</div>
        <input type="radio" name="question-group-1" value="item-1" data-activity-item="item-1" class="sr-only" tabindex="0" aria-label="Option 1" />
        <img data-id="img-1" src="images/lion.png" alt="A lion" style="width:100%" class="h-auto rounded" />
        <div class="feedback-container mt-2 hidden"><span class="feedback-text"></span></div>
      </label>
      <label class="activity-option flex items-start gap-4 p-4 rounded-lg cursor-pointer">
        <div class="option-letter">2</div>
        <input type="radio" name="question-group-1" value="item-2" data-activity-item="item-2" class="sr-only" tabindex="0" aria-label="Option 2" />
        <img data-id="img-2" src="images/zebra.png" alt="A zebra" style="width:50%" class="h-auto rounded" />
        <div class="feedback-container mt-2 hidden"><span class="feedback-text"></span></div>
      </label>
    </div>
    <p data-id="text-3">Which picture shows a zebra?</p>
    <div class="grid grid-cols-2 gap-4">
      <label class="activity-option cursor-pointer">
        <input type="radio" name="question-group-2" value="item-3" data-activity-item="item-3" class="sr-only" tabindex="0" aria-label="Option 1" />
        <img data-id="img-3" src="images/lion2.png" alt="A lion" />
      </label>
      <label class="activity-option cursor-pointer">
        <input type="radio" name="question-group-2" value="item-4" data-activity-item="item-4" class="sr-only" tabindex="0" aria-label="Option 2" />
        <img data-id="img-4" src="images/zebra2.png" alt="A zebra" />
      </label>
    </div>
  </div>
</section>`

const MC_TEXT_OPTIONS = `
<section data-section-type="activity_multiple_choice" data-section-id="sec-2">
  <div class="questions" role="group">
    <p data-id="text-10">What is the capital of Tanzania?</p>
    <label class="activity-option"><div class="option-letter">1</div>
      <input type="radio" name="q1" data-activity-item="item-1" class="sr-only" tabindex="0" aria-label="Option" />
      <span data-id="text-11">Dodoma</span>
    </label>
    <label class="activity-option"><div class="option-letter">2</div>
      <input type="radio" name="q1" data-activity-item="item-2" class="sr-only" tabindex="0" aria-label="Option" />
      <span data-id="text-12">Arusha</span>
    </label>
    <label class="activity-option"><div class="option-letter">3</div>
      <input type="radio" name="q1" data-activity-item="item-3" class="sr-only" tabindex="0" aria-label="Option" />
      <span data-id="text-13">Mwanza</span>
    </label>
  </div>
</section>`

const FITB_CARDS = `
<section data-section-type="activity_fill_in_the_blank" data-section-id="sec-3">
  <h2 data-id="text-20">Name the pictures</h2>
  <p data-id="text-21">Write the name of each animal.</p>
  <div class="grid grid-cols-2 gap-6">
    <div class="rounded-lg border p-4">
      <img data-id="img-10" src="images/cat.png" alt="" />
      <p class="fitb-sentence"><span data-id="text-22">This is a [[blank:item-1]].</span></p>
    </div>
    <div class="rounded-lg border p-4">
      <img data-id="img-11" src="images/dog.png" alt="" />
      <p class="fitb-sentence"><span data-id="text-23">This is a [[blank:item-2]].</span></p>
    </div>
  </div>
</section>`

const FITB_PLAIN = `
<section data-section-type="activity_fill_in_the_blank" data-section-id="sec-4">
  <p class="fitb-sentence" data-id="text-30">The sun rises in the [[blank:item-1]].</p>
  <p class="fitb-sentence" data-id="text-31">Water boils at [[blank:item-2:100]] degrees.</p>
</section>`

const FITB_STANDALONE_FORM = `
<section data-section-type="activity_fill_in_the_blank" data-section-id="sec-5">
  <span data-id="text-40">Name:</span>
  <input type="text" data-aria-id="aria-1-0-0" data-activity-item="item-1" tabindex="0" />
  <span data-id="text-41">Surname:</span>
  <input type="text" data-aria-id="aria-2-0-0" data-activity-item="item-2" tabindex="0" />
</section>`

const FITB_IMAGE_CARDS_WITH_INPUTS = `
<section data-section-type="activity_fill_in_the_blank" data-section-id="sec-6">
  <h2 data-id="text-50">Name the animals</h2>
  <p data-id="text-51">Write the name under each picture.</p>
  <div class="grid grid-cols-3 gap-4">
    <div class="rounded border p-3">
      <img data-id="img-20" src="images/lion.png" alt="" />
      <input type="text" data-aria-id="aria-1-0-0" data-activity-item="item-1" placeholder="animal" tabindex="0" />
    </div>
    <div class="rounded border p-3">
      <img data-id="img-21" src="images/zebra.png" alt="" />
      <input type="text" data-aria-id="aria-2-0-0" data-activity-item="item-2" tabindex="0" />
    </div>
    <div class="rounded border p-3">
      <img data-id="img-22" src="images/goat.png" alt="" />
      <textarea data-aria-id="aria-3-0-0" data-activity-item="item-3" tabindex="0"></textarea>
    </div>
  </div>
</section>`

const FITB_MIXED = `
<section data-section-type="activity_fill_in_the_blank" data-section-id="sec-7">
  <p class="fitb-sentence" data-id="text-60">The cow says [[blank:item-1]].</p>
  <span data-id="text-61">Your favourite animal:</span>
  <input type="text" data-aria-id="aria-2-0-0" data-activity-item="item-2" tabindex="0" />
</section>`

describe("supportsEditableActivity", () => {
  it("accepts FITB and MC, rejects others", () => {
    expect(supportsEditableActivity("activity_fill_in_the_blank")).toBe(true)
    expect(supportsEditableActivity("activity_multiple_choice")).toBe(true)
    expect(supportsEditableActivity("activity_sorting")).toBe(false)
    expect(supportsEditableActivity("activity_fill_in_a_table")).toBe(false)
  })
})

describe("replaceStepperShellsWithStaticHtml", () => {
  it("swaps the interactive shell for a static worksheet rendering", () => {
    const { activity } = extractEditableActivity({
      html: FITB_CARDS,
      sectionType: "activity_fill_in_the_blank",
      activityAnswers: { "item-1": "cat", "item-2": "dog" },
    })
    if (!activity) throw new Error("extraction failed")
    const shell = renderEditableActivityHtml(activity, { palette: DEFAULT_QUIZ_PALETTE })
    const page = `<html><body><div id="content">${shell}</div></body></html>`

    const replaced = replaceStepperShellsWithStaticHtml(page)
    expect(replaced).not.toContain("data-editable-activity")
    expect(replaced).not.toContain("data-stepper-root")
    // Sentence text survives (marker becomes a writing line), with data-id
    // preserved for EPUB media overlays.
    expect(replaced).toContain("This is a ")
    expect(replaced).toContain('data-id="text-22"')
    expect(replaced).toContain('src="images/cat.png"')
    expect(replaced).not.toContain("[[blank:")
    // Pages without shells pass through untouched.
    const plain = "<html><body><p>hi</p></body></html>"
    expect(replaceStepperShellsWithStaticHtml(plain)).toBe(plain)
  })
})

describe("extractEditableActivity — multiple choice", () => {
  it("extracts multi-group image options with prompts and correctness", () => {
    const { activity, errors, warnings } = extractEditableActivity({
      html: MC_IMAGE_OPTIONS,
      sectionType: "activity_multiple_choice",
      activityAnswers: { "item-1": true, "item-2": false, "item-3": false, "item-4": true },
    })
    expect(errors).toEqual([])
    expect(warnings).toEqual([])
    expect(activity).not.toBeNull()
    if (activity?.kind !== "multiple-choice") throw new Error("wrong kind")

    expect(activity.title).toEqual({ text: "Choose the right animal", dataId: "text-1" })
    expect(activity.steps).toHaveLength(2)

    const [q1, q2] = activity.steps
    expect(q1.id).toBe("question-group-1")
    expect(q1.prompt).toEqual({ text: "Which picture shows a lion?", dataId: "text-2" })
    expect(q1.options).toHaveLength(2)
    expect(q1.options[0]).toMatchObject({
      itemId: "item-1",
      correct: true,
      image: { imageId: "img-1", src: "images/lion.png", alt: "A lion", widthPercent: 100 },
    })
    expect(q1.options[1]).toMatchObject({
      itemId: "item-2",
      correct: false,
      image: { imageId: "img-2", widthPercent: 50 },
    })

    expect(q2.prompt).toEqual({ text: "Which picture shows a zebra?", dataId: "text-3" })
    expect(q2.options.map((o) => o.correct)).toEqual([false, true])
  })

  it("extracts text options with dataIds preserved", () => {
    const { activity, errors } = extractEditableActivity({
      html: MC_TEXT_OPTIONS,
      sectionType: "activity_multiple_choice",
      activityAnswers: { "item-1": true, "item-2": false, "item-3": false },
    })
    expect(errors).toEqual([])
    if (activity?.kind !== "multiple-choice") throw new Error("wrong kind")
    expect(activity.steps).toHaveLength(1)
    const step = activity.steps[0]
    expect(step.prompt?.text).toBe("What is the capital of Tanzania?")
    expect(step.options.map((o) => o.text?.text)).toEqual(["Dodoma", "Arusha", "Mwanza"])
    expect(step.options.map((o) => o.text?.dataId)).toEqual(["text-11", "text-12", "text-13"])
    expect(step.options[0].correct).toBe(true)
  })

  it("errors when the answer key has no single correct option", () => {
    const { activity, errors } = extractEditableActivity({
      html: MC_TEXT_OPTIONS,
      sectionType: "activity_multiple_choice",
      activityAnswers: { "item-1": true, "item-2": true, "item-3": false },
    })
    expect(activity).toBeNull()
    expect(errors.some((e) => e.includes("exactly one correct"))).toBe(true)
  })
})

describe("extractEditableActivity — fill in the blank", () => {
  it("extracts card steps with images, sentences, and answers", () => {
    const { activity, errors, warnings } = extractEditableActivity({
      html: FITB_CARDS,
      sectionType: "activity_fill_in_the_blank",
      activityAnswers: { "item-1": "cat|kitten", "item-2": "dog" },
    })
    expect(errors).toEqual([])
    expect(warnings).toEqual([])
    if (activity?.kind !== "fill-in-the-blank") throw new Error("wrong kind")

    expect(activity.title).toEqual({ text: "Name the pictures", dataId: "text-20" })
    expect(activity.instructions).toEqual({
      text: "Write the name of each animal.",
      dataId: "text-21",
    })
    expect(activity.steps).toHaveLength(2)

    const [s1, s2] = activity.steps
    expect(s1.image).toMatchObject({ imageId: "img-10", src: "images/cat.png" })
    expect(s1.sentences).toEqual([
      { text: "This is a [[blank:item-1]].", dataId: "text-22" },
    ])
    expect(s1.blanks).toEqual([{ itemId: "item-1", answers: ["cat", "kitten"] }])
    expect(s2.image).toMatchObject({ imageId: "img-11" })
    expect(s2.blanks).toEqual([{ itemId: "item-2", answers: ["dog"] }])
  })

  it("extracts plain sentences without images, keeping hints in text", () => {
    const { activity, errors } = extractEditableActivity({
      html: FITB_PLAIN,
      sectionType: "activity_fill_in_the_blank",
      activityAnswers: { "item-1": "east", "item-2": "100" },
    })
    expect(errors).toEqual([])
    if (activity?.kind !== "fill-in-the-blank") throw new Error("wrong kind")
    expect(activity.steps).toHaveLength(2)
    expect(activity.steps[0].image).toBeUndefined()
    expect(activity.steps[1].sentences[0].text).toBe(
      "Water boils at [[blank:item-2:100]] degrees.",
    )
  })

  it("warns and accepts any input when an answer is missing", () => {
    const { activity, warnings } = extractEditableActivity({
      html: FITB_PLAIN,
      sectionType: "activity_fill_in_the_blank",
      activityAnswers: { "item-1": "east" },
    })
    expect(activity).not.toBeNull()
    expect(warnings.some((w) => w.includes("item-2"))).toBe(true)
    if (activity?.kind !== "fill-in-the-blank") throw new Error("wrong kind")
    expect(activity.steps[1].blanks[0].answers).toEqual([])
    expect(activity.extractionWarnings?.length).toBeGreaterThan(0)
  })

  it("converts form-style activities: each standalone input becomes a step with its label", () => {
    const { activity, errors } = extractEditableActivity({
      html: FITB_STANDALONE_FORM,
      sectionType: "activity_fill_in_the_blank",
      activityAnswers: { "item-1": "Asha", "item-2": "" },
    })
    expect(errors).toEqual([])
    if (activity?.kind !== "fill-in-the-blank") throw new Error("wrong kind")
    expect(activity.steps).toHaveLength(2)
    expect(activity.steps[0].sentences).toEqual([{ text: "Name:", dataId: "text-40" }])
    expect(activity.steps[0].blanks).toEqual([{ itemId: "item-1", answers: ["Asha"] }])
    expect(activity.steps[1].sentences).toEqual([{ text: "Surname:", dataId: "text-41" }])
    // Empty stored answer = accept-any input.
    expect(activity.steps[1].blanks[0].answers).toEqual([])
  })

  it("converts image cards with standalone inputs (name-the-picture layout)", () => {
    const { activity, errors, warnings } = extractEditableActivity({
      html: FITB_IMAGE_CARDS_WITH_INPUTS,
      sectionType: "activity_fill_in_the_blank",
      activityAnswers: { "item-1": "lion", "item-2": "zebra", "item-3": "goat" },
    })
    expect(errors).toEqual([])
    expect(warnings).toEqual([])
    if (activity?.kind !== "fill-in-the-blank") throw new Error("wrong kind")

    expect(activity.title).toEqual({ text: "Name the animals", dataId: "text-50" })
    expect(activity.instructions).toEqual({
      text: "Write the name under each picture.",
      dataId: "text-51",
    })
    expect(activity.steps).toHaveLength(3)
    expect(activity.steps[0].image).toMatchObject({ imageId: "img-20" })
    // No label text inside the card — the step is image + answer field.
    expect(activity.steps[0].sentences).toEqual([])
    expect(activity.steps[0].blanks).toEqual([
      { itemId: "item-1", answers: ["lion"], hint: "animal" },
    ])
    expect(activity.steps[2].image).toMatchObject({ imageId: "img-22" })
    expect(activity.steps[2].blanks).toEqual([{ itemId: "item-3", answers: ["goat"] }])
  })

  it("skips numbering captions — they aren't labels or instructions", () => {
    const html = `
<section data-section-type="activity_fill_in_the_blank" data-section-id="sec-8">
  <h2 data-id="t1">Name the animal</h2>
  <span data-id="t2">(b)</span>
  <div class="grid">
    <div class="card">
      <span data-id="n1">1.</span>
      <img data-id="img-1" src="images/bee.png" alt="" />
      <input type="text" data-aria-id="a1" data-activity-item="item-1" tabindex="0" />
    </div>
    <div class="card">
      <span data-id="n2">2</span>
      <img data-id="img-2" src="images/ant.png" alt="" />
      <input type="text" data-aria-id="a2" data-activity-item="item-2" tabindex="0" />
    </div>
  </div>
</section>`
    const { activity, errors } = extractEditableActivity({
      html,
      sectionType: "activity_fill_in_the_blank",
      activityAnswers: { "item-1": "bee", "item-2": "ant" },
    })
    expect(errors).toEqual([])
    if (activity?.kind !== "fill-in-the-blank") throw new Error("wrong kind")
    // "(b)" is a lettering caption, not instructions; "1." / "2" aren't labels.
    expect(activity.instructions).toBeUndefined()
    expect(activity.steps.map((s) => s.sentences)).toEqual([[], []])
    expect(activity.steps[0].image).toMatchObject({ imageId: "img-1" })
  })

  it("mixes marker sentences and standalone inputs in document order", () => {
    const { activity, errors } = extractEditableActivity({
      html: FITB_MIXED,
      sectionType: "activity_fill_in_the_blank",
      activityAnswers: { "item-1": "moo", "item-2": "" },
    })
    expect(errors).toEqual([])
    if (activity?.kind !== "fill-in-the-blank") throw new Error("wrong kind")
    expect(activity.steps).toHaveLength(2)
    expect(activity.steps[0].sentences[0].text).toBe("The cow says [[blank:item-1]].")
    expect(activity.steps[1].sentences).toEqual([
      { text: "Your favourite animal:", dataId: "text-61" },
    ])
    expect(activity.steps[1].blanks[0].itemId).toBe("item-2")
  })

  it("rejects activities containing math notation", () => {
    const html = `
<section data-section-type="activity_fill_in_the_blank">
  <p class="fitb-sentence" data-id="t1">\\(\\frac{3}{4} + \\frac{1}{4} =\\) [[blank:item-1]]</p>
</section>`
    const { activity, errors } = extractEditableActivity({
      html,
      sectionType: "activity_fill_in_the_blank",
      activityAnswers: { "item-1": "1" },
    })
    expect(activity).toBeNull()
    expect(errors.some((e) => e.includes("math"))).toBe(true)
  })

  it("rejects unsupported section types", () => {
    const { activity, errors } = extractEditableActivity({
      html: FITB_PLAIN,
      sectionType: "activity_sorting",
    })
    expect(activity).toBeNull()
    expect(errors[0]).toContain("doesn't support")
  })
})
