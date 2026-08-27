/** Same route as `ExternalLinkButton`: a `_blank` navigation, which Electron's
 *  `setWindowOpenHandler` turns into `shell.openExternal` and a browser opens as a tab.
 *  Popup blockers can still refuse a programmatic call, so every caller keeps a visible
 *  link as the fallback. */
export function openExternalUrl(url: string): boolean {
  try {
    const opened = window.open(url, "_blank", "noopener,noreferrer")
    return opened !== null
  } catch {
    return false
  }
}
