import type { Context } from "hono"
import { HTTPException } from "hono/http-exception"
import {
  CLOUDFLARE_ACCOUNT_ID_HEADER,
  CLOUDFLARE_TOKEN_HEADER,
  type CloudflareAuthMethod,
} from "@adt/types"
import type { ConnectionStore } from "./connection-store.js"
import { CloudflareOAuthError, type CloudflareOAuthService } from "./oauth.js"

export interface ResolvedCloudflareCredentials {
  token: string
  accountId: string
  authMethod: CloudflareAuthMethod
}

export interface CredentialResolutionDeps {
  store: ConnectionStore
  oauth: CloudflareOAuthService
}

/** A stored OAuth grant wins over the request headers: it is the connection the user made
 *  inside the Studio, it is refreshed here, and it means the manual token never has to be
 *  held by the SPA. The headers stay as the fallback for Studio instances that cannot
 *  receive a localhost callback. */
export async function resolveCloudflareCredentials(
  c: Context,
  deps: CredentialResolutionDeps,
): Promise<ResolvedCloudflareCredentials> {
  const token = c.req.header(CLOUDFLARE_TOKEN_HEADER)?.trim()
  const accountId = c.req.header(CLOUDFLARE_ACCOUNT_ID_HEADER)?.trim()
  const storedGrant = deps.store.readOAuth()
  const hasHeaderCredentials = Boolean(token && accountId)

  /** A grant that has not been bound to an account yet cannot provision anything, so it
   *  must not shadow a manual token — otherwise abandoning the account picker would lock
   *  the user out of the fallback path. */
  if (storedGrant && (storedGrant.account_id !== null || !hasHeaderCredentials)) {
    const fresh = await deps.oauth.ensureFreshToken()
    if (!fresh) {
      throw new CloudflareOAuthError(
        "reconnect_required",
        "The Cloudflare login was cleared. Connect to Cloudflare again.",
      )
    }
    if (!fresh.account_id) {
      throw new CloudflareOAuthError(
        "account_choice_required",
        "Pick which Cloudflare account ADT Studio should publish into.",
      )
    }
    return { token: fresh.access_token, accountId: fresh.account_id, authMethod: "oauth" }
  }

  if (!token) {
    throw new HTTPException(400, { message: `Missing ${CLOUDFLARE_TOKEN_HEADER} header` })
  }
  if (!accountId) {
    throw new HTTPException(400, {
      message: `Missing ${CLOUDFLARE_ACCOUNT_ID_HEADER} header`,
    })
  }
  return { token, accountId, authMethod: "token" }
}

export function oauthErrorStatus(error: CloudflareOAuthError): 401 | 409 | 502 {
  switch (error.code) {
    case "reconnect_required":
      return 401
    case "oauth_flow_pending":
    case "oauth_port_busy":
    case "oauth_expired":
    case "oauth_denied":
    case "account_choice_required":
    case "oauth_state_mismatch":
      return 409
    default:
      return 502
  }
}
