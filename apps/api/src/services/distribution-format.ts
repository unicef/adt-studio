import { unzipSync, type UnzipFileInfo } from "fflate"

/**
 * Reader-facing distribution exports that are derived from the ADT web bundle
 * but reshaped for readers/LMS/FNDE. They still contain the ADT content, but
 * import can't round-trip them yet — so we detect them up front and surface a
 * clear "not supported yet" message instead of a confusing manifest-parse error.
 */
export type DistributionExportFormat = "webpub" | "epub" | "pnld"

const LABELS: Record<DistributionExportFormat, string> = {
  webpub: "WebPub",
  epub: "EPUB",
  pnld: "PNLD",
}

/**
 * English message shown when a distribution export is uploaded for re-import.
 * The studio localizes it via `useFriendlyArchiveError`, which matches on the
 * stable "read-only distribution format" / "cannot be re-imported yet" tokens.
 */
export function distributionFormatMessage(format: DistributionExportFormat): string {
  return (
    `${LABELS[format]} is a read-only distribution format and cannot be re-imported yet. ` +
    `Re-import the ADT Web ZIP or a Project backup instead.`
  )
}

function basename(entryPath: string): string {
  return entryPath.split("/").pop() ?? entryPath
}

/**
 * The archive's content root — a single top-level wrapper directory (e.g. a
 * folder compressed via Finder) when one contains everything, otherwise `""`.
 * macOS resource-fork entries are ignored.
 *
 * This anchors the marker checks below to the true root. A project backup has
 * many top-level entries (its own `.db`/`.pdf` plus leftover `epub/`/`pnld/`
 * export dirs), so its root is `""` and those nested distribution markers do not
 * match — which is what stops a backup from being misread as a distribution export.
 */
function archiveRoot(names: string[]): string {
  const topLevel = new Set<string>()
  for (const entry of names) {
    if (!entry || entry.startsWith("__MACOSX/")) continue
    topLevel.add(entry.split("/")[0])
  }
  if (topLevel.size === 1) {
    const [only] = [...topLevel]
    if (names.some((p) => p.startsWith(`${only}/`))) return `${only}/`
  }
  return ""
}

/**
 * Classify an uploaded archive as a WebPub / EPUB / PNLD distribution export, or
 * `null` when it is not one of those (an ADT bundle, project, part, or garbage).
 *
 * Only the small marker files (`mimetype`, `manifest.json`) are decompressed;
 * every entry name is inspected via the unzip filter so large archives are not
 * fully inflated just to classify them. Marker checks are anchored to the archive
 * root so a project backup that still contains `epub/`/`pnld/` export dirs is not
 * misclassified.
 */
export function detectDistributionFormat(zipBuffer: Buffer): DistributionExportFormat | null {
  const names: string[] = []
  let markers: Record<string, Uint8Array>
  try {
    markers = unzipSync(zipBuffer, {
      filter: (file: UnzipFileInfo) => {
        names.push(file.name)
        const base = basename(file.name)
        return base === "mimetype" || base === "manifest.json"
      },
    })
  } catch {
    return null
  }
  if (names.length === 0) return null

  const root = archiveRoot(names)
  const atRoot = (relative: string): boolean => names.includes(`${root}${relative}`)
  const decodeAtRoot = (relative: string): string | null => {
    const key = `${root}${relative}`
    return key in markers ? new TextDecoder().decode(markers[key]) : null
  }

  // A project backup carries a root-level `<label>.db` — never a distribution
  // export. Bail before the marker checks.
  const isRootEntry = (p: string): boolean =>
    p.startsWith(root) && !p.slice(root.length).includes("/")
  if (names.some((p) => isRootEntry(p) && p.endsWith(".db"))) return null

  // PNLD (FNDE "Obra Digital"): OPF plus a `resources/` tree at the package root.
  // Checked before the generic EPUB test because PNLD is also EPUB-conformant and
  // would otherwise match it.
  const hasRootOpf = atRoot("content.opf")
  const hasResourcesDir = names.some((p) => p.startsWith(`${root}resources/`))
  if (hasRootOpf && hasResourcesDir) return "pnld"

  // EPUB: the canonical mimetype, or the container/OPF layout, at the root.
  const mimetype = decodeAtRoot("mimetype")?.trim()
  const hasContainerXml = atRoot("META-INF/container.xml")
  const hasOebpsOpf = atRoot("OEBPS/content.opf")
  if (mimetype === "application/epub+zip" || hasContainerXml || hasOebpsOpf) return "epub"

  // WebPub: a Readium manifest.json at the root — a different schema from the ADT
  // editing-contract manifest.json (which carries `editingContract`/`formatVersion`).
  const manifestRaw = decodeAtRoot("manifest.json")
  if (manifestRaw) {
    try {
      const manifest = JSON.parse(manifestRaw) as Record<string, unknown>
      const isAdtContract = "editingContract" in manifest || "formatVersion" in manifest
      const conformsToReadium = JSON.stringify(manifest.metadata ?? "").includes(
        "readium.org/webpub-manifest",
      )
      const isReadiumManifest =
        Array.isArray((manifest as { readingOrder?: unknown }).readingOrder) || conformsToReadium
      if (isReadiumManifest && !isAdtContract) return "webpub"
    } catch {
      // manifest.json is not valid JSON — not a WebPub manifest.
    }
  }

  return null
}
