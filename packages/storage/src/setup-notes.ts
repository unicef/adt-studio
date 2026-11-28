import type sqlite from "node-sqlite3-wasm"

/**
 * The Add Book assistant's notes on a new book (#333): the recommendation it made from the PDF
 * (`setup-recommendation.json`), its AI calls in the LLM log (step `setup-recommender`), and the
 * page images those calls were sent, in `.debug-images` under the hash the log names them by.
 * They describe how the book was set up: not extraction output, and kept when Extract runs.
 */
export const SETUP_RECOMMENDATION_FILE = "setup-recommendation.json"
export const SETUP_RECOMMENDER_LOG_STEP = "setup-recommender"

/** The image hashes the assistant's LLM log rows name. */
export function setupNoteImageHashes(db: sqlite.Database): Set<string> {
  const hashes = new Set<string>()
  const rows = db.all("SELECT data FROM llm_log WHERE step = ?", [SETUP_RECOMMENDER_LOG_STEP]) as Array<{ data: string }>
  for (const row of rows) {
    let entry: { messages?: Array<{ content?: Array<{ type?: string; hash?: unknown }> }> }
    try {
      entry = JSON.parse(row.data)
    } catch {
      continue
    }
    for (const message of entry.messages ?? []) for (const part of message.content ?? []) if (part.type === "image" && typeof part.hash === "string") hashes.add(part.hash)
  }
  return hashes
}
