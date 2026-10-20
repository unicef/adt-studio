const MATH_BLOCK_RE = /<math[\s\S]*?<\/math>/gi

const MATHML_NAMESPACE = "http://www.w3.org/1998/Math/MathML"

const MATHML_ELEMENTS = new Set([
  "math", "semantics", "annotation", "annotation-xml", "mrow", "mfrac", "msqrt",
  "mroot", "mstyle", "merror", "mpadded", "mphantom", "mfenced", "menclose",
  "msub", "msup", "msubsup", "munder", "mover", "munderover", "mmultiscripts",
  "mtable", "mtr", "mtd", "maligngroup", "malignmark", "mi", "mn", "mo",
  "mtext", "mspace", "ms", "mglyph", "mstack", "mlongdiv", "msgroup", "msrow",
  "mscarries", "mscarry", "msline", "maction", "cn", "ci", "csymbol", "apply",
  "bind", "bvar", "share", "cerror", "cd", "cbytes", "cs", "cnum", "set", "list",
  "interval", "condition", "declare", "lambda", "compose", "ident",
  "domainofapplication", "piecewise", "piece", "otherwise",
])

const MATHML_ATTRIBUTES = new Set([
  "xmlns", "display", "mathvariant", "mathsize", "mathcolor", "mathbackground",
  "scriptlevel", "displaystyle", "scriptsizemultiplier", "scriptminsize", "dir",
  "notation", "form", "fence", "separator", "stretchy", "symmetric", "lspace",
  "rspace", "largeop", "movablelimits", "accent", "accentunder", "bevelled",
  "numalign", "denomalign", "linethickness", "open", "close", "separators",
  "rowalign", "columnalign", "groupalign", "align", "alignmentscope", "columnspan",
  "rowspan", "framespacing", "rowspacing", "columnspacing", "frame", "equalrows",
  "equalcolumns", "side", "minlabelspacing", "indentalign", "indentshift",
  "indentalignfirst", "indentalignlast", "indentshiftfirst", "indentshiftlast",
  "depth", "width", "height", "voffset", "char", "edge", "selection", "actiontype",
  "encoding", "class", "id",
])

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
    parent.appendChild(sanitizeMathBlock(match[0]))
    lastIndex = start + match[0].length
  }
  if (lastIndex < line.length) {
    parent.appendChild(document.createTextNode(line.slice(lastIndex)))
  }
}

/** Parse a Temml MathML block without allowing catalog markup to create HTML. */
function sanitizeMathBlock(html: string): DocumentFragment {
  const template = document.createElement("template")
  template.innerHTML = html
  const fragment = document.createDocumentFragment()
  const math = template.content.firstElementChild

  if (
    template.content.childElementCount !== 1 ||
    !math ||
    math.localName !== "math" ||
    math.namespaceURI !== MATHML_NAMESPACE
  ) {
    fragment.appendChild(document.createTextNode(html))
    return fragment
  }

  const sanitized = cloneMathNode(math)
  if (sanitized) fragment.appendChild(sanitized)
  else fragment.appendChild(document.createTextNode(html))
  return fragment
}

function cloneMathNode(node: Node): Node | null {
  if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.textContent ?? "")
  if (node.nodeType !== Node.ELEMENT_NODE) return null

  const element = node as Element
  if (
    element.namespaceURI !== MATHML_NAMESPACE ||
    !MATHML_ELEMENTS.has(element.localName)
  ) return null

  const clone = document.createElementNS(MATHML_NAMESPACE, element.localName)
  for (const attribute of element.attributes) {
    if (MATHML_ATTRIBUTES.has(attribute.name.toLowerCase())) {
      clone.setAttribute(attribute.name, attribute.value)
    }
  }
  for (const child of element.childNodes) {
    const sanitizedChild = cloneMathNode(child)
    if (sanitizedChild) clone.appendChild(sanitizedChild)
  }
  return clone
}
