import { parseDocument } from "htmlparser2"
import { containsMathNotation } from "@adt/types"
import { convertLatexString } from "./packaging/web.js"

/**
 * Minimal structural view of the parsed MathML. `domhandler` is a transitive
 * dependency of htmlparser2, not a direct one, so its types are not declared
 * here — only the fields this walker reads are modelled.
 */
interface MathNode {
  type: string
  name?: string
  data?: string
  children?: MathNode[]
  attribs?: Record<string, string>
}

/**
 * LaTeX → speech text.
 *
 * The text catalog stores maths as raw LaTeX, and the TTS providers receive a
 * plain string — so without this pass `\frac{2}{5}` is read aloud verbatim as
 * "backslash frac two five".
 *
 * Rather than parse LaTeX a second time, this reuses the temml conversion that
 * already backs on-screen rendering and walks the resulting MathML. One LaTeX
 * parser, and every command temml understands is covered rather than a
 * hand-listed subset.
 *
 * Output is deliberately symbolic — digits and operators, never number words.
 * The TTS providers are themselves language models and localise "2/5" into the
 * voice's own language; emitting "two fifths" here would hard-code English into
 * books that are read in Kiswahili, Albanian, and Portuguese. Per-language
 * pronunciation belongs in `config/speech_instructions.yaml`, which is already
 * keyed by language.
 */

/** Detection lives in `@adt/types` so the Studio's maths filter and this
 *  conversion cannot drift apart. */
const looksLikeMaths = containsMathNotation

/**
 * Maths mode discards literal spaces, so a sentence that reaches temml whole
 * comes back with its words fused ("Type1/2tomakeafraction"). The information
 * is gone by then and cannot be recovered — the only safe response is to
 * reject the conversion and keep the original text.
 */
function fusedWords(before: string, after: string): boolean {
  const longestToken = (s: string) =>
    (s.match(/\S+/g) ?? []).reduce((max, t) => Math.max(max, t.length), 0)
  // A table legitimately compresses whitespace, so a plain space count is not
  // the signal. Fusion shows up as a single unbroken run far longer than
  // anything in the source.
  return longestToken(after) > Math.max(14, longestToken(before))
}

/** A word present before conversion but missing afterwards means a path
 *  segment or prose fragment was swallowed by a command. */
function droppedWords(before: string, after: string): boolean {
  // Environment names (`\begin{array}`, `\end{cases}`) are syntax, not prose —
  // they are meant to disappear, so they must not count as lost words.
  const prose = before.replace(/\\(?:begin|end)\s*\{[^}]*\}/g, " ")
  const words = prose.match(/(?<![\\\p{L}])\p{L}{3,}/gu) ?? []
  return words.some((w) => !after.includes(w))
}

/** Unicode superscripts, so `mm^2` becomes `mm²` ("millimetres squared") and
 *  not `mm^2` ("m m caret two"). Covers the exponents that actually occur. */
const SUPERSCRIPTS: Record<string, string> = {
  "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴",
  "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹",
  "+": "⁺", "-": "⁻", n: "ⁿ", i: "ⁱ",
}

/** Accent glyphs temml places in an <mover>, mapped to their combining forms
 *  so `\bar{x}` is one token ("x̄") rather than "x" followed by a stray "‾". */
const ACCENTS: Record<string, string> = {
  "‾": "̄", "¯": "̄",   // bar / macron
  "→": "⃗",                   // vector
  "^": "̂", "ˆ": "̂",   // hat
  "~": "̃", "˜": "̃",   // tilde
  ".": "̇",                   // dot
  "˙": "̇",
}

/** Wrappers whose children are simply concatenated. */
const TRANSPARENT = new Set([
  "math", "mrow", "mstyle", "semantics", "mpadded", "menclose", "merror",
])

/** temml can embed the original LaTeX here; re-emitting it would defeat the
 *  entire pass. */
const DROPPED = new Set(["annotation", "annotation-xml"])

function isElement(node: MathNode): boolean {
  return node.type === "tag"
}

function textOf(node: MathNode): string {
  if (node.type === "text") return node.data ?? ""
  return (node.children ?? []).map(textOf).join("")
}

/** Parenthesise a fraction operand that is not a single atom, so `1/2 + 3` and
 *  `(1+2)/3` stay distinguishable when spoken. */
function group(s: string): string {
  const t = s.trim()
  return /^[\p{L}\p{N}.,]*$/u.test(t) ? t : `(${t})`
}

function superscript(exp: string): string {
  const t = exp.trim()
  const mapped = [...t].map((c) => SUPERSCRIPTS[c])
  return mapped.every(Boolean) ? mapped.join("") : `^${group(t)}`
}

/**
 * Concatenate sibling nodes, keeping a whole number and a following fraction
 * apart. `2\frac{3}{4}` (two and three quarters) would otherwise render as
 * "23/4" — twenty-three quarters, a different number. Mixed numbers are common
 * throughout primary arithmetic, so this separation is load-bearing.
 */
function joinRow(children: MathNode[]): string {
  let out = ""
  let prev: MathNode | undefined
  for (const child of children) {
    const text = walk(child)
    if (!text) continue
    if (
      prev &&
      isElement(prev) &&
      prev.name?.toLowerCase() === "mn" &&
      isElement(child) &&
      child.name?.toLowerCase() === "mfrac"
    ) {
      out += " "
    }
    out += text
    prev = child
  }
  return out
}

function walk(node: MathNode): string {
  if (node.type === "text") return node.data ?? ""
  if (!isElement(node)) return ""

  const name = (node.name ?? "").toLowerCase()
  if (DROPPED.has(name)) return ""
  if (TRANSPARENT.has(name)) return joinRow(node.children ?? [])

  const kids = (node.children ?? []).filter(
    (c: MathNode) => isElement(c) || (c.type === "text" && (c.data ?? "").trim() !== "")
  )

  switch (name) {
    case "mn":
    case "mi":
    case "mtext":
      return textOf(node)

    // Spaces keep `2×7` from being run together into one token.
    case "mo":
      return ` ${textOf(node).trim()} `

    case "mspace":
      return " "

    // A zero-thickness fraction bar is not division — temml renders \binom
    // that way. Reading it as "n/k" would state the wrong mathematics, so it
    // becomes the standard C(n, k) form instead.
    case "mfrac": {
      if (kids.length !== 2) return kids.map(walk).join(" ")
      const thickness = node.attribs?.["linethickness"] ?? ""
      const isBinomial = /^0(?:[a-z%]*)?$/.test(thickness.trim())
      const [a, b] = [walk(kids[0]), walk(kids[1])]
      return isBinomial ? `C(${a.trim()}, ${b.trim()})` : `${group(a)}/${group(b)}`
    }

    case "msup":
      return kids.length === 2
        ? `${walk(kids[0])}${superscript(walk(kids[1]))}`
        : kids.map(walk).join("")

    // "_" has no spoken form — read aloud it becomes "y underscore 2".
    //
    // A NUMERIC subscript can be appended: "y2" reads as "y two". A LETTER one
    // cannot, because appending manufactures a word — `U_K` becomes "UK"
    // (United Kingdom), `S_n` becomes "Sn" (tin), `g_t` becomes "gt". Those
    // read as confidently wrong and nothing downstream can tell, so letters
    // keep a separating space instead.
    case "msub": {
      if (kids.length !== 2) return kids.map(walk).join("")
      const [base, sub] = [walk(kids[0]).trim(), walk(kids[1]).trim()]
      if (/^\p{N}{1,3}$/u.test(sub)) return `${base}${sub}`
      return `${base} ${/^[\p{L}\p{N}]{1,4}$/u.test(sub) ? sub : group(sub)}`
    }

    case "msubsup":
      return kids.length === 3
        ? `${walk(kids[0])}_${group(walk(kids[1]))}${superscript(walk(kids[2]))}`
        : kids.map(walk).join("")

    // An accent is markup over a base, not a symbol beside it. Emitted as a
    // sibling it becomes a stray "x ‾" / "v →" that a voice reads as a word.
    // The combining form keeps the notation faithful while collapsing to a
    // single spoken token.
    case "mover":
    case "munder": {
      if (kids.length !== 2) return kids.map(walk).join("")
      const base = walk(kids[0])
      const mark = walk(kids[1]).trim()
      const combining = ACCENTS[mark]
      if (combining) return `${base}${combining}`
      // Not an accent (∑ limits use munder too) — keep both, spaced.
      return `${base} ${mark}`
    }

    case "msqrt":
      return `√${group(kids.map(walk).join(""))}`

    case "mroot":
      return kids.length === 2
        ? `${superscript(walk(kids[1]))}√${group(walk(kids[0]))}`
        : `√${group(kids.map(walk).join(""))}`

    // A columnar sum read row by row. The spatial alignment cannot survive
    // being linearised, so rows are separated by commas to at least keep the
    // grouping audible as separate phrases.
    case "mtable":
      return kids.map(walk).filter((s: string) => s.trim()).join(", ")

    case "mtr":
    case "mlabeledtr":
      return kids.map(walk).map((s: string) => s.trim()).filter(Boolean).join(" ")

    case "mtd":
      return kids.map(walk).join("")

    default:
      return kids.map(walk).join("")
  }
}

/** MathML carries invisible operators (function application, invisible times)
 *  that carry no sound. Left in, they are handed verbatim to the TTS provider. */
const INVISIBLE = /[⁡-⁤​‌‍﻿]/g

function tidy(s: string): string {
  return s
    .replace(INVISIBLE, " ")
    .replace(/\s+/g, " ")
    // The space inserted around every operator leaves gaps at bracket edges.
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim()
}

/**
 * Convert any LaTeX in `text` to a spoken-form string, leaving surrounding
 * prose untouched. Returns the input unchanged when it contains no maths, or
 * when conversion fails — never throws, and never returns empty for non-empty
 * input.
 */
export function latexToSpeech(text: string): string {
  if (!text || !looksLikeMaths(text)) return text

  let converted: string
  try {
    converted = convertLatexString(text)
  } catch {
    return text
  }
  if (!converted.includes("<math")) return text

  const doc = parseDocument(converted) as unknown as { children: MathNode[] }
  const spoken = tidy(doc.children.map(walk).join(""))

  // Anything that silently loses content is worse than leaving the LaTeX
  // alone: unconverted maths is audibly wrong and gets reported, whereas a
  // mangled sentence sounds fine and hides the damage.
  if (!spoken.trim()) return text
  if (fusedWords(text, spoken)) return text
  if (droppedWords(text, spoken)) return text

  return spoken
}
