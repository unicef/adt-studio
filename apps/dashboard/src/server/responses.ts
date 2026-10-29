import type { ImageFile } from "./conversions"

const CACHED = "private, max-age=86400"

export function requireParams<K extends string>(request: Request, keys: K[]): Record<K, string> | Response {
  const params = new URL(request.url).searchParams
  const values = {} as Record<K, string>
  for (const key of keys) {
    const value = params.get(key)
    if (!value) return new Response(`${keys.join(", ")} are required`, { status: 400 })
    values[key] = value
  }
  return values
}

export function fileResponse(file: ImageFile | null, missing: string): Response {
  if (!file) return new Response(missing, { status: 404 })
  return new Response(new Uint8Array(file.bytes), { headers: { "Content-Type": file.type, "Cache-Control": CACHED } })
}

export function textResponse(body: string, type: string): Response {
  return new Response(body, { headers: { "Content-Type": `${type}; charset=utf-8`, "Cache-Control": CACHED } })
}

export async function handled(respond: () => Promise<Response>): Promise<Response> {
  try {
    return await respond()
  } catch (error) {
    return new Response(error instanceof Error ? error.message : String(error), { status: 400 })
  }
}
