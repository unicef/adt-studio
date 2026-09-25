import { useState, type ReactNode } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { AlertTriangle, LayoutDashboard, MessageSquareText, UserPlus, Users } from "lucide-react"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import { LinkSettingsPanel } from "./LinkSettingsPanel"
import { PublishingEngineNotice } from "../PublishingEngineNotice"
import { FeedbackTab } from "./FeedbackTab"
import { SharingHero } from "./SharingHero"
import { SharingOverview } from "./SharingOverview"
import { DashboardCount, PanelEmpty, DashboardPanel, SkeletonRows } from "./DashboardPanel"
import { ReadersList } from "./ReadersList"
import type { DashboardTabId } from "./helpers"
import type { DashboardData } from "./dashboard-data"

const panelClassName = "flex min-h-0 flex-1 flex-col outline-none data-[state=inactive]:hidden motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-200"

/**
 * The live Sharing dashboard: one bold hero that says what is out there and hands it over, tabs right under it,
 * and an overview that is the whole dashboard on its own — what's waiting, who joined, and a
 * line for the history. The other tabs hold the full lists; the rarely-changed access settings
 * (end date, removing the code, stopping) sit in a Link settings sheet off the hero.
 */
export function SharingDashboard({ data }: { data: DashboardData }) {
  const { t } = useLingui()
  const [tab, setTab] = useState<DashboardTabId>("overview")
  const ready = data.status === "ready"
  const readersReady = data.readersStatus === "ready"
  /** `"end-date"` opens the sheet with the end date already open, for Extend. */
  const [settings, setSettings] = useState<"closed" | "open" | "end-date">("closed")
  const openSettings = (focus: "open" | "end-date") => {
    data.link.clearFailures()
    setSettings(focus)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 [@media(max-height:820px)]:gap-3">
      {data.link.workerReachable ? <PublishingEngineNotice /> : null}

      <SharingHero link={data.link} onOpenSettings={() => openSettings("open")} />

      <Sheet open={settings !== "closed"} onOpenChange={(open) => (open ? openSettings("open") : setSettings("closed"))}>
        <SheetContent side="right" className="flex w-[440px] flex-col gap-4 overflow-y-auto sm:max-w-[440px]">
          <SheetHeader>
            <SheetTitle>
              <Trans>Link settings</Trans>
            </SheetTitle>
            <SheetDescription>
              <Trans>Who can open the link and for how long. Changes apply to everyone at once.</Trans>
            </SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-6">
            <LinkSettingsPanel key={settings} link={data.link} editEndDate={settings === "end-date"} />
          </div>
        </SheetContent>
      </Sheet>

      <Tabs value={tab} onValueChange={(next) => setTab(next as DashboardTabId)} className="flex min-h-0 flex-1 flex-col gap-4 [@media(max-height:820px)]:gap-3">
        <TabsList
          aria-label={t`Sharing dashboard sections`}
          className="flex h-auto shrink-0 justify-start gap-1 rounded-none border-b bg-transparent p-0 text-muted-foreground"
        >
          <DashboardTab value="overview" icon={<LayoutDashboard aria-hidden="true" />}>
            <Trans>Overview</Trans>
          </DashboardTab>
          <DashboardTab
            value="feedback"
            icon={<MessageSquareText aria-hidden="true" />}
            count={ready ? data.threads.length : undefined}
            tone="attention"
          >
            <Trans>Feedback</Trans>
          </DashboardTab>
          <DashboardTab value="readers" icon={<Users aria-hidden="true" />} count={readersReady ? data.readers.length : undefined}>
            <Trans>Readers</Trans>
          </DashboardTab>
        </TabsList>

        <TabsContent value="overview" className={cn(panelClassName, "mt-0")}>
          <SharingOverview
            data={data}
            startedAt={data.versions[data.versions.length - 1]?.publishedAt ?? null}
            onExtend={() => openSettings("end-date")}
          />
        </TabsContent>

        <TabsContent value="feedback" className={cn(panelClassName, "mt-0")}>
          <FeedbackTab data={data} />
        </TabsContent>

        <TabsContent value="readers" className={cn(panelClassName, "mt-0")}>
          <DashboardPanel className="flex-1" title={<Trans>Everyone who joined</Trans>} count={readersReady ? data.readers.length : undefined}>
            {data.readersStatus === "loading" ? (
              <SkeletonRows rows={6} />
            ) : data.readersStatus === "error" ? (
              <PanelEmpty
                tone="attention"
                icon={<AlertTriangle className="size-5" aria-hidden="true" />}
                title={<Trans>Can't reach the readers</Trans>}
                body={<Trans>They come back once the service answers.</Trans>}
              />
            ) : data.readers.length === 0 ? (
              <PanelEmpty
                icon={<UserPlus className="size-5" aria-hidden="true" />}
                title={<Trans>Nobody has joined yet</Trans>}
                body={<Trans>Send the message above. Readers appear here once they open the link and give a name.</Trans>}
              />
            ) : (
              <ReadersList readers={data.readers} />
            )}
          </DashboardPanel>
        </TabsContent>

      </Tabs>
    </div>
  )
}

function DashboardTab({
  value,
  icon,
  count,
  tone = "neutral",
  children,
}: {
  value: DashboardTabId
  icon: ReactNode
  count?: number
  tone?: "neutral" | "attention"
  children: ReactNode
}) {
  return (
    <TabsTrigger
      value={value}
      className={cn(
        "relative -mb-px h-10 gap-2 rounded-none border-b-2 border-transparent bg-transparent px-3 text-[13px] font-medium text-muted-foreground shadow-none",
        "transition-colors duration-200 hover:text-foreground motion-reduce:transition-none",
        "focus-visible:ring-offset-0 data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none",
        "[&_svg]:size-4 [&_svg]:shrink-0",
      )}
    >
      {icon}
      {children}
      {count !== undefined ? <DashboardCount value={count} tone={tone} /> : null}
    </TabsTrigger>
  )
}
