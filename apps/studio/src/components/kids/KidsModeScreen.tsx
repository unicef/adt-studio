import { useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { ArrowLeft, Loader2, Mic, Sparkles } from "lucide-react"
import { Link } from "@tanstack/react-router"
import { KIDS_BUDDIES } from "@adt/types/kids"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { SettingsCard } from "@/components/pipeline/components/SettingsCard"
import { useApiKey } from "@/hooks/use-api-key"
import {
  useGenerateKidsVoice,
  useKidsMode,
  useKidsVoiceStatus,
  useUpdateKidsMode,
} from "@/hooks/use-kids-mode"
import type { KidsVoiceGenerationSummary } from "@/api/client"
import { cn } from "@/lib/utils"

export function KidsModeScreen({ bookLabel }: { bookLabel: string }) {
  const { t } = useLingui()
  const { data: config } = useKidsMode(bookLabel)
  const updateKidsMode = useUpdateKidsMode(bookLabel)
  const { data: voiceStatus } = useKidsVoiceStatus(bookLabel)
  const generateVoice = useGenerateKidsVoice(bookLabel)
  const { apiKey, hasApiKey } = useApiKey()
  const [lastRun, setLastRun] = useState<KidsVoiceGenerationSummary | null>(
    null,
  )
  const [voiceError, setVoiceError] = useState<string | null>(null)

  const enabled = config?.enabled ?? false
  const buddies = config?.buddies ?? KIDS_BUDDIES.map((buddy) => buddy.id)

  const setEnabled = (next: boolean) => {
    updateKidsMode.mutate({ enabled: next, buddies })
  }

  const toggleBuddy = (id: string) => {
    const next = buddies.includes(id)
      ? buddies.filter((buddy) => buddy !== id)
      : [...buddies, id]
    if (next.length === 0) return
    updateKidsMode.mutate({ enabled, buddies: next })
  }

  const runVoice = (dryRun: boolean) => {
    setVoiceError(null)
    generateVoice.mutate(
      {
        characters: buddies,
        dryRun,
        apiKey: dryRun ? undefined : apiKey,
      },
      {
        onSuccess: setLastRun,
        onError: (err) =>
          setVoiceError(err instanceof Error ? err.message : String(err)),
      },
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-8">
      <div className="flex flex-col gap-2">
        <Link
          to="/books/$label/$step"
          params={{ label: bookLabel, step: "export" }}
          className="inline-flex w-fit items-center gap-1.5 text-[13px] font-medium text-[#737373] hover:text-[#0a0a0a]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <Trans>Back to Export</Trans>
        </Link>
        <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-[#0a0a0a]">
          <Trans>Kids Mode</Trans>
        </h1>
        <p className="text-[14px] leading-relaxed text-[#737373]">
          <Trans>
            Turn this book into a kids book: readers get a buddy-guided,
            child-friendly interface instead of the standard menus. This is an
            authoring decision — it's packed into the book and readers can't
            change it.
          </Trans>
        </p>
      </div>

      <SettingsCard
        title={<Trans>Enable kids mode</Trans>}
        description={
          <Trans>
            Applies to the Studio preview immediately and to every future
            export of this book.
          </Trans>
        }
      >
        <div className="flex items-center justify-between gap-4">
          <span className="text-[14px] font-medium text-[#0a0a0a]">
            <Trans>This is a kids book</Trans>
          </span>
          <Switch
            checked={enabled}
            onCheckedChange={setEnabled}
            disabled={updateKidsMode.isPending || !config}
          />
        </div>
      </SettingsCard>

      <SettingsCard
        title={<Trans>Reading buddies</Trans>}
        description={
          <Trans>
            Choose which buddies ship with the book. Kids pick one of these
            during onboarding; fewer buddies also means fewer voice clips to
            generate.
          </Trans>
        }
      >
        <div className={cn("grid grid-cols-2 gap-2 sm:grid-cols-5", !enabled && "opacity-50")}>
          {KIDS_BUDDIES.map((buddy) => {
            const selected = buddies.includes(buddy.id)
            return (
              <button
                key={buddy.id}
                type="button"
                aria-pressed={selected}
                disabled={!enabled || updateKidsMode.isPending}
                onClick={() => toggleBuddy(buddy.id)}
                className={cn(
                  "flex flex-col items-center gap-0.5 rounded-lg border px-3 py-3 text-center transition",
                  selected
                    ? "border-indigo-600 bg-indigo-50"
                    : "border-[#e5e5e5] bg-white hover:border-[#c9c9c9]",
                  enabled ? "cursor-pointer" : "cursor-not-allowed",
                )}
              >
                <span className="text-[14px] font-semibold text-[#0a0a0a]">
                  {buddy.defaultNameFallback}
                </span>
                <span className="text-[12px] text-[#737373]">
                  {buddy.labelFallback}
                </span>
              </button>
            )
          })}
        </div>
      </SettingsCard>

      <SettingsCard
        title={<Trans>Buddy voices</Trans>}
        description={
          <Trans>
            Pre-generate spoken buddy phrases per language so the book talks
            offline. Each buddy has its own voice. Clips are cached — re-runs
            only pay for lines that changed.
          </Trans>
        }
      >
        <div className="flex flex-col gap-2">
          {(voiceStatus?.languages ?? []).map((entry) => (
            <div
              key={entry.language}
              className="flex items-center justify-between gap-3 rounded-lg border border-[#e5e5e5] px-4 py-2.5"
            >
              <div className="flex items-center gap-2.5">
                <Mic className="h-4 w-4 text-[#737373]" />
                <span className="text-[14px] font-medium uppercase text-[#0a0a0a]">
                  {entry.language}
                </span>
                <span className="text-[12.5px] text-[#737373]">
                  {entry.hasPack ? (
                    <Trans>{entry.clipCount} clips generated</Trans>
                  ) : (
                    <Trans>No voice pack yet</Trans>
                  )}
                </span>
              </div>
            </div>
          ))}

          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!enabled || generateVoice.isPending}
              onClick={() => runVoice(true)}
            >
              <Sparkles className="h-3.5 w-3.5" />
              <Trans>Check what would be generated</Trans>
            </Button>
            <Button
              size="sm"
              disabled={!enabled || !hasApiKey || generateVoice.isPending}
              onClick={() => runVoice(false)}
            >
              {generateVoice.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Mic className="h-3.5 w-3.5" />
              )}
              <Trans>Generate voices</Trans>
            </Button>
            {!hasApiKey && (
              <span className="text-[12.5px] text-[#737373]">
                <Trans>Add your OpenAI key in Settings to generate.</Trans>
              </span>
            )}
          </div>

          {voiceError && (
            <p className="text-[12.5px] leading-relaxed text-red-600">
              {voiceError}
            </p>
          )}

          {lastRun && !voiceError && (
            <p className="text-[12.5px] leading-relaxed text-[#737373]">
              {lastRun.dryRun ? (
                <Trans>
                  Plan: {lastRun.total} clips across{" "}
                  {lastRun.languages.length} language(s) ×{" "}
                  {lastRun.characters.length} buddies —{" "}
                  {lastRun.cachedHits} already cached,{" "}
                  {lastRun.total - lastRun.cachedHits} would call the API
                  (model {lastRun.model}).
                </Trans>
              ) : (
                <Trans>
                  Done: {lastRun.total} clips ready — {lastRun.generated}{" "}
                  newly generated, {lastRun.cachedHits} from cache.
                </Trans>
              )}
            </p>
          )}
        </div>
      </SettingsCard>
    </div>
  )
}
