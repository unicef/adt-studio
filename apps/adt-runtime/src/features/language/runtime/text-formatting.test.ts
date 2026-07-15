// @vitest-environment jsdom
import { describe, expect, it } from "vitest"

import { applyPlainTextWithLineBreaks } from "./text-formatting"

describe("Easy Read text formatting", () => {
  it("renders newline-separated Easy Read bullets as text plus real line breaks", () => {
    document.body.innerHTML = "<p></p>"
    const element = document.querySelector("p")
    expect(element).not.toBeNull()

    applyPlainTextWithLineBreaks(
      element as HTMLElement,
      "Por ejemplo:\n- politica\n- social\n- cultural",
    )

    expect(element?.textContent).toBe("Por ejemplo:- politica- social- cultural")
    expect(element?.innerHTML).toBe("Por ejemplo:<br>- politica<br>- social<br>- cultural")
  })

  it("does not interpret generated Easy Read text as HTML", () => {
    document.body.innerHTML = "<p></p>"
    const element = document.querySelector("p")
    expect(element).not.toBeNull()

    applyPlainTextWithLineBreaks(
      element as HTMLElement,
      "Texto <strong>simple</strong>",
    )

    expect(element?.querySelector("strong")).toBeNull()
    expect(element?.innerHTML).toBe("Texto &lt;strong&gt;simple&lt;/strong&gt;")
  })

  it("renders Temml-baked <math> while keeping surrounding prose plain", () => {
    document.body.innerHTML = "<p></p>"
    const element = document.querySelector("p")
    expect(element).not.toBeNull()

    applyPlainTextWithLineBreaks(
      element as HTMLElement,
      'Dong Xu<math xmlns="http://www.w3.org/1998/Math/MathML"><msup><mrow></mrow><mn>1,2</mn></msup></math> <strong>x</strong>',
    )

    // Math is rendered as a real element, not shown as literal tags.
    expect(element?.querySelector("math")).not.toBeNull()
    expect(element?.textContent).toContain("Dong Xu")
    // Non-math markup is still escaped (LLM output can't inject elements).
    expect(element?.querySelector("strong")).toBeNull()
    expect(element?.innerHTML).toContain("&lt;strong&gt;x&lt;/strong&gt;")
  })
})
