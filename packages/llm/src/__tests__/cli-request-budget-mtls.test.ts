import fs from "node:fs"
import http from "node:http"
import https from "node:https"
import net from "node:net"
import { afterEach, expect, it } from "vitest"
import { createCliRequestBudget } from "../providers/shared/cli-request-budget.js"

const cert = fs.readFileSync(new URL("./fixtures/cli-budget/synthetic-cert.pem", import.meta.url))
const key = fs.readFileSync(new URL("./fixtures/cli-budget/synthetic-key.pem", import.meta.url))
const passphrase = "synthetic-fixture-passphrase"
const cleanup: Array<() => Promise<void>> = []

afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close()
})

async function listen(server: http.Server | https.Server): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", resolve)
  })
  cleanup.push(async () => {
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })
  return (server.address() as net.AddressInfo).port
}

function post(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const request = http.request(url, { method: "POST" }, (response) => {
      let body = ""
      response.on("data", (chunk) => { body += chunk })
      response.on("end", () => resolve(body))
      response.on("error", reject)
    })
    request.on("error", reject)
    request.end('{"fixture":true}')
  })
}

it.each([false, true])("preserves encrypted-key mTLS authentication (CONNECT=%s)", async (throughProxy) => {
  let providerCalls = 0
  let recordedCalls = 0
  let connects = 0
  const server = https.createServer({ cert, key, passphrase, ca: cert, requestCert: true, rejectUnauthorized: true }, (request, response) => {
    providerCalls++
    expect((request.socket as import("node:tls").TLSSocket).authorized).toBe(true)
    expect(request.url).toBe("/v1/messages")
    request.resume()
    response.end("authenticated fixture response")
  })
  const providerPort = await listen(server)
  const env: NodeJS.ProcessEnv = {}
  if (throughProxy) {
    const sockets = new Set<import("node:stream").Duplex>()
    const proxy = http.createServer()
    proxy.on("connect", (request, socket, head) => {
      connects++
      expect(request.url).toBe(`localhost:${providerPort}`)
      // Never use the requested host as an arbitrary egress destination.
      const upstream = net.connect(providerPort, "127.0.0.1", () => {
        socket.write("HTTP/1.1 200 Connection Established\r\n\r\n")
        if (head.length) upstream.write(head)
        socket.pipe(upstream).pipe(socket)
      })
      for (const connection of [socket, upstream]) {
        sockets.add(connection)
        connection.on("close", () => sockets.delete(connection))
        connection.on("error", () => { socket.destroy(); upstream.destroy() })
      }
    })
    env.HTTPS_PROXY = `http://127.0.0.1:${await listen(proxy)}`
    cleanup.push(async () => { for (const socket of sockets) socket.destroy() })
  }
  const gate = await createCliRequestBudget({
    signal: new AbortController().signal,
    env,
    clientTls: { cert, key, passphrase, ca: cert },
    upstream: () => `https://localhost:${providerPort}`,
    onProviderRequest: () => { recordedCalls++ },
  })
  cleanup.push(() => gate.close())

  await expect(post(`${gate.url}/v1/messages`)).resolves.toBe("authenticated fixture response")
  expect(providerCalls).toBe(1)
  expect(recordedCalls).toBe(1)
  expect(connects).toBe(throughProxy ? 1 : 0)
  expect(() => gate.check()).not.toThrow()
})

it("keeps server-side client authentication enforced when no certificate is supplied", async () => {
  let providerCalls = 0
  const server = https.createServer({ cert, key, passphrase, ca: cert, requestCert: true, rejectUnauthorized: true }, (request, response) => {
    providerCalls++
    request.resume()
    response.end("must not reach authenticated handler")
  })
  const providerPort = await listen(server)
  const gate = await createCliRequestBudget({
    signal: new AbortController().signal,
    env: {},
    clientTls: { ca: cert },
    upstream: () => `https://localhost:${providerPort}`,
  })
  cleanup.push(() => gate.close())
  await expect(post(`${gate.url}/v1/messages`)).rejects.toThrow()
  expect(providerCalls).toBe(0)
})
