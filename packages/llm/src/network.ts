import net from "node:net"

/**
 * How long one address of a host gets to connect before Node moves on to the
 * next one (its "Happy Eyeballs" fallback, `autoSelectFamily`).
 *
 * Node's default is 250 ms, and a healthy connection can miss it. The timer is
 * served before socket events, so whenever this process is busy for longer
 * than that — a large status response, a burst of database writes — or the
 * link is slow, an address that was about to connect, or already had, is
 * abandoned. Provider hosts resolve to IPv4 and IPv6 addresses, tried
 * alternately. On a network whose IPv6 route leads nowhere, two such misses
 * leave the connection waiting on a dead address until the 10 s connect
 * timeout, and the request fails with `fetch failed` (#1067).
 *
 * 2.5 s rides out those pauses and one retransmitted SYN, and still leaves
 * room to try four addresses inside the 10 s.
 */
export const CONNECTION_ATTEMPT_TIMEOUT_MS = 2_500

/**
 * Process-wide defaults for outbound connections. Call once at startup, before
 * the first request: it applies to every connection opened afterwards.
 */
export function configureOutboundConnections(): void {
  net.setDefaultAutoSelectFamilyAttemptTimeout(CONNECTION_ATTEMPT_TIMEOUT_MS)
}
