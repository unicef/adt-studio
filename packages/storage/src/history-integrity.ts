/** A malformed historical payload cannot prove which identities it reserved.
 * Keep SyntaxError compatibility for existing per-page read isolation, while
 * exposing a stable diagnostic for writers before any destructive preparation.
 * Never include the payload (which may contain private book content) in errors. */
export class HistoryIntegrityError extends SyntaxError {
  readonly code = "HISTORY_REPAIR_REQUIRED"

  constructor(readonly node: string, readonly itemId: string, readonly version: number) {
    super(`HISTORY_REPAIR_REQUIRED: ${node}/${itemId}@${version}`)
    this.name = "HistoryIntegrityError"
  }
}

export function parseHistoricalPayload(node: string, itemId: string, version: number, raw: string | null): unknown {
  if (raw === null) return null
  try { return JSON.parse(raw) }
  catch (error) {
    if (!(error instanceof SyntaxError)) throw error
    throw new HistoryIntegrityError(node, itemId, version)
  }
}
