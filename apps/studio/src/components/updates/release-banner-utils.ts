export type ReleaseChannel = "stable" | "beta"
export const RELEASE_BANNER_ASPECT = "aspect-[3/2]"

export const TRUSTED_ASSET_PREFIXES = [
  "https://github.com/user-attachments/",
  "https://user-images.githubusercontent.com/",
]

// Official release covers are uploaded as GitHub release assets, served from the
// repo's own release-download host. That host is fully GitHub/repo controlled, so
// it is safe to render alongside the user-attachments hosts above.
const TRUSTED_ASSET_PATTERNS = [
  /^https:\/\/github\.com\/[^/]+\/[^/]+\/releases\/download\//,
]

export function trustedAssetUrl(url?: string): string | undefined {
  if (!url) return undefined
  const trusted =
    TRUSTED_ASSET_PREFIXES.some((prefix) => url.startsWith(prefix)) ||
    TRUSTED_ASSET_PATTERNS.some((pattern) => pattern.test(url))
  return trusted ? url : undefined
}

export interface ReleaseCover {
  light?: string
  dark?: string
}

/**
 * Extracts the themed release cover from release notes. Handles the GitHub
 * `<picture>`/`<source media="(prefers-color-scheme: …)">` markup, a plain
 * `<img>` fallback, and Markdown `![](…)`. Only trusted asset URLs are kept.
 */
export function parseReleaseCover(notes?: string): ReleaseCover {
  if (!notes) return {}
  let light: string | undefined
  let dark: string | undefined

  for (const tag of notes.match(/<source\b[^>]*>/gi) ?? []) {
    const media = tag.match(/media=["']([^"']*)["']/i)?.[1]?.toLowerCase() ?? ""
    const url = trustedAssetUrl(tag.match(/srcset=["']?([^"'\s>]+)/i)?.[1])
    if (!url) continue
    if (media.includes("dark")) dark ??= url
    else if (media.includes("light")) light ??= url
  }

  if (!light || !dark) {
    const fallback =
      trustedAssetUrl(notes.match(/<img\b[^>]*\ssrc=["']([^"']+)["']/i)?.[1]) ??
      trustedAssetUrl(notes.match(/!\[[^\]]*\]\(([^)\s]+)/)?.[1])
    if (fallback) {
      light ??= fallback
      dark ??= fallback
    }
  }

  return { light, dark }
}

export function getReleaseChannel(version: string): ReleaseChannel {
  return version.toLowerCase().includes("-beta") ? "beta" : "stable"
}

export function formatVersion(version: string, fallback = "—"): string {
  if (!version) return fallback
  return version.startsWith("v") ? version : `v${version}`
}

/**
 * The release's editorial headline — the first heading in the notes (HTML or
 * Markdown), e.g. "Smoother, Safer Book Production". Used as a teaser line.
 */
export function releaseHeadline(notes?: string): string | undefined {
  if (!notes) return undefined
  const html = notes.match(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i)?.[1]
  const markdown = notes.match(/^[ \t]*#{1,3}[ \t]+(.+)$/m)?.[1]
  const text = (html ?? markdown)
    ?.replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim()
  return text || undefined
}

export function releaseNotesHaveImage(notes?: string): boolean {
  if (!notes) return false
  return (
    /!\[[^\]]*\]\([^)\s]+/.test(notes) ||
    /<source[^>]*\ssrcset=["'][^"']+["'][^>]*>/i.test(notes) ||
    /<img[^>]*\ssrc=["'][^"']+["'][^>]*>/i.test(notes)
  )
}
