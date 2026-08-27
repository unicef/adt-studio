import type { ReactNode } from "react"
import { useState } from "react"
import { Trans } from "@lingui/react/macro"
import { ArrowRight, Building2, Cloud, Github, MessageSquareOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { RadioDot } from "./RadioDot"
import { WizardStepShell } from "./WizardStepShell"

type StorageChoice = "cloudflare" | "none"

interface ProviderCardProps {
  icon: ReactNode
  brandColor: string
  name: ReactNode
  note: ReactNode
  chip?: ReactNode
  selected?: boolean
  disabled?: boolean
  onSelect?: () => void
}

function ProviderCard({
  icon,
  brandColor,
  name,
  note,
  chip,
  selected,
  disabled,
  onSelect,
}: ProviderCardProps) {
  const body = (
    <>
      <span
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-lg bg-white ring-1 transition-shadow duration-200 motion-reduce:transition-none",
          selected ? "shadow-sm ring-indigo-200" : "shadow-sm ring-zinc-200",
          disabled && "grayscale",
        )}
        style={{ color: brandColor }}
      >
        {icon}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span
            className={cn(
              "text-sm font-semibold tracking-tight",
              selected ? "text-foreground" : "text-muted-foreground",
              disabled && "text-muted-foreground",
            )}
          >
            {name}
          </span>
          {chip}
        </span>
        <span className="text-xs leading-5 text-muted-foreground">{note}</span>
      </span>
    </>
  )

  if (disabled) {
    return (
      <div
        role="radio"
        aria-checked={false}
        aria-disabled="true"
        className="flex h-full items-start gap-3 rounded-xl border border-dashed bg-muted/20 p-4 opacity-70"
      >
        {body}
      </div>
    )
  }

  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "flex h-full cursor-pointer items-start gap-3 rounded-xl border p-4 text-left transition-all duration-200 motion-reduce:transition-none",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        selected
          ? "border-indigo-300 bg-indigo-50/50 shadow-sm ring-1 ring-indigo-200"
          : "bg-card hover:border-zinc-300 hover:shadow-sm",
      )}
    >
      {body}
      <RadioDot selected={!!selected} />
    </button>
  )
}

function SectionHeader({
  number,
  title,
  subtitle,
  optional,
}: {
  number: string
  title: ReactNode
  subtitle: ReactNode
  optional?: boolean
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border border-indigo-200 bg-indigo-50 text-xs font-semibold text-indigo-700">
        {number}
      </span>
      <div className="flex flex-col gap-0.5">
        <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
          {title}
          {optional && (
            <span className="rounded-full border bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              <Trans>Optional</Trans>
            </span>
          )}
        </span>
        <span className="text-xs text-muted-foreground">{subtitle}</span>
      </div>
    </div>
  )
}

function ComingSoonChip() {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full border bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
      <Trans>Coming soon</Trans>
    </span>
  )
}

function RecommendedChip() {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full border border-indigo-200 bg-indigo-100/60 px-2 py-0.5 text-[10px] font-medium text-indigo-800">
      <Trans>Recommended</Trans>
    </span>
  )
}

interface IntroStepProps {
  onBack: () => void
  onContinue: (choice: { storage: StorageChoice }) => void
}

export function IntroStep({ onBack, onContinue }: IntroStepProps) {
  const [storage, setStorage] = useState<StorageChoice>("cloudflare")

  return (
    <WizardStepShell
      title={<Trans>Choose where your books will live</Trans>}
      description={
        <Trans>
          Hosting is where readers open your book; feedback storage is where their comments are
          kept. Both stay in accounts that belong to you — set up once.
        </Trans>
      }
      footer={
        <>
          <Button variant="ghost" onClick={onBack}>
            <Trans>Back</Trans>
          </Button>
          <Button className="group ml-auto" onClick={() => onContinue({ storage })}>
            <Trans>Continue</Trans>
            <ArrowRight
              className="size-4 transition-transform duration-200 motion-safe:group-hover:translate-x-0.5 motion-reduce:transition-none"
              aria-hidden="true"
            />
          </Button>
        </>
      }
    >
      <div className="flex flex-1 flex-col gap-8 pt-1 mh:gap-5">
        <div role="radiogroup" aria-labelledby="hosting-group-label" className="flex flex-col gap-3.5">
          <span id="hosting-group-label">
            <SectionHeader
              number="1"
              title={<Trans>Hosting</Trans>}
              subtitle={<Trans>Where readers open your book</Trans>}
            />
          </span>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <ProviderCard
              selected
              icon={<Cloud className="size-5" aria-hidden="true" />}
              brandColor="#f6821f"
              name={<Trans>Cloudflare</Trans>}
              note={<Trans>Free plan covers normal classroom use</Trans>}
              chip={<RecommendedChip />}
            />
            <ProviderCard
              disabled
              icon={<Github className="size-5" aria-hidden="true" />}
              brandColor="#181717"
              name={<Trans>GitHub Pages</Trans>}
              note={<Trans>Publish from a GitHub repository</Trans>}
              chip={<ComingSoonChip />}
            />
            <ProviderCard
              disabled
              icon={<Building2 className="size-5" aria-hidden="true" />}
              brandColor="#4338ca"
              name={<Trans>ADT Infrastructure</Trans>}
              note={<Trans>Hosted for you — no account to set up</Trans>}
              chip={<ComingSoonChip />}
            />
          </div>
        </div>

        <div role="radiogroup" aria-labelledby="storage-group-label" className="flex flex-col gap-3.5">
          <span id="storage-group-label">
            <SectionHeader
              number="2"
              title={<Trans>Feedback storage</Trans>}
              subtitle={<Trans>Where reviewer comments live</Trans>}
              optional
            />
          </span>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <ProviderCard
              selected={storage === "cloudflare"}
              onSelect={() => setStorage("cloudflare")}
              icon={<Cloud className="size-5" aria-hidden="true" />}
              brandColor="#f6821f"
              name={<Trans>Cloudflare</Trans>}
              note={<Trans>Comments and live presence, on the free plan</Trans>}
              chip={<RecommendedChip />}
            />
            <ProviderCard
              selected={storage === "none"}
              onSelect={() => setStorage("none")}
              icon={<MessageSquareOff className="size-5" aria-hidden="true" />}
              brandColor="#71717a"
              name={<Trans>Skip for now</Trans>}
              note={<Trans>Publish without reader comments — you can enable them later</Trans>}
            />
          </div>
        </div>
      </div>
    </WizardStepShell>
  )
}
