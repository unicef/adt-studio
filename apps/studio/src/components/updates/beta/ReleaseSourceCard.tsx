import { Trans, useLingui } from "@lingui/react/macro"
import {
  GitBranch,
  GitCommitHorizontal,
  GitCompareArrows,
  GitPullRequest,
} from "lucide-react"
import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

interface ReleaseSourceCardProps {
  source?: ElectronReleaseSource
  className?: string
}

function isGitHubUrl(href: string): boolean {
  return href.startsWith("https://github.com/")
}

function ExternalLink({
  href,
  label,
  children,
  className,
}: {
  href: string
  label: string
  children: ReactNode
  className?: string
}) {
  if (!isGitHubUrl(href)) return <span>{children}</span>
  return (
    <a
      href={href}
      aria-label={label}
      onClick={(event) => {
        event.preventDefault()
        window.open(href, "_blank", "noopener,noreferrer")
      }}
      className={cn(
        "rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      {children}
    </a>
  )
}

export function ReleaseSourceCard({
  source,
  className,
}: ReleaseSourceCardProps) {
  const { t } = useLingui()
  const targetBranch = source?.prs.find((pr) => pr.baseRef)?.baseRef

  return (
    <aside
      className={cn(
        "min-h-0 overflow-auto rounded-lg border bg-card p-4 shadow-none",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-balance text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          <Trans>Source</Trans>
        </h3>
        {source?.compare && (
          <ExternalLink
            href={source.compare.url}
            label={t`Open comparison`}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-primary transition-colors hover:text-primary/80"
          >
            <GitCompareArrows className="size-3.5" aria-hidden="true" />
            <Trans>Compare</Trans>
          </ExternalLink>
        )}
      </div>

      {!source ? (
        <p className="mt-4 text-pretty text-sm text-muted-foreground">
          <Trans>No source information was provided for this version.</Trans>
        </p>
      ) : (
        <>
          <dl className="mt-3 space-y-2 text-xs">
            {source.buildCommit && (
              <SourceMetadata label={<Trans>Build commit</Trans>}>
                <ExternalLink
                  href={source.buildCommit.url}
                  label={t`Open commit ${source.buildCommit.sha.slice(0, 7)}`}
                  className="inline-flex items-center gap-1 font-mono text-primary hover:underline"
                >
                  <GitCommitHorizontal className="size-3.5" aria-hidden="true" />
                  {source.buildCommit.sha.slice(0, 7)}
                </ExternalLink>
              </SourceMetadata>
            )}
            {source.branch && (
              <SourceMetadata label={<Trans>Branch</Trans>}>
                <span className="font-mono text-[11px]">{source.branch}</span>
              </SourceMetadata>
            )}
            {targetBranch && (
              <SourceMetadata label={<Trans>Target</Trans>}>
                <span className="font-mono text-[11px]">{targetBranch}</span>
              </SourceMetadata>
            )}
            {source.changeCommit &&
              source.changeCommit.sha !== source.buildCommit?.sha && (
                <SourceMetadata label={<Trans>Last change</Trans>}>
                  <ExternalLink
                    href={source.changeCommit.url}
                    label={t`Open commit ${source.changeCommit.sha.slice(0, 7)}`}
                    className="font-mono text-[11px] text-primary hover:underline"
                  >
                    {source.changeCommit.sha.slice(0, 7)}
                  </ExternalLink>
                </SourceMetadata>
              )}
          </dl>

          <div className="mt-5 flex items-center justify-between gap-2">
            <h4 className="text-balance text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              <Trans>Pull requests</Trans>
            </h4>
            <span className="text-xs text-muted-foreground">
              {source.prs.length}
            </span>
          </div>

          {source.prs.length > 0 ? (
            <div className="mt-2 space-y-2">
              {source.prs.map((pr) => (
                <PullRequestCard key={pr.number} pullRequest={pr} />
              ))}
            </div>
          ) : (
            <p className="mt-2 text-pretty text-xs text-muted-foreground">
              <Trans>No pull requests are associated with this release.</Trans>
            </p>
          )}
        </>
      )}
    </aside>
  )
}

function SourceMetadata({
  label,
  children,
}: {
  label: ReactNode
  children: ReactNode
}) {
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-right text-foreground">{children}</dd>
    </div>
  )
}

function PullRequestCard({
  pullRequest,
}: {
  pullRequest: ElectronReleaseSourcePullRequest
}) {
  const { t } = useLingui()

  return (
    <article className="rounded-lg border bg-secondary p-3 shadow-none">
      <div className="flex items-start gap-2">
        <GitPullRequest
          className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
        <div className="min-w-0">
          <ExternalLink
            href={pullRequest.url}
            label={t`Open pull request ${pullRequest.number}`}
            className="group block text-pretty text-xs font-medium leading-5"
          >
            <span className="text-primary underline decoration-primary/30 underline-offset-2 group-hover:decoration-primary">
              #{pullRequest.number}
            </span>
            {pullRequest.title && (
              <span className="text-foreground"> · {pullRequest.title}</span>
            )}
          </ExternalLink>

          {(pullRequest.author || pullRequest.headRef || pullRequest.baseRef) && (
            <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
              {pullRequest.author && <span>@{pullRequest.author}</span>}
              {pullRequest.author &&
                (pullRequest.headRef || pullRequest.baseRef) && (
                  <span aria-hidden>·</span>
                )}
              {(pullRequest.headRef || pullRequest.baseRef) && (
                <span className="inline-flex min-w-0 items-center gap-1 font-mono">
                  <GitBranch className="size-3 shrink-0" aria-hidden="true" />
                  <span className="truncate">
                    {pullRequest.headRef}
                    {pullRequest.headRef && pullRequest.baseRef && " → "}
                    {pullRequest.baseRef}
                  </span>
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </article>
  )
}
