import crypto from "node:crypto"
import { CloudflareApiError, type CloudflareClient } from "./client.js"

/** Cloudflare's own limit for the label, which becomes `<name>.workers.dev`. */
const MAX_LENGTH = 63
const DIGEST_LENGTH = 10

/**
 * A name for the account's workers.dev subdomain.
 *
 * Derived from the account id rather than its name: the account name is often a person's email
 * ("someone@example.com's Account"), and this label ends up in the public URL of every book
 * the account ever shares.
 *
 * Deterministic, so a retry after a half-finished setup asks for the same name back rather
 * than claiming a second one.
 */
export function suggestedWorkersDevSubdomain(accountId: string, attempt = 0): string {
  const digest = crypto.createHash("sha256")
    .update(attempt === 0 ? accountId : `${accountId}:${attempt}`)
    .digest("hex")
    .slice(0, DIGEST_LENGTH)
  return `adt-${digest}`.slice(0, MAX_LENGTH)
}

function isTaken(error: unknown): boolean {
  return (
    error instanceof CloudflareApiError &&
    /taken|already|in use|unavailable|conflict/i.test(error.message)
  )
}

export interface EnsuredSubdomain {
  subdomain: string
  /** True when this call registered it, so the caller can say so rather than staying silent
   *  about a permanent, account-wide change it just made. */
  created: boolean
}

/**
 * The account's workers.dev subdomain, registering one if it has none.
 *
 * Cloudflare refuses to upload a Worker that carries static assets until the account has a
 * subdomain, and it creates one silently the first time anyone opens the Workers dashboard —
 * so this is a step a person would otherwise be sent away to perform by hand, to get a name
 * Cloudflare would have picked for them anyway.
 *
 * `attempts` covers the one case a derived name cannot: these labels are unique across all of
 * Cloudflare, not just this account, so a collision is possible however unlikely.
 */
export async function ensureWorkersDevSubdomain(
  client: CloudflareClient,
  options: { attempts?: number } = {},
): Promise<EnsuredSubdomain> {
  const existing = await client.getWorkersDevSubdomain()
  if (existing) return { subdomain: existing, created: false }

  const attempts = options.attempts ?? 3
  let lastError: unknown = null

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const candidate = suggestedWorkersDevSubdomain(client.accountId, attempt)
    try {
      return { subdomain: await client.createWorkersDevSubdomain(candidate), created: true }
    } catch (error) {
      lastError = error
      if (!isTaken(error)) throw error
    }
  }

  throw lastError
}
