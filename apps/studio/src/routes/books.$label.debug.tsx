import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { Terminal } from "lucide-react"
import { Tabs, TabsContent } from "@/components/ui/tabs"
import { useQuery } from "@tanstack/react-query"
import { api } from "@/api/client"
import { StatsTab } from "@/components/debug/StatsTab"
import { LlmLogsTab } from "@/components/debug/LlmLogsTab"
import { ConfigTab } from "@/components/debug/ConfigTab"
import { VersionsTab } from "@/components/debug/VersionsTab"
import { DebugTabsNav } from "@/components/debug/DebugTabsNav"
import { normalizeDebugTabValue, type DebugTabValue } from "@/components/debug/debug-panel-state"
import { ApiLogsTab } from "@/components/debug/api-logs-tab"

export const Route = createFileRoute("/books/$label/debug")({
  component: DebugPage,
  validateSearch: (search: Record<string, unknown>) => ({
    tab: normalizeDebugTabValue(search.tab) ?? "stats",
  }),
})

function DebugPage() {
  const { label } = Route.useParams()
  const { tab } = Route.useSearch()
  const navigate = useNavigate({ from: "/books/$label/debug" })

  const { data: stageStatus } = useQuery({
    queryKey: ["books", label, "step-status"],
    queryFn: () => api.getStepStatus(label),
    enabled: !!label,
    refetchInterval: (query) => {
      const stages = query.state.data?.stages
      if (!stages) return false
      return Object.values(stages).some((status) => status === "running" || status === "queued")
        ? 2000
        : false
    },
  })

  const isRunning = Object.values(stageStatus?.stages ?? {}).some(
    (status) => status === "running" || status === "queued"
  )

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-2">
        <Terminal className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Debug - {label}</span>
      </div>

      <Tabs
        value={tab}
        onValueChange={(value) => {
          navigate({
            search: { tab: value as DebugTabValue },
            replace: true,
          })
        }}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="flex items-start border-b border-border px-4 py-1 shrink-0">
          <DebugTabsNav isRunning={isRunning} />
        </div>

        <div className="flex-1 min-h-0 overflow-auto">
          <TabsContent value="stats" className="m-0">
            <StatsTab label={label} isRunning={isRunning} />
          </TabsContent>
          <TabsContent value="logs" className="m-0">
            <LlmLogsTab label={label} isRunning={isRunning} />
          </TabsContent>
          <TabsContent value="config" className="m-0">
            <ConfigTab label={label} />
          </TabsContent>
          <TabsContent value="versions" className="m-0">
            <VersionsTab label={label} />
          </TabsContent>
          <TabsContent value="api-logs" className="m-0">
            <ApiLogsTab label={label} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  )
}
