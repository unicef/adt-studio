export type ReleaseChannel = "stable" | "beta"
export const RELEASE_BANNER_ASPECT = "aspect-[3/2]"

export const TRUSTED_ASSET_PREFIXES = [
  "https://github.com/user-attachments/",
  "https://user-images.githubusercontent.com/",
]

export function trustedAssetUrl(url?: string): string | undefined {
  return url && TRUSTED_ASSET_PREFIXES.some((prefix) => url.startsWith(prefix))
    ? url
    : undefined
}

export function getReleaseChannel(version: string): ReleaseChannel {
  return version.toLowerCase().includes("-beta") ? "beta" : "stable"
}

export function formatVersion(version: string, fallback = "—"): string {
  if (!version) return fallback
  return version.startsWith("v") ? version : `v${version}`
}

export function releaseNotesHaveImage(notes?: string): boolean {
  if (!notes) return false
  return (
    /!\[[^\]]*\]\([^)\s]+/.test(notes) ||
    /<source[^>]*\ssrcset=["'][^"']+["'][^>]*>/i.test(notes) ||
    /<img[^>]*\ssrc=["'][^"']+["'][^>]*>/i.test(notes)
  )
}
