/**
 * Sample books for the cover gallery, read from the local, git-ignored `.context/auto-mode/books/`
 * (first-page PNGs plus a books.json manifest). Missing folder → empty list.
 */
export type SampleBook = { id: string; title: string; fileName: string; pages: number; size: number; cover?: string }

// eslint-disable-next-line lingui/no-unlocalized-strings
const covers = import.meta.glob<string>(`../../../../../../../.context/auto-mode/books/*.png`, { eager: true, import: "default" })
// eslint-disable-next-line lingui/no-unlocalized-strings
const manifests = import.meta.glob<Omit<SampleBook, "cover">[]>(`../../../../../../../.context/auto-mode/books/books.json`, { eager: true, import: "default" })

export const SAMPLE_BOOKS: SampleBook[] = (Object.values(manifests)[0] ?? []).map((book) => ({
  ...book,
  cover: Object.entries(covers).find(([path]) => path.endsWith(`/${book.id}.png`))?.[1],
}))
