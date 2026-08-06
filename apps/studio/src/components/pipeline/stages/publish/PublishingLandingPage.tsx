import { useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { Globe, History, Users } from "lucide-react"
import { cn } from "@/lib/utils"
import { SegmentedControl } from "@/components/ui/segmented-control"
import { PublishPanel } from "@/components/pipeline/stages/export/publish/PublishPanel"
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
 * The Cloudflare connection itself deliberately stays in Settings: it belongs to the Studio, not
 * to this book, and offering it here would imply you connect an account per book.
 */
export function PublishingLandingPage({ bookLabel }: { bookLabel: string }) {
  const { t } = useLingui()
  const [tab, setTab] = useState<Tab>("overview")

  const tabs: Array<{ value: Tab; label: string; icon: typeof Globe }> = [
    { value: "overview", label: t`Overview`, icon: Globe },
    { value: "versions", label: t`Published versions`, icon: History },
    { value: "readers", label: t`Readers`, icon: Users },
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

        <SegmentedControl<Tab>
          className="h-9 w-full max-w-md"
          value={tab}
          onValueChange={setTab}
          options={tabs.map((entry) => ({ value: entry.value, label: entry.label }))}
        />

        <div
          key={tab}
          className={cn(
            "flex flex-col gap-5",
            "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-300",
          )}
        >
          {tab === "overview" ? <PublishPanel bookLabel={bookLabel} /> : null}
          {tab === "versions" ? <PublishingVersionsTab bookLabel={bookLabel} /> : null}
          {tab === "readers" ? <PublishingReadersTab bookLabel={bookLabel} /> : null}
        </div>
      </div>
    </div>
  )
}
