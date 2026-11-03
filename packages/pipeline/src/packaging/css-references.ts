import postcss from "postcss"

/** CSS values need token boundaries: strings in image-set() are URLs, while
 * strings in content/type() are not. Decode CSS escapes before resolving paths
 * and never discover dependencies inside comments or quoted prose. */
function valueReferences(value: string, importRule = false): Array<{ url: string; stylesheet: boolean }> {
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
  walk()
  return references
}

export function cssReferences(css: string): Array<{ url: string; stylesheet: boolean }> {
  const references: Array<{ url: string; stylesheet: boolean }> = []
  // PostCSS does not tokenize escaped at-rule names. Normalize only those
  // identifiers (not arbitrary escapes that could turn URL bytes into syntax).
  const normalized = css.replace(/@((?:\\[0-9a-f]{1,6}[\t\n\r\f ]?|\\[^\n\r\f]|[\w-])+)/gi, (raw, identifier: string) => {
    const decoded = valueReferences(`url(${identifier})`)[0]?.url
    return decoded && /^[a-z-]+$/i.test(decoded) ? `@${decoded}` : raw
  })
  const root = postcss.parse(normalized)
  root.walkDecls(declaration => { references.push(...valueReferences(declaration.value)) })
  root.walkAtRules(rule => {
    // Reuse CSS escape decoding for at-rule identifiers as well as values.
    const name = valueReferences(`url(${rule.name})`)[0]?.url.toLowerCase()
    if (name === "import") references.push(...valueReferences(rule.params, true))
  })
  return references
}
