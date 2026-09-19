import type { ResolvedCredentials } from "@adt/llm"

/**
 * Request-scoped credentials for every registered provider. Keyed by provider
 * id so an agent model from any provider authenticates with its own values.
 */
export type AgentCredentials = ResolvedCredentials
