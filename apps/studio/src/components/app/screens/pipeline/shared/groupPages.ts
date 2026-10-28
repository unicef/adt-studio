export type PageGroup = number[]

export function groupPages(start: number, end: number, spread: boolean): PageGroup[] {
  const groups: PageGroup[] = []
  let page = start
  while (page <= end) {
    if (!spread || page === start || page === end) {
      groups.push([page])
      page += 1
    } else {
      groups.push([page, page + 1])
      page += 2
    }
  }
  return groups
}

export function countGroups(start: number, end: number, spread: boolean): number {
  const pages = Math.max(0, end - start + 1)
  if (!spread || pages <= 1) return pages
  return 1 + Math.ceil((pages - 1) / 2)
}
