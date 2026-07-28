/**
 * Loads the per-book manifests:
 *   - content/pages.json — flat page list (driven by web-rendering DAG)
 *   - content/toc.json   — table of contents (LLM-generated or heading-based)
 */
import type { PageEntry, TocEntry } from "@/features/navigation/state/nav.atoms"
import { loadAdtData } from "./base-path.js"

export async function loadPagesManifest(versionParam = ""): Promise<PageEntry[]> {
  return (await loadAdtData<PageEntry[]>("content/pages.json", versionParam)) ?? []
}

export async function loadTocManifest(versionParam = ""): Promise<TocEntry[]> {
  return (await loadAdtData<TocEntry[]>("content/toc.json", versionParam)) ?? []
}
