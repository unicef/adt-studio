import { extractTextCatalogEntriesFromHtml, projectImportedHtmlSection } from "@adt/pipeline"
import { openBookDb } from "@adt/storage"

import { pageIdFromSection } from "../catalog.js"

export function seedPages(
  dbPath: string,
  pages: Array<{ section_id: string; href: string; page_number?: number }>,
  pageHtml: Record<string, string>,
  legacyRecovery = false,
): void {
  const grouped = new Map<string, { texts: string[] }>()
  pages.forEach((page, index) => {
    const pageId = pageIdFromSection(page.section_id, index)
    if (!pageId) return
    const group = grouped.get(pageId) ?? { texts: [] }
    const html = pageHtml[page.href] ?? ""
    group.texts.push(...(legacyRecovery
      ? projectImportedHtmlSection(
          html,
          page.section_id,
          undefined,
          { repairLegacyIds: true },
        ).nodes.flatMap((node) => node.role !== "image" && node.text ? [node.text] : [])
      : extractTextCatalogEntriesFromHtml(html, pageId).map((entry) => entry.text)))
    grouped.set(pageId, group)
  })

  const db = openBookDb(dbPath)
  try {
    let pageNumber = 0
    for (const [pageId, group] of grouped) {
      pageNumber++
      db.run(
        `INSERT INTO pages (page_id, page_number, text)
         VALUES (?, ?, ?)
         ON CONFLICT (page_id) DO UPDATE SET
           page_number = excluded.page_number,
           text = excluded.text`,
        [pageId, pageNumber, group.texts.join("\n")],
      )
    }
  } finally {
    db.close()
  }
}
