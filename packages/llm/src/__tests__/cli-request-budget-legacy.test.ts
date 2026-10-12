import http from "node:http"
import { expect, it, vi } from "vitest"
import { createCliRequestBudget } from "../providers/shared/cli-request-budget.js"

// Supported older Node releases have gzip/deflate/Brotli but no native zstd.
vi.mock("node:zlib", async (original) => ({
  ...await original<typeof import("node:zlib")>(),
  zstdDecompressSync: undefined,
}))

it("does not advertise zstd when the host runtime cannot inspect it", async () => {
  let accepted: string | undefined
  const server = http.createServer((req, res) => {
    accepted = req.headers["accept-encoding"]
    res.end("fixture")
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const gate = await createCliRequestBudget({
    upstream: () => `http://127.0.0.1:${(server.address() as { port: number }).port}`,
    env: {}, signal: new AbortController().signal,
  })
  try {
    const response = await fetch(`${gate.url}/messages`, {
      method: "POST", headers: { "accept-encoding": "zstd, gzip;q=0.8, future-encoding" },
    })
    expect(await response.text()).toBe("fixture")
    expect(accepted).toBe("gzip;q=0.8")
    gate.check()
  } finally {
    await gate.close()
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})
