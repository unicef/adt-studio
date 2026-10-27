export function normalizeQuery(query: string): string {
  return query.trim().toLowerCase()
}

export function matchesQuery(query: string, values: Array<string | null | undefined>): boolean {
  if (!query) return true
  return values.some((value) => value?.toLowerCase().includes(query))
}

export function Highlight({ text, query }: { text: string; query: string }) {
  const index = query ? text.toLowerCase().indexOf(query) : -1
  if (index < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, index)}
      <mark className="rounded-[3px] bg-brand-100 px-px text-inherit dark:bg-brand-500/25">
        {text.slice(index, index + query.length)}
      </mark>
      {text.slice(index + query.length)}
    </>
  )
}
