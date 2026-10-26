import type { ProviderCliLoginStatus } from "@adt/types"
import {
  resolveProviderCredentials,
  type AnyProviderModule,
  type CheckProviderConnectionOptions,
  type CliLoginSession,
  type ProviderRegistry,
} from "@adt/llm"

type Credentials = CheckProviderConnectionOptions["credentials"]

interface LoginRecord {
  /** Set once the port has handed the process over; absent while `start` is still awaiting it. */
  session?: CliLoginSession
  /** Undefined while the CLI is still waiting for the user. */
  outcome?: "done" | Error
}

export class CliLoginUnsupportedError extends Error {
  constructor(providerId: string) {
    super(`Provider "${providerId}" has no CLI sign-in`)
    this.name = "CliLoginUnsupportedError"
  }
}

export interface CliLoginService {
  supports(providerId: string): boolean
  /** Starts a sign-in, or returns the one already waiting for approval. */
  start(providerId: string, credentials?: Credentials): Promise<ProviderCliLoginStatus>
  /** The current state. A settled outcome is reported once, then the record is forgotten. */
  status(providerId: string): ProviderCliLoginStatus
  cancel(providerId: string): ProviderCliLoginStatus
  logout(providerId: string, credentials?: Credentials): Promise<void>
}

/**
 * One in-memory sign-in per provider, backed by the provider's `cliLogin` port.
 * A record only ever holds the sign-in URL and a non-secret failure message:
 * the CLI keeps the tokens it receives, and this server never sees them.
 * Settled records are served once and dropped, so a reopened settings panel
 * does not re-announce an old sign-in or show a stale failure.
 */
export function createCliLoginService(registry: ProviderRegistry): CliLoginService {
  const records = new Map<string, LoginRecord>()

  const toStatus = (providerId: string, record: LoginRecord | undefined): ProviderCliLoginStatus => {
    if (!record) return { providerId, state: "idle" }
    if (record.outcome === undefined) {
      return {
        providerId,
        state: "pending",
        ...(record.session?.url ? { url: record.session.url } : {}),
      }
    }
    if (record.outcome === "done") return { providerId, state: "done" }
    return { providerId, state: "failed", detail: record.outcome.message.slice(0, 400) }
  }

  const portFor = (providerId: string) => {
    const module = registry.get(providerId)
    const port = module.cliLogin
    if (!port) throw new CliLoginUnsupportedError(providerId)
    return { module, port }
  }

  const contextFor = (module: AnyProviderModule, credentials: Credentials) => ({
    providerId: module.manifest.id,
    credentials: resolveProviderCredentials(module, credentials),
  })

  const settle = (providerId: string, record: LoginRecord, outcome: "done" | Error): void => {
    // A cancel or a newer sign-in may have replaced this record; never overwrite that.
    if (records.get(providerId) === record) record.outcome = outcome
  }

  return {
    supports: (providerId) => typeof registry.tryGet(providerId)?.cliLogin?.start === "function",

    async start(providerId, credentials) {
      const existing = records.get(providerId)
      if (existing && existing.outcome === undefined) return toStatus(providerId, existing)

      const { module, port } = portFor(providerId)
      const record: LoginRecord = {}
      records.set(providerId, record)
      try {
        const session = await port.start(contextFor(module, credentials))
        if (records.get(providerId) !== record) {
          // Cancelled (or superseded) while the CLI was starting up: the
          // process exists now, so it must not be left waiting on its port.
          session.cancel()
          return toStatus(providerId, records.get(providerId))
        }
        if (!session.url) {
          // Nothing left for the user to do (already signed in).
          records.delete(providerId)
          return { providerId, state: "done" }
        }
        record.session = session
        session.completion.then(
          () => settle(providerId, record, "done"),
          (error: unknown) => settle(providerId, record, toError(error)),
        )
        return toStatus(providerId, record)
      } catch (error) {
        // The CLI could not even start; report it once, keep nothing.
        if (records.get(providerId) === record) records.delete(providerId)
        return { providerId, state: "failed", detail: toError(error).message.slice(0, 400) }
      }
    },

    status(providerId) {
      const record = records.get(providerId)
      if (record?.outcome !== undefined) records.delete(providerId)
      return toStatus(providerId, record)
    },

    cancel(providerId) {
      const record = records.get(providerId)
      records.delete(providerId)
      if (record?.outcome === undefined) record?.session?.cancel()
      return toStatus(providerId, undefined)
    },

    async logout(providerId, credentials) {
      const { module, port } = portFor(providerId)
      const record = records.get(providerId)
      records.delete(providerId)
      if (record?.outcome === undefined) record?.session?.cancel()
      await port.logout(contextFor(module, credentials))
    },
  }
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}
