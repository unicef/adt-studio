import { Trans } from "@lingui/react/macro"
import { AlertTriangle, ImageOff } from "lucide-react"

export function EditorSkeleton() {
  return (
    <div
      role="status"
      aria-busy
      className="flex min-h-0 w-full flex-1 flex-col motion-safe:animate-pulse"
    >
      <span className="sr-only">
        <Trans>Loading the page HTML…</Trans>
      </span>
      <div className="h-12 shrink-0 border-b bg-card" />
      <div className="m-6 flex-1 rounded-lg bg-muted" />
    </div>
  )
}

function Notice({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center text-muted-foreground">
      {icon}
      <span className="max-w-sm text-[12.5px] leading-relaxed text-pretty">{children}</span>
    </div>
  )
}

export function EditorError({ message }: { message?: string }) {
  return (
    <Notice icon={<AlertTriangle className="size-5" />}>
      <Trans>The page HTML could not be loaded.</Trans> {message}
    </Notice>
  )
}

export function EditorEmpty() {
  return (
    <Notice icon={<ImageOff className="size-5" />}>
      <Trans>This page has no rendered sections to edit yet.</Trans>
    </Notice>
  )
}
