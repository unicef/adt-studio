import { isDeepStrictEqual } from "node:util"
import yaml from "js-yaml"

const KEY_LINE = /^(\s*)([A-Za-z0-9_.-]+):(?:\s+(.*))?$/

export class ConfigYamlEditError extends Error {}

function isContent(line: string): boolean {
  const trimmed = line.trim()
  return trimmed.length > 0 && !trimmed.startsWith("#")
}

function indentOf(line: string): number {
  return line.length - line.trimStart().length
}

function blockEnd(lines: string[], start: number, indent: number): number {
  for (let i = start + 1; i < lines.length; i++) {
    if (isContent(lines[i]) && indentOf(lines[i]) <= indent) return i
  }
  return lines.length
}

function firstChildIndent(lines: string[], start: number, end: number): number | null {
  for (let i = start + 1; i < end; i++) {
    if (isContent(lines[i])) return indentOf(lines[i])
  }
  return null
}

function lastContentLine(lines: string[], start: number, end: number): number {
  for (let i = end - 1; i > start; i--) {
    if (isContent(lines[i])) return i
  }
  return start
}

function findKey(lines: string[], start: number, end: number, indent: number, key: string): number {
  for (let i = start + 1; i < end; i++) {
    if (!isContent(lines[i]) || indentOf(lines[i]) !== indent) continue
    const match = lines[i].match(KEY_LINE)
    if (match?.[2] === key) return i
  }
  return -1
}

function hasNestedBlock(rest: string | undefined): boolean {
  return rest === undefined || rest.trim() === "" || rest.trim().startsWith("#")
}

function editLines(content: string, path: readonly string[], value: string | null): string {
  const eol = content.includes("\r\n") ? "\r\n" : "\n"
  const lines = content.split(/\r?\n/)
  const ancestors: Array<{ index: number; indent: number }> = []
  let start = -1
  let end = lines.length
  let parentIndent = -1

  for (let depth = 0; depth < path.length; depth++) {
    const key = path[depth]
    const isLast = depth === path.length - 1
    const childIndent =
      firstChildIndent(lines, start, end) ?? (parentIndent < 0 ? 0 : parentIndent + 2)
    const index = findKey(lines, start, end, childIndent, key)

    if (index === -1) {
      if (value === null) return content
      const insertAt = lastContentLine(lines, start, end) + 1
      const added = path.slice(depth).map((segment, offset) => {
        const prefix = `${" ".repeat(childIndent + offset * 2)}${segment}:`
        return depth + offset === path.length - 1 ? `${prefix} ${JSON.stringify(value)}` : prefix
      })
      lines.splice(insertAt, 0, ...added)
      return lines.join(eol)
    }

    const rest = lines[index].match(KEY_LINE)?.[3]
    if (isLast) {
      const nestedEnd = blockEnd(lines, index, childIndent)
      if (value !== null) {
        if (hasNestedBlock(rest) && firstChildIndent(lines, index, nestedEnd) !== null) {
          throw new ConfigYamlEditError(`"${path.join(".")}" is a mapping, not a value`)
        }
        lines[index] = `${" ".repeat(childIndent)}${key}: ${JSON.stringify(value)}`
        return lines.join(eol)
      }
      lines.splice(index, lastContentLine(lines, index, nestedEnd) - index + 1)
      for (const ancestor of [...ancestors].reverse()) {
        const ancestorEnd = blockEnd(lines, ancestor.index, ancestor.indent)
        if (firstChildIndent(lines, ancestor.index, ancestorEnd) !== null) break
        lines.splice(ancestor.index, 1)
      }
      return lines.join(eol)
    }

    if (!hasNestedBlock(rest)) {
      throw new ConfigYamlEditError(`"${path.slice(0, depth + 1).join(".")}" is not a block mapping`)
    }
    ancestors.push({ index, indent: childIndent })
    start = index
    parentIndent = childIndent
    end = blockEnd(lines, index, childIndent)
  }
  return content
}

function applyToObject(source: unknown, path: readonly string[], value: string | null): unknown {
  const root = structuredClone(source ?? {}) as Record<string, unknown>
  const chain: Array<Record<string, unknown>> = [root]
  for (const segment of path.slice(0, -1)) {
    const parent = chain[chain.length - 1]
    const existing = parent[segment]
    if (existing === null || existing === undefined) {
      if (value === null) return root
      parent[segment] = {}
    }
    chain.push(parent[segment] as Record<string, unknown>)
  }
  const leaf = path[path.length - 1]
  if (value !== null) {
    chain[chain.length - 1][leaf] = value
    return root
  }
  delete chain[chain.length - 1][leaf]
  for (let depth = chain.length - 1; depth > 0; depth--) {
    if (Object.keys(chain[depth]).length > 0) break
    delete chain[depth - 1][path[depth - 1]]
  }
  return root
}

export function setYamlPathValue(content: string, path: readonly string[], value: string | null): string {
  const updated = editLines(content, path, value)
  const expected = applyToObject(yaml.load(content), path, value)
  if (!isDeepStrictEqual(yaml.load(updated), expected)) {
    throw new ConfigYamlEditError(`Unable to update "${path.join(".")}" without rewriting config.yaml`)
  }
  return updated
}
