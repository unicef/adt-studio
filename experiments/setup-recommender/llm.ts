/** Minimal OpenAI Responses call with strict JSON schema output. Same endpoint and defaults as the PoC. */
export interface LlmCall<T> {
  value: T
  usage: { inputTokens: number; outputTokens: number }
  ms: number
}

export async function askJson<T>(opts: {
  model: string
  system: string
  text: string
  images: { label: string; png: Uint8Array }[]
  schemaName: string
  schema: Record<string, unknown>
}): Promise<LlmCall<T>> {
  const key = process.env.OPENAI_API_KEY
  if (!key) throw new Error("OPENAI_API_KEY is not set")
  const content: unknown[] = [{ type: "input_text", text: opts.text }]
  for (const img of opts.images) {
    content.push({ type: "input_text", text: img.label })
    content.push({ type: "input_image", image_url: `data:image/png;base64,${Buffer.from(img.png).toString("base64")}`, detail: "auto" })
  }
  const started = performance.now()
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: opts.model,
      instructions: opts.system,
      input: [{ role: "user", content }],
      text: { format: { type: "json_schema", name: opts.schemaName, schema: opts.schema, strict: true } },
    }),
  })
  const body = (await res.json()) as {
    error?: { message: string }
    output?: { type: string; content?: { type: string; text?: string }[] }[]
    usage?: { input_tokens: number; output_tokens: number }
  }
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${body.error?.message ?? "unknown error"}`)
  const text = body.output?.flatMap((o) => o.content ?? []).find((c) => c.type === "output_text")?.text
  if (!text) throw new Error("OpenAI returned no text output")
  return {
    value: JSON.parse(text) as T,
    usage: { inputTokens: body.usage?.input_tokens ?? 0, outputTokens: body.usage?.output_tokens ?? 0 },
    ms: performance.now() - started,
  }
}
