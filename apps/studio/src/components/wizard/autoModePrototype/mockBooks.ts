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
