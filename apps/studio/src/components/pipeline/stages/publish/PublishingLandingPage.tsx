import { Trans } from "@lingui/react/macro"
import { History, Link2, Loader2, Users } from "lucide-react"
import { PublishPanel } from "@/components/pipeline/stages/export/publish/PublishPanel"
import { PublishedState } from "@/components/pipeline/stages/export/publish/PublishedState"
import { PublicationReaders } from "@/components/publications/PublicationReaders"
import {
  publicationLifecycle,
  useBookPublication,
  useBookPublishRun,
} from "@/hooks/use-book-publication"
import { PublishingSection } from "./PublishingSection"
import { PublishingStepper, type PublishPhase } from "./PublishingStepper"
import { PublishingSummary } from "./PublishingSummary"
import { PublishingVersions } from "./PublishingVersions"

/**
 * Publishing, as its own place in the book rather than a card at the top of Export.
 *
 * A publication is not an export. An export is an artifact you produce once; a publication is a
 * living thing with an address, an audience, an access code and a history — which is why it sits
 * *before* Export in the rail. You publish early and often to gather feedback; you export at the
 * end, once.
 *
 * One page, no tabs, and two shapes.
 *
 * **Before a link exists** it is a narrow single column: a stepper, then the one card that asks
 * for a decision. Narrow is right here — there is exactly one thing to do, and a wide empty page
 * would hide it.
 *
 * **Once the link exists** the page becomes an operations dashboard and widens into two columns:
 * state and numbers across the top, the link and its settings in the main column, history and
 * the roster in a sidebar. Nothing is behind a tab, because tabs on a page this size only hide
 * two short lists and make the author hunt for them.
 *
 * The Cloudflare connection itself deliberately stays in Settings: it belongs to the Studio, not
 * to this book, and offering it here would imply you connect an account per book.
 */
export function PublishingLandingPage({ bookLabel }: { bookLabel: string }) {
  const status = useBookPublication(bookLabel)
  const run = useBookPublishRun(bookLabel)

  const connected = status.data?.connected === true
  const lifecycle = publicationLifecycle(status.data)
  const url = status.data?.url ?? run.result?.url ?? null
  const live = lifecycle === "active" && !!url
  const record = status.data?.record ?? null
  const token = record?.token ?? null
  const currentVersion = status.data?.publication?.current_version ?? null

  const phase: PublishPhase = !connected
    ? "connect"
    : run.status === "running"
      ? "running"
      : live
        ? "live"
        : "configure"

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div
        className={
          live
            ? "mx-auto flex w-full max-w-6xl flex-col gap-7 px-8 pb-12 pt-8"
            : "mx-auto flex w-full max-w-3xl flex-col gap-7 px-8 pb-12 pt-8"
        }
      >
        <header className="flex shrink-0 flex-col gap-1.5">
          <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-[#0a0a0a]">
            <Trans>Publishing</Trans>
          </h1>
          <p className="max-w-2xl text-[14px] leading-relaxed text-[#737373]">
            <Trans>
              Put this book online for readers and reviewers. The copy lives in your own
              Cloudflare account, behind a link only the people you send it to can open.
            </Trans>
          </p>
        </header>

        {status.isPending ? (
          <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
            <Loader2
              className="size-4 animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
            <Trans>Checking whether this book is shared…</Trans>
          </div>
        ) : !live ? (
          <>
            <PublishingStepper phase={phase} />
            <PublishPanel bookLabel={bookLabel} />
          </>
        ) : (
          <>
            {/* Numbers before controls: the first question on arrival is "what state is this
                in", and four tiles answer it without reading a word of anything below. */}
            <div className="shrink-0 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-500">
              <PublishingSummary
                bookLabel={bookLabel}
                record={record}
                currentVersion={currentVersion}
                hasAccessCode={status.data?.has_access_code ?? false}
              />
            </div>

            <div className="grid shrink-0 items-start gap-7 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
              <PublishingSection icon={Link2} title={<Trans>The link and its settings</Trans>}>
                {/* `PublishedState` directly rather than through `PublishPanel`: the panel's
                    header pitches sharing to somebody who has not shared yet, which on a page
                    already titled Publishing would be the third heading in a row saying the same
                    thing. Its own boxes are the cards here — wrapping them in one more would be
                    a box in a box. */}
                <PublishedState
                  bookLabel={bookLabel}
                  url={url as string}
                  record={record}
                  publication={status.data?.publication ?? null}
                  workerReachable={status.data?.worker_reachable ?? true}
                  hasAccessCode={status.data?.has_access_code ?? false}
                  isUpdating={run.status === "running"}
                  recentRun={run.status === "done" ? run.kind : null}
                  onUpdate={run.update}
                />
              </PublishingSection>

              <div className="flex flex-col gap-7">
                <PublishingSection
                  icon={History}
                  title={<Trans>Version history</Trans>}
                  aside={
                    record?.versions.length ? (
                      <Trans>{record.versions.length} total</Trans>
                    ) : null
                  }
                >
                  <PublishingVersions record={record} currentVersion={currentVersion} />
                </PublishingSection>

                <PublishingSection icon={Users} title={<Trans>Readers</Trans>}>
                  <div className="rounded-xl border bg-card px-4 py-3">
                    {token === null ? (
                      <p className="py-2 text-xs text-muted-foreground">
                        <Trans>Nobody can join until this book is published.</Trans>
                      </p>
                    ) : (
                      <PublicationReaders token={token} hideHeading />
                    )}
                  </div>
                </PublishingSection>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
