export function pageNumbersOf(page: { pageId: string; pageNumber: number }): number[] {
  const digits = page.pageId.replace(/^pg/, "").match(/\d{3}/g)
  const numbers = digits ? digits.map(Number) : []
  return numbers.includes(page.pageNumber) ? numbers : [page.pageNumber, ...numbers]
}

export function findPageByNumber<P extends { pageId: string; pageNumber: number }>(pages: readonly P[], value: string): P | null {
  const wanted = Number.parseInt(value.trim(), 10)
  if (!Number.isFinite(wanted)) return null
  return pages.find((page) => pageNumbersOf(page).includes(wanted)) ?? null
}
