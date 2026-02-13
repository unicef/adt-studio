import { createFileRoute, Link } from "@tanstack/react-router"
import { Terminal, ArrowLeft } from "lucide-react"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { StatsTab } from "@/components/debug/StatsTab"
import { LlmLogsTab } from "@/components/debug/LlmLogsTab"
import { ConfigTab } from "@/components/debug/ConfigTab"
import { VersionsTab } from "@/components/debug/VersionsTab"
import { usePipelineSSE, usePipelineStatus } from "@/hooks/use-pipeline"

export const Route = createFileRoute("/books/$label/debug")({
  component: DebugPage,
})

function DebugPage() {
  const { label } = Route.useParams()

  const { data: pipelineStatus } = usePipelineStatus(label)
  const isRunning = pipelineStatus?.status === "running"
  const { progress } = usePipelineSSE(label, isRunning)

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border shrink-0">
        <Terminal className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Debug — {label}</span>
        <div className="flex-1" />
        <Link
          to="/books/$label"
          params={{ label }}
          search={{ autoRun: undefined, startPage: undefined, endPage: undefined }}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to book
        </Link>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="stats" className="flex flex-col flex-1 min-h-0">
        <div className="flex items-center px-4 py-1 border-b border-border shrink-0">
          <TabsList className="h-8">
            <TabsTrigger value="stats" className="text-xs px-2 py-1">
              Stats
            </TabsTrigger>
            <TabsTrigger value="logs" className="text-xs px-2 py-1">
              Logs
              {progress.isRunning && progress.liveLlmLogs.length > 0 && (
                <span className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-green-500 text-[10px] text-white">
                  {progress.liveLlmLogs.length > 99 ? "99+" : progress.liveLlmLogs.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="config" className="text-xs px-2 py-1">
              Config
            </TabsTrigger>
            <TabsTrigger value="versions" className="text-xs px-2 py-1">
              Versions
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="flex-1 min-h-0 overflow-auto">
          <TabsContent value="stats" className="m-0 h-full">
            <StatsTab label={label} isRunning={progress.isRunning} />
          </TabsContent>
          <TabsContent value="logs" className="m-0 h-full">
            <LlmLogsTab label={label} progress={progress} />
          </TabsContent>
          <TabsContent value="config" className="m-0 h-full">
            <ConfigTab label={label} />
          </TabsContent>
          <TabsContent value="versions" className="m-0 h-full">
            <VersionsTab label={label} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  )
}
