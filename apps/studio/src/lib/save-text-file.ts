import { isElectron } from "@/lib/utils"

/**
 * Save text as a Markdown file: the desktop app's save dialog when it has one,
 * otherwise a browser download. Resolves to false when the person cancels the
 * dialog; a browser download can't be cancelled from here, so it counts as saved.
 */
export async function saveTextFile(fileName: string, text: string): Promise<boolean> {
  if (isElectron() && window.api?.saveFile) {
    // "Markdown" names the file format in the OS dialog, like "PDF": not translated.
    const filters = [{ name: "Markdown", extensions: ["md"] }]
    const savedPath = await window.api.saveFile({ defaultPath: fileName, filters }, new TextEncoder().encode(text))
    return savedPath !== null
  }
  const url = URL.createObjectURL(new Blob([text], { type: "text/markdown;charset=utf-8" }))
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  // Revoked after the click has started the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return true
}
