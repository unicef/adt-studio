import { Trans, useLingui } from "@lingui/react/macro"
import {
  GitBranch,
  GitCommitHorizontal,
  GitCompareArrows,
  GitPullRequest,
} from "lucide-react"
import type { ReactNode } from "react"

interface ReleaseSourceCardProps {
  source: ElectronReleaseSource
}

function isGitHubUrl(href: string): boolean {
  return href.startsWith("https://github.com/")
}

function ExternalLink({
  href,
  label,
  children,
}: {
  href: string
  label: string
  children: ReactNode
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
      className="rounded-sm font-medium text-primary underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children}
    </a>
  )
}

export function ReleaseSourceCard({ source }: ReleaseSourceCardProps) {
  const { t } = useLingui()

  const commitRow = (commit: ElectronReleaseSourceCommit, label: ReactNode) => {
    const shortSha = commit.sha.slice(0, 7)
    return (
      <div className="flex min-w-0 items-start gap-2.5">
        <GitCommitHorizontal
          className="mt-0.5 size-4 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
        <div className="flex min-w-0 items-baseline gap-2 text-sm">
          <span className="shrink-0">
            <span className="text-muted-foreground">{label}: </span>
            <ExternalLink href={commit.url} label={t`Open commit ${shortSha}`}>
              <span className="font-mono text-xs">{shortSha}</span>
            </ExternalLink>
          </span>
          {commit.subject && (
            <span
              className="truncate text-muted-foreground"
              title={commit.subject}
            >
              {commit.subject}
            </span>
          )}
        </div>
      </div>
    )
  }

  return (
    <section className="mb-5 rounded-lg border bg-muted/30 px-4 py-3">
      <h3 className="mb-3 text-balance text-sm font-semibold">
        <Trans>Source</Trans>
      </h3>

      <div className="space-y-3">
        {source.prs.map((pr) => {
          const refs =
            pr.headRef && pr.baseRef
              ? `${pr.headRef} → ${pr.baseRef}`
              : undefined
          return (
            <div key={pr.number} className="flex min-w-0 items-start gap-2.5">
              <GitPullRequest
                className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <div className="min-w-0 text-sm">
                <ExternalLink
                  href={pr.url}
                  label={t`Open pull request ${pr.number}`}
                >
                  #{pr.number}
                  {pr.title ? ` · ${pr.title}` : ""}
                </ExternalLink>
                {(refs || pr.author) && (
                  <div className="mt-1 flex items-start gap-1.5 text-xs text-muted-foreground">
                    <GitBranch
                      className="mt-px size-3.5 shrink-0"
                      aria-hidden="true"
                    />
                    <span className="text-pretty">
                      {refs}
                      {refs && pr.author ? " · " : ""}
                      {pr.author ? `@${pr.author}` : ""}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )
        })}

        {source.prs.length === 0 && source.branch && (
          <div className="flex items-center gap-2.5 text-sm">
            <GitBranch
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <span className="text-muted-foreground">
              <Trans>Branch</Trans>: {source.branch}
            </span>
          </div>
        )}

        {source.buildCommit &&
          commitRow(source.buildCommit, <Trans>Built from</Trans>)}
        {source.changeCommit &&
          source.changeCommit.sha !== source.buildCommit?.sha &&
          commitRow(source.changeCommit, <Trans>Last change</Trans>)}

        {source.compare && (
          <div className="flex items-center gap-2.5 text-sm">
            <GitCompareArrows
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <ExternalLink href={source.compare.url} label={t`Open comparison`}>
              <Trans>View all changes</Trans>
            </ExternalLink>
          </div>
        )}
      </div>
    </section>
  )
}
