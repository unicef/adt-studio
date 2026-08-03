import {
  CLOUDFLARE_REQUIRED_SCOPES,
  type CloudflareTokenScope,
  type CloudflareVerifyResponse,
} from "@adt/types"
import { CloudflareApiError, type CloudflareClient } from "./client.js"

export interface CloudflareAccessProbe {
  ok: boolean
  accountName: string | null
  missingScopes: CloudflareTokenScope[]
  workersDevSubdomain: string | null
  tokenInvalid: boolean
  accountNotFound: boolean
}

function isScopeFailure(error: unknown): error is CloudflareApiError {
  return error instanceof CloudflareApiError && error.isAuthFailure
}

/** Cloudflare's token-verify endpoint reports liveness only, never the token's policies,
 *  so scope coverage is probed with the cheapest read on each product. A successful read
 *  does not prove the matching `:Edit` permission — a write-scope gap surfaces later as
 *  `upload_failed` / `migration_failed`. */
export async function probeCloudflareAccess(
  client: CloudflareClient,
): Promise<CloudflareAccessProbe> {
  const missingScopes: CloudflareTokenScope[] = []

  try {
    const verification = await client.verifyToken()
    if (verification.status !== "active") {
      return {
        ok: false,
        accountName: null,
        missingScopes: [...CLOUDFLARE_REQUIRED_SCOPES],
        workersDevSubdomain: null,
        tokenInvalid: true,
        accountNotFound: false,
      }
    }
  } catch {
    return {
      ok: false,
      accountName: null,
      missingScopes: [...CLOUDFLARE_REQUIRED_SCOPES],
      workersDevSubdomain: null,
      tokenInvalid: true,
      accountNotFound: false,
    }
  }

  let accountName: string | null = null
  let accountNotFound = false
  try {
    const account = await client.getAccount()
    accountName = account.name || null
  } catch (error) {
    if (error instanceof CloudflareApiError && error.isNotFound) {
      accountNotFound = true
    } else if (isScopeFailure(error)) {
      missingScopes.push("Account:Read")
    } else {
      throw error
    }
  }

  const probes: Array<{ scope: CloudflareTokenScope; run: () => Promise<unknown> }> = [
    { scope: "Workers Scripts:Edit", run: () => client.listWorkerScripts() },
    { scope: "D1:Edit", run: () => client.listD1Databases() },
    { scope: "R2:Edit", run: () => client.listR2Buckets() },
  ]

  for (const probe of probes) {
    try {
      await probe.run()
    } catch (error) {
      if (isScopeFailure(error)) {
        missingScopes.push(probe.scope)
      } else if (error instanceof CloudflareApiError && error.isNotFound) {
        accountNotFound = true
      } else {
        throw error
      }
    }
  }

  let workersDevSubdomain: string | null = null
  try {
    workersDevSubdomain = await client.getWorkersDevSubdomain()
  } catch (error) {
    if (!isScopeFailure(error)) throw error
  }

  const ordered = CLOUDFLARE_REQUIRED_SCOPES.filter((scope) => missingScopes.includes(scope))

  return {
    ok: !accountNotFound && ordered.length === 0,
    accountName,
    missingScopes: ordered,
    workersDevSubdomain,
    tokenInvalid: false,
    accountNotFound,
  }
}

export function toVerifyResponse(probe: CloudflareAccessProbe): CloudflareVerifyResponse {
  return {
    ok: probe.ok,
    account_name: probe.accountName,
    missing_scopes: probe.missingScopes,
    workers_dev_subdomain: probe.workersDevSubdomain,
  }
}
