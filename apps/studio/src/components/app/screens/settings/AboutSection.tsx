import type { ReactNode } from "react"
import { Trans } from "@lingui/react/macro"
import { Link } from "@tanstack/react-router"
import { Check, RotateCcw, Folder, FileDown, Download, Laptop, Compass } from "lucide-react"
import { useAppVersion } from "@/hooks/use-app-version"
import { useAppLogo } from "@/hooks/use-app-logo"
import { usePlatform } from "@/hooks/use-platform"
import { useUpdateDialog } from "@/components/updates"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { ComingSoon, SettingsHeading, SettingsLead } from "./ui"
import { SETTINGS_ANCHORS } from "./nav"

/* eslint-disable-next-line lingui/no-unlocalized-strings -- OS brand names, not translatable */
const OS_LABEL = { macos: "macOS", windows: "Windows", linux: "Linux" }

function DetailTile({
  icon: Icon,
  title,
  soon,
  anchorId,
  children,
}: {
  icon: typeof Folder
  title: ReactNode
  soon?: boolean
  anchorId?: string
  children: ReactNode
}) {
  return (
    <div id={anchorId} className={cn("flex scroll-mt-24 flex-col rounded-2xl border bg-card p-[18px] shadow-sm", soon && "opacity-70")}>
      <div className="flex items-center gap-2">
        <span className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-brand-50 text-brand-600">
          <Icon className="size-[17px]" />
        </span>
        <div className="text-[13px] font-semibold">{title}</div>
        {soon && <ComingSoon />}
      </div>
      <div className="mt-3">{children}</div>
    </div>
  )
}

export function AboutSection() {
  const version = useAppVersion()
  const logoSrc = useAppLogo()
  const os = usePlatform()
  const { openUpdateDialog, hasPendingUpdate } = useUpdateDialog()

  return (
    <>
      <SettingsHeading>
        <Trans>About</Trans>
      </SettingsHeading>
      <SettingsLead>
        <Trans>ADT Studio turns PDFs into accessible digital textbooks.</Trans>
      </SettingsLead>

      <div
        id={SETTINGS_ANCHORS.appVersion}
        className="relative mb-3 scroll-mt-24 overflow-hidden rounded-2xl border bg-card p-7 shadow-sm"
      >
        <div className="pointer-events-none absolute -top-[150px] right-[-80px] size-[360px] rounded-full bg-[radial-gradient(circle,rgba(43,127,255,.12),transparent_70%)]" />
        <div className="relative flex flex-wrap items-center gap-5">
          <div className="grid size-[76px] shrink-0 place-items-center rounded-[20px] bg-white shadow-[0_30px_60px_-20px_rgba(43,127,255,0.3),0_4px_14px_rgba(0,0,0,0.08)]">
            <img src={logoSrc} className="size-14" alt="" />
          </div>
          <div className="min-w-0">
            <div className="text-[24px] font-bold leading-none tracking-[-0.02em]">
              <Trans>ADT Studio</Trans>
            </div>
            <div className="mt-2 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
              <Trans>Accessible digital textbook</Trans>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <Badge variant="outline" className="px-2 font-mono text-[10.5px]">
                v{version ?? "—"}
              </Badge>
              {hasPendingUpdate ? (
                <Badge variant="info" className="gap-1 px-2 text-[10.5px]">
                  <Download className="size-3" />
                  <Trans>Update available</Trans>
                </Badge>
              ) : (
                <Badge variant="success" className="gap-1 px-2 text-[10.5px]">
                  <Check className="size-3" />
                  <Trans>Up to date</Trans>
                </Badge>
              )}
            </div>
          </div>
          <Button
            variant={hasPendingUpdate ? "default" : "outline"}
            size="sm"
            className="ml-auto shrink-0"
            onClick={openUpdateDialog}
          >
            {hasPendingUpdate ? (
              <>
                <Download className="size-3.5" />
                <Trans>Install update</Trans>
              </>
            ) : (
              <>
                <RotateCcw className="size-3.5" />
                <Trans>Check for updates</Trans>
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <DetailTile icon={Laptop} title={<Trans>Platform</Trans>}>
          <div className="text-[15px] font-semibold">{OS_LABEL[os]}</div>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            <Trans>Running on this machine.</Trans>
          </p>
        </DetailTile>

        <DetailTile icon={Compass} title={<Trans>Onboarding tour</Trans>}>
          <p className="text-[12px] leading-normal text-muted-foreground">
            <Trans>Replay the guided introduction to ADT Studio.</Trans>
          </p>
          <Button asChild variant="outline" size="sm" className="mt-3">
            <Link
              to="/onboarding"
              onClick={(e) => {
                // On desktop the tour has its own right-sized window; the in-app
                // route is the web fallback.
                const bridge = typeof window !== "undefined" ? window.api?.onboarding : undefined
                if (bridge?.open) {
                  e.preventDefault()
                  void bridge.open()
                }
              }}
            >
              <RotateCcw className="size-3.5" />
              <Trans>Restart tour</Trans>
            </Link>
          </Button>
        </DetailTile>

        <DetailTile icon={Folder} title={<Trans>Books folder</Trans>} soon anchorId={SETTINGS_ANCHORS.booksFolder}>
          <p className="text-[12px] leading-normal text-muted-foreground">
            <Trans>Where book projects live on this machine.</Trans>
          </p>
          <Button variant="outline" size="sm" disabled className="mt-3 font-mono">
            <Folder className="size-3.5" />
            <Trans>~/ADT/Books</Trans>
          </Button>
        </DetailTile>

        <DetailTile icon={FileDown} title={<Trans>Diagnostics</Trans>} soon anchorId={SETTINGS_ANCHORS.diagnostics}>
          <p className="text-[12px] leading-normal text-muted-foreground">
            <Trans>Export logs to help debug pipeline failures.</Trans>
          </p>
          <Button variant="outline" size="sm" disabled className="mt-3">
            <FileDown className="size-3.5" />
            <Trans>Export logs</Trans>
          </Button>
        </DetailTile>
      </div>
    </>
  )
}
