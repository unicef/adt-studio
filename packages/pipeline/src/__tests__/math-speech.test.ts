import { describe, expect, it } from "vitest"
import { latexToSpeech } from "../math-speech.js"

/**
 * Cases marked "from the book" are literal catalog entries taken from
 * MATHEMATICS-STD-5-PB--SEPT-2025-, so the fixtures are real content rather
 * than invented examples.
 */

describe("latexToSpeech — leaves non-maths untouched", () => {
  // Any modification here is a false positive: these strings reach the TTS
  // provider verbatim today and must continue to.
  const UNTOUCHED: Array<[string, string]> = [
    ["plain prose", "The elephant is the largest land animal."],
    ["Kiswahili prose", "Nilikwenda sokoni kununua matunda na mboga."],
    ["Albanian prose", "Nxënësit shkruajnë përgjigjet në fletore."],
    ["empty", ""],
    ["and/or", "Bring a pencil and/or a pen to the examination."],
    ["units per hour", "The car travels at 60 km/h on the highway."],
    ["date with slashes", "The examination is on 12/05/2026 at 9 a.m."],
    ["fraction written in prose", "About 2/3 of the class passed the test."],
    ["percentage", "Nearly 50% of pupils walk to school each day."],
    ["fill-in-the-blank rule", "Complete the sentence: The capital is ____________."],
    ["snake_case identifier", "The variable file_name_here stores the value."],
    ["markdown emphasis", "Write __bold__ or _italic_ in your notes."],
    ["caret as a key name", "Use the ^ symbol on your keyboard to go up."],
    ["lone backslash", "Press the \\ key next to Enter."],
  ]

  for (const [label, input] of UNTOUCHED) {
    it(label, () => {
      expect(latexToSpeech(input)).toBe(input)
    })
  }
})

describe("latexToSpeech — file paths are not maths", () => {
  // Backslash runs in paths collide with command names: `\text`, `\times`,
  // `\in` and `\sum` are all real commands and all plausible directory names.
  // Converting these silently deleted a path segment.
  const PATHS: Array<[string, string]> = [
    ["path containing \\text", "Save the file to C:\\text\\notes.txt"],
    ["path containing \\times", "The folder is D:\\times\\backup"],
    ["path containing \\in", "Look in C:\\in\\out for the report."],
    ["UNC network path", "The shared folder is \\\\server\\class\\notes"],
    ["Kiswahili prose with a path", "Hifadhi faili katika C:\\text\\kazi.docx"],
  ]

  for (const [label, input] of PATHS) {
    it(label, () => {
      expect(latexToSpeech(input)).toBe(input)
    })
  }
})

describe("latexToSpeech — prose about LaTeX keeps its spacing", () => {
  // Maths mode discards literal spaces, so a whole sentence sent to the
  // converter comes back with its words fused ("Type1/2tomakeafraction").
  // A computing textbook explaining LaTeX must survive intact.
  it("a sentence naming a command is left alone", () => {
    const input = "Type \\frac{1}{2} to make a fraction in LaTeX."
    expect(latexToSpeech(input)).toBe(input)
  })

  it("a sentence describing \\sqrt is left alone", () => {
    const input = "The \\sqrt command draws a square root sign."
    expect(latexToSpeech(input)).toBe(input)
  })

  it("word spacing is never destroyed", () => {
    const input = "Press \\ then type \\alpha to insert a symbol."
    expect(latexToSpeech(input)).toBe(input)
  })
})

describe("latexToSpeech — currency is not maths", () => {
  // `$5 … $10` pairs up under the inline-maths delimiters. Converting it
  // strips the markers and turns "five dollars" into "five".
  const CURRENCY: Array<[string, string]> = [
    ["two prices", "The book costs $5 and the pen costs $10."],
    ["a price range", "Prices range between $20 and $50 in the shop."],
    ["adjacent prices", "It costs $5+$10 altogether."],
    ["Kiswahili prices", "Kitabu kinagharimu $5 na kalamu inagharimu $10."],
    ["escaped dollar", "It costs \\$5 in total."],
  ]

  for (const [label, input] of CURRENCY) {
    it(label, () => {
      expect(latexToSpeech(input)).toBe(input)
    })
  }

  it("converts real maths while leaving a price beside it alone", () => {
    const out = latexToSpeech("The pen is $2 and the area is $\\pi r^2$.")
    expect(out).toContain("$2")
    expect(out).toContain("πr²")
    expect(out).not.toContain("\\pi")
  })
})

describe("latexToSpeech — footnote markers are not maths", () => {
  // From a research paper in the corpus: a bare superscript with no base is an
  // affiliation or footnote marker attached to a name. Converting it reads
  // "Dong Xu caret one comma two" across an author list.
  const MARKERS: Array<[string, string]> = [
    ["author affiliations", "Dong Xu$^{1,2}$ Zhangfan Yang$^{3}$ Ka-Chun Wong$^{4}$"],
    ["a starred footnote", "Junkai Ji$^{*}$"],
    ["a dagger footnote", "Ka-Chun Wong$^{†}$"],
    ["a subscripted label", "Ratio$_{cm}$"],
  ]

  for (const [label, input] of MARKERS) {
    it(label, () => {
      expect(latexToSpeech(input)).toBe(input)
    })
  }

  it("still converts a superscript that has a base", () => {
    expect(latexToSpeech("Area of a circle = $\\pi r^2$")).toBe("Area of a circle = πr²")
  })
})

describe("latexToSpeech — fractions", () => {
  it("converts a simple fraction", () => {
    expect(latexToSpeech("$\\frac{2}{5}$")).toBe("2/5")
  })

  it("converts undelimited fractions", () => {
    expect(latexToSpeech("\\frac{1}{2} + \\frac{1}{4}")).toBe("1/2 + 1/4")
  })

  it("keeps a mixed number separate from its fraction", () => {
    // "2 3/4" is two and three quarters. Fused into "23/4" it becomes
    // twenty-three quarters — a different number, spoken confidently.
    expect(latexToSpeech("$2\\frac{3}{4}$")).toBe("2 3/4")
  })

  it("parenthesises a compound numerator", () => {
    expect(latexToSpeech("$\\frac{a+b}{2}$")).toBe("(a + b)/2")
  })

  it("handles a nested fraction", () => {
    expect(latexToSpeech("$\\frac{1}{1 + \\frac{1}{x}}$")).toBe("1/(1 + 1/x)")
  })
})

describe("latexToSpeech — binomial coefficients are not division", () => {
  it("reads \\binom as C(n, k) rather than n/k", () => {
    // temml renders \binom as an <mfrac> with a zero-thickness bar. Treated as
    // a fraction it would be spoken as "n over k", stating wrong mathematics.
    const out = latexToSpeech("$\\binom{n}{k}$")
    expect(out).toContain("C(n, k)")
    expect(out).not.toMatch(/\bn\/k\b/)
  })
})

describe("latexToSpeech — operators, units and superscripts", () => {
  it("keeps operators as symbols, not English words", () => {
    // Word forms would hard-code English into books read in other languages.
    const out = latexToSpeech("$3 \\times 4 \\div 2$")
    expect(out).toContain("×")
    expect(out).toContain("÷")
    expect(out).not.toMatch(/times|divided/i)
  })

  it("converts a squared unit to a Unicode superscript (from the book)", () => {
    expect(latexToSpeech("= 616\\ \\mathrm{mm}^2")).toBe("= 616 mm²")
  })

  it("converts the area of a circle (from the book)", () => {
    expect(latexToSpeech("Area of a circle = $\\pi r^2$")).toBe("Area of a circle = πr²")
  })

  it("keeps prose around inline maths (from the book)", () => {
    expect(latexToSpeech("Where, $\\pi=\\frac{22}{7}$.")).toBe("Where, π = 22/7.")
  })
})

describe("latexToSpeech — subscripts", () => {
  it("appends a short identifier subscript instead of emitting an underscore", () => {
    // "_" has no spoken form: y_2 would otherwise be read "y underscore 2".
    expect(latexToSpeech("$y_2 - y_1$")).toBe("y2 − y1")
  })
})

describe("latexToSpeech — accents", () => {
  it("collapses \\bar into a combining mark rather than a stray glyph", () => {
    const out = latexToSpeech("$\\bar{x}$")
    expect(out).not.toContain(" ‾")
    expect(out.normalize("NFC")).toBe("x̄".normalize("NFC"))
  })
})

describe("latexToSpeech — columnar arithmetic", () => {
  // The book stores these undelimited. Reaching them also needs `begin`/`end`
  // in `UNDELIMITED_LATEX_RE` (PR #633) — until that lands the entry is left
  // as-is rather than mis-converted, so the walker is correct either way. The
  // delimited form below exercises the same table-walking code today.
  it("reads a columnar sum row by row (from the book)", () => {
    const out = latexToSpeech(
      "$$\\begin{array}{cc} \\text{L} & \\text{mL} \\\\ 23 & 200 \\\\ \\times & 7 \\\\ \\hline 162 & 400 \\end{array}$$"
    )
    expect(out).toBe("L mL, 23 200, × 7, 162 400")
    expect(out).not.toContain("\\begin")
  })

  it("reads a long-division bracket (from the book)", () => {
    const out = latexToSpeech(
      "$$\\begin{array}{cc} \\mathrm{kg} & \\mathrm{g}\\\\ 8 & 94\\\\ 6\\ )\\ 48 & 564 \\end{array}$$"
    )
    expect(out).toContain("kg g")
    expect(out).not.toContain("\\begin")
  })
})

describe("latexToSpeech — invisible characters", () => {
  it("strips MathML invisible operators", () => {
    // Function application (U+2061) and invisible times carry no sound but are
    // handed verbatim to the TTS provider.
    const out = latexToSpeech("$\\sin^2\\theta + \\cos^2\\theta = 1$")
    expect(out).not.toMatch(/[\u2061-\u2064]/)
    expect(out).toContain("sin²")
  })
})

describe("latexToSpeech — is idempotent", () => {
  // The TTS routes apply the review (which converts) and `generateSpeechFile`
  // converts again. Running twice must equal running once, or the second pass
  // would mangle the first pass's output.
  const SAMPLES = [
    "$\\frac{2}{5} + \\frac{3}{9}$",
    "$2\\frac{3}{4}$",
    "= 616\\ \\mathrm{mm}^2",
    "$a^m \\times a^n$",
    "$\\sqrt{b^2 - 4ac}$",
    "Where, $\\pi=\\frac{22}{7}$.",
    "The elephant is the largest land animal.",
  ]

  for (const input of SAMPLES) {
    it(`converting twice matches converting once for ${input.slice(0, 30)}…`, () => {
      const once = latexToSpeech(input)
      expect(latexToSpeech(once)).toBe(once)
    })
  }
})

describe("latexToSpeech — never loses content", () => {
  // The walker's failure mode must stay "left the LaTeX alone", which is
  // audible and reportable, rather than "quietly dropped text", which is not.
  const SAMPLES = [
    "$\\frac{2}{5} + \\frac{3}{9}$",
    "= 2 \\times \\frac{22}{7} \\times 14\\,\\text{cm}",
    "\\mathrm{Circumference}=\\pi d",
    "C = \\pi d \\text{ or } C = 2\\pi r",
    "Thus, circumference of a circle = $\\pi \\times d$.",
    "$\\int_a^b f(x)\\,dx = F(b) - F(a)$",
    "$\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}$",
    "$x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}$",
  ]

  for (const input of SAMPLES) {
    it(`returns non-empty output for ${input.slice(0, 34)}…`, () => {
      expect(latexToSpeech(input).trim()).not.toBe("")
    })
  }
})
