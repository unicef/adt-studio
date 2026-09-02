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
  return rest
}
