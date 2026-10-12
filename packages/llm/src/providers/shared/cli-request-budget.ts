import { APICallError } from "ai"
import http, { type IncomingHttpHeaders, type RequestOptions } from "node:http"
import https from "node:https"
import tls from "node:tls"
import { randomBytes } from "node:crypto"
import * as zlib from "node:zlib"
import { LLMValidationError } from "../../errors.js"
import type { TokenUsage } from "../../types.js"

/** One facade attempt owns one forwarding slot. Reserve it synchronously before
 * opening an upstream socket, including concurrent CLI retries/continuations.
 * The CLI still owns authentication: headers pass through, tokens are never read
 * from its credential store. The capability path is ephemeral and never logged.
 */
export async function createCliRequestBudget(options: {
  signal: AbortSignal
  clientTls?: Pick<tls.ConnectionOptions, "cert" | "key" | "passphrase" | "ca">
  onProviderRequest?: () => void
  env: NodeJS.ProcessEnv
  upstream: (headers: IncomingHttpHeaders) => string
}) {
  const token = randomBytes(24).toString("hex")
  const controller = new AbortController()
  const signal = AbortSignal.any([options.signal, controller.signal])
  let used = false
  let blocked = false
  let status: number | undefined
  let retryAfter: string | undefined
  let explicitlyNonRetryable = false
  let transportError: unknown
  const responseChunks: Buffer[] = []
  let responseBytes = 0
  let responseEncoding: string | undefined
  const requests = new Set<http.ClientRequest>()
  const server = http.createServer((incoming, outgoing) => {
    const prefix = `/${token}/`
    if (!incoming.url?.startsWith(prefix) || incoming.method !== "POST") {
      outgoing.writeHead(404).end()
      return
    }
    if (used || signal.aborted) {
      blocked = used
      outgoing
        .writeHead(429, { "content-type": "application/json" })
        .end('{"error":{"message":"Automatic request budget exhausted"}}')
      // Aborting stops CLI work, but the forwarding gate already denied egress.
      if (used) controller.abort(new Error("CLI continuation exceeds request budget"))
      return
    }
    used = true
    let destination: URL
    try {
      const base = new URL(options.upstream(incoming.headers))
      if (!["http:", "https:"].includes(base.protocol))
        throw new Error("Unsupported provider protocol")
      destination = new URL(
        base.toString().replace(/\/$/, "") + "/" + incoming.url.slice(prefix.length),
      )
    } catch {
      transportError = new Error("Invalid provider endpoint")
      outgoing.writeHead(502).end()
      return
    }
    const headers = { ...incoming.headers, host: destination.host }
    delete headers.connection
    delete headers["proxy-authorization"]
    // Never negotiate an encoding this runtime cannot inspect. Older supported
    // Node versions lack zstd, even when the external CLI advertises it.
    if (headers["accept-encoding"]) {
      headers["accept-encoding"] = headers["accept-encoding"].split(",")
        .filter((entry) => supportedEncoding(entry.split(";")[0].trim().toLowerCase()))
        .join(",") || "identity"
    }
    const send = async () => {
      const transport = await transportOptions(destination, options.env, signal, options.clientTls)
      if (signal.aborted) return
      options.onProviderRequest?.()
      const request = (destination.protocol === "https:" ? https : http).request(
        destination,
        {
          ...options.clientTls,
          ...transport,
          method: "POST",
          headers,
          signal,
        },
        (result) => {
          status = result.statusCode
          const delay = result.headers["retry-after"]
          if (typeof delay === "string" && delay.length <= 128) retryAfter = delay
          explicitlyNonRetryable = result.headers["x-should-retry"] === "false"
          outgoing.writeHead(result.statusCode ?? 502, result.headers)
          responseEncoding = result.headers["content-encoding"]
          result.on("data", (chunk: Buffer) => {
            // Keep wire forwarding untouched. Bound both captured compressed
            // bytes and decoded diagnostic evidence; never retain request data.
            const retained = chunk.subarray(0, Math.max(0, RESPONSE_EVIDENCE_LIMIT - responseBytes))
            if (retained.length) responseChunks.push(Buffer.from(retained))
            responseBytes += retained.length
          })
          result.on("error", (error) => {
            transportError = error
            outgoing.destroy()
          })
          result.pipe(outgoing)
        },
      )
      requests.add(request)
      request.on("close", () => requests.delete(request))
      request.on("error", (error) => {
        transportError = error
        outgoing.destroy()
      })
      incoming.on("aborted", () => request.destroy())
      incoming.pipe(request)
    }
    void send().catch((error: unknown) => {
      transportError = error
      outgoing.destroy()
    })
  })
  server.on("clientError", (_error, socket) => socket.end("HTTP/1.1 400 Bad Request\r\n\r\n"))
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", reject)
      resolve()
    })
  })
  const abort = () => {
    for (const request of requests) request.destroy()
    server.closeAllConnections()
  }
  signal.addEventListener("abort", abort, { once: true })
  if (signal.aborted) abort()
  return {
    url: `http://127.0.0.1:${(server.address() as { port: number }).port}/${token}`,
    signal,
    /** Loopback must not be sent through the user's corporate proxy. Forwarding
     * still uses the original environment and upstream proxy configuration. */
    env: {
      ...options.env,
      NO_PROXY: [options.env.NO_PROXY ?? options.env.no_proxy, "127.0.0.1"]
        .filter(Boolean)
        .join(","),
      no_proxy: [options.env.NO_PROXY ?? options.env.no_proxy, "127.0.0.1"]
        .filter(Boolean)
        .join(","),
    },
    check() {
      options.signal.throwIfAborted()
      const response = decodeResponseEvidence(Buffer.concat(responseChunks), responseEncoding)
      if (status && status >= 400)
        throw new APICallError({
          message: "Provider request failed",
          url: "",
          requestBodyValues: {},
          statusCode: status,
          responseBody: response,
          ...(explicitlyNonRetryable ? { isRetryable: false } : {}),
          ...(retryAfter ? { responseHeaders: { "retry-after": retryAfter } } : {}),
        })
      if (transportError) throw transportError
      if (!blocked) return
      throw new LLMValidationError(
        [
          "Return the complete structured output in a single response; additional tool or token continuations are not permitted.",
        ],
        undefined,
        responseUsage(response),
      )
    },
    async close() {
      signal.removeEventListener("abort", abort)
      abort()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    },
  }
}

const RESPONSE_EVIDENCE_LIMIT = 65536
const nativeZstd = (zlib as typeof zlib & {
  zstdDecompressSync?: (body: Buffer, options: { maxOutputLength: number }) => Buffer
}).zstdDecompressSync
function supportedEncoding(encoding: string): boolean {
  return ["identity", "gzip", "x-gzip", "deflate", "br"].includes(encoding) ||
    (encoding === "zstd" && !!nativeZstd)
}

/** Content-Encoding applies to the wire bytes, not the CLI's decoded body.
 * Decode only the bounded diagnostic copy, in reverse encoding order. Broken,
 * unsupported or oversized evidence remains unknown; never interpret compressed
 * bytes as text or allocate an unbounded decompression result. */
function decodeResponseEvidence(body: Buffer, encoding?: string): string {
  const encodings = (encoding ?? "identity").split(",").map((value) => value.trim().toLowerCase())
  if (encodings.length > 4) return ""
  try {
    for (const value of encodings.reverse()) {
      const options = { maxOutputLength: RESPONSE_EVIDENCE_LIMIT }
      if (value === "gzip" || value === "x-gzip") body = zlib.gunzipSync(body, options)
      else if (value === "deflate") body = zlib.inflateSync(body, options)
      else if (value === "br") body = zlib.brotliDecompressSync(body, options)
      else if (value === "zstd" && nativeZstd) body = nativeZstd(body, options)
      else if (value !== "identity") return ""
    }
    return body.toString("utf8")
  } catch {
    return ""
  }
}

function responseUsage(response: string): TokenUsage | undefined {
  let input: number | undefined, output: number | undefined
  for (const line of response.split("\n")) {
    if (!line.startsWith("data: ")) continue
    try {
      const value = JSON.parse(line.slice(6))
      const usage = value.usage ?? value.message?.usage ?? value.response?.usage
      if (typeof usage?.input_tokens === "number") input = usage.input_tokens
      if (typeof usage?.output_tokens === "number") output = usage.output_tokens
    } catch {
      /* Partial SSE lines are not usage evidence. */
    }
  }
  return input !== undefined && output !== undefined
    ? { inputTokens: input, outputTokens: output }
    : undefined
}

/** Preserve standard HTTP(S)_PROXY routing without adding a transport dependency.
 * CONNECT remains encrypted end-to-end for TLS providers. No redirect or retry
 * is performed here: either would consume another provider attempt. */
async function transportOptions(
  destination: URL,
  env: NodeJS.ProcessEnv,
  signal: AbortSignal,
  clientTls?: Pick<tls.ConnectionOptions, "cert" | "key" | "passphrase" | "ca">,
): Promise<RequestOptions> {
  const noProxy = (env.NO_PROXY ?? env.no_proxy ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
  const bypass = noProxy.some(
    (entry) =>
      entry === "*" ||
      entry === destination.host ||
      entry === destination.hostname ||
      (entry.startsWith(".") && destination.hostname.endsWith(entry)),
  )
  const value = bypass
    ? undefined
    : destination.protocol === "https:"
      ? (env.HTTPS_PROXY ?? env.https_proxy ?? env.HTTP_PROXY ?? env.http_proxy)
      : (env.HTTP_PROXY ?? env.http_proxy)
  if (!value) return {}
  const proxy = new URL(value)
  if (!["http:", "https:"].includes(proxy.protocol)) throw new Error("Unsupported proxy protocol")
  const authorization =
    proxy.username || proxy.password
      ? `Basic ${Buffer.from(`${decodeURIComponent(proxy.username)}:${decodeURIComponent(proxy.password)}`).toString("base64")}`
      : undefined
  const socket = await new Promise<import("node:net").Socket>((resolve, reject) => {
    const request = (proxy.protocol === "https:" ? https : http).request({
      hostname: proxy.hostname,
      port: proxy.port || (proxy.protocol === "https:" ? 443 : 80),
      method: "CONNECT",
      path: `${destination.hostname}:${destination.port || (destination.protocol === "https:" ? 443 : 80)}`,
      headers: authorization ? { "proxy-authorization": authorization } : {},
      signal,
    })
    request.on("error", reject)
    request.on("connect", (response, connection, head) => {
      if (response.statusCode !== 200) {
        connection.destroy()
        reject(new Error("Provider proxy connection failed"))
        return
      }
      if (head.length) connection.unshift(head)
      resolve(connection)
    })
    request.end()
  })
  if (signal.aborted) {
    socket.destroy()
    signal.throwIfAborted()
  }
  const agent = destination.protocol === "https:" ? new https.Agent() : new http.Agent()
  agent.createConnection = () =>
    destination.protocol === "https:"
      ? tls.connect({ ...clientTls, socket, servername: destination.hostname })
      : socket
  return { agent }
}
