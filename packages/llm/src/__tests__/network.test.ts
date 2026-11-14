import net from "node:net"
import { afterEach, describe, expect, it } from "vitest"
import { CONNECTION_ATTEMPT_TIMEOUT_MS, configureOutboundConnections } from "../network.js"

describe("configureOutboundConnections", () => {
  const nodeDefault = net.getDefaultAutoSelectFamilyAttemptTimeout()

  afterEach(() => {
    net.setDefaultAutoSelectFamilyAttemptTimeout(nodeDefault)
  })

  it("gives each address longer than Node's default before falling back to the next", () => {
    configureOutboundConnections()

    expect(net.getDefaultAutoSelectFamilyAttemptTimeout()).toBe(CONNECTION_ATTEMPT_TIMEOUT_MS)
    expect(CONNECTION_ATTEMPT_TIMEOUT_MS).toBeGreaterThan(nodeDefault)
  })

  // A host resolves to up to four addresses (two IPv4, two IPv6). All of them
  // have to get a turn before undici's 10 s connect timeout ends the attempt.
  it("still leaves time to try four addresses inside the connect timeout", () => {
    const undiciConnectTimeoutMs = 10_000
    expect(CONNECTION_ATTEMPT_TIMEOUT_MS * 3).toBeLessThan(undiciConnectTimeoutMs)
  })

  it("keeps address fallback itself switched on", () => {
    const before = net.getDefaultAutoSelectFamily()
    configureOutboundConnections()
    expect(net.getDefaultAutoSelectFamily()).toBe(before)
  })
})
