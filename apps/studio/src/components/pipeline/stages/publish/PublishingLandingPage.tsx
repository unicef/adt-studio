import { useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { cn } from "@/lib/utils"
import { SegmentedControl } from "@/components/ui/segmented-control"
import { PublishPanel } from "@/components/pipeline/stages/export/publish/PublishPanel"
import {
  publicationLifecycle,
  useBookPublication,
  useBookPublishRun,
} from "@/hooks/use-book-publication"
import { PublishingStepper, type PublishPhase } from "./PublishingStepper"
import { PublishingSummary } from "./PublishingSummary"
import { PublishingVersionsTab } from "./PublishingVersionsTab"
import { PublishingReadersTab } from "./PublishingReadersTab"

type Tab = "overview" | "versions" | "readers"

/**
 * Publishing, as its own place in the book rather than a card at the top of Export.
 *
 * A publication is not an export. An export is an artifact you produce once; a publication is a
 * living thing with an address, an audience, an access code and a history — which is why it sits
 * *before* Export in the rail. You publish early and often to gather feedback; you export at the
 * end, once.
 *
 * The page reads as one journey with two halves. Before the link exists it is a stepper —
 * connect, decide, publish — ending in the same calm loader the Cloudflare setup uses, because
 * both are the same kind of wait. Once it exists it becomes a dashboard: the numbers worth
 * knowing, then the controls, then the history and the readers behind tabs.
 *
 * The Cloudflare connection itself deliberately stays in Settings: it belongs to the Studio, not
 * to this book, and offering it here would imply you connect an account per book.
 */
export function PublishingLandingPage({ bookLabel }: { bookLabel: string }) {
  const { t } = useLingui()
  const [tab, setTab] = useState<Tab>("overview")
  const status = useBookPublication(bookLabel)
  const run = useBookPublishRun(bookLabel)

  const connected = status.data?.connected === true
  const lifecycle = publicationLifecycle(status.data)
  const url = status.data?.url ?? run.result?.url ?? null
  const live = lifecycle === "active" && !!url
  const record = status.data?.record ?? null

  const phase: PublishPhase = !connected
    ? "connect"
    : run.status === "running"
      ? "running"
      : live
        ? "live"
        : "configure"

  const tabs: Array<{ value: Tab; label: string }> = [
    { value: "overview", label: t`Overview` },
    { value: "versions", label: t`Published versions` },
    { value: "readers", label: t`Readers` },
  ]

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-8 pb-10 pt-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-[#0a0a0a]">
            <Trans>Publishing</Trans>
          </h1>
          <p className="text-[14px] leading-relaxed text-[#737373]">
            <Trans>
              Put this book online for readers and reviewers. The copy lives in your own
              Cloudflare account, behind a link only the people you send it to can open.
            </Trans>
          </p>
        </div>

        {status.isPending ? null : <PublishingStepper phase={phase} />}

        {/* The tiles are the dashboard's headline and belong above the controls; before there is
            a link there is nothing to count, so they simply are not there. */}
        {live ? (
          <div className="motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-500">
            <PublishingSummary
              bookLabel={bookLabel}
              record={record}
              currentVersion={status.data?.publication?.current_version ?? null}
              hasAccessCode={status.data?.has_access_code ?? false}
            />
          </div>
        ) : null}

        {live ? (
          <SegmentedControl<Tab>
            className="h-9 w-full max-w-md"
            value={tab}
            onValueChange={setTab}
            options={tabs}
          />
        ) : null}

        <div
          key={live ? tab : "flow"}
          className={cn(
            "flex flex-col gap-5",
            "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-300",
          )}
        >
          {!live || tab === "overview" ? <PublishPanel bookLabel={bookLabel} /> : null}
          {live && tab === "versions" ? <PublishingVersionsTab bookLabel={bookLabel} /> : null}
          {live && tab === "readers" ? <PublishingReadersTab bookLabel={bookLabel} /> : null}
        </div>
      </div>
    </div>
  )
}
