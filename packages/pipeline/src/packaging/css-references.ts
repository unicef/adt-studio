import postcss from "postcss"

/** CSS values need token boundaries: strings in image-set() are URLs, while
 * strings in content/type() are not. Decode CSS escapes before resolving paths
 * and never discover dependencies inside comments or quoted prose. */
function valueReferences(
  value: string,
  importRule = false,
  variables: ReadonlyMap<string, readonly string[]> = new Map(),
  context = "",
  visited: Set<string> = new Set(),
): Array<{ url: string; stylesheet: boolean }> {
  const references: Array<{ url: string; stylesheet: boolean }> = []
  let position = 0
  const escape = (): string => {
    position++ // backslash
    const hex = /^[0-9a-f]{1,6}/i.exec(value.slice(position))?.[0]
    if (hex) {
      position += hex.length
      if (/\s/.test(value[position] ?? "")) {
        if (value[position] === "\r" && value[position + 1] === "\n") position++
        position++
      }
      const code = parseInt(hex, 16)
      return code === 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff) ? "\ufffd" : String.fromCodePoint(code)
    }
    if (value[position] === "\r" && value[position + 1] === "\n") position++
    const char = value[position++] ?? ""
    return /[\n\r\f]/.test(char) ? "" : char
  }
  const string = (): string => {
    const quote = value[position++]
    let result = ""
    while (position < value.length && value[position] !== quote) {
      result += value[position] === "\\" ? escape() : value[position++]
    }
    if (value[position++] !== quote) throw new Error("Unclosed CSS string")
    return result
  }
  const skip = () => {
    while (position < value.length) {
      if (/\s/.test(value[position])) { position++; continue }
      if (value.slice(position, position + 2) !== "/*") break
      const end = value.indexOf("*/", position + 2)
      if (end < 0) throw new Error("Unclosed CSS comment")
      position = end + 2
    }
  }
  const variableArguments = () => {
    const start = position
    let depth = 1, comma = -1
    while (position < value.length) {
      const char = value[position]
      if (char === '"' || char === "'") { string(); continue }
      if (char === "\\") { escape(); continue }
      if (value.slice(position, position + 2) === "/*") { skip(); continue }
      if (char === "(") depth++
      if (char === ")" && --depth === 0) {
        const end = position++
        const rawName = value.slice(start, comma < 0 ? end : comma).replace(/\/\*[\s\S]*?\*\//g, "").trim()
        const name = valueReferences(`url(${rawName})`)[0]?.url ?? ""
        return { name, fallback: comma < 0 ? undefined : value.slice(comma + 1, end) }
      }
      // A comma in a nested function is not the fallback separator.
      if (char === "," && depth === 1 && comma < 0) comma = position
      position++
    }
    throw new Error("Unclosed CSS variable")
  }
  const walk = (parent = "") => {
    while (position < value.length) {
      skip()
      const char = value[position]
      if (!char) break
      if (char === ")") { position++; return }
      if (char === '"' || char === "'") {
        const url = string()
        if (parent === "image-set" || parent === "-webkit-image-set" || (!parent && importRule)) {
          references.push({ url, stylesheet: !parent && importRule })
        }
        continue
      }
      if (/[\w-]/.test(char) || char === "\\" || char.charCodeAt(0) >= 128) {
        let name = ""
        while (position < value.length) {
          const next = value[position]
          if (next === "\\") name += escape()
          else if (/[\w-]/.test(next) || next.charCodeAt(0) >= 128) name += value[position++]
          else break
        }
        if (value[position] !== "(") continue
        position++
        if (name.toLowerCase() === "var") {
          const { name: property, fallback } = variableArguments()
          const key = JSON.stringify([property, parent, importRule])
          if (!visited.has(key)) {
            visited.add(key)
            for (const candidate of variables.get(property) ?? []) {
              references.push(...valueReferences(candidate, importRule, variables, parent, visited))
            }
          }
          // Keep declared fallback assets portable too: CSS inheritance and
          // conditional rules may select them in another viewport/state.
          if (fallback !== undefined) references.push(...valueReferences(fallback, importRule, variables, parent, visited))
          continue
        }
        if (name.toLowerCase() !== "url") { walk(name.toLowerCase()); continue }
        skip()
        let url = ""
        if (value[position] === '"' || value[position] === "'") { url = string(); skip() }
        else while (position < value.length && value[position] !== ")") url += value[position] === "\\" ? escape() : value[position++]
        if (value[position++] !== ")") throw new Error("Unclosed CSS URL")
        references.push({ url: url.trim(), stylesheet: !parent && importRule })
        continue
      }
      position++
      if (char === "(") walk()
    }
  }
  walk(context)
  return references
}

export function parseCssSource(css: string) {
  // PostCSS does not tokenize escaped at-rule names. Normalize only those
  // identifiers (not arbitrary escapes that could turn URL bytes into syntax).
  const normalized = css.replace(/@((?:\\[0-9a-f]{1,6}[\t\n\r\f ]?|\\[^\n\r\f]|[\w-])+)/gi, (raw, identifier: string) => {
    const decoded = valueReferences(`url(${identifier})`)[0]?.url
    return decoded && /^[a-z-]+$/i.test(decoded) ? `@${decoded}` : raw
  })
  const root = postcss.parse(normalized)
  const declarations: Array<{ property: string; value: string }> = []
  const imports: string[] = []
  root.walkDecls(declaration => {
    declarations.push({ property: valueReferences(`url(${declaration.prop})`)[0]?.url ?? declaration.prop, value: declaration.value })
  })
  root.walkAtRules(rule => {
    // Reuse CSS escape decoding for at-rule identifiers as well as values.
    const name = valueReferences(`url(${rule.name})`)[0]?.url.toLowerCase()
    if (name === "import") imports.push(...valueReferences(rule.params, true).map(reference => reference.url))
  })
  return { declarations, imports }
}

/** Resolve possible variable values in one document's linked/imported/inline
 * CSS, never across independent pages. URLs use the consumer declaration's
 * base path, including when the quoted value came from another stylesheet. */
export function cssReferences(sources: readonly { parsed: ReturnType<typeof parseCssSource>; from: string }[]) {
  const variables = new Map<string, string[]>()
  for (const { parsed } of sources) for (const declaration of parsed.declarations) {
    if (!declaration.property.startsWith("--")) continue
    variables.set(declaration.property, [...(variables.get(declaration.property) ?? []), declaration.value])
  }
  return sources.flatMap(({ parsed, from }) => parsed.declarations.flatMap(declaration =>
    valueReferences(declaration.value, false, variables).map(reference => ({ ...reference, from }))))
}
