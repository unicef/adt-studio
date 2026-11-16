import type { AccessAttemptKind, PublicationStore } from "./store.js"

export const ATTEMPT_WINDOW_SECONDS = 15 * 60

export const CLIENT_ATTEMPT_LIMIT = 10

/** Higher than the per-caller limit to reduce distributed guessing without easy lockout. Each
 *  caller adds at most `CLIENT_ATTEMPT_LIMIT` toward it, so tripping it takes several callers:
 *  counted in full, one caller's refused attempts alone kept every reader of the book out. */
const TOKEN_ATTEMPT_LIMIT = 60

/** Cooldown after the limit trips, doubling per further failure, capped. Returned as
 *  `Retry-After`, so a polite client waits rather than hammering. */
const BASE_COOLDOWN_SECONDS = 30
const MAX_COOLDOWN_SECONDS = 15 * 60

export function cooldownFor(failures: number, limit: number): number {
  const over = Math.max(0, failures - limit) + 1
  return Math.min(MAX_COOLDOWN_SECONDS, BASE_COOLDOWN_SECONDS * 2 ** (over - 1))
}

/**
 * The network a caller is counted as. An IPv6 subscriber is handed a whole /64 and can rotate
 * through it freely, so counting single addresses gave each one a fresh per-caller limit and a
 * fresh share of the per-book one; the /64 is the smallest unit one subscriber cannot leave.
 */
export function callerNetwork(ip: string): string {
  const groups = ipv6Groups(ip.split("%")[0]!)
  if (!groups) return ip
  if (groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff) {
    return [groups[6]! >> 8, groups[6]! & 0xff, groups[7]! >> 8, groups[7]! & 0xff].join(".")
  }
  return groups.slice(0, 4).map((group) => group.toString(16)).join(":") + "::/64"
}

/** The eight groups of an IPv6 address, or `null` for anything that is not one. */
function ipv6Groups(address: string): number[] | null {
  const dotted = /^(.*:)(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(address)
  let text = address
  if (dotted) {
    const octets = dotted.slice(2).map(Number)
    if (octets.some((octet) => octet > 255)) return null
    text = `${dotted[1]}${((octets[0]! << 8) | octets[1]!).toString(16)}:${((octets[2]! << 8) | octets[3]!).toString(16)}`
  }
  const halves = text.split("::")
  if (halves.length > 2) return null
  const parse = (half: string) => (half === "" ? [] : half.split(":"))
  const left = parse(halves[0]!)
  const right = halves.length === 2 ? parse(halves[1]!) : []
  const missing = 8 - left.length - right.length
  if (halves.length === 2 ? missing < 1 : missing !== 0) return null
  const groups = [...left, ...Array<string>(halves.length === 2 ? missing : 0).fill("0"), ...right]
  if (!groups.every((group) => /^[0-9a-f]{1,4}$/i.test(group))) return null
  return groups.map((group) => parseInt(group, 16))
}

/** Store an HMAC of the caller's network, never the address itself. */
export async function clientHandle(ip: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(callerNetwork(ip)))
  return [...new Uint8Array(mac)]
    .slice(0, 16)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}

/**
 * The secret a book's attempt counter is keyed with: the same value wherever that book's door is
 * asked. A book host holds its book's per-book secret; the control plane derives that same value
 * from its own, the way the Studio does at deploy. Keyed with each Worker's own secret, every
 * host was a fresh bucket and the per-client limit multiplied by the number of hosts.
 */
export async function throttleSecretFor(env: { MGMT_SECRET?: string; BOOK_TOKEN?: string }, token: string): Promise<string | undefined> {
  const secret = env.MGMT_SECRET
  if (!secret || env.BOOK_TOKEN) return secret
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(token))
  return [...new Uint8Array(mac)].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

export interface ThrottleDeps {
  store: PublicationStore
  secret: string
  ip: string
  token: string
  kind: AccessAttemptKind
  now: Date
}

export interface ThrottleGate {
  refusedFor: number | null
  recordSuccess: () => Promise<void>
}

/** Record before counting so concurrent attempts cannot evade the limit. */
export async function attemptGate(deps: ThrottleDeps): Promise<ThrottleGate> {
  const client = await clientHandle(deps.ip, deps.secret)
  const at = deps.now.toISOString()

  await deps.store.recordAccessFailure({ token: deps.token, client, kind: deps.kind, at })

  const since = new Date(deps.now.getTime() - ATTEMPT_WINDOW_SECONDS * 1000).toISOString()
  const { byClient, byToken } = await deps.store.countAccessFailures({
    token: deps.token,
    client,
    kind: deps.kind,
    since,
    clientCap: CLIENT_ATTEMPT_LIMIT,
  })

  const refusedFor =
    byClient > CLIENT_ATTEMPT_LIMIT
      ? cooldownFor(byClient, CLIENT_ATTEMPT_LIMIT)
      : byToken > TOKEN_ATTEMPT_LIMIT
        ? cooldownFor(byToken, TOKEN_ATTEMPT_LIMIT)
        : null

  return {
    refusedFor,
    recordSuccess: () =>
      deps.store.clearAccessFailures({ token: deps.token, client, kind: deps.kind }),
  }
}

/** Cloudflare sets this header; do not trust client-provided forwarding headers. */
export function callerIp(headers: Headers): string {
  return headers.get("cf-connecting-ip") ?? "unknown"
}
