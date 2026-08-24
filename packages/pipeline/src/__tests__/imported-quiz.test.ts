import { describe, expect, it } from "vitest"
import { recoverImportedQuiz } from "../imported-quiz.js"

const TEXTS = {
  qz001_que: "Who was coming to visit The COPE Academy?",
  qz001_o0: "1) Firefighters",
  qz001_o0_exp: "❌ Not quite. The pages do not say firefighters were visiting.",
  qz001_o1: "2) Volcanologists",
  qz001_o1_exp: "✅ Correct! Two volcanologists were visiting.",
  qz001_o2: "3) Astronauts",
  qz001_o2_exp: "❌ Nice try, but the visitors were not astronauts.",
}

function page(key = '{"qz001_o0":false,"qz001_o1":true,"qz001_o2":false}'): string {
  return `<!doctype html><html><body>
    <section data-id="qz001" data-section-type="activity_quiz">
      <p data-id="qz001_que">Who was coming to visit The COPE Academy?</p>
    </section>
    <script>
      window.correctAnswers = JSON.parse('${key}')
    </script>
  </body></html>`
}

describe("recoverImportedQuiz", () => {
  it("rebuilds the quiz from the catalog and the page's answer key", () => {
    expect(recoverImportedQuiz(page(), "qz001", TEXTS)).toEqual({
      sectionId: "qz001",
      question: "Who was coming to visit The COPE Academy?",
      options: [
        { text: "1) Firefighters", explanation: "❌ Not quite. The pages do not say firefighters were visiting." },
        { text: "2) Volcanologists", explanation: "✅ Correct! Two volcanologists were visiting." },
        { text: "3) Astronauts", explanation: "❌ Nice try, but the visitors were not astronauts." },
      ],
      answerIndex: 1,
    })
  })

  it("reads the key from the section attribute when the script form is absent", () => {
    const html = `<section data-id="qz001" data-correct-answers="{&quot;qz001_o0&quot;:true,&quot;qz001_o1&quot;:false,&quot;qz001_o2&quot;:false}"></section>`
    expect(recoverImportedQuiz(html, "qz001", TEXTS)?.answerIndex).toBe(0)
  })

  it("never guesses the answer from the explanation markers", () => {
    // The ✅ still sits on option 2, but the page carries no key at all.
    expect(recoverImportedQuiz("<section data-id='qz001'></section>", "qz001", TEXTS)).toBeNull()
  })

  it("refuses a key that flags no answer or several", () => {
    expect(recoverImportedQuiz(page('{"qz001_o0":false,"qz001_o1":false,"qz001_o2":false}'), "qz001", TEXTS)).toBeNull()
    expect(recoverImportedQuiz(page('{"qz001_o0":true,"qz001_o1":true,"qz001_o2":false}'), "qz001", TEXTS)).toBeNull()
  })

  it("refuses a key that does not describe exactly these three options", () => {
    expect(recoverImportedQuiz(page('{"qz001_o0":false,"qz001_o1":true}'), "qz001", TEXTS)).toBeNull()
    expect(recoverImportedQuiz(
      page('{"qz001_o0":false,"qz001_o1":true,"qz001_o2":false,"qz001_o3":false}'),
      "qz001",
      TEXTS,
    )).toBeNull()
  })

  it("refuses when the catalog is missing the question or an option", () => {
    const { qz001_que: _q, ...noQuestion } = TEXTS
    expect(recoverImportedQuiz(page(), "qz001", noQuestion)).toBeNull()
    const { qz001_o2: _o, ...noOption } = TEXTS
    expect(recoverImportedQuiz(page(), "qz001", noOption)).toBeNull()
  })
})
