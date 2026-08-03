import { useCallback, useEffect, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Trans, useLingui } from "@lingui/react/macro"
import {
  Check,
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  ChevronDown,
  Circle,
  ExternalLink,
  Eye,
  FileText,
  GitBranch,
  GitCommitHorizontal,
  Github,
  KeyRound,
  LoaderCircle,
  RotateCcw,
  Rocket,
  ScanSearch,
  Settings2,
  X,
} from "lucide-react"
import type {
  GitHubConnectionType,
  GitHubFileDiffType,
  GitHubPublishStateType,
  GitHubPublishStepType,
} from "@adt/types"
import { api } from "@/api/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { toast } from "@/components/ui/sonner"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"

const TOKEN_STORAGE_KEY = "adt.github.token.v1"
const AUTO_SYNC_STORAGE_KEY = "adt.github.auto-sync.v1"
const REPOSITORY_STORAGE_KEY = "adt.github.repository.v1"
const OWNER_STORAGE_KEY = "adt.github.owner.v1"

function scopedStorageKey(key: string, bookLabel: string): string {
  return `${key}:${bookLabel}`
}

function readSessionToken(): string {
  if (typeof window === "undefined") return ""
  return window.localStorage.getItem(TOKEN_STORAGE_KEY) ?? ""
}

function readAutoSyncPreference(): boolean {
  if (typeof window === "undefined") return false
  const saved = window.localStorage.getItem(AUTO_SYNC_STORAGE_KEY)
  return saved === null ? true : saved === "true"
}

function defaultRepositoryName(bookLabel: string): string {
  return bookLabel.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "")
}

function StepIcon({ status }: { status: GitHubPublishStepType["status"] }) {
  if (status === "running") return <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
  if (status === "completed") return <Check className="h-4 w-4" aria-hidden="true" />
  if (status === "failed") return <X className="h-4 w-4" aria-hidden="true" />
  return <Circle className="h-3.5 w-3.5" aria-hidden="true" />
}

const WORKFLOW_STEP_NAMES: GitHubPublishStepType["name"][] = [
  "connect",
  "detect-changes",
  "package-book",
  "commit",
  "push",
  "enable-pages",
  "verify",
]

function formatCommitDate(value: string | undefined): string {
  if (!value) return "—"
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
}

function formatStepDuration(step: GitHubPublishStepType): string | null {
  if (!step.startedAt) return null
  const end = step.completedAt ? new Date(step.completedAt).getTime() : Date.now()
  const seconds = Math.max(0, Math.round((end - new Date(step.startedAt).getTime()) / 1000))
  if (!Number.isFinite(seconds)) return null
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`
}

function GitHistoryGraph({
  bookLabel,
  state,
  changes,
  connection,
  isLoading,
}: {
  bookLabel: string
  state: GitHubPublishStateType | null | undefined
  changes: GitHubPublishStateType["changes"] | undefined
  connection: GitHubConnectionType | null
  isLoading: boolean
}) {
  const { t } = useLingui()
  // The Changes pane represents only Git's current working tree. Deployment
  // history belongs to the workflow state and must never masquerade as edits.
  const currentChanges = changes ?? []
  const [selectedPath, setSelectedPath] = useState<string | null>(currentChanges[0]?.path ?? null)
  const selectedChange = currentChanges.find((change) => change.path === selectedPath) ?? currentChanges[0]
  useEffect(() => {
    if (!selectedChange) setSelectedPath(null)
    else if (selectedPath !== selectedChange.path) setSelectedPath(selectedChange.path)
  }, [selectedChange, selectedPath])
  const diffQuery = useQuery({
    queryKey: ["github-publishing-diff", bookLabel, selectedChange?.path],
    queryFn: () => api.getGitHubFileDiff(bookLabel, selectedChange!.path),
    enabled: Boolean(selectedChange),
  })
  const statusLabel = state?.status === "completed"
    ? t`Published`
    : state?.status === "running"
      ? t`Publishing`
      : state?.status === "failed"
        ? t`Failed`
        : t`Local changes`

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-background shadow-sm">
      <div className="flex min-h-12 items-center justify-between gap-3 border-b border-border bg-muted/30 px-4 py-2.5">
        <div className="inline-flex min-w-0 items-center gap-2 text-xs">
          {connection ? <img src={connection.avatarUrl} alt="" className="h-6 w-6 shrink-0 rounded-full border border-border object-cover" /> : <Github className="h-4 w-4 shrink-0" aria-hidden="true" />}
          <span className="text-muted-foreground"><Trans>Current repository:</Trans></span>
          <span className="truncate font-semibold">{state?.owner && state.repository ? `${state.owner}/${state.repository}` : t`Local book workspace`}</span>
          {connection ? <span className="hidden truncate text-muted-foreground sm:inline">· @{connection.login}</span> : null}
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${state?.status === "completed" ? "bg-emerald-100 text-emerald-800" : state?.status === "failed" ? "bg-red-100 text-red-800" : state?.status === "running" ? "bg-indigo-100 text-indigo-800" : "bg-amber-100 text-amber-800"}`}>
          {state?.status === "running" ? <LoaderCircle className="mr-1.5 inline h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
          {statusLabel}
        </span>
      </div>
      <div className="grid min-h-[32rem] md:grid-cols-[17rem_minmax(0,1fr)]">
        <aside className="flex min-h-0 flex-col border-b border-border bg-muted/10 md:border-b-0 md:border-r">
          <div className="flex items-center justify-between border-b border-border px-3 py-3">
            <p className="text-xs font-semibold"><Trans>Changes</Trans></p>
            {isLoading ? <span className="h-4 w-7 animate-pulse rounded-full bg-muted" aria-hidden="true" /> : <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold">{currentChanges.length}</span>}
          </div>
          {isLoading ? (
            <div className="flex-1 space-y-1 p-2" aria-label={t`Loading changed book files`}>
              {Array.from({ length: 9 }, (_, index) => (
                <div key={index} className="flex h-8 items-center gap-2 rounded-md px-2.5">
                  <span className="h-3.5 w-3.5 animate-pulse rounded bg-muted" />
                  <span className={`h-3 animate-pulse rounded bg-muted ${index % 3 === 0 ? "w-4/5" : index % 3 === 1 ? "w-3/5" : "w-2/3"}`} />
                  <span className="ml-auto h-2.5 w-2.5 animate-pulse rounded-sm bg-muted" />
                </div>
              ))}
            </div>
          ) : currentChanges.length > 0 ? (
            <ul className="max-h-[25rem] flex-1 space-y-1 overflow-y-auto p-2" aria-label={t`Changed book files`}>
              {currentChanges.map((change) => (
                <li key={`${change.status}-${change.path}`}>
                  <button type="button" onClick={() => setSelectedPath(change.path)} className={`flex w-full min-w-0 items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs transition-colors ${selectedChange?.path === change.path ? "bg-indigo-50 text-indigo-950 ring-1 ring-indigo-200" : "hover:bg-muted"}`}>
                    <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate font-mono">{change.path}</span>
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-sm border ${change.status === "added" ? "border-emerald-600 bg-emerald-100" : change.status === "deleted" ? "border-red-600 bg-red-100" : "border-amber-600 bg-amber-100"}`} aria-label={change.status} />
                  </button>
                </li>
              ))}
            </ul>
          ) : <p className="p-4 text-xs text-muted-foreground"><Trans>No unpublished file changes were detected.</Trans></p>}
          <div className="mt-auto space-y-2 border-t border-border p-3 text-xs">
            <div className="flex items-center justify-between"><span className="inline-flex items-center gap-1.5 font-medium"><GitBranch className="h-3.5 w-3.5" aria-hidden="true" />{state?.branch ?? "main"}</span><span className="text-muted-foreground">{state?.commitSha?.slice(0, 7) ?? t`Local`}</span></div>
            <div className="flex items-center gap-1.5 text-muted-foreground"><CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />{formatCommitDate(state?.completedAt ?? state?.startedAt)}</div>
          </div>
        </aside>

        <article className="flex min-w-0 flex-col bg-background">
          <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
            <div className="min-w-0"><p className="truncate font-mono text-xs font-semibold">{selectedChange?.path ?? t`No file selected`}</p><p className="mt-1 text-[11px] capitalize text-muted-foreground">{selectedChange?.status ?? t`No changes`}</p></div>
            <span className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-[10px] font-semibold"><GitCommitHorizontal className="h-3.5 w-3.5" aria-hidden="true" />{state?.commitSha?.slice(0, 8) ?? t`Working tree`}</span>
          </header>
          <div className="min-h-0 flex-1 p-5">
            {isLoading ? (
              <div className="relative min-h-[22rem] overflow-hidden rounded-lg border border-border" aria-label={t`Loading Git file preview`}>
                <div className="flex h-9 items-center justify-between border-b border-border bg-muted/30 px-3">
                  <span className="h-3 w-48 animate-pulse rounded bg-muted" />
                  <span className="h-3 w-14 animate-pulse rounded bg-muted" />
                </div>
                <div className="space-y-2 p-4 opacity-70">
                  {Array.from({ length: 11 }, (_, index) => <div key={index} className={`h-3 animate-pulse rounded bg-muted ${index % 4 === 0 ? "w-11/12" : index % 4 === 1 ? "w-4/5" : index % 4 === 2 ? "w-2/3" : "w-5/6"}`} />)}
                </div>
                <div className="absolute inset-0 flex items-center justify-center bg-background/55 backdrop-blur-[1px]">
                  <LoaderCircle className="h-7 w-7 animate-spin text-indigo-600" aria-hidden="true" />
                  <span className="sr-only"><Trans>Loading Git file preview</Trans></span>
                </div>
              </div>
            ) : selectedChange ? (
              <div className="overflow-hidden rounded-lg border border-border font-mono text-xs">
                <div className="flex items-center justify-between border-b border-border bg-muted/30 px-3 py-2 text-[11px]"><span>{selectedChange.path}</span><span className="capitalize text-muted-foreground">{selectedChange.status}</span></div>
                {diffQuery.isLoading ? <div className="flex min-h-40 items-center justify-center"><LoaderCircle className="h-5 w-5 animate-spin text-muted-foreground" aria-label={t`Loading file differences`} /></div>
                  : diffQuery.isError ? <p className="p-4 font-sans text-xs text-red-700">{diffQuery.error instanceof Error ? diffQuery.error.message : t`Unable to load file differences.`}</p>
                    : diffQuery.data?.binary ? <p className="p-4 font-sans text-xs text-muted-foreground"><Trans>Binary file changed. A line-by-line preview is not available.</Trans></p>
                      : <GitFileDiff diff={diffQuery.data} />}
              </div>
            ) : <div className="flex h-full min-h-48 items-center justify-center text-xs text-muted-foreground"><Trans>Select a changed file to inspect its publishing metadata.</Trans></div>}
          </div>
          <footer className="border-t border-border bg-muted/10 p-4">
            <p className="text-xs font-semibold">{state?.commitMessage || t`Publish book changes`}</p>
            <p className="mt-1 text-xs text-muted-foreground"><Trans>The final commit message can be reviewed in Configure before deployment.</Trans></p>
          </footer>
        </article>
      </div>
    </div>
  )
}

function GitFileDiff({ diff }: { diff: GitHubFileDiffType | undefined }) {
  if (!diff) return null
  return (
    <div className="max-h-[36rem] overflow-auto" role="table" aria-label={diff.path}>
      {diff.lines.map((line, index) => (
        <div key={`${line.type}-${line.oldLine ?? ""}-${line.newLine ?? ""}-${index}`} role="row" className={`grid min-w-max grid-cols-[3.25rem_3.25rem_1.5rem_minmax(40rem,1fr)] border-b border-black/5 ${line.type === "added" ? "bg-emerald-50 text-emerald-950" : line.type === "deleted" ? "bg-red-50 text-red-950" : "bg-background"}`}>
          <span role="cell" className="select-none border-r px-2 py-0.5 text-right text-muted-foreground">{line.oldLine ?? ""}</span>
          <span role="cell" className="select-none border-r px-2 py-0.5 text-right text-muted-foreground">{line.newLine ?? ""}</span>
          <span role="cell" className={`select-none px-1 py-0.5 text-center font-semibold ${line.type === "added" ? "text-emerald-700" : line.type === "deleted" ? "text-red-700" : "text-muted-foreground"}`}>{line.type === "added" ? "+" : line.type === "deleted" ? "−" : ""}</span>
          <code role="cell" className="whitespace-pre px-1 py-0.5">{line.content || " "}</code>
        </div>
      ))}
      {diff.truncated ? <p className="border-t bg-amber-50 px-3 py-2 font-sans text-xs text-amber-900"><Trans>This large diff is truncated after 5,000 lines.</Trans></p> : null}
    </div>
  )
}

function deploymentDuration(deployment: GitHubPublishStateType): string {
  if (!deployment.completedAt && deployment.status !== "running") return "—"
  const end = deployment.completedAt ? new Date(deployment.completedAt).getTime() : Date.now()
  const seconds = Math.max(0, Math.round((end - new Date(deployment.startedAt).getTime()) / 1000))
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`
}

function DeploymentFileAccordion({ bookLabel, deployment, file }: {
  bookLabel: string
  deployment: GitHubPublishStateType
  file: GitHubPublishStateType["changes"][number]
}) {
  const { t } = useLingui()
  const [open, setOpen] = useState(false)
  const diffQuery = useQuery({
    queryKey: ["github-deployment-diff", bookLabel, deployment.id, file.path],
    queryFn: () => api.getGitHubDeploymentFileDiff(bookLabel, deployment.id, file.path),
    enabled: open,
  })
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-background">
      <button
        type="button"
        className="flex w-full items-center gap-3 px-4 py-3 text-left text-xs transition-colors hover:bg-muted/50"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate font-mono font-medium">{file.path}</span>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${file.status === "added" ? "bg-emerald-100 text-emerald-800" : file.status === "deleted" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`}>{file.status}</span>
      </button>
      {open ? (
        <div className="border-t border-border">
          {diffQuery.isLoading ? <div className="flex min-h-32 items-center justify-center"><LoaderCircle className="h-5 w-5 animate-spin" aria-label={t`Loading deployed file differences`} /></div>
            : diffQuery.isError ? <p className="p-4 text-xs text-red-700">{diffQuery.error instanceof Error ? diffQuery.error.message : t`Unable to load deployed file differences.`}</p>
              : diffQuery.data?.binary ? <p className="p-4 text-xs text-muted-foreground"><Trans>Binary file changed. A line-by-line preview is not available.</Trans></p>
                : <GitFileDiff diff={diffQuery.data} />}
        </div>
      ) : null}
    </div>
  )
}

function DeploymentInspector({ bookLabel, deployment, onBack }: {
  bookLabel: string
  deployment: GitHubPublishStateType
  onBack: () => void
}) {
  return (
    <div className="motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-right-3 motion-safe:duration-300">
      <Button type="button" variant="ghost" size="sm" className="mb-3" onClick={onBack}>
        <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" /><Trans>Back to deployments</Trans>
      </Button>
      <div className="rounded-xl border border-border bg-background">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-5">
          <div>
            <h3 className="text-sm font-semibold">{deployment.commitMessage || <Trans>Book deployment</Trans>}</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              <Trans>Deployed files and the exact changes included in this publishing run.</Trans>
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className={`rounded-full px-2.5 py-1 font-semibold capitalize ${deployment.status === "completed" ? "bg-emerald-100 text-emerald-800" : deployment.status === "failed" ? "bg-red-100 text-red-800" : "bg-indigo-100 text-indigo-800"}`}>{deployment.status}</span>
            <span className="rounded-md border border-border px-2.5 py-1 font-mono">{deployment.commitSha?.slice(0, 7) ?? "—"}</span>
          </div>
        </header>
        <div className="grid gap-3 border-b border-border bg-muted/20 p-4 text-xs sm:grid-cols-4">
          <div><p className="text-muted-foreground"><Trans>Created</Trans></p><p className="mt-1 font-medium">{formatCommitDate(deployment.startedAt)}</p></div>
          <div><p className="text-muted-foreground"><Trans>Duration</Trans></p><p className="mt-1 font-medium">{deploymentDuration(deployment)}</p></div>
          <div><p className="text-muted-foreground"><Trans>Branch</Trans></p><p className="mt-1 font-mono font-medium">{deployment.branch}</p></div>
          <div><p className="text-muted-foreground"><Trans>Files</Trans></p><p className="mt-1 font-medium">{deployment.changes.length}</p></div>
        </div>
        {deployment.status === "failed" ? (
          <div className="border-b border-red-200 bg-red-50 p-4 text-xs text-red-900" role="alert">
            <p className="font-semibold"><Trans>GitHub deployment failed</Trans></p>
            <p className="mt-1 break-words">{deployment.error || <Trans>GitHub did not provide a build error message.</Trans>}</p>
          </div>
        ) : null}
        {deployment.status === "running" ? (
          <div className="border-b border-border p-4">
            <h4 className="mb-3 text-xs font-semibold"><Trans>Live deployment progress</Trans></h4>
            <DeploymentWorkflow state={deployment} />
          </div>
        ) : null}
        <div className="max-h-[70vh] space-y-2 overflow-y-auto p-4">
          {deployment.changes.length > 0 ? deployment.changes.map((file) => (
            <DeploymentFileAccordion key={`${deployment.id}-${file.path}`} bookLabel={bookLabel} deployment={deployment} file={file} />
          )) : <p className="py-8 text-center text-xs text-muted-foreground"><Trans>No file changes were recorded for this deployment.</Trans></p>}
        </div>
      </div>
    </div>
  )
}

function DeploymentsTable({ deployments, connection, onInspect, isLoading }: {
  deployments: GitHubPublishStateType[]
  connection: GitHubConnectionType | null
  onInspect: (deployment: GitHubPublishStateType) => void
  isLoading: boolean
}) {
  const pageSize = 10
  const [page, setPage] = useState(1)
  const pageCount = Math.max(1, Math.ceil(deployments.length / pageSize))
  const visibleDeployments = deployments.slice((page - 1) * pageSize, page * pageSize)

  useEffect(() => {
    setPage((current) => Math.min(current, pageCount))
  }, [pageCount])

  return (
    <div className="rounded-xl border border-border bg-background">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[58rem] text-left text-xs">
        <thead className="border-b border-border bg-muted/30 text-muted-foreground">
          <tr>
            <th className="px-4 py-3 font-medium"><Trans>Deployment</Trans></th>
            <th className="px-4 py-3 font-medium"><Trans>Status</Trans></th>
            <th className="px-4 py-3 font-medium"><Trans>Environment</Trans></th>
            <th className="px-4 py-3 font-medium"><Trans>Commit</Trans></th>
            <th className="px-4 py-3 font-medium"><Trans>Branch</Trans></th>
            <th className="px-4 py-3 font-medium"><Trans>Created</Trans></th>
            <th className="px-4 py-3 text-right font-medium"><span className="sr-only"><Trans>Actions</Trans></span></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {isLoading ? Array.from({ length: pageSize }, (_, index) => (
            <tr key={`deployment-skeleton-${index}`} className="h-[3.75rem]" aria-hidden="true">
              <td className="px-4 py-3"><div className="h-3 w-64 animate-pulse rounded bg-muted" /><div className="mt-2 h-2.5 w-16 animate-pulse rounded bg-muted" /></td>
              <td className="px-4 py-3"><div className="h-3 w-24 animate-pulse rounded bg-muted" /></td>
              <td className="px-4 py-3"><div className="h-6 w-20 animate-pulse rounded-full bg-muted" /></td>
              <td className="px-4 py-3"><div className="h-3 w-14 animate-pulse rounded bg-muted" /></td>
              <td className="px-4 py-3"><div className="h-3 w-12 animate-pulse rounded bg-muted" /></td>
              <td className="px-4 py-3"><div className="h-3 w-32 animate-pulse rounded bg-muted" /></td>
              <td className="px-4 py-3"><div className="ml-auto h-8 w-20 animate-pulse rounded-md bg-muted" /></td>
            </tr>
          )) : visibleDeployments.map((deployment) => (
            <tr key={deployment.id} className="transition-colors hover:bg-muted/20">
              <td className="max-w-[22rem] px-4 py-3"><p className="truncate font-medium">{deployment.commitMessage || <Trans>Book deployment</Trans>}</p><p className="mt-1 text-[11px] text-muted-foreground">{deployment.changes.length} <Trans>files</Trans></p></td>
              <td className="px-4 py-3"><span className="inline-flex items-center gap-1.5 capitalize"><span className={`h-2 w-2 rounded-full ${deployment.status === "completed" ? "bg-emerald-500" : deployment.status === "failed" ? "bg-red-500" : "bg-indigo-500"}`} />{deployment.status} <span className="text-muted-foreground">{deploymentDuration(deployment)}</span></span></td>
              <td className="px-4 py-3"><span className="rounded-full border border-border px-2 py-1 font-medium"><Trans>Production</Trans></span></td>
              <td className="px-4 py-3 font-mono">{deployment.commitSha?.slice(0, 7) ?? "—"}</td>
              <td className="px-4 py-3"><span className="inline-flex items-center gap-1.5"><GitBranch className="h-3.5 w-3.5" aria-hidden="true" />{deployment.branch}</span></td>
              <td className="px-4 py-3"><span className="inline-flex items-center gap-2">{connection ? <img src={connection.avatarUrl} alt="" className="h-5 w-5 rounded-full" /> : null}{formatCommitDate(deployment.startedAt)}</span></td>
              <td className="px-4 py-3 text-right"><Button type="button" size="sm" variant="outline" onClick={() => onInspect(deployment)}>{deployment.status === "running" ? <LoaderCircle className="mr-2 h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <ScanSearch className="mr-2 h-3.5 w-3.5" aria-hidden="true" />}<Trans>Inspect</Trans></Button></td>
            </tr>
          ))}
        </tbody>
        </table>
      </div>
      {!isLoading && deployments.length === 0 ? <p className="p-10 text-center text-xs text-muted-foreground"><Trans>No deployments have been recorded yet.</Trans></p> : null}
      {!isLoading && deployments.length > 0 ? (
        <div className="flex items-center justify-between border-t border-border px-4 py-3 text-xs text-muted-foreground">
          <p>
            <Trans>Page {page} of {pageCount}</Trans>
          </p>
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" variant="outline" disabled={page === 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>
              <ArrowLeft className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              <Trans>Previous</Trans>
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={page === pageCount} onClick={() => setPage((current) => Math.min(pageCount, current + 1))}>
              <Trans>Next</Trans>
              <ArrowRight className="ml-1.5 h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function DeploymentWorkflow({ state }: { state: GitHubPublishStateType | null | undefined }) {
  const { t } = useLingui()
  const labels: Record<GitHubPublishStepType["name"], string> = {
    connect: t`Connect`, "detect-changes": t`Detect changes`, "package-book": t`Package book`,
    commit: t`Commit`, push: t`Push`, "enable-pages": t`Enable Pages`, verify: t`Verify`,
  }
  const defaults: Record<GitHubPublishStepType["name"], string> = {
    connect: t`Authenticate securely with the configured GitHub account.`,
    "detect-changes": t`Compare the current book with the last published version.`,
    "package-book": t`Build the accessible web book and collect its assets.`,
    commit: t`Create a versioned Git commit describing the book changes.`,
    push: t`Upload the commit to the configured GitHub repository.`,
    "enable-pages": t`Configure GitHub Pages for the published book.`,
    verify: t`Confirm that the public book link is available and healthy.`,
  }
  const steps: GitHubPublishStepType[] = state?.steps ?? WORKFLOW_STEP_NAMES.map((name) => ({ name, status: "pending" }))
  const activeStep = steps.find((step) => step.status === "running") ?? steps.find((step) => step.status === "failed") ?? steps.find((step) => step.status === "pending") ?? steps.at(-1)
  const positions: Record<GitHubPublishStepType["name"], string> = {
    connect: "md:left-0 md:top-0",
    "detect-changes": "md:left-[36%] md:top-0",
    "package-book": "md:right-0 md:top-0",
    commit: "md:right-0 md:top-[9.5rem]",
    push: "md:left-[36%] md:top-[9.5rem]",
    "enable-pages": "md:left-0 md:top-[9.5rem]",
    verify: "md:left-[36%] md:top-[19rem]",
  }
  return (
    <div aria-live="polite">
      <div className="grid gap-3 rounded-xl border border-border bg-background p-4 text-xs sm:grid-cols-2 lg:grid-cols-4">
        <div><p className="text-muted-foreground"><Trans>Triggered</Trans></p><p className="mt-1 font-semibold">{formatCommitDate(state?.startedAt)}</p></div>
        <div><p className="text-muted-foreground"><Trans>Status</Trans></p><p className="mt-1 font-semibold capitalize">{state?.status ?? t`Ready`}</p></div>
        <div><p className="text-muted-foreground"><Trans>Branch</Trans></p><p className="mt-1 font-mono font-semibold">{state?.branch ?? "main"}</p></div>
        <div><p className="text-muted-foreground"><Trans>Commit</Trans></p><p className="mt-1 font-mono font-semibold">{state?.commitSha?.slice(0, 7) ?? "—"}</p></div>
      </div>
      <div className="mt-3 rounded-xl border border-border bg-muted/10 p-5">
        <div className="relative md:h-[25rem]">
          <svg className="pointer-events-none absolute inset-0 hidden h-full w-full md:block" viewBox="0 0 1000 400" preserveAspectRatio="none" aria-hidden="true">
            <path d="M280 48 H360 M640 48 H720 M860 96 V152 M720 200 H640 M360 200 H280 M140 248 V318 Q140 352 180 352 H360" fill="none" stroke="currentColor" strokeWidth="3" className="text-border" vectorEffect="non-scaling-stroke" />
            {["280,48", "360,48", "640,48", "720,48", "860,96", "860,152", "720,200", "640,200", "360,200", "280,200", "140,248", "360,352"].map((point) => {
              const [cx, cy] = point.split(",")
              return <circle key={point} cx={cx} cy={cy} r="6" fill="currentColor" className="text-muted-foreground" />
            })}
          </svg>
          <span className="absolute bottom-8 left-[1.35rem] top-8 w-0.5 bg-border md:hidden" aria-hidden="true" />
          <ol className="relative grid gap-4 md:block" aria-label={t`GitHub deployment progress`}>
            {steps.map((step) => (
              <li key={step.name} className={`md:absolute md:w-[28%] ${positions[step.name]}`}>
                <div className={`relative z-10 flex min-h-24 items-center gap-3 rounded-xl border px-4 py-4 transition-all duration-300 ${step.status === "running" ? "border-indigo-500 bg-indigo-50 shadow-[0_0_0_4px_rgba(99,102,241,0.12)]" : step.status === "completed" ? "border-emerald-400 bg-emerald-50" : step.status === "failed" ? "border-red-400 bg-red-50" : "border-border bg-background"}`}>
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${step.status === "running" ? "border-indigo-600 bg-indigo-600 text-white" : step.status === "completed" ? "border-emerald-600 bg-emerald-600 text-white" : step.status === "failed" ? "border-red-600 bg-red-600 text-white" : "border-muted-foreground/60 bg-background text-muted-foreground"}`}><StepIcon status={step.status} /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2"><p className="text-xs font-semibold leading-4">{labels[step.name]}</p><span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">{formatStepDuration(step)}</span></div>
                    <p className="mt-1 text-[10px] capitalize text-muted-foreground">{step.status}</p>
                    {step.detail && (step.status === "completed" || step.status === "failed") ? <p className="mt-1 max-h-12 overflow-y-auto break-words text-[10px] leading-4 text-muted-foreground">{step.detail}</p> : null}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
      {activeStep ? (
        <div className="mt-3 rounded-lg border border-border bg-background px-4 py-3">
          <p className="text-xs font-semibold">{labels[activeStep.name]}</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{activeStep.detail || defaults[activeStep.name]}</p>
        </div>
      ) : null}
    </div>
  )
}

function useWorkflowCompletionSound(state: GitHubPublishStateType | null | undefined) {
  const previousCompleted = useRef<Set<string> | null>(null)
  const previousFailed = useRef<Set<string> | null>(null)

  useEffect(() => {
    if (!state) return
    const completed = new Set(state.steps.filter((step) => step.status === "completed").map((step) => step.name))
    const failed = new Set(state.steps.filter((step) => step.status === "failed").map((step) => step.name))
    if (previousCompleted.current) {
      const newCompletions = [...completed].filter((name) => !previousCompleted.current?.has(name))
      newCompletions.forEach((_, index) => {
        try {
          const context = new AudioContext()
          const oscillator = context.createOscillator()
          const gain = context.createGain()
          const startAt = context.currentTime + index * 0.24
          oscillator.type = "sine"
          oscillator.frequency.setValueAtTime(660, startAt)
          oscillator.frequency.exponentialRampToValueAtTime(880, startAt + 0.12)
          gain.gain.setValueAtTime(0.0001, startAt)
          gain.gain.exponentialRampToValueAtTime(0.12, startAt + 0.02)
          gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.2)
          oscillator.connect(gain)
          gain.connect(context.destination)
          oscillator.start(startAt)
          oscillator.stop(startAt + 0.22)
          oscillator.addEventListener("ended", () => void context.close(), { once: true })
        } catch {
          // Audio feedback is an enhancement; publishing remains functional when unavailable.
        }
      })
    }
    if (previousFailed.current) {
      const hasNewFailure = [...failed].some((name) => !previousFailed.current?.has(name))
      if (hasNewFailure) {
        try {
          const context = new AudioContext()
          const oscillator = context.createOscillator()
          const gain = context.createGain()
          oscillator.type = "triangle"
          oscillator.frequency.setValueAtTime(320, context.currentTime)
          oscillator.frequency.exponentialRampToValueAtTime(180, context.currentTime + 0.3)
          gain.gain.setValueAtTime(0.1, context.currentTime)
          gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.35)
          oscillator.connect(gain)
          gain.connect(context.destination)
          oscillator.start()
          oscillator.stop(context.currentTime + 0.36)
          oscillator.addEventListener("ended", () => void context.close(), { once: true })
        } catch {
          // Audio feedback is an enhancement; publishing remains functional when unavailable.
        }
      }
    }
    previousCompleted.current = completed
    previousFailed.current = failed
  }, [state])
}

function PersonalAccessTokenGuide() {
  return (
    <Sheet>
      <p className="mt-3 text-xs text-muted-foreground">
        <Trans>Don't know how to get your token?</Trans>{" "}
        <SheetTrigger asChild>
          <button type="button" className="font-semibold text-indigo-700 underline-offset-4 transition-colors hover:text-indigo-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">
            <Trans>Learn</Trans>
          </button>
        </SheetTrigger>
      </p>

      <SheetContent side="right" className="w-[min(94vw,42rem)] overflow-y-auto sm:!max-w-2xl">
        <SheetHeader className="pr-8">
          <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
            <KeyRound className="h-5 w-5" aria-hidden="true" />
          </div>
          <SheetTitle>
            <Trans>How to configure a GitHub personal access token</Trans>
          </SheetTitle>
          <SheetDescription>
            <Trans>Follow one of these paths, then return to ADT Studio and paste the generated token into the connection field.</Trans>
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-5 text-sm leading-relaxed">
          <section className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4" aria-labelledby="classic-token-title">
            <span className="mb-2 inline-flex rounded-full bg-indigo-600 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
              <Trans>Easiest complete setup</Trans>
            </span>
            <h3 id="classic-token-title" className="font-semibold text-indigo-950">
              <Trans>Recommended for creating a new repository</Trans>
            </h3>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-indigo-950">
              <li><Trans>Open GitHub token settings and choose Generate new token (classic).</Trans></li>
              <li><Trans>Set a clear name and a short expiration date.</Trans></li>
              <li><Trans>Under Select scopes, enable repo. GitHub requires this classic scope for repository creation, pushing book files, and configuring GitHub Pages.</Trans></li>
              <li><Trans>Do not enable workflow, delete_repo, admin:org, packages, or user scopes. ADT Studio does not need them.</Trans></li>
              <li><Trans>Generate the token, copy it once, paste it below, and select Connect GitHub.</Trans></li>
            </ol>
            <div className="mt-3 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-xs text-indigo-950">
              <strong><Trans>Required classic scope:</Trans></strong>{" "}
              <code className="rounded bg-indigo-100 px-1.5 py-0.5 font-mono font-semibold">repo</code>
            </div>
            <a
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700"
              href="https://github.com/settings/tokens/new"
              target="_blank"
              rel="noreferrer"
            >
              <Trans>Open the classic token setup page</Trans>
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          </section>

          <section className="rounded-xl border border-border p-4" aria-labelledby="fine-grained-token-title">
            <h3 id="fine-grained-token-title" className="font-semibold">
              <Trans>Fine-grained token for an existing repository</Trans>
            </h3>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
              <li><Trans>Create the destination repository first, choose its Resource owner, then limit Repository access to that repository.</Trans></li>
              <li><Trans>Under Repository permissions, set Contents to Read and write so ADT can pull and push book files.</Trans></li>
              <li><Trans>Set Administration to Read and write so ADT can configure the repository and create the GitHub Pages site.</Trans></li>
              <li><Trans>Set Pages to Read and write so ADT can enable, inspect, and update the published site.</Trans></li>
              <li><Trans>Metadata remains Read-only automatically. No Actions, Workflows, Issues, Packages, or account permissions are required.</Trans></li>
              <li><Trans>If an organization owns the repository, its policy may require administrator approval before the token works.</Trans></li>
            </ol>
            <div className="mt-3 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs">
              <strong><Trans>Required fine-grained repository permissions:</Trans></strong>{" "}
              <Trans>Contents — Read and write; Administration — Read and write; Pages — Read and write; Metadata — Read-only.</Trans>
            </div>
            <a
              className="mt-4 inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3.5 py-2 text-xs font-semibold shadow-sm transition-colors hover:bg-muted"
              href="https://github.com/settings/personal-access-tokens/new"
              target="_blank"
              rel="noreferrer"
            >
              <Trans>Open the fine-grained token setup page</Trans>
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          </section>

          <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-950">
            <Trans>Security: use the shortest practical expiration, never share the token, and revoke it in GitHub when it is no longer needed. ADT Studio keeps this token locally on this device and does not store it in the book directory.</Trans>
          </p>
        </div>
      </SheetContent>
    </Sheet>
  )
}

export function GitHubPublisher({ bookLabel }: { bookLabel: string }) {
  const { t } = useLingui()
  const queryClient = useQueryClient()
  const [token, setToken] = useState(readSessionToken)
  const [connection, setConnection] = useState<GitHubConnectionType | null>(null)
  const [repository, setRepository] = useState(() => window.localStorage.getItem(scopedStorageKey(REPOSITORY_STORAGE_KEY, bookLabel)) ?? defaultRepositoryName(bookLabel))
  const [owner, setOwner] = useState(() => window.localStorage.getItem(scopedStorageKey(OWNER_STORAGE_KEY, bookLabel)) ?? "")
  const [commitMessage, setCommitMessage] = useState("")
  const [showPreview, setShowPreview] = useState(false)
  const [screen, setScreen] = useState<"workflow" | "configure" | "deploy">("workflow")
  const [landingTab, setLandingTab] = useState<"history" | "deployments">("history")
  const [inspectedDeployment, setInspectedDeployment] = useState<GitHubPublishStateType | null>(null)
  const [configurationStep, setConfigurationStep] = useState(0)
  const [autoSync, setAutoSync] = useState(readAutoSyncPreference)
  const [editorChoice, setEditorChoice] = useState<"vscode" | "cursor" | "system">("vscode")
  const [initialChangeCheckComplete, setInitialChangeCheckComplete] = useState(false)
  const [lastSynchronizedAt, setLastSynchronizedAt] = useState<Date | null>(null)
  const autoSyncAttempt = useRef<string | null>(null)
  const previousPublishStatus = useRef<GitHubPublishStateType["status"] | null>(null)

  const reconnectGitHub = useCallback(() => {
    window.localStorage.removeItem(TOKEN_STORAGE_KEY)
    setToken("")
    setConnection(null)
    setConfigurationStep(0)
    setScreen("configure")
    toast.info(t`Enter a new GitHub token to reconnect.`)
  }, [t])

  const statusQuery = useQuery({
    queryKey: ["github-publishing", bookLabel],
    queryFn: () => api.getGitHubPublishStatus(bookLabel),
    refetchInterval: (query) => query.state.data?.status === "running" ? 1_000 : false,
  })
  const deploymentsQuery = useQuery({
    queryKey: ["github-deployments", bookLabel],
    queryFn: () => api.getGitHubDeployments(bookLabel),
  })
  const changesQuery = useQuery({
    queryKey: ["github-publishing-changes", bookLabel],
    queryFn: () => api.getGitHubPublishChanges(bookLabel),
    // Keep the publishing view in step with edits saved either by Studio or
    // directly in an editor such as VS Code. Git remains the source of truth.
    refetchInterval: 3_000,
    refetchOnMount: "always",
  })
  const remoteStatusQuery = useQuery({
    queryKey: ["github-publishing-remote", bookLabel],
    queryFn: () => api.getGitHubRemoteStatus(bookLabel, token.trim()),
    enabled: Boolean(connection && statusQuery.data?.commitSha),
    refetchInterval: autoSync ? 30_000 : false,
  })

  const connectMutation = useMutation({
    mutationFn: () => api.connectGitHub(token.trim()),
    onMutate: () => toast.loading(t`Connecting to GitHub…`, { id: "github-connect" }),
    onSuccess: (result) => {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, token.trim())
      setConnection(result)
      setOwner((current) => current || result.login)
      setConfigurationStep(1)
      toast.success(t`Connected to GitHub as ${result.login}.`, { id: "github-connect" })
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : t`Unable to connect to GitHub.`, { id: "github-connect" }),
  })

  const publishMutation = useMutation({
    mutationFn: () => api.publishBookToGitHub(bookLabel, token.trim(), {
      repository: repository.trim(),
      owner: owner.trim() || undefined,
      visibility: "public",
      commitMessage: commitMessage.trim() || undefined,
    }),
    onMutate: () => toast.loading(t`Starting the GitHub deployment…`, { id: "github-publish" }),
    onSuccess: () => {
      window.localStorage.setItem(scopedStorageKey(REPOSITORY_STORAGE_KEY, bookLabel), repository.trim())
      window.localStorage.setItem(scopedStorageKey(OWNER_STORAGE_KEY, bookLabel), owner.trim() || connection?.login || "")
      void queryClient.invalidateQueries({ queryKey: ["github-publishing", bookLabel] })
      void queryClient.invalidateQueries({ queryKey: ["github-publishing-changes", bookLabel] })
      void queryClient.invalidateQueries({ queryKey: ["github-deployments", bookLabel] })
      toast.success(t`GitHub deployment started.`, { id: "github-publish" })
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : t`Unable to start the GitHub deployment.`, {
      id: "github-publish",
      action: { label: t`Reconnect`, onClick: reconnectGitHub },
    }),
  })

  useEffect(() => {
    if (token.trim() && !connection && connectMutation.isIdle) connectMutation.mutate()
  }, [connection, connectMutation, token])
  const pullMutation = useMutation({
    mutationFn: () => api.pullBookFromGitHub(bookLabel, token.trim()),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["github-publishing-changes", bookLabel] })
      void queryClient.invalidateQueries({ queryKey: ["github-publishing-remote", bookLabel] })
      setLastSynchronizedAt(new Date())
    },
  })
  const openEditorMutation = useMutation({
    mutationFn: () => api.openGitHubBookEditor(bookLabel, editorChoice),
    onSuccess: () => toast.success(t`Book worktree opened in the selected editor.`),
    onError: (error) => toast.error(error instanceof Error ? error.message : t`Unable to open the selected editor.`),
  })

  useEffect(() => {
    const remoteSha = remoteStatusQuery.data?.remoteCommitSha
    if (!autoSync || !remoteStatusQuery.data?.behind || remoteStatusQuery.data.conflict || !remoteSha || pullMutation.isPending) return
    if (autoSyncAttempt.current === remoteSha) return
    autoSyncAttempt.current = remoteSha
    pullMutation.mutate()
  }, [autoSync, pullMutation, remoteStatusQuery.data?.behind, remoteStatusQuery.data?.conflict, remoteStatusQuery.data?.remoteCommitSha])

  useEffect(() => {
    setInitialChangeCheckComplete(false)
  }, [bookLabel])

  useEffect(() => {
    if (!changesQuery.isFetching && (changesQuery.data !== undefined || changesQuery.isError)) {
      setInitialChangeCheckComplete(true)
    }
  }, [changesQuery.data, changesQuery.isError, changesQuery.isFetching])

  const state = statusQuery.data
  const isRunning = state?.status === "running"
  const hasSavedConfiguration = Boolean(token.trim() && repository.trim())
  const hasPublishingProfile = Boolean(state?.owner && state.repository)
  useWorkflowCompletionSound(state)

  useEffect(() => {
    if (!state) return
    if (previousPublishStatus.current === null) {
      previousPublishStatus.current = state.status
      return
    }
    if (previousPublishStatus.current === state.status) return
    if (state.status === "completed" || state.status === "failed") {
      void queryClient.invalidateQueries({ queryKey: ["github-deployments", bookLabel] })
      if (state.status === "completed") toast.success(t`Book published successfully.`, { id: "github-workflow-status" })
      else toast.error(state.error || t`GitHub deployment failed.`, {
        id: "github-workflow-status",
        action: { label: t`Reconnect`, onClick: reconnectGitHub },
      })
    }
    previousPublishStatus.current = state.status
  }, [bookLabel, queryClient, reconnectGitHub, state, t])

  const startPublishing = () => {
    publishMutation.mutate()
  }

  const rerunPublishing = () => {
    setScreen("deploy")
  }

  const updateAutoSync = (enabled: boolean) => {
    setAutoSync(enabled)
    window.localStorage.setItem(AUTO_SYNC_STORAGE_KEY, String(enabled))
  }

  const checkRemoteChanges = async () => {
    await remoteStatusQuery.refetch()
  }

  const synchronizationStatus = (() => {
    if (!initialChangeCheckComplete) return { tone: "muted", loading: true, message: t`Checking local book changes…` }
    if (pullMutation.isPending) return { tone: "muted", loading: true, message: t`Synchronizing changes from GitHub…` }
    if (remoteStatusQuery.isFetching) return { tone: "muted", loading: true, message: t`Checking GitHub for changes…` }
    if (pullMutation.isError) return {
      tone: "error",
      loading: false,
      message: pullMutation.error instanceof Error ? pullMutation.error.message : t`Unable to synchronize GitHub changes.`,
    }
    if (remoteStatusQuery.isError) return {
      tone: "error",
      loading: false,
      message: remoteStatusQuery.error instanceof Error ? remoteStatusQuery.error.message : t`Unable to check GitHub for changes.`,
    }
    if (!connection) return { tone: "muted", loading: false, message: t`Local changes checked. Connect GitHub to synchronize.` }
    if (!statusQuery.data?.commitSha) return { tone: "muted", loading: false, message: t`Local changes checked. The book is ready for its first deployment.` }
    if (remoteStatusQuery.data?.conflict) return { tone: "warning", loading: false, message: t`Synchronization paused: local and GitHub changes need resolution.` }
    if (remoteStatusQuery.data?.behind) return { tone: "warning", loading: false, message: t`GitHub has changes waiting to be synchronized.` }
    if (lastSynchronizedAt) return { tone: "success", loading: false, message: t`GitHub synchronized at ${lastSynchronizedAt.toLocaleTimeString()}.` }
    if (changesQuery.isError) return {
      tone: "error",
      loading: false,
      message: changesQuery.error instanceof Error ? changesQuery.error.message : t`Unable to check local book changes.`,
    }
    return { tone: "success", loading: false, message: t`Local changes checked. GitHub is up to date.` }
  })()

  return (
    <section className="bg-background" aria-labelledby="github-publisher-title">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4">
        <div>
          <h2 id="github-publisher-title" className="text-base font-semibold">
            {screen === "configure" ? <Trans>Configure publishing</Trans> : screen === "deploy" ? <Trans>Deploy book</Trans> : landingTab === "deployments" ? <Trans>Deployments</Trans> : <Trans>Git history</Trans>}
          </h2>
          {screen === "configure" ? <p className="mt-1 text-xs text-muted-foreground"><Trans>Connect GitHub, choose synchronization behavior, and follow deployment progress.</Trans></p> : null}
        </div>
        <div className="flex items-center gap-2">
          {connection ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 py-1 pl-1 pr-2.5 text-xs font-medium text-emerald-700">
              <img src={connection.avatarUrl} alt="" className="h-5 w-5 rounded-full border border-emerald-200 object-cover" />
              <Trans>Connected as {connection.login}</Trans>
            </span>
          ) : null}
          {screen === "workflow" && state?.status === "failed" ? (
            <Button
              type="button"
              size="sm"
              onClick={rerunPublishing}
              disabled={publishMutation.isPending}
            >
              {publishMutation.isPending ? (
                <LoaderCircle className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
              )}
              <Trans>Re-run</Trans>
            </Button>
          ) : null}
          {screen === "workflow" && (hasSavedConfiguration || hasPublishingProfile) && state?.status !== "failed" ? (
            <Button type="button" size="sm" onClick={() => setScreen("deploy")}>
              <Rocket className="mr-2 h-4 w-4" aria-hidden="true" />
              <Trans>Deploy</Trans>
            </Button>
          ) : null}
          <Button
            type="button"
            variant={screen === "configure" ? "ghost" : "outline"}
            size="sm"
            onClick={() => {
              if (screen === "configure") setScreen("workflow")
              else {
                setConfigurationStep(hasSavedConfiguration ? 1 : 0)
                setScreen("configure")
              }
            }}
          >
            {screen === "configure" ? <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" /> : <Settings2 className="mr-2 h-4 w-4" aria-hidden="true" />}
            {screen === "configure" ? <Trans>Back to workflow</Trans> : <Trans>Configure</Trans>}
          </Button>
        </div>
      </div>

      {screen === "configure" ? (
        <div key="configure" className="motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-right-3 motion-safe:duration-300">
          <ol className="mb-6 grid grid-cols-3 gap-2 rounded-xl border border-border bg-muted/20 p-4" aria-label={t`GitHub configuration progress`}>
            {[t`Connect`, t`Repository`, t`Synchronization`].map((label, index) => (
              <li key={label} className="flex min-w-0 items-center gap-2" aria-current={index === configurationStep ? "step" : undefined}>
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${index < configurationStep ? "border-emerald-600 bg-emerald-600 text-white" : index === configurationStep ? "border-indigo-600 bg-indigo-600 text-white" : "border-border bg-background text-muted-foreground"}`}>
                  {index < configurationStep ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : index + 1}
                </span>
                <span className={`truncate text-xs font-medium ${index === configurationStep ? "text-foreground" : "text-muted-foreground"}`}>{label}</span>
                {index < 2 ? <span className="h-px flex-1 bg-border" aria-hidden="true" /> : null}
              </li>
            ))}
          </ol>

          {configurationStep === 0 ? (
            <div className="rounded-xl border border-border bg-muted/10 p-4">
              <h3 className="text-sm font-semibold"><Trans>Connect your GitHub account</Trans></h3>
              <p className="mt-1 text-xs text-muted-foreground"><Trans>Paste a personal access token with the permissions needed to create repositories, publish files, and enable GitHub Pages.</Trans></p>
              <PersonalAccessTokenGuide />
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <Input
                  type="password"
                  value={token}
                  onChange={(event) => setToken(event.target.value)}
                  placeholder={t`GitHub personal access token`}
                  aria-label={t`GitHub personal access token`}
                  autoComplete="off"
                />
                <Button type="button" onClick={() => connectMutation.mutate()} disabled={!token.trim() || connectMutation.isPending}>
                  {connectMutation.isPending ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <Github className="mr-2 h-4 w-4" aria-hidden="true" />}
                  <Trans>Connect GitHub</Trans>
                </Button>
              </div>
            </div>
          ) : null}

          {configurationStep === 1 ? (
            <div className="rounded-xl border border-border bg-muted/10 p-4">
              <h3 className="text-sm font-semibold"><Trans>Choose the repository</Trans></h3>
              <p className="mt-1 text-xs text-muted-foreground"><Trans>ADT Studio can create this public repository or update it when it already exists.</Trans></p>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <label className="text-xs font-medium"><Trans>Owner</Trans><Input className="mt-1" value={owner} onChange={(event) => setOwner(event.target.value)} /></label>
                <label className="text-xs font-medium sm:col-span-2"><Trans>Repository</Trans><Input className="mt-1" value={repository} onChange={(event) => setRepository(event.target.value)} /></label>
                <label className="text-xs font-medium sm:col-span-3"><Trans>Commit message</Trans><Input className="mt-1" value={commitMessage} onChange={(event) => setCommitMessage(event.target.value)} placeholder={t`Leave empty to generate a change-aware message`} /></label>
              </div>
            </div>
          ) : null}

          {configurationStep === 2 ? (
            <div className="rounded-xl border border-border bg-muted/10 p-4">
              <h3 className="text-sm font-semibold"><Trans>Choose how changes are synchronized</Trans></h3>
              <p className="mt-1 text-xs text-muted-foreground"><Trans>Automatic sync checks GitHub every 30 seconds and pulls a newer remote version. Manual sync only checks when you request it.</Trans></p>
              <div className="mt-4 flex items-center justify-between gap-4 rounded-lg border border-border bg-background p-4">
                <div><p className="text-xs font-semibold"><Trans>Automatic GitHub sync</Trans></p><p className="mt-1 text-xs text-muted-foreground">{autoSync ? <Trans>ADT Studio will monitor and pull remote changes automatically.</Trans> : <Trans>You control when ADT Studio checks and pulls remote changes.</Trans>}</p></div>
                <Switch checked={autoSync} onCheckedChange={updateAutoSync} aria-label={t`Automatic GitHub sync`} />
              </div>
              {!autoSync ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button type="button" variant="outline" onClick={() => void checkRemoteChanges()} disabled={!connection || remoteStatusQuery.isFetching}>
                    {remoteStatusQuery.isFetching ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <ScanSearch className="mr-2 h-4 w-4" aria-hidden="true" />}<Trans>Check GitHub now</Trans>
                  </Button>
                  {remoteStatusQuery.data?.behind ? <Button type="button" onClick={() => pullMutation.mutate()} disabled={pullMutation.isPending}>{pullMutation.isPending ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <GitBranch className="mr-2 h-4 w-4" aria-hidden="true" />}<Trans>Sync latest changes</Trans></Button> : null}
                  {remoteStatusQuery.data && !remoteStatusQuery.data.behind ? <span className="text-xs font-medium text-emerald-700"><Check className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" /><Trans>Local book is up to date</Trans></span> : null}
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="mt-4 flex items-center justify-between">
            <Button type="button" variant="outline" onClick={() => setConfigurationStep((step) => Math.max(0, step - 1))} disabled={configurationStep === 0}>
              <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" /><Trans>Previous</Trans>
            </Button>
            {configurationStep < 2 ? (
              <Button type="button" onClick={() => setConfigurationStep((step) => Math.min(2, step + 1))} disabled={configurationStep === 0 ? !connection : configurationStep === 1 ? !repository.trim() : false}>
                <Trans>Continue</Trans><ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
              </Button>
            ) : (
              <Button type="button" onClick={() => setScreen("deploy")}><Rocket className="mr-2 h-4 w-4" aria-hidden="true" /><Trans>Continue to deploy</Trans></Button>
            )}
          </div>
        </div>
      ) : screen === "deploy" ? (
        <div key="deploy" className="motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-right-3 motion-safe:duration-300">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="rounded-xl border border-border bg-muted/10 p-4">
              <h3 className="text-sm font-semibold"><Trans>Deployment workflow</Trans></h3>
              <p className="mt-1 text-xs text-muted-foreground"><Trans>Follow every publishing operation. The active step is highlighted and completed steps play a short confirmation sound.</Trans></p>
              {state?.status === "failed" ? (
                <div className="mt-4 rounded-lg border border-red-300 bg-red-50 p-3 text-xs text-red-900" role="alert">
                  <p className="font-semibold"><Trans>GitHub deployment failed</Trans></p>
                  <p className="mt-1 break-words">{state.error || <Trans>GitHub did not provide a build error message.</Trans>}</p>
                </div>
              ) : null}
              <div className="mt-4"><DeploymentWorkflow state={state} /></div>
            </div>
            <aside className="rounded-xl border border-border bg-background p-4">
              <h3 className="text-sm font-semibold"><Trans>Deployment details</Trans></h3>
              <dl className="mt-4 space-y-3 text-xs">
                <div><dt className="text-muted-foreground"><Trans>GitHub account</Trans></dt><dd className="mt-1 flex items-center gap-2 font-medium">{connection ? <img src={connection.avatarUrl} alt="" className="h-7 w-7 rounded-full border border-border object-cover" /> : null}<span>{connection?.login || owner || state?.owner}</span></dd></div>
                <div><dt className="text-muted-foreground"><Trans>Repository destination</Trans></dt><dd className="mt-1 break-all font-medium">{owner || connection?.login || state?.owner}/{repository}</dd></div>
                <div><dt className="text-muted-foreground"><Trans>Synchronization</Trans></dt><dd className="mt-1 font-medium">{autoSync ? t`Automatic` : t`Manual`}</dd></div>
                <div><dt className="text-muted-foreground"><Trans>Commit message</Trans></dt><dd className="mt-1 font-medium">{commitMessage || t`Automatically generated from book changes`}</dd></div>
              </dl>
              {!hasSavedConfiguration ? (
                <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                  <Trans>Reconnect GitHub once to restore the saved token on this device, then re-run the deployment.</Trans>
                </p>
              ) : null}
              <Button className="mt-5 w-full" type="button" onClick={startPublishing} disabled={!hasSavedConfiguration || isRunning || publishMutation.isPending}>
                {isRunning || publishMutation.isPending ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <Rocket className="mr-2 h-4 w-4" aria-hidden="true" />}
                {state?.status === "failed" ? <Trans>Re-run deployment</Trans> : state?.commitSha ? <Trans>Publish latest changes</Trans> : <Trans>Start deployment</Trans>}
              </Button>
              <Button className="mt-2 w-full" type="button" variant="outline" onClick={reconnectGitHub}>
                <Github className="mr-2 h-4 w-4" aria-hidden="true" /><Trans>Reconnect GitHub</Trans>
              </Button>
            </aside>
          </div>
          <Button className="mt-4" type="button" variant="outline" onClick={() => setScreen("workflow")}>
            <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" /><Trans>Back to git history</Trans>
          </Button>
        </div>
      ) : (
        <div key="workflow" className="motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-left-3 motion-safe:duration-300">
          <div className="mb-4 border-b border-border" role="tablist" aria-label={t`Publishing views`}>
            <button
              type="button"
              role="tab"
              aria-selected={landingTab === "history"}
              onClick={() => setLandingTab("history")}
              className={`relative px-4 py-2.5 text-sm font-medium transition-colors ${landingTab === "history" ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              <GitCommitHorizontal className="mr-2 inline h-4 w-4" aria-hidden="true" />
              <Trans>Git History</Trans>
              {landingTab === "history" ? <span className="absolute inset-x-0 -bottom-px h-0.5 bg-indigo-600" aria-hidden="true" /> : null}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={landingTab === "deployments"}
              onClick={() => {
                setLandingTab("deployments")
                setInspectedDeployment(null)
              }}
              className={`relative px-4 py-2.5 text-sm font-medium transition-colors ${landingTab === "deployments" ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              <Rocket className="mr-2 inline h-4 w-4" aria-hidden="true" />
              <Trans>Deployments</Trans>
              {landingTab === "deployments" ? <span className="absolute inset-x-0 -bottom-px h-0.5 bg-indigo-600" aria-hidden="true" /> : null}
            </button>
          </div>

          {landingTab === "history" ? (
            <div role="tabpanel">
              {remoteStatusQuery.data?.conflict ? (
                <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950" role="alert">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold"><Trans>Local and GitHub changes need resolution</Trans></p>
                      <p className="mt-1 max-w-3xl text-xs">
                        <Trans>Automatic synchronization is paused to protect {remoteStatusQuery.data.localChangeCount} local change(s). Open the deployable book worktree in an editor, resolve the differences, then publish the result.</Trans>
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="sr-only" htmlFor="book-conflict-editor"><Trans>Editor</Trans></label>
                      <select
                        id="book-conflict-editor"
                        value={editorChoice}
                        onChange={(event) => setEditorChoice(event.target.value as "vscode" | "cursor" | "system")}
                        className="h-9 rounded-md border border-amber-300 bg-white px-2 text-xs font-medium"
                      >
                        <option value="vscode">{t`VS Code`}</option>
                        <option value="cursor">{t`Cursor`}</option>
                        <option value="system">{t`System editor`}</option>
                      </select>
                      <Button type="button" size="sm" onClick={() => openEditorMutation.mutate()} disabled={openEditorMutation.isPending}>
                        {openEditorMutation.isPending ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <GitBranch className="mr-2 h-4 w-4" aria-hidden="true" />}
                        <Trans>Open in editor</Trans>
                      </Button>
                    </div>
                  </div>
                </div>
              ) : null}
              {state?.status === "completed" && state.pagesUrl ? (
                <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50/50 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold text-emerald-900"><Trans>Book preview</Trans></p>
                      <a href={state.pagesUrl} target="_blank" rel="noreferrer" className="text-sm font-medium text-emerald-700 underline underline-offset-2">
                        {state.pagesUrl}<ExternalLink className="ml-1 inline h-3.5 w-3.5" aria-hidden="true" />
                      </a>
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={() => setShowPreview((value) => !value)}>
                      <Eye className="mr-2 h-4 w-4" aria-hidden="true" />
                      {showPreview ? <Trans>Hide preview</Trans> : <Trans>Preview deployment</Trans>}
                    </Button>
                  </div>
                  {showPreview ? (
                    <iframe
                      className="mt-3 h-[520px] w-full rounded-md border bg-white"
                      src={state.pagesUrl}
                      title={t`Published book preview`}
                      sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                    />
                  ) : null}
                </div>
              ) : null}
              {state?.status === "failed" ? (
                <div className="mb-4 rounded-lg border border-red-300 bg-red-50 p-3 text-xs text-red-900" role="alert">
                  <p className="font-semibold"><Trans>Latest deployment failed</Trans></p>
                  <p className="mt-1 break-words">{state.error || <Trans>GitHub did not provide a build error message.</Trans>}</p>
                </div>
              ) : null}
              <GitHistoryGraph bookLabel={bookLabel} state={state} changes={changesQuery.data?.changes} connection={connection} isLoading={!initialChangeCheckComplete} />
            </div>
          ) : (
            <div role="tabpanel">
              {inspectedDeployment ? (
                <DeploymentInspector
                  bookLabel={bookLabel}
                  deployment={state?.id === inspectedDeployment.id ? state : inspectedDeployment}
                  onBack={() => setInspectedDeployment(null)}
                />
              ) : deploymentsQuery.isError ? (
                <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-800">{deploymentsQuery.error instanceof Error ? deploymentsQuery.error.message : t`Unable to load deployments.`}</p>
              ) : (
                <DeploymentsTable
                  deployments={state && !(deploymentsQuery.data ?? []).some((deployment) => deployment.id === state.id)
                    ? [state, ...(deploymentsQuery.data ?? [])]
                    : (deploymentsQuery.data ?? [])}
                  connection={connection}
                  onInspect={setInspectedDeployment}
                  isLoading={deploymentsQuery.isFetching}
                />
              )}
            </div>
          )}
        </div>
      )}
      <div
        className={`sticky bottom-0 z-20 mt-4 flex min-h-9 items-center justify-between gap-3 border px-3 py-2 text-xs shadow-sm ${synchronizationStatus.tone === "error" ? "border-red-300 bg-red-50 text-red-900" : synchronizationStatus.tone === "warning" ? "border-amber-300 bg-amber-50 text-amber-950" : synchronizationStatus.tone === "success" ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-border bg-background text-muted-foreground"}`}
        role="status"
        aria-live="polite"
      >
        <span className="flex min-w-0 items-center gap-2">
          {synchronizationStatus.loading ? <LoaderCircle className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden="true" /> : synchronizationStatus.tone === "error" ? <X className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
          <span className="truncate">{synchronizationStatus.message}</span>
        </span>
        {synchronizationStatus.tone === "error" && connection ? (
          <button type="button" className="shrink-0 font-semibold underline underline-offset-2" onClick={reconnectGitHub}><Trans>Reconnect</Trans></button>
        ) : null}
      </div>
    </section>
  )
}
