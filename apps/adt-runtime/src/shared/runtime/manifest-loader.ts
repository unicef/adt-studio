/**
 * Loads the per-book manifests:
 *   - content/pages.json — flat page list (driven by web-rendering DAG)
 *   - content/toc.json   — table of contents (LLM-generated or heading-based)
 */
import type { PageEntry, TocEntry } from "@/features/navigation/state/nav.atoms"
import { runtimeBase } from "./base-path.js"

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    return (await res.json()) as T
  } catch (err) {
    console.warn(`Failed to load ${url}`, err)
    return null
  }
}

export async function loadPagesManifest(versionParam = ""): Promise<PageEntry[]> {
  const url = `${runtimeBase()}content/pages.json${versionParam ? `?v=${versionParam}` : ""}`
  return (await fetchJson<PageEntry[]>(url)) ?? []
}

export async function loadTocManifest(versionParam = ""): Promise<TocEntry[]> {
  const url = `${runtimeBase()}content/toc.json${versionParam ? `?v=${versionParam}` : ""}`
  return (await fetchJson<TocEntry[]>(url)) ?? []
}
