import { zodToJsonSchema } from "zod-to-json-schema"

export interface ZodLike {
  safeParse: (input: unknown) => { success: boolean; data?: unknown; error?: unknown }
}

export function asZodLike(schema: unknown): ZodLike | null {
  return schema && typeof (schema as ZodLike).safeParse === "function"
    ? (schema as ZodLike)
    : null
}

/** CLI output schemas want plain JSON Schema; call sites hand us Zod schemas. */
export function toJsonSchema(schema: unknown, subject: string): Record<string, unknown> {
  if (!asZodLike(schema)) {
    if (schema && typeof schema === "object") return schema as Record<string, unknown>
    throw new Error(`${subject} structured output requires an object or Zod schema`)
  }

  const converted = zodToJsonSchema(schema as Parameters<typeof zodToJsonSchema>[0], {
    $refStrategy: "root",
  }) as Record<string, unknown>
  const { $schema: _ignored, ...rest } = converted
  return inlineLocalRefs(rest)
}

const ROOT_DEFINITION_POINTER = /^#\/(definitions|\$defs)\//

/**
 * zod-to-json-schema emits a `$ref` to the first occurrence whenever one Zod
 * instance is reused (`HeadingLevel` sits on both outline entries and style
 * clusters). OpenAI's structured-output validator, and so `codex exec
 * --output-schema`, only accepts references to top-level definitions, and the
 * Claude CLI's `--json-schema` accepts none — so every other local reference
 * is replaced by a copy of its target. A reference to one of its own ancestors
 * is genuine recursion, which has no finite inline form: it is kept, and such
 * schemas are routed away from the native strategy anyway.
 */
export function inlineLocalRefs(schema: Record<string, unknown>): Record<string, unknown> {
  const resolve = (pointer: string): unknown => {
    let node: unknown = schema
    for (const segment of pointerSegments(pointer)) {
      if (node === null || typeof node !== "object") return undefined
      node = (node as Record<string, unknown>)[segment]
    }
    return node
  }

  const walk = (node: unknown, path: readonly string[], inlining: readonly string[]): unknown => {
    if (Array.isArray(node)) {
      return node.map((item, index) => walk(item, [...path, String(index)], inlining))
    }
    if (node === null || typeof node !== "object") return node

    const record = node as Record<string, unknown>
    const ref = record.$ref
    if (typeof ref === "string" && ref.startsWith("#/") && !ROOT_DEFINITION_POINTER.test(ref)) {
      const targetPath = pointerSegments(ref)
      const pointsAtAncestor =
        targetPath.length <= path.length && targetPath.every((segment, i) => path[i] === segment)
      const target = resolve(ref)
      if (
        !pointsAtAncestor &&
        !inlining.includes(ref) &&
        target !== null &&
        typeof target === "object" &&
        !Array.isArray(target)
      ) {
        const { $ref: _ref, ...siblings } = record
        return walk({ ...(target as Record<string, unknown>), ...siblings }, path, [...inlining, ref])
      }
      return { ...record }
    }

    const copy: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(record)) {
      copy[key] = walk(value, [...path, key], inlining)
    }
    return copy
  }

  return walk(schema, [], []) as Record<string, unknown>
}

/** `#/properties/a~1b` → ["properties", "a/b"] (RFC 6901 unescaping). */
function pointerSegments(pointer: string): string[] {
  return pointer
    .slice(2)
    .split("/")
    .filter((segment) => segment.length > 0)
    .map((segment) => segment.replace(/~1/g, "/").replace(/~0/g, "~"))
}
