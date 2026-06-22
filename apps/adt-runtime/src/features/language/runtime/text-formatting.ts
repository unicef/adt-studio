const MATH_BLOCK_RE = /<math[\s\S]*?<\/math>/gi

export function applyPlainTextWithLineBreaks(element: HTMLElement, text: string): void {
  const fragment = document.createDocumentFragment()
  const lines = String(text ?? "").split(/\r?\n/)

  lines.forEach((line, index) => {
    if (index > 0) fragment.appendChild(document.createElement("br"))
    appendLineWithMath(fragment, line)
  })

  element.replaceChildren(fragment)
}

/**
 * Append one line of Easy Read text. The text is rendered as plain text so
 * LLM-generated content can't inject arbitrary markup (e.g. a stray
 * `<strong>` stays literal). The one exception is Temml-rendered
 * `<math>…</math>` that the packaging step bakes into the catalog entry via
 * `convertLatexString` — that must render, so math blocks are parsed into real
 * MathML nodes while everything around them stays escaped text nodes.
 */
function appendLineWithMath(parent: DocumentFragment, line: string): void {
  let lastIndex = 0
  for (const match of line.matchAll(MATH_BLOCK_RE)) {
    const start = match.index ?? 0
    if (start > lastIndex) {
      parent.appendChild(document.createTextNode(line.slice(lastIndex, start)))
    }
    const template = document.createElement("template")
    template.innerHTML = match[0]
    parent.appendChild(template.content)
    lastIndex = start + match[0].length
  }
  if (lastIndex < line.length) {
    parent.appendChild(document.createTextNode(line.slice(lastIndex)))
  }
}
