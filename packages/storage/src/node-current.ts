import type sqlite from "node-sqlite3-wasm"

/**
 * Read the *current* version's row for a (node, itemId) directly off a raw db
 * handle: the version pointed at by `node_current`, or MAX(version) when no
 * pointer is set (or it dangles). Mirrors `Storage.getLatestNodeData` for
 * routes that use `openBookDb` instead of the full storage wrapper, so both
 * agree on which version is current.
 */
export function readCurrentNodeRow(
  db: sqlite.Database,
  node: string,
  itemId: string
): { version: number; data: string } | null {
  const rows = db.all(
    `SELECT nd.version AS version, nd.data AS data
     FROM node_data nd
     LEFT JOIN node_current nc ON nc.node = nd.node AND nc.item_id = nd.item_id
     WHERE nd.node = ? AND nd.item_id = ?
     ORDER BY (nd.version = nc.version) DESC, nd.version DESC
     LIMIT 1`,
    [node, itemId]
  ) as Array<{ version: number; data: string }>
  return rows[0] ?? null
}

/**
 * SQL ordering fragment that ranks the current (pointer) version first, then by
 * descending version. Use in bulk reads (`... ORDER BY nd.item_id, ` + this)
 * that pick the first row per item_id, alongside a
 * `LEFT JOIN node_current nc ON nc.node = nd.node AND nc.item_id = nd.item_id`.
 */
export const CURRENT_VERSION_ORDER = "(nd.version = nc.version) DESC, nd.version DESC"
