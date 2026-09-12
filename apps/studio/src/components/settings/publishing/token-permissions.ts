import { msg } from "@lingui/core/macro"
import type { MessageDescriptor } from "@lingui/core"
import type { CloudflareTokenScope } from "@adt/types"

export interface TokenPermission {
  id: string
  /** The shared-contract scope this row grants. */
  scope: CloudflareTokenScope
  /** First column in Cloudflare's permission picker. */
  group: MessageDescriptor
  /** Second column — the resource being granted. */
  resource: MessageDescriptor
  /** Third column — the level of access. */
  access: MessageDescriptor
  /** Fallback fragments, so an unexpected scope spelling still resolves. */
  aliases: readonly string[]
}

/** Keyed by contract scope, ordered the way the wizard asks the user to add the
 *  rows in Cloudflare's token editor. */
const PERMISSION_COPY: Record<CloudflareTokenScope, Omit<TokenPermission, "scope">> = {
  "Workers Scripts:Edit": {
    id: "workers-scripts",
    group: msg`Account`,
    resource: msg`Workers Scripts`,
    access: msg`Edit`,
    aliases: ["workerscript", "workersscript", "workerscripts", "scriptwrite"],
  },
  "D1:Edit": {
    id: "d1",
    group: msg`Account`,
    resource: msg`D1`,
    access: msg`Edit`,
    aliases: ["d1"],
  },
  "R2:Edit": {
    id: "r2",
    group: msg`Account`,
    resource: msg`Workers R2 Storage`,
    access: msg`Edit`,
    aliases: ["r2", "bucket"],
  },
  "Account:Read": {
    id: "account-settings",
    group: msg`Account`,
    resource: msg`Account Settings`,
    access: msg`Read`,
    aliases: ["accountsettings", "accountread", "accountlist"],
  },
}

/** The exact four rows the user must add in Cloudflare's token editor. */
export const TOKEN_PERMISSIONS: readonly TokenPermission[] = Object.entries(PERMISSION_COPY).map(
  ([scope, copy]) => ({ scope: scope as CloudflareTokenScope, ...copy }),
)

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "")
}

/**
 * Maps server-reported missing scopes onto the four permission rows the wizard
 * shows, so the user is told which row to add rather than a raw scope string.
 * Anything unrecognised is returned verbatim so nothing is silently dropped.
 */
export function matchMissingScopes(scopes: readonly string[]): {
  permissions: TokenPermission[]
  unmatched: string[]
} {
  const permissions: TokenPermission[] = []
  const unmatched: string[] = []

  for (const scope of scopes) {
    const normalized = normalize(scope)
    const permission =
      TOKEN_PERMISSIONS.find((candidate) => candidate.scope === scope) ??
      TOKEN_PERMISSIONS.find((candidate) =>
        candidate.aliases.some((alias) => normalized.includes(alias)),
      )
    if (!permission) {
      unmatched.push(scope)
      continue
    }
    if (!permissions.includes(permission)) permissions.push(permission)
  }

  return { permissions, unmatched }
}
