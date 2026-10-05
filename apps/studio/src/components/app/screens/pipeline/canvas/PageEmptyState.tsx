import { Trans, useLingui } from "@lingui/react/macro"
import { FileQuestion, Images, Loader2, Network, Type } from "lucide-react"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/app/ui/EmptyState"
import { PageThumb } from "./PageThumb"
import type { SectioningRun } from "@/components/app/screens/pipeline/runs/useSectioningRun"
import type { PipelinePage } from "@/components/app/screens/pipeline/shared/usePipelineState"

export interface PageEmptyStateProps {
  label: string
  page: PipelinePage
  sectioning: SectioningRun
  storyboardRunning?: boolean
  onOpenSectioning: () => void
}

function GhostPage({ children }: { children: React.ReactNode }) {
  return (
    <div aria-hidden className="mb-5 flex justify-center">
      <span className="grid h-[98px] w-[74px] place-items-center rounded-md border-[1.5px] border-dashed border-brand-200 bg-brand-50 text-brand-500">
        {children}
      </span>
    </div>
  )
}

function Stat({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground [&_svg]:size-3.5">
      {icon}
      {children}
    </span>
  )
}

export function PageEmptyState({
  label,
  page,
  sectioning,
  storyboardRunning,
  onOpenSectioning,
}: PageEmptyStateProps) {
  const { t } = useLingui()
  const blank = page.wordCount === 0 && page.imageCount === 0

  if (page.isDiscarded) {
    return (
      <EmptyState
        className="w-[520px]"
        illustration={
          <div aria-hidden className="mb-5 flex justify-center">
            <PageThumb
              label={label}
              pageId={page.pageId}
              sectionIndex={page.sections[0]?.sectionIndex ?? null}
              cacheKey={page.renderingVersion}
              pruned
              className="h-[186px] w-[140px]"
            />
          </div>
        }
        title={<span className="line-through">{t`Page ${page.pageNumber} is discarded`}</span>}
        description={
          <Trans>
            Every section on this page is excluded from the render, so the page never reaches the
            reader. Bring it back from the sectioning step.
          </Trans>
        }
      >
        <Button variant="outline" onClick={onOpenSectioning}>
          <Network className="size-3.5" />
          <Trans>Open sectioning</Trans>
        </Button>
      </EmptyState>
    )
  }

  if (storyboardRunning && !page.hasRendering) {
    return (
      <EmptyState
        className="w-[520px]"
        illustration={
          <GhostPage>
            <Loader2 className="size-5 animate-spin" />
          </GhostPage>
        }
        title={<Trans>Building this page</Trans>}
        description={t`The storyboard is turning page ${page.pageNumber} into the page the reader sees. It shows up here as soon as it is built.`}
      />
    )
  }

  if (sectioning.isRunning) {
    return (
      <EmptyState
        className="w-[520px]"
        illustration={
          <GhostPage>
            <Loader2 className="size-5 animate-spin" />
          </GhostPage>
        }
        title={<Trans>Sectioning this page</Trans>}
        description={t`Page ${page.pageNumber} is in the queue. Its sections show up here as soon as the step reaches it.`}
      />
    )
  }

  if (blank) {
    return (
      <EmptyState
        className="w-[520px]"
        illustration={
          <GhostPage>
            <FileQuestion className="size-5" />
          </GhostPage>
        }
        title={t`Page ${page.pageNumber} is blank`}
        description={
          <Trans>
            No text or images were extracted from this page, so there is nothing to section. Blank
            and decorative pages stay out of the book.
          </Trans>
        }
      >
        <Button variant="outline" onClick={onOpenSectioning}>
          <Network className="size-3.5" />
          <Trans>Review sectioning</Trans>
        </Button>
      </EmptyState>
    )
  }

  return (
    <EmptyState
      className="w-[520px]"
      illustration={
        <GhostPage>
          <Network className="size-5" />
        </GhostPage>
      }
      title={t`Page ${page.pageNumber} has no sections yet`}
      description={
        <Trans>
          The page has content, but sectioning did not split it into sections. Run the step again to
          give it another pass.
        </Trans>
      }
    >
      <div className="flex w-full flex-col items-center gap-4">
        <div className="flex items-center gap-4 rounded-lg border bg-card px-3.5 py-2">
          <Stat icon={<Type />}>{t`${page.wordCount} words`}</Stat>
          <span aria-hidden className="h-3.5 w-px bg-border" />
          <Stat icon={<Images />}>{t`${page.imageCount} images`}</Stat>
        </div>

        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-2.5">
            <Button onClick={sectioning.run} disabled={!sectioning.canRun}>
              <Network className="size-3.5" />
              <Trans>Run sectioning again</Trans>
            </Button>
            <Button variant="outline" onClick={onOpenSectioning}>
              <Trans>Open sectioning</Trans>
            </Button>
          </div>
          {!sectioning.hasApiKey && (
            <p className="text-[11.5px] text-muted-foreground">
              <Trans>Add an API key in Book settings to run sectioning.</Trans>
            </p>
          )}
        </div>
      </div>
    </EmptyState>
  )
}
