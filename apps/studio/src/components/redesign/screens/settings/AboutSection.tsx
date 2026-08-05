import { Trans } from "@lingui/react/macro"
import { Check, RotateCcw, Folder, FileDown, Hourglass, Download } from "lucide-react"
import { useAppVersion } from "@/hooks/use-app-version"
import { useAppLogo } from "@/hooks/use-app-logo"
import { useUpdateDialog } from "@/components/updates"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { CARD, HEADING, LEAD, SettingRow } from "./ui"

export function AboutSection() {
  const version = useAppVersion()
  const logoSrc = useAppLogo()
  const { openUpdateDialog, hasPendingUpdate } = useUpdateDialog()

  return (
    <>
      <div className={HEADING}>
        <Trans>About</Trans>
      </div>
      <div className={LEAD}>
        <Trans>ADT Studio turns PDFs into accessible digital textbooks.</Trans>
      </div>
      <div className="relative mb-3.5 overflow-hidden rounded-2xl border bg-card p-[30px] shadow-sm">
        <div className="pointer-events-none absolute -top-[140px] right-[-90px] size-[340px] rounded-full bg-[radial-gradient(circle,rgba(43,127,255,.10),transparent_70%)]" />
        <div className="relative flex items-center gap-5">
          <div className="grid size-[74px] shrink-0 place-items-center rounded-[19px] bg-white shadow-[0_30px_60px_-20px_rgba(43,127,255,0.25),0_4px_14px_rgba(0,0,0,0.08)]">
            <img src={logoSrc} className="size-14" alt="" />
          </div>
          <div>
            <div className="font-mono text-[22px] font-semibold tracking-[-0.02em]">
              adt<span className="text-brand-600">/</span>studio
            </div>
            <div className="mt-[5px] text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
              <Trans>Accessible digital textbook</Trans>
            </div>
            <div className="mt-2 flex items-center gap-2">
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
          <Button variant="outline" size="sm" className="ml-auto shrink-0" onClick={openUpdateDialog}>
            <RotateCcw className="size-3.5" />
            <Trans>Check for updates</Trans>
          </Button>
        </div>
      </div>
      <div className={cn(CARD, "relative overflow-hidden")}>
        <div aria-disabled className="pointer-events-none select-none opacity-50">
          <SettingRow title={<Trans>Books folder</Trans>} subtitle={<Trans>Where book projects live on this machine.</Trans>}>
            <Button variant="outline" size="sm" disabled>
              <Folder className="size-3.5" />
              <Trans>~/ADT/Books</Trans>
            </Button>
          </SettingRow>
          <SettingRow title={<Trans>Diagnostics</Trans>} subtitle={<Trans>Logs help us debug pipeline failures.</Trans>}>
            <Button variant="outline" size="sm" disabled>
              <FileDown className="size-3.5" />
              <Trans>Export logs</Trans>
            </Button>
          </SettingRow>
        </div>
        <div className="absolute inset-0 z-10 grid place-items-center bg-background/35">
          <Badge variant="outline" className="gap-1.5 bg-card px-3 py-1.5 text-[11.5px] font-semibold shadow-sm">
            <Hourglass className="size-3.5 text-muted-foreground" />
            <Trans>Coming soon</Trans>
          </Badge>
        </div>
      </div>
    </>
  )
}
