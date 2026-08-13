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
 * Classify an uploaded archive as a WebPub / EPUB / PNLD distribution export, or
 * `null` when it is not one of those (an ADT bundle, project, part, or garbage).
 *
 * Only the small marker files (`mimetype`, `manifest.json`) are decompressed;
 * every entry name is inspected via the unzip filter so large archives are not
 * fully inflated just to classify them.
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

  const decode = (base: string): string | null => {
    const key = Object.keys(markers).find((p) => basename(p) === base)
    return key ? new TextDecoder().decode(markers[key]) : null
  }

  // PNLD (FNDE "Obra Digital"): OPF at the package root (not under OEBPS/) plus a
  // `resources/` tree. Checked before the generic EPUB test because PNLD is also
  // EPUB-conformant and would otherwise match it.
  const hasRootOpf = names.some((p) => /(^|\/)content\.opf$/.test(p) && !p.includes("OEBPS/"))
  const hasResourcesDir = names.some((p) => /(^|\/)resources\//.test(p))
  if (hasRootOpf && hasResourcesDir) return "pnld"

  // EPUB: the canonical mimetype, or the container/OPF layout.
  const mimetype = decode("mimetype")?.trim()
  const hasContainerXml = names.some((p) => p.endsWith("META-INF/container.xml"))
  const hasOebpsOpf = names.some((p) => p.endsWith("OEBPS/content.opf"))
  if (mimetype === "application/epub+zip" || hasContainerXml || hasOebpsOpf) return "epub"

  // WebPub: a Readium manifest.json — a different schema from the ADT
  // editing-contract manifest.json (which carries `editingContract`/`formatVersion`).
  const manifestRaw = decode("manifest.json")
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
