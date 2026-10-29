import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { z } from "zod"
import { Dashboard } from "../components/dashboard/Dashboard"
import type { FolderState } from "../components/FolderForm"
import { TopBar } from "../components/shell/TopBar"
import { useWorkspace } from "../hooks/useWorkspace"
import { PRICE_TIERS } from "../lib/pricing"
import { getConversions, getDefaultFolder } from "../server/functions"

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error))

export const Route = createFileRoute("/")({
  validateSearch: z.object({ folder: z.string().optional(), tier: z.enum(PRICE_TIERS).optional() }),
  loader: () => getDefaultFolder(),
  component: Home,
})

function Home() {
  const defaultFolder = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const folder = search.folder ?? defaultFolder ?? ""
  const tier = search.tier ?? "short"
  const [draft, setDraft] = useState(folder)

  useEffect(() => setDraft(folder), [folder])

  const listing = useQuery({
    queryKey: ["conversions", folder],
    queryFn: () => getConversions({ data: { folder } }),
    enabled: folder.length > 0,
  })

  const workspace = useWorkspace(listing.data, tier)

  const folderState: FolderState = {
    draft,
    onDraft: setDraft,
    onSubmit() {
      const next = draft.trim()
      if (!next) return
      if (next === folder) void listing.refetch()
      else void navigate({ search: (prev) => ({ ...prev, folder: next }) })
    },
    busy: listing.isFetching,
    canRescan: draft.trim() === folder && Boolean(listing.data),
    error: listing.isError ? errorMessage(listing.error) : null,
    emptyFolder: listing.data && listing.data.conversions.length === 0 ? listing.data.folder : null,
  }

  const hasListing = Boolean(listing.data && listing.data.conversions.length > 0)

  return (
    <div className="min-h-dvh">
      <TopBar tier={tier} onTier={(next) => void navigate({ search: (prev) => ({ ...prev, tier: next }) })} />
      <Dashboard folder={folderState} workspace={workspace} hasListing={hasListing} />
    </div>
  )
}
