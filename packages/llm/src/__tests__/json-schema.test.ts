import { describe, expect, it } from "vitest"
import { z } from "zod"
import { BookOutlineProposalOutput } from "@adt/types"
import { inlineLocalRefs, toJsonSchema } from "../providers/shared/json-schema.js"

/** Dotted-path reader for untyped JSON Schema output. */
function at(value: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((node, key) => {
    if (node === null || typeof node !== "object") return undefined
    return (node as Record<string, unknown>)[key]
  }, value)
}

describe("toJsonSchema", () => {
  it("inlines the refs zod-to-json-schema emits when one Zod schema is reused", () => {
    const Level = z.number().int().min(1).max(6)
    const Reused = z.object({
      entries: z.array(z.object({ id: z.string(), level: Level })),
      clusters: z.array(z.object({ level: Level })),
    })

    const json = toJsonSchema(Reused, "test")

    expect(JSON.stringify(json)).not.toContain("$ref")
    expect(at(json, "properties.clusters.items.properties.level")).toEqual({
      type: "integer",
      minimum: 1,
      maximum: 6,
    })
  })

  it("produces a Book Outline schema OpenAI's structured-output validator accepts", () => {
    // Regression: `HeadingLevel` sits on both entries and style clusters, and the
    // resulting `#/properties/entries/items/properties/level` ref was rejected by
    // `codex exec --output-schema` ("reference can only point to definitions
    // defined at the top level of the schema").
    const json = toJsonSchema(BookOutlineProposalOutput, "test")

    expect(JSON.stringify(json)).not.toContain("$ref")
    expect(at(json, "properties.styleClusters.items.properties.level.type")).toBe("integer")
  })

  it("keeps a recursive reference that points at its own ancestor", () => {
    interface TreeNode {
      name: string
      children: TreeNode[]
    }
    const Node: z.ZodType<TreeNode> = z.lazy(() =>
      z.object({ name: z.string(), children: z.array(Node) }),
    )
    const Tree = z.object({ roots: z.array(Node) })

    const json = toJsonSchema(Tree, "test")

    expect(at(json, "properties.roots.items.properties.children.items")).toEqual({
      $ref: "#/properties/roots/items",
    })
  })
})

describe("inlineLocalRefs", () => {
  it("leaves references to top-level definitions untouched", () => {
    const schema = {
      type: "object",
      properties: { a: { $ref: "#/definitions/x" }, b: { $ref: "#/$defs/y" } },
      definitions: { x: { type: "string" } },
      $defs: { y: { type: "number" } },
    }

    expect(inlineLocalRefs(schema)).toEqual(schema)
  })

  it("follows a chain of local references and stops at a cycle between siblings", () => {
    const schema = {
      properties: {
        a: { $ref: "#/properties/b" },
        b: { type: "object", properties: { back: { $ref: "#/properties/a" } } },
      },
    }

    const out = inlineLocalRefs(schema)

    expect(at(out, "properties.a.type")).toBe("object")
    // a → b → a: once `b` is copied into `a`, its `back` reference points at
    // `a` itself — an ancestor — so it is kept rather than expanded forever.
    expect(at(out, "properties.a.properties.back")).toEqual({ $ref: "#/properties/a" })
    expect(at(out, "properties.b.properties.back")).toEqual({ $ref: "#/properties/b" })
  })

  it("keeps sibling keywords of an inlined ref and unescapes pointer segments", () => {
    const schema = {
      properties: {
        "a/b": { type: "string", minLength: 1 },
        c: { $ref: "#/properties/a~1b", description: "copy of a/b" },
      },
    }

    expect(at(inlineLocalRefs(schema), "properties.c")).toEqual({
      type: "string",
      minLength: 1,
      description: "copy of a/b",
    })
  })

  it("does not mutate its input", () => {
    const schema = { properties: { a: { type: "string" }, b: { $ref: "#/properties/a" } } }
    const snapshot = JSON.stringify(schema)

    inlineLocalRefs(schema)

    expect(JSON.stringify(schema)).toBe(snapshot)
  })
})
