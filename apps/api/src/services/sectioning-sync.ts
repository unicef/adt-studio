import { openBookDb, readCurrentNodeRow } from "@adt/storage"
import { classifyStoredSectioning } from "@adt/pipeline"
import { PageSectioningOutput, WebRenderingOutput, type SectioningSynchronization } from "@adt/types"

/** Project current pointers only. No timestamp/index-based provenance inference. */
export function readSectioningSynchronization(
  db: ReturnType<typeof openBookDb>,
  pageId: string,
  source: { data: unknown; version: number } | null,
  rendering: { data: unknown; version: number } | null,
  layout: SectioningSynchronization["layout"],
): SectioningSynchronization {
  const result: SectioningSynchronization = {
    sourceVersion: source?.version ?? null,
    renderingVersion: rendering?.version ?? null,
    layout,
    sections: [],
    diagnostics: [],
  }
  if (!source && !rendering) return result
  const tree = PageSectioningOutput.safeParse(source?.data)
  if (!tree.success) {
    result.diagnostics.push("The current semantic source is missing or invalid; correspondence cannot be verified.")
    return result
  }
  const rendered = WebRenderingOutput.safeParse(rendering?.data)
  if (rendering && !rendered.success) result.diagnostics.push("The current rendering data is invalid.")

  const owners: Record<string, string[]> = Object.create(null)
  let graphVerified = true
  const pages = db.all("SELECT page_id FROM pages", []) as Array<{ page_id: string }>
  for (const page of pages) {
    const row = readCurrentNodeRow(db, "page-sectioning", page.page_id)
    if (!row) continue
    try {
      const parsed = PageSectioningOutput.safeParse(JSON.parse(row.data))
      if (!parsed.success) {
        graphVerified = false
        result.diagnostics.push("Part of the active section graph is invalid.")
        continue
      }
      for (const section of parsed.data.sections) {
        if (!section.isPruned) (owners[section.sectionId] ??= []).push(page.page_id)
      }
    } catch {
      // An unreadable neighbor cannot supply evidence of unique ownership.
      graphVerified = false
      result.diagnostics.push("Part of the active section graph could not be read.")
    }
  }
  const history = (db.all("SELECT version, data FROM node_data WHERE node = ? AND item_id = ?", ["page-sectioning", pageId]) as Array<{ version: number; data: string }>).flatMap((row) => {
    try { return [{ version: row.version, data: JSON.parse(row.data) }] } catch { return [] }
  })
  const comparison = classifyStoredSectioning({ pageId, source: source!, rendering,
    history, layout, sectionOwners: graphVerified ? owners : {},
  })
  result.sections = comparison.sections
  result.diagnostics.push(...comparison.diagnostics)
  return result
}
