import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { z } from "zod"
import { ConversionWorkspace } from "../components/ConversionWorkspace"
import { getConversions, getDefaultFolder } from "../server/functions"

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error))

export const Route = createFileRoute("/")({
  validateSearch: z.object({ folder: z.string().optional() }),
  loader: () => getDefaultFolder(),
  component: Home,
})

function Home() {
  const defaultFolder = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const folder = search.folder ?? defaultFolder ?? ""
  const [draft, setDraft] = useState(folder)

  useEffect(() => setDraft(folder), [folder])

  const listing = useQuery({
    queryKey: ["conversions", folder],
    queryFn: () => getConversions({ data: { folder } }),
    enabled: folder.length > 0,
  })

  const open = () => {
    const next = draft.trim()
    if (!next) return
    if (next === folder) void listing.refetch()
    else void navigate({ search: { folder: next } })
  }

  return (
    <div className="mx-auto flex max-w-[84rem] flex-col gap-6 px-[max(16px,env(safe-area-inset-left,0px))] py-8">
      <header className="flex flex-col gap-3">
        <h1 className="text-2xl font-medium text-balance text-ink">ADT Conversion Compare</h1>
        <p className="max-w-[72ch] text-sm leading-relaxed text-ink-2">
          Enter the ADT Studio project folder (or its books folder, or a single book). The local server reads each conversion&apos;s database, from the llm_log and step_runs tables, and builds the comparison.
        </p>
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            open()
          }}
        >
          <label htmlFor="folder" className="sr-only">Project folder</label>
          <input
            id="folder"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="C:\\path\\to\\adt-studio"
            spellCheck={false}
            className="min-w-0 flex-1 basis-80 rounded-md border border-line bg-surface px-3 py-2 font-mono text-sm text-ink placeholder:text-muted focus-visible:outline-2 focus-visible:outline-ink"
          />
          <button
            type="submit"
            disabled={listing.isFetching || draft.trim().length === 0}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50"
          >
            {draft.trim() === folder && listing.data ? "Rescan" : "Open folder"}
          </button>
        </form>
        {listing.isFetching && <p className="text-sm text-muted">Looking for conversions…</p>}
        {listing.isError && <p className="text-sm text-bad">{errorMessage(listing.error)}</p>}
        {listing.data && listing.data.conversions.length === 0 && (
          <p className="text-sm text-bad">No conversions found in {listing.data.folder}. Use the ADT Studio project folder, its books folder, or a single book folder.</p>
        )}
      </header>

      {listing.data && listing.data.conversions.length > 0 && <ConversionWorkspace key={listing.data.booksDir} listing={listing.data} />}
    </div>
  )
}
