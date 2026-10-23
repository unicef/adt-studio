export type HtmlTokenKind = "open" | "close" | "comment" | "decl" | "text" | "raw"

export interface HtmlToken {
  kind: HtmlTokenKind
  value: string
  name?: string
  selfClosing?: boolean
}

const RAW_ELEMENTS = new Set(["pre", "textarea", "script", "style"])
const VOID_ELEMENTS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"])
const INDENT = "  "

function tagEnd(html: string, start: number): number {
  let quote: string | null = null
  for (let index = start + 1; index < html.length; index += 1) {
    const char = html[index]
    if (quote) {
      if (char === quote) quote = null
    } else if (char === '"' || char === "'") {
      quote = char
    } else if (char === ">") {
      return index + 1
    }
  }
  return html.length
}

function tagName(tag: string): string {
  return /^<\/?([A-Za-z][\w:-]*)/.exec(tag)?.[1]?.toLowerCase() ?? ""
}

function rawContentEnd(html: string, name: string, from: number): number {
  const lower = html.toLowerCase()
  const needle = `</${name}`
  let at = lower.indexOf(needle, from)
  while (at !== -1) {
    const after = lower[at + needle.length] ?? ">"
    if (after === ">" || /\s/.test(after)) return at
    at = lower.indexOf(needle, at + needle.length)
  }
  return html.length
}

export function tokenizeHtml(html: string): HtmlToken[] {
  const tokens: HtmlToken[] = []
  let index = 0
  let text = ""
  const flushText = () => {
    if (text) tokens.push({ kind: "text", value: text })
    text = ""
  }
  while (index < html.length) {
    const char = html[index]
    const next = html[index + 1] ?? ""
    if (char !== "<") {
      text += char
      index += 1
      continue
    }
    if (html.startsWith("<!--", index)) {
      flushText()
      const close = html.indexOf("-->", index + 4)
      const end = close === -1 ? html.length : close + 3
      tokens.push({ kind: "comment", value: html.slice(index, end) })
      index = end
      continue
    }
    if (next === "!" || next === "?") {
      flushText()
      const end = tagEnd(html, index)
      tokens.push({ kind: "decl", value: html.slice(index, end) })
      index = end
      continue
    }
    const isClose = next === "/" && /[A-Za-z]/.test(html[index + 2] ?? "")
    if (!isClose && !/[A-Za-z]/.test(next)) {
      text += char
      index += 1
      continue
    }
    flushText()
    const end = tagEnd(html, index)
    const value = html.slice(index, end)
    const name = tagName(value)
    if (isClose) {
      tokens.push({ kind: "close", value, name })
      index = end
      continue
    }
    const selfClosing = /\/\s*>$/.test(value) || VOID_ELEMENTS.has(name)
    tokens.push({ kind: "open", value, name, selfClosing })
    index = end
    if (RAW_ELEMENTS.has(name) && !selfClosing) {
      const rawEnd = rawContentEnd(html, name, index)
      if (rawEnd > index) tokens.push({ kind: "raw", value: html.slice(index, rawEnd) })
      index = rawEnd
    }
  }
  flushText()
  return tokens
}

function isMarkup(token: HtmlToken | undefined): boolean {
  return !!token && token.kind !== "text" && token.kind !== "raw"
}

function opensRaw(token: HtmlToken | undefined): boolean {
  return token?.kind === "open" && !token.selfClosing && RAW_ELEMENTS.has(token.name ?? "")
}

function isLayoutWhitespace(token: HtmlToken, previous: HtmlToken | undefined, next: HtmlToken | undefined): boolean {
  return token.kind === "text" && /^\s+$/.test(token.value) && token.value.includes("\n") && isMarkup(previous) && isMarkup(next)
}

export function hasLayoutWhitespace(html: string): boolean {
  const tokens = tokenizeHtml(html)
  return tokens.some((token, index) => isLayoutWhitespace(token, tokens[index - 1], tokens[index + 1]))
}

export function formatHtml(html: string): string {
  const tokens = tokenizeHtml(html)
  let depth = 0
  let out = ""
  tokens.forEach((token, index) => {
    const previous = tokens[index - 1]
    if (token.kind === "close") depth = Math.max(0, depth - 1)
    if (isMarkup(previous) && isMarkup(token) && !opensRaw(previous)) out += `\n${INDENT.repeat(depth)}`
    out += token.value
    if (token.kind === "open" && !token.selfClosing) depth += 1
  })
  return out
}

export function compactHtml(html: string): string {
  const tokens = tokenizeHtml(html)
  return tokens
    .filter((token, index) => !isLayoutWhitespace(token, tokens[index - 1], tokens[index + 1]))
    .map((token) => token.value)
    .join("")
}

export interface HtmlSourceCodec {
  readable: boolean
  format: (html: string) => string
  compact: (html: string) => string
}

const IDENTITY = (html: string) => html

export function htmlSourceCodec(original: string): HtmlSourceCodec {
  if (hasLayoutWhitespace(original)) return { readable: false, format: IDENTITY, compact: IDENTITY }
  return { readable: true, format: formatHtml, compact: compactHtml }
}
