export type ReleaseChannel = "stable" | "beta"

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
