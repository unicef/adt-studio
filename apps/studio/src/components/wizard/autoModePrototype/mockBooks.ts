/**
 * Lab-only mock PDFs, read from the local, git-ignored `.context/auto-mode/pdfs/`, so the
 * prototype can open straight on a later screen without uploading. Missing folder → empty list.
 */
export type MockBook = { id: string; fileName: string; url: string }

// eslint-disable-next-line lingui/no-unlocalized-strings
const urls = import.meta.glob<string>(`../../../../../../.context/auto-mode/pdfs/*.pdf`, { eager: true, query: `?url`, import: "default" })

export const MOCK_BOOKS: MockBook[] = Object.entries(urls)
  .map(([path, url]) => {
    const fileName = path.slice(path.lastIndexOf("/") + 1)
    return { id: fileName.slice(0, -4), fileName, url }
  })
  .sort((a, b) => a.id.localeCompare(b.id))

export async function loadMockFile(book: MockBook): Promise<File> {
  const blob = await (await fetch(book.url)).blob()
  return new File([blob], book.fileName, { type: "application/pdf", lastModified: 1 })
}

// eslint-disable-next-line lingui/no-unlocalized-strings
const edgeUrls = import.meta.glob<string>(`../../../../../../.context/auto-mode/edge/*`, { eager: true, query: `?url`, import: "default" })

/** Lab-only problem files (a damaged PDF, a password-protected one, a text file) from `.context/auto-mode/edge/`. */
export const EDGE_FILES: MockBook[] = Object.entries(edgeUrls)
  .map(([path, url]) => {
    const fileName = path.slice(path.lastIndexOf("/") + 1)
    return { id: fileName.slice(0, fileName.lastIndexOf(".")), fileName, url }
  })
  .sort((a, b) => a.id.localeCompare(b.id))

export async function loadEdgeFile(file: MockBook): Promise<File> {
  const blob = await (await fetch(file.url)).blob()
  const type = file.fileName.endsWith(".pdf") ? "application/pdf" : "text/plain"
  return new File([blob], file.fileName, { type, lastModified: 1 })
}
