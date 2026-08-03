import { describe, expect, it } from "vitest"
import {
  extractEditableActivity,
  supportsEditableActivity,
  isIndexLabel,
} from "../extract-editable-activity.js"
import { buildActivityOutline, applyActivityHeader } from "../activity-outline.js"
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

// A cloze passage with a word bank (mirrors pg014): an instruction, a box of
// words, then a passage whose blanks are all drawn from the box.
const FITB_WORD_BANK = `
<section data-section-type="activity_fill_in_the_blank" data-section-id="sec-wb">
  <div><span data-id="wb-num">C.</span><p><span data-id="wb-instr">Complete the passage using the words in the box.</span></p></div>
  <div class="bg-orange-100 border"><span data-id="wb-bank">swam, muddy, filled, sank</span></div>
  <div class="sr-only"><span data-id="wb-sr">FOR ONLINE READING ONLY</span></div>
  <div>
    <p><span data-id="wb-s1" class="fitb-sentence">The children (i) [[blank:item-1]] in the pond.</span></p>
    <p><span data-id="wb-s2" class="fitb-sentence">The water was (ii) [[blank:item-2]].</span> <span data-id="wb-narr">They had fun.</span> <span data-id="wb-s3" class="fitb-sentence">Their bodies (iii) [[blank:item-3]] with mud.</span></p>
    <p><span data-id="wb-s4" class="fitb-sentence">Then they (iv) [[blank:item-4]] under water.</span></p>
  </div>
</section>`

// Grouped form-style FITB (mirrors pg035 activity E): sections with a heading
// and worked example above numbered "(i) ___" lines. The blanks are standalone
// inputs whose only per-line label is a roman-numeral caption.
const FITB_GROUPED_FORM = `
<section data-section-type="activity_fill_in_the_blank" data-section-id="sec-grp">
  <span data-id="g-instr" class="block font-semibold">Match each to its group.</span>
  <div class="space-y-8">
    <div>
      <span data-id="g-h1" class="block font-bold">Methali</span>
      <span data-id="g-e1" class="block">Mfano: Asiyeuliza hana ajifunzalo.</span>
      <div class="space-y-2">
        <div class="flex"><label data-id="g-l1">(i)</label><input type="text" data-aria-id="a-1" data-activity-item="item-1" aria-label="Methali (i)"></div>
        <div class="flex"><label data-id="g-l2">(ii)</label><input type="text" data-aria-id="a-2" data-activity-item="item-2" aria-label="Methali (ii)"></div>
      </div>
    </div>
    <div>
      <span data-id="g-h2" class="block font-bold">Nahau</span>
      <span data-id="g-e2" class="block">Mfano: Watu wa damu moja.</span>
      <div class="space-y-2">
        <div class="flex"><label data-id="g-l3">(i)</label><input type="text" data-aria-id="a-3" data-activity-item="item-3" aria-label="Nahau (i)"></div>
        <div class="flex"><label data-id="g-l4">(ii)</label><input type="text" data-aria-id="a-4" data-activity-item="item-4" aria-label="Nahau (ii)"></div>
      </div>
    </div>
  </div>
</section>`

describe("isIndexLabel", () => {
  it("treats numbers, single letters, and roman numerals as captions", () => {
    for (const s of ["1.", "2)", "(b)", "a:", "(i)", "(ii)", "iii.", "(iv)", "v", "(x)", "xiv"]) {
      expect(isIndexLabel(s)).toBe(true)
    }
  })
  it("does not treat real words (even all-roman-letter ones) as captions", () => {
    for (const s of ["mill", "civil", "Methali", "Mfano", "Nahau", "cat"]) {
      expect(isIndexLabel(s)).toBe(false)
    }
  })
})

describe("supportsEditableActivity", () => {
  it("accepts FITB, MC, true/false, open-ended, and underline; rejects others", () => {
    expect(supportsEditableActivity("activity_fill_in_the_blank")).toBe(true)
    expect(supportsEditableActivity("activity_multiple_choice")).toBe(true)
    expect(supportsEditableActivity("activity_true_false")).toBe(true)
    expect(supportsEditableActivity("activity_open_ended_answer")).toBe(true)
    expect(supportsEditableActivity("activity_underline_text")).toBe(true)
    expect(supportsEditableActivity("activity_sorting")).toBe(false)
    expect(supportsEditableActivity("activity_fill_in_a_table")).toBe(false)
  })
})

describe("buildActivityOutline", () => {
  // Section tree matching the OPEN_ENDED fixture below — supplies the
  // semantic roles the HTML lacks.
  const leaf = (nodeId: string, role: string, text: string) => ({
    nodeId,
    isPruned: false,
    role,
    text,
  })

  it("organizes header + item cards for open-ended activities", () => {
    // Mirrors the listening-and-writing layout: styled-span title (not an
    // h1-h6), grade badge, two instruction sentences, and per-item cards
    // holding a letter caption, a multi-sentence question, and a textarea.
    const html = `
<section data-section-type="activity_open_ended_answer" data-section-id="sec-9">
  <span class="text-5xl font-bold" data-id="t1">A Day to Remember</span>
  <span data-id="t2">GRADE 2</span>
  <p><span data-id="i1">Answer each question in full sentences.</span><span data-id="i2">Use the lines to write your ideas.</span></p>
  <div class="item-card">
    <span data-id="l1">(a)</span>
    <p data-id="q1">Who is someone who makes you feel happy?</p>
    <p data-id="q2">Tell us a little about them.</p>
    <textarea data-activity-item="item-1" tabindex="0"></textarea>
  </div>
</section>`
    const nodes = [
      leaf("t1", "heading", "A Day to Remember"),
      leaf("t2", "label", "GRADE 2"),
      leaf("i1", "activity_instruction", "Answer each question in full sentences."),
      leaf("i2", "activity_instruction", "Use the lines to write your ideas."),
      leaf("l1", "activity_number", "(a)"),
      leaf("q1", "activity_question", "Who is someone who makes you feel happy?"),
      leaf("q2", "activity_question", "Tell us a little about them."),
    ]
    const o = buildActivityOutline({ html, sectionNodes: nodes })
    expect(o.title).toEqual({ dataId: "t1", text: "A Day to Remember" })
    expect(o.badges).toEqual([{ dataId: "t2", text: "GRADE 2" }])
    expect(o.instructions.map((i) => i.dataId)).toEqual(["i1", "i2"])
    expect(o.items).toHaveLength(1)
    expect(o.items[0].number).toEqual({ dataId: "l1", text: "(a)" })
    // BOTH question sentences group into the item — not just the last one.
    expect(o.items[0].prompts.map((p) => p.dataId)).toEqual(["q1", "q2"])
    expect(o.items[0].inputs).toEqual([{ itemId: "item-1", kind: "textarea" }])
  })

  it("builds value-choice items for true/false radio pairs", () => {
    const html = `
<section data-section-type="activity_true_false" data-section-id="sec-9">
  <h1 data-id="t1">Geography</h1>
  <p data-id="i1">Circle T for True or F for False.</p>
  <fieldset>
    <p data-id="n1">1.</p>
    <span data-id="s1">The Amazon River is in South America.</span>
    <label><input type="radio" name="question1" value="true" data-activity-item="item-1" /><span data-id="tt1">T</span></label>
    <label><input type="radio" name="question1" value="false" data-activity-item="item-1" /><span data-id="ff1">F</span></label>
  </fieldset>
</section>`
    const nodes = [
      leaf("i1", "activity_instruction", "Circle T for True or F for False."),
      leaf("n1", "activity_number", "1."),
      leaf("s1", "activity_question", "The Amazon River is in South America."),
    ]
    const o = buildActivityOutline({ html, sectionNodes: nodes })
    expect(o.title?.dataId).toBe("t1")
    expect(o.items).toHaveLength(1)
    const item = o.items[0]
    expect(item.choice).toBe("value")
    expect(item.number?.dataId).toBe("n1")
    expect(item.prompts.map((p) => p.dataId)).toEqual(["s1"])
    expect(item.options).toEqual([
      { itemId: "item-1", value: "true", text: { dataId: "tt1", text: "T" } },
      { itemId: "item-1", value: "false", text: { dataId: "ff1", text: "F" } },
    ])
  })

  it("builds multi-choice items from checkbox groups, preferring visible option text", () => {
    const html = `
<section data-section-type="activity_multi_select" data-section-id="sec-9">
  <div class="questions" role="group">
    <label><input type="checkbox" name="g1" value="item-1" data-activity-item="item-1" /><span class="sr-only" data-id="sr1">A</span><span data-id="o1">Lion</span></label>
    <label><input type="checkbox" name="g1" value="item-2" data-activity-item="item-2" /><span class="sr-only" data-id="sr2">B</span><span data-id="o2">Snake</span></label>
  </div>
</section>`
    const o = buildActivityOutline({ html })
    expect(o.items).toHaveLength(1)
    expect(o.items[0].choice).toBe("multi")
    expect(o.items[0].options.map((x) => [x.itemId, x.text?.dataId])).toEqual([
      ["item-1", "o1"],
      ["item-2", "o2"],
    ])
  })

  it("adopts a shared prompt stranded above a question's second answer group", () => {
    // A two-blank sentence: one prompt, two radio groups. The prompt sits
    // above both groups' cards and must attach to the first bare item.
    const html = `
<section data-section-type="activity_multiple_choice" data-section-id="sec-9">
  <div class="question">
    <span data-id="n1">3</span>
    <span data-id="p1">A baby cat is called a ___, and a baby dog is called a ___.</span>
    <div role="group">
      <label><input type="radio" name="g1" value="item-1" data-activity-item="item-1" /><span data-id="o1">puppy</span></label>
      <label><input type="radio" name="g1" value="item-2" data-activity-item="item-2" /><span data-id="o2">kitten</span></label>
    </div>
    <div role="group">
      <label><input type="radio" name="g2" value="item-3" data-activity-item="item-3" /><span data-id="o3">foal</span></label>
      <label><input type="radio" name="g2" value="item-4" data-activity-item="item-4" /><span data-id="o4">calf</span></label>
    </div>
  </div>
</section>`
    const o = buildActivityOutline({ html })
    expect(o.items).toHaveLength(2)
    expect(o.items[0].number?.dataId).toBe("n1")
    expect(o.items[0].prompts.map((p) => p.dataId)).toEqual(["p1"])
    expect(o.items[1].prompts).toEqual([])
    expect(o.items[1].options).toHaveLength(2)
  })

  it("groups table inputs with their row's cells", () => {
    const html = `
<section data-section-type="activity_fill_in_a_table" data-section-id="sec-9">
  <table>
    <tr><td><span data-id="h1">First group</span></td><td><span data-id="h2">Total</span></td></tr>
    <tr><td><span data-id="c1">🍎🍎</span></td><td><input type="text" data-activity-item="item-1" /></td></tr>
    <tr><td><span data-id="c2">⭐️⭐️⭐️</span></td><td><input type="text" data-activity-item="item-2" /></td></tr>
  </table>
</section>`
    const o = buildActivityOutline({ html })
    expect(o.items).toHaveLength(2)
    expect(o.items[0].prompts.map((p) => p.dataId)).toEqual(["c1"])
    expect(o.items[0].inputs[0]).toMatchObject({ itemId: "item-1", kind: "text" })
    expect(o.items[1].prompts.map((p) => p.dataId)).toEqual(["c2"])
  })

  it("applyActivityHeader overrides badge-as-instructions and span titles", () => {
    const html = `
<section data-section-type="activity_fill_in_the_blank" data-section-id="sec-9">
  <span class="text-5xl" data-id="t1">Missing Letters</span>
  <span data-id="b1">GRADE 1</span>
  <span data-id="i1">Write the missing letter.</span>
  <div class="fitb-sentence"><span data-id="s1">C [[blank:item-1]] T</span></div>
</section>`
    const nodes = [
      leaf("t1", "heading", "Missing Letters"),
      leaf("b1", "label", "GRADE 1"),
      leaf("i1", "activity_instruction", "Write the missing letter."),
      leaf("s1", "text", "C [[blank:item-1]] T"),
    ]
    const bad = { title: undefined, instructions: { text: "GRADE 1", dataId: "b1" } }
    const fixed = applyActivityHeader(bad, { html, sectionNodes: nodes })
    expect(fixed.title).toEqual({ dataId: "t1", text: "Missing Letters" })
    expect(fixed.instructions).toEqual({ dataId: "i1", text: "Write the missing letter." })
  })

  it("joins a heading split across sibling leaves into one title", () => {
    const html = `
<section data-section-type="activity_open_ended_answer" data-section-id="sec-9">
  <h1><span data-id="t1">Activity 5:</span> <span data-id="t2">My Family</span></h1>
  <p data-id="q1">Write about your family.</p>
  <textarea data-activity-item="item-1" tabindex="0"></textarea>
</section>`
    const nodes = [
      {
        nodeId: "h1",
        isPruned: false,
        structure: "heading",
        children: [leaf("t1", "heading", "Activity 5:"), leaf("t2", "heading", "My Family")],
      },
      leaf("q1", "activity_question", "Write about your family."),
    ]
    const o = buildActivityOutline({ html, sectionNodes: nodes })
    // Joined text, no dataId (a single edit channel can't address two spans).
    expect(o.title).toEqual({ text: "Activity 5: My Family" })
    // Both spans are claimed — neither leaks into the item's prompts.
    expect(o.items[0].prompts.map((p) => p.dataId)).toEqual(["q1"])
  })

  it("scans select and number inputs as writable answer fields", () => {
    const html = `
<section data-section-type="activity_fill_in_a_table" data-section-id="sec-9">
  <table>
    <tr><td><span data-id="c1">🍎🍎 + 🍎</span></td><td>
      <select data-activity-item="item-1"><option>2</option><option>3</option></select>
    </td></tr>
    <tr><td><span data-id="c2">⭐️ + ⭐️</span></td><td>
      <input type="number" data-activity-item="item-2" />
    </td></tr>
  </table>
</section>`
    const o = buildActivityOutline({ html })
    expect(o.items.map((i) => i.inputs[0])).toEqual([
      { itemId: "item-1", kind: "select" },
      { itemId: "item-2", kind: "text" },
    ])
    expect(o.items[0].prompts.map((p) => p.dataId)).toEqual(["c1"])
  })

  it("returns items: [] for input-less activities (header still organized)", () => {
    const o = buildActivityOutline({ html: MC_TEXT_OPTIONS })
    // MC radios DO produce items; a truly inert page produces none.
    expect(o.items.length).toBeGreaterThan(0)
    expect(buildActivityOutline({ html: "<p>no section</p>" })).toEqual({
      badges: [],
      instructions: [],
      items: [],
    })
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

  it("captures a word bank shared across all blanks, keeping the directive as instructions", () => {
    const { activity, errors } = extractEditableActivity({
      html: FITB_WORD_BANK,
      sectionType: "activity_fill_in_the_blank",
      activityAnswers: {
        "item-1": "swam",
        "item-2": "muddy",
        "item-3": "filled",
        "item-4": "sank",
      },
    })
    expect(errors).toEqual([])
    if (activity?.kind !== "fill-in-the-blank") throw new Error("wrong kind")
    // The box of words is detected as the word bank (by overlap with the
    // answer key) — not mistaken for the instruction; the sr-only banner is
    // ignored entirely.
    expect(activity.wordBank).toEqual({ text: "swam, muddy, filled, sank", dataId: "wb-bank" })
    expect(activity.instructions).toEqual({
      text: "Complete the passage using the words in the box.",
      dataId: "wb-instr",
    })
    expect(activity.steps).toHaveLength(4)
  })

  it("does not invent a word bank when there is no shared word list", () => {
    const { activity } = extractEditableActivity({
      html: FITB_PLAIN,
      sectionType: "activity_fill_in_the_blank",
      activityAnswers: { "item-1": "east", "item-2": "100" },
    })
    if (activity?.kind !== "fill-in-the-blank") throw new Error("wrong kind")
    expect(activity.wordBank).toBeUndefined()
  })

  it("gives grouped form blanks their section heading + worked example", () => {
    const { activity, errors } = extractEditableActivity({
      html: FITB_GROUPED_FORM,
      sectionType: "activity_fill_in_the_blank",
      activityAnswers: {
        "item-1": "Beba wazazi",
        "item-2": "Kaza macho",
        "item-3": "Mtu kwao",
        "item-4": "Mkono kwa mkono",
      },
    })
    expect(errors).toEqual([])
    if (activity?.kind !== "fill-in-the-blank") throw new Error("wrong kind")
    expect(activity.instructions?.text).toBe("Match each to its group.")
    // No box listing the answers → not a word bank.
    expect(activity.wordBank).toBeUndefined()
    expect(activity.steps).toHaveLength(4)
    // Every blank in a group carries that group's heading + example — including
    // the (ii) line, whose roman-numeral label is treated as a caption.
    const ctx = (i: number) => activity.steps[i].sentences.map((s) => s.text)
    expect(ctx(0)).toEqual(["Methali", "Mfano: Asiyeuliza hana ajifunzalo."])
    expect(ctx(1)).toEqual(["Methali", "Mfano: Asiyeuliza hana ajifunzalo."])
    expect(ctx(2)).toEqual(["Nahau", "Mfano: Watu wa damu moja."])
    expect(ctx(3)).toEqual(["Nahau", "Mfano: Watu wa damu moja."])
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

// ---------------------------------------------------------------------------
// True/false — mirrors prompts/activity_true_false.liquid: per-statement
// <fieldset> with a <legend> prompt and two radios that share one
// data-activity-item, differing by value="true"|"false".
// ---------------------------------------------------------------------------

const tfGroup = (name: string, itemId: string, sid: string, statement: string) => `
  <fieldset>
    <legend><span data-id="${sid}">${statement}</span></legend>
    <label for="${name}-t"><input name="${name}" type="radio" value="true" data-activity-item="${itemId}"><div><span data-id="${sid}-t">KWELI</span></div></label>
    <label for="${name}-f"><input name="${name}" type="radio" value="false" data-activity-item="${itemId}"><div><span data-id="${sid}-f">SI KWELI</span></div></label>
  </fieldset>`

const TRUE_FALSE = `
<section data-section-type="activity_true_false" data-section-id="sec-tf">
  <h1 data-id="tf-title">Andika KWELI au SI KWELI</h1>
  ${tfGroup("q1", "item-1", "tf-s1", "(i) The lion is a mammal.")}
  ${tfGroup("q2", "item-2", "tf-s2", "(ii) Fish can fly.")}
</section>`

describe("extractEditableActivity — true/false", () => {
  it("maps each statement onto a two-option multiple-choice step", () => {
    const { activity, errors, warnings } = extractEditableActivity({
      html: TRUE_FALSE,
      sectionType: "activity_true_false",
      activityAnswers: { "item-1": "true", "item-2": "false" },
    })
    expect(errors).toEqual([])
    expect(warnings).toEqual([])
    // True/false reuses the multiple-choice kind, keeping its source type.
    if (activity?.kind !== "multiple-choice") throw new Error("wrong kind")
    expect(activity.sectionType).toBe("activity_true_false")
    expect(activity.title).toEqual({ text: "Andika KWELI au SI KWELI", dataId: "tf-title" })
    expect(activity.steps).toHaveLength(2)

    const [s1, s2] = activity.steps
    expect(s1.id).toBe("q1")
    expect(s1.prompt).toEqual({ text: "(i) The lion is a mammal.", dataId: "tf-s1" })
    expect(s1.options).toEqual([
      { itemId: "item-1-true", text: { text: "KWELI", dataId: "tf-s1-t" }, correct: true },
      { itemId: "item-1-false", text: { text: "SI KWELI", dataId: "tf-s1-f" }, correct: false },
    ])
    // Statement 2's answer is false → the "SI KWELI" option is correct.
    expect(s2.options.map((o) => o.correct)).toEqual([false, true])
  })

  it("accepts a boolean answer key", () => {
    const { activity, errors } = extractEditableActivity({
      html: TRUE_FALSE,
      sectionType: "activity_true_false",
      activityAnswers: { "item-1": false, "item-2": true },
    })
    expect(errors).toEqual([])
    if (activity?.kind !== "multiple-choice") throw new Error("wrong kind")
    expect(activity.steps[0].options.map((o) => o.correct)).toEqual([false, true])
  })

  it("errors when a statement has no answer in the key", () => {
    const { activity, errors } = extractEditableActivity({
      html: TRUE_FALSE,
      sectionType: "activity_true_false",
      activityAnswers: { "item-1": "true" },
    })
    expect(activity).toBeNull()
    expect(errors.some((e) => e.includes("exactly one correct answer"))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Open-ended — mirrors prompts/activity_open_ended_answer.liquid: a styled-span
// header, per-question cards with a number caption, one or more prompt lines,
// and a textarea with data-aria-id (no answer key).
// ---------------------------------------------------------------------------

const OPEN_ENDED = `
<section data-section-type="activity_open_ended_answer" data-section-id="sec-oe">
  <span class="adt-h3 font-bold" data-id="oe-title">Comprehension</span>
  <div class="space-y-5">
    <div class="rounded-2xl p-4">
      <span class="w-8 shrink-0" data-id="oe-n1">1.</span>
      <div class="flex-1">
        <div class="adt-body" data-id="oe-q1">Why did the animals raid the farms?</div>
        <textarea data-aria-id="aria-1-0-0" aria-label="Answer to question 1" tabindex="0"></textarea>
      </div>
    </div>
    <div class="px-1 py-2">
      <span class="w-8 shrink-0" data-id="oe-n2">2.</span>
      <div class="flex-1">
        <div class="adt-body" data-id="oe-q2a">What two gifts were promised?</div>
        <div class="adt-body" data-id="oe-q2b">Why?</div>
        <textarea data-aria-id="aria-1-0-1" aria-label="Answer to question 2" tabindex="0"></textarea>
      </div>
    </div>
  </div>
</section>`

describe("extractEditableActivity — open-ended", () => {
  it("extracts one step per writing field with its prompt and no answer key", () => {
    const { activity, errors } = extractEditableActivity({
      html: OPEN_ENDED,
      sectionType: "activity_open_ended_answer",
    })
    expect(errors).toEqual([])
    if (activity?.kind !== "open-ended") throw new Error("wrong kind")

    // The styled-span header (no h1-h6) is recovered as the title.
    expect(activity.title).toEqual({ text: "Comprehension", dataId: "oe-title" })
    expect(activity.instructions).toBeUndefined()
    expect(activity.steps).toHaveLength(2)

    const [s1, s2] = activity.steps
    expect(s1.prompt).toEqual({
      text: "Why did the animals raid the farms?",
      dataId: "oe-q1",
    })
    expect(s1.ariaId).toBe("aria-1-0-0")
    expect(s1.multiline).toBe(true)
    // Two prompt lines join; a joined text can't map to one catalog id.
    expect(s2.prompt).toEqual({ text: "What two gifts were promised? Why?" })
    expect(s2.ariaId).toBe("aria-1-0-1")
  })

  it("errors when there are no writable fields", () => {
    const { activity, errors } = extractEditableActivity({
      html: `<section data-section-type="activity_open_ended_answer"><p data-id="x">Read the story.</p></section>`,
      sectionType: "activity_open_ended_answer",
    })
    expect(activity).toBeNull()
    expect(errors.some((e) => e.includes("writable answer fields"))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Underline — mirrors prompts/activity_underline_text.liquid: every word of an
// interactive sentence is wrapped in .activity-underline-option with a unique
// data-activity-item and a data-question-group; correctness is a boolean map.
// ---------------------------------------------------------------------------

const opt = (id: string, group: string, text: string) =>
  `<span class="activity-underline-option" data-activity-item="${id}" data-question-group="${group}">${text}</span>`

const UNDERLINE = `
<section data-section-type="activity_underline_text" data-section-id="sec-ul">
  <h1 data-id="ul-title">Grammar</h1>
  <p data-id="ul-instr">Underline the pronouns.</p>
  <p data-id="ul-s1">${opt("item-1", "question-group-1", "I")} ${opt("item-2", "question-group-1", "like")} ${opt("item-3", "question-group-1", "bananas")}.</p>
  <p data-id="ul-s2">${opt("item-4", "question-group-2", "She")} ${opt("item-5", "question-group-2", "runs")}.</p>
</section>`

describe("extractEditableActivity — underline", () => {
  it("tokenizes each sentence into words with the answer key applied", () => {
    const { activity, errors, warnings } = extractEditableActivity({
      html: UNDERLINE,
      sectionType: "activity_underline_text",
      activityAnswers: {
        "item-1": true,
        "item-2": false,
        "item-3": false,
        "item-4": true,
        "item-5": false,
      },
    })
    expect(errors).toEqual([])
    expect(warnings).toEqual([])
    if (activity?.kind !== "underline-text") throw new Error("wrong kind")

    expect(activity.title).toEqual({ text: "Grammar", dataId: "ul-title" })
    expect(activity.instructions).toEqual({
      text: "Underline the pronouns.",
      dataId: "ul-instr",
    })
    expect(activity.steps).toHaveLength(2)

    const [s1, s2] = activity.steps
    expect(s1.id).toBe("question-group-1")
    expect(s1.dataId).toBe("ul-s1")
    // Words are selectable tokens; spaces/punctuation are plain connective text.
    expect(s1.tokens).toEqual([
      { itemId: "item-1", text: "I", correct: true },
      { text: " " },
      { itemId: "item-2", text: "like", correct: false },
      { text: " " },
      { itemId: "item-3", text: "bananas", correct: false },
      { text: "." },
    ])
    expect(s2.tokens.filter((t) => t.itemId && t.correct).map((t) => t.text)).toEqual(["She"])
  })

  it("drops sentences whose answer key marks nothing (unwinnable), warning about it", () => {
    const { activity, errors, warnings } = extractEditableActivity({
      html: UNDERLINE,
      sectionType: "activity_underline_text",
      // group-1 has a correct word; group-2 has none → group-2 is dropped.
      activityAnswers: {
        "item-1": true,
        "item-2": false,
        "item-3": false,
        "item-4": false,
        "item-5": false,
      },
    })
    expect(errors).toEqual([])
    if (activity?.kind !== "underline-text") throw new Error("wrong kind")
    expect(activity.steps.map((s) => s.id)).toEqual(["question-group-1"])
    expect(warnings.some((w) => w.includes("no correct word"))).toBe(true)
  })

  it("errors when no sentence has a correct word", () => {
    const { activity, errors } = extractEditableActivity({
      html: UNDERLINE,
      sectionType: "activity_underline_text",
      activityAnswers: {},
    })
    expect(activity).toBeNull()
    expect(errors.some((e) => e.includes("No answerable underline"))).toBe(true)
  })
})
