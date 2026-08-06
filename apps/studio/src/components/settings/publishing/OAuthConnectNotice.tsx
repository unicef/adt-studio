import type { ReactNode } from "react"
import { Trans } from "@lingui/react/macro"
import { Clock, Cloud, Unplug, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { CloudflareOAuthErrorCode } from "@/api/client"

function ScenePanel({ children }: { children: ReactNode }) {
  return <div className="flex items-center justify-center">{children}</div>
}

/** The Allow dialog as the reviewer last saw it, with Deny taken — the most
 *  literal possible answer to "what went wrong". */
function SceneDenied() {
  return (
    <ScenePanel>
      <div className="flex w-56 flex-col gap-2 rounded-lg border bg-white p-3.5 shadow-lg">
        <div className="flex items-center gap-1.5">
          <Cloud className="size-4.5 shrink-0" style={{ color: "#f6821f" }} aria-hidden="true" />
          <span className="text-[11px] font-semibold leading-4 text-zinc-700">
            <Trans>Wrangler</Trans>
          </span>
        </div>
        <span className="h-2 w-full rounded-full bg-zinc-100" />
        <span className="h-2 w-4/5 rounded-full bg-zinc-100" />
        <div className="mt-1 flex items-center justify-end gap-1.5">
          <span className="rounded bg-rose-600 px-2 py-1 text-[10px] font-semibold leading-3 text-white ring-2 ring-rose-200">
            <Trans>Deny</Trans>
          </span>
          <span className="rounded border px-2.5 py-1 text-[10px] leading-3 text-zinc-400">
            <Trans>Allow</Trans>
          </span>
        </div>
      </div>
    </ScenePanel>
  )
}

/** The login could not travel back from the browser to the Studio. */
function SceneInterrupted({ icon }: { icon: ReactNode }) {
  return (
    <ScenePanel>
      <div className="flex items-center gap-2">
        <div className="flex w-28 flex-col gap-1.5 rounded-lg border bg-white p-2.5 shadow-md">
          <span className="flex items-center gap-1">
            <Cloud className="size-3 shrink-0" style={{ color: "#f6821f" }} aria-hidden="true" />
            <span className="h-1.5 flex-1 rounded-full bg-zinc-200" />
          </span>
          <span className="h-1.5 w-3/4 rounded-full bg-zinc-100" />
          <span className="h-1.5 w-2/3 rounded-full bg-zinc-100" />
        </div>

        <div className="flex items-center gap-1">
          <span className="h-px w-4 bg-zinc-300" />
          <span className="flex size-6 items-center justify-center rounded-full bg-rose-100 text-rose-600 ring-2 ring-white">
            {icon}
          </span>
          <span className="h-px w-4 border-t border-dashed border-zinc-300" />
        </div>

        <div className="flex w-28 flex-col gap-1.5 rounded-lg border bg-white p-2.5 shadow-md">
          <span className="flex items-center gap-1">
            <span className="size-3 shrink-0 rounded bg-indigo-600" />
            <span className="h-1.5 flex-1 rounded-full bg-zinc-200" />
          </span>
          <span className="h-1.5 w-3/4 rounded-full bg-zinc-100" />
          <span className="h-1.5 w-1/2 rounded-full bg-zinc-100" />
        </div>
      </div>
    </ScenePanel>
  )
}

function explain(code: CloudflareOAuthErrorCode | "unknown" | null): {
  scene: ReactNode
  title: ReactNode
  body: ReactNode
  showRemoteHint: boolean
} {
  switch (code) {
    case "oauth_denied":
      return {
        scene: <SceneDenied />,
        title: <Trans>Access was not granted</Trans>,
        body: (
          <Trans>
            Nothing was connected. Try again and choose <strong>Allow</strong> on the Cloudflare
            page.
          </Trans>
        ),
        showRemoteHint: false,
      }
    case "oauth_port_busy":
      return {
        scene: <SceneInterrupted icon={<Unplug className="size-3.5" aria-hidden="true" />} />,
        title: <Trans>The login couldn't come back to the Studio</Trans>,
        body: (
          <Trans>
            Another program on this computer is already signing in to Cloudflare. Close it and try
            again.
          </Trans>
        ),
        showRemoteHint: true,
      }
    case "oauth_flow_pending":
      return {
        scene: <SceneInterrupted icon={<Clock className="size-3.5" aria-hidden="true" />} />,
        title: <Trans>A login is already open</Trans>,
        body: (
          <Trans>
            Finish the Cloudflare login already open in your browser, or wait a moment and try
            again.
          </Trans>
        ),
        showRemoteHint: false,
      }
    case "oauth_expired":
      return {
        scene: <SceneInterrupted icon={<Clock className="size-3.5" aria-hidden="true" />} />,
        title: <Trans>The login took too long</Trans>,
        body: <Trans>It was cancelled for safety. Try again — it usually takes a few seconds.</Trans>,
        showRemoteHint: true,
      }
    case "oauth_no_accounts":
      return {
        scene: <SceneInterrupted icon={<X className="size-3.5" aria-hidden="true" />} />,
        title: <Trans>No Cloudflare account to publish into</Trans>,
        body: (
          <Trans>
            This login has no account the Studio can use. Create an account in Cloudflare, then
            connect again.
          </Trans>
        ),
        showRemoteHint: false,
      }
    default:
      return {
        scene: <SceneInterrupted icon={<Unplug className="size-3.5" aria-hidden="true" />} />,
        title: <Trans>We couldn't connect to Cloudflare</Trans>,
        body: <Trans>The login could not be finished. Try again, or use an API token instead.</Trans>,
        showRemoteHint: true,
      }
  }
}

interface OAuthErrorNoticeProps {
  code: CloudflareOAuthErrorCode | "unknown" | null
  detail: string | null
  onRetry: () => void
}

export function OAuthErrorNotice({
  code,
  detail,
  onRetry,
}: OAuthErrorNoticeProps) {
  const { scene, title, body, showRemoteHint } = explain(code)

  return (
    <div
      data-testid={`oauth-error-${code ?? "unknown"}`}
      className="flex flex-1 flex-col items-center justify-center gap-6 py-4 text-center motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-300 mh:gap-4 mh:py-0"
    >
      {scene}

      <div className="flex max-w-md flex-col gap-2">
        <h3 className="text-lg font-semibold tracking-tight text-foreground mh:text-base">
          {title}
        </h3>
        <p className="text-sm leading-6 text-muted-foreground">{body}</p>
        {showRemoteHint && (
          <p className="text-sm leading-6 text-muted-foreground">
            <Trans>
              Signing in only works when ADT Studio and your browser run on the same computer.
            </Trans>
          </p>
        )}
        {detail && <p className="text-xs leading-5 text-muted-foreground/80">{detail}</p>}
      </div>

      <Button onClick={onRetry}>
        <Trans>Try again</Trans>
      </Button>
    </div>
  )
}
