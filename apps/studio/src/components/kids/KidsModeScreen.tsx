import { useEffect, useRef, useState } from "react"
import { Plural, Trans, useLingui } from "@lingui/react/macro"
import {
  ArrowLeft,
  CheckCircle2,
  CircleDashed,
  Loader2,
  Mic,
  Play,
  Plus,
  Sparkles,
  Square,
} from "lucide-react"
import { Link } from "@tanstack/react-router"
import {
  getKidsSpeakableLines,
  KIDS_BUDDIES,
  KIDS_BUDDY_LINES,
  KIDS_LANGUAGE_NAMES,
  type KidsBuddyLine,
  type KidsBuddyMeta,
} from "@adt/types/kids"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useApiKey } from "@/hooks/use-api-key"
import {
  useGenerateKidsVoice,
  useKidsMode,
  useKidsVoiceStatus,
  useKidsVoices,
  useResetKidsBuddyVoice,
  useUpdateKidsBuddyVoice,
  useUpdateKidsMode,
} from "@/hooks/use-kids-mode"
import {
  getKidsVoiceClipUrl,
  type KidsVoiceGenerationSummary,
} from "@/api/client"
import { cn } from "@/lib/utils"
import dinoImg from "@/assets/kids-buddies/dino.png"
import robotImg from "@/assets/kids-buddies/robot.png"
import bunnyImg from "@/assets/kids-buddies/bunny.png"
import catImg from "@/assets/kids-buddies/cat.png"
import alienImg from "@/assets/kids-buddies/alien.png"

const BUDDY_IMAGES: Record<string, string> = {
  dino: dinoImg,
  robot: robotImg,
  bunny: bunnyImg,
  cat: catImg,
  alien: alienImg,
}

interface VoiceDraft {
  voice: string
  instructions: string
}

export function KidsModeScreen({ bookLabel }: { bookLabel: string }) {
  const { t } = useLingui()
  const { data: config } = useKidsMode(bookLabel)
  const updateKidsMode = useUpdateKidsMode(bookLabel)
  const { data: voiceStatus } = useKidsVoiceStatus(bookLabel)
  const { data: voicesData } = useKidsVoices(bookLabel)
  const generateVoice = useGenerateKidsVoice(bookLabel)
  const updateBuddyVoice = useUpdateKidsBuddyVoice(bookLabel)
  const resetBuddyVoice = useResetKidsBuddyVoice(bookLabel)
  const { apiKey, hasApiKey } = useApiKey()
  const [lastRun, setLastRun] = useState<KidsVoiceGenerationSummary | null>(
    null,
  )
  const [voiceError, setVoiceError] = useState<string | null>(null)
  const [auditionLangChoice, setAuditionLangChoice] = useState<string | null>(
    null,
  )
  const [playingKey, setPlayingKey] = useState<string | null>(null)
  const [selectedBuddyId, setSelectedBuddyId] = useState<string>(
    KIDS_BUDDIES[0].id,
  )
  const [voiceDraft, setVoiceDraft] = useState<VoiceDraft | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const enabled = config?.enabled ?? false
  const buddies = config?.buddies ?? KIDS_BUDDIES.map((buddy) => buddy.id)
  const languages = voiceStatus?.languages ?? []
  const auditionLang =
    auditionLangChoice &&
    languages.some((entry) => entry.language === auditionLangChoice)
      ? auditionLangChoice
      : (languages[0]?.language ?? null)
  const auditionEntry =
    languages.find((entry) => entry.language === auditionLang) ?? null
  const anyPackReady = languages.some((entry) => entry.hasPack)

  const selectedBuddy =
    KIDS_BUDDIES.find((buddy) => buddy.id === selectedBuddyId) ??
    KIDS_BUDDIES[0]
  const selectedName = selectedBuddy.defaultNameFallback
  const buddyOverride = voicesData?.buddies.find(
    (buddy) => buddy.id === selectedBuddy.id,
  )
  const savedVoice = buddyOverride?.voice ?? selectedBuddy.voice.voice
  const savedInstructions =
    buddyOverride?.instructions ?? selectedBuddy.voice.instructions
  const serverIsDefault = buddyOverride?.isDefault ?? true
  const effectiveVoice = voiceDraft?.voice ?? savedVoice
  const effectiveInstructions = voiceDraft?.instructions ?? savedInstructions
  const isDirty =
    effectiveVoice !== savedVoice || effectiveInstructions !== savedInstructions

  useEffect(() => {
    setVoiceDraft(null)
  }, [selectedBuddyId])

  useEffect(() => {
    return () => {
      audioRef.current?.pause()
      audioRef.current = null
    }
  }, [])

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

  const stopAudition = () => {
    audioRef.current?.pause()
    audioRef.current = null
    setPlayingKey(null)
  }

  const toggleAudition = (
    buddyId: string,
    lineKey: string = KIDS_BUDDY_LINES.greet.key,
  ) => {
    const key = `${buddyId}:${lineKey}`
    if (playingKey === key) {
      stopAudition()
      return
    }
    audioRef.current?.pause()
    if (!auditionLang) return
    const audio = new Audio(
      getKidsVoiceClipUrl(bookLabel, auditionLang, buddyId, lineKey),
    )
    const reset = () => {
      if (audioRef.current === audio) {
        audioRef.current = null
        setPlayingKey(null)
      }
    }
    audio.addEventListener("ended", reset)
    audio.addEventListener("error", reset)
    audioRef.current = audio
    setPlayingKey(key)
    audio.play().catch(reset)
  }

  const canAuditionFor = (buddyId: string) =>
    (auditionEntry?.hasPack ?? false) &&
    (auditionEntry?.characters.includes(buddyId) ?? false)

  const buddyHasAnyPack = (buddyId: string) =>
    languages.some((entry) => entry.hasPack && entry.characters.includes(buddyId))

  const runVoice = (
    dryRun: boolean,
    options?: { languages?: string[]; characters?: string[] },
  ) => {
    setVoiceError(null)
    generateVoice.mutate(
      {
        languages: options?.languages,
        characters: options?.characters ?? buddies,
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

  const pendingVariables = generateVoice.isPending
    ? generateVoice.variables
    : undefined
  const isDryRunPending = pendingVariables?.dryRun === true

  const isBuddyLanguagePending = (buddyId: string, language: string) =>
    pendingVariables !== undefined &&
    pendingVariables.dryRun === false &&
    pendingVariables.characters?.length === 1 &&
    pendingVariables.characters[0] === buddyId &&
    pendingVariables.languages?.length === 1 &&
    pendingVariables.languages[0] === language

  const isBuddyAllLanguagesPending = (buddyId: string) =>
    pendingVariables !== undefined &&
    pendingVariables.dryRun === false &&
    pendingVariables.characters?.length === 1 &&
    pendingVariables.characters[0] === buddyId &&
    !pendingVariables.languages

  const isGlobalGeneratePending =
    pendingVariables !== undefined &&
    pendingVariables.dryRun === false &&
    !pendingVariables.languages &&
    (pendingVariables.characters?.length ?? 0) !== 1

  const handleSaveVoice = () => {
    updateBuddyVoice.mutate(
      {
        buddyId: selectedBuddy.id,
        voice: effectiveVoice,
        instructions: effectiveInstructions,
      },
      { onSuccess: () => setVoiceDraft(null) },
    )
  }

  const handleResetVoice = () => {
    resetBuddyVoice.mutate(selectedBuddy.id, {
      onSuccess: () => setVoiceDraft(null),
    })
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-8">
      <div className="flex flex-col gap-2">
        <Link
          to="/books/$label/$step"
          params={{ label: bookLabel, step: "book" }}
          className="inline-flex w-fit items-center gap-1.5 rounded text-[13px] font-medium text-[#737373] transition-colors duration-150 hover:text-[#0a0a0a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-2"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <Trans>Back to book</Trans>
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

      {/* Hero enable card */}
      <div className="overflow-hidden rounded-xl border border-[#e5e5e5] bg-white">
        <div
          aria-hidden
          className="h-1.5 bg-gradient-to-r from-sky-100 via-sky-300 to-sky-100"
        />
        <div className="flex flex-wrap items-center gap-4 p-5 sm:flex-nowrap">
          <div className="flex shrink-0 -space-x-3">
            {KIDS_BUDDIES.map((buddy) => (
              <span
                key={buddy.id}
                className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-sky-50 ring-2 ring-white"
              >
                <img
                  src={BUDDY_IMAGES[buddy.id]}
                  alt=""
                  width={44}
                  height={44}
                  className="h-11 w-11 object-contain"
                />
              </span>
            ))}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-[15px] font-semibold tracking-tight text-[#0a0a0a]">
              <Trans>This is a kids book</Trans>
            </span>
            <span className="text-[12.5px] leading-relaxed text-[#737373]">
              <Trans>
                Applies to the preview immediately and to every export.
              </Trans>
            </span>
          </div>
          <Switch
            checked={enabled}
            onCheckedChange={setEnabled}
            disabled={updateKidsMode.isPending || !config}
            aria-label={t`This is a kids book`}
            className="shrink-0"
          />
        </div>
      </div>

      {!enabled && (
        <p className="-mt-2 text-[12.5px] text-[#737373]">
          <Trans>Turn on kids mode to configure buddies and voices.</Trans>
        </p>
      )}

      {/* Reading buddies — master-detail */}
      <section className="flex flex-col gap-4 rounded-xl border border-[#e5e5e5] bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h3 className="text-[15px] font-semibold tracking-tight text-[#0a0a0a]">
              <Trans>Reading buddies</Trans>
            </h3>
            <p className="text-[12.5px] leading-relaxed text-[#737373]">
              <Trans>
                Choose which buddies ship with the book, then tune each
                buddy's voice and preview what they say.
              </Trans>
            </p>
            <p className="text-[12px] font-medium text-[#a3a3a3]">
              <Plural
                value={buddies.length}
                one={`# of ${KIDS_BUDDIES.length} buddies ship with this book`}
                other={`# of ${KIDS_BUDDIES.length} buddies ship with this book`}
              />
            </p>
          </div>
          {languages.length > 0 && (
            <div className="flex shrink-0 items-center gap-1.5 text-[12px] font-medium text-[#737373]">
              <span>
                <Trans>Audition</Trans>
              </span>
              <Select
                value={auditionLang ?? undefined}
                onValueChange={(value) => {
                  stopAudition()
                  setAuditionLangChoice(value)
                }}
              >
                <SelectTrigger
                  aria-label={t`Audition language`}
                  className="h-8 w-auto gap-1.5 rounded-md border-[#e5e5e5] bg-white px-2 text-[12px] font-medium uppercase text-[#0a0a0a] transition-colors duration-150 hover:border-[#c9c9c9] focus:ring-indigo-600 focus:ring-offset-1"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {languages.map((entry) => (
                    <SelectItem
                      key={entry.language}
                      value={entry.language}
                      className="text-[12px] font-medium uppercase"
                    >
                      {entry.language.toUpperCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <div
          className={cn(
            "flex flex-col gap-4 lg:flex-row",
            !enabled && "pointer-events-none opacity-60",
          )}
        >
          {/* Left rail */}
          <div className="flex shrink-0 flex-col gap-1.5 lg:w-64 xl:w-72">
            {KIDS_BUDDIES.map((buddy) => (
              <BuddyRailRow
                key={buddy.id}
                buddy={buddy}
                shipped={buddies.includes(buddy.id)}
                selected={buddy.id === selectedBuddy.id}
                hasPack={buddyHasAnyPack(buddy.id)}
                enabled={enabled && !updateKidsMode.isPending}
                onSelect={() => setSelectedBuddyId(buddy.id)}
                onToggleShipped={() => toggleBuddy(buddy.id)}
              />
            ))}
            <AddBuddyRailTile />
          </div>

          {/* Right detail panel */}
          <div className="flex min-w-0 flex-1 flex-col gap-5 rounded-lg border border-[#e5e5e5] p-4">
            <div className="flex items-center gap-3">
              <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-sky-50">
                <img
                  src={BUDDY_IMAGES[selectedBuddy.id]}
                  alt=""
                  width={56}
                  height={56}
                  className="h-14 w-14 object-contain"
                />
              </span>
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-[16px] font-semibold tracking-tight text-[#0a0a0a]">
                  {selectedName}
                </span>
                <span className="text-[12.5px] text-[#737373]">
                  {selectedBuddy.labelFallback}
                </span>
              </div>
            </div>

            {/* Voice controls */}
            <div className="flex flex-col gap-3 rounded-lg border border-[#e5e5e5] p-4">
              <div className="flex items-center justify-between gap-3">
                <h4 className="text-[13px] font-semibold text-[#0a0a0a]">
                  <Trans>Voice</Trans>
                </h4>
                <Badge
                  variant="outline"
                  className={cn(
                    "px-2 py-0.5 text-[11px] font-medium",
                    serverIsDefault
                      ? "border-[#e5e5e5] text-[#737373]"
                      : "border-transparent bg-indigo-50 text-indigo-700",
                  )}
                >
                  {serverIsDefault ? (
                    <Trans>Default</Trans>
                  ) : (
                    <Trans>Edited</Trans>
                  )}
                </Badge>
              </div>

              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="kids-buddy-voice-select"
                  className="text-[11.5px] font-medium text-[#737373]"
                >
                  <Trans>Voice preset</Trans>
                </label>
                <Select
                  value={effectiveVoice}
                  onValueChange={(value) =>
                    setVoiceDraft({
                      voice: value,
                      instructions: effectiveInstructions,
                    })
                  }
                  disabled={!voicesData || !enabled}
                >
                  <SelectTrigger
                    id="kids-buddy-voice-select"
                    className="h-9 w-full max-w-xs border-[#e5e5e5] text-[13px]"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(voicesData?.voices ?? []).map((voiceId) => (
                      <SelectItem key={voiceId} value={voiceId}>
                        {voiceId}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="kids-buddy-instructions"
                  className="text-[11.5px] font-medium text-[#737373]"
                >
                  <Trans>Style instructions</Trans>
                </label>
                <Textarea
                  id="kids-buddy-instructions"
                  value={effectiveInstructions}
                  onChange={(event) =>
                    setVoiceDraft({
                      voice: effectiveVoice,
                      instructions: event.target.value,
                    })
                  }
                  disabled={!enabled}
                  className="min-h-[140px] font-mono text-[12.5px] leading-relaxed"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  disabled={!enabled || !isDirty || updateBuddyVoice.isPending}
                  onClick={handleSaveVoice}
                >
                  {updateBuddyVoice.isPending && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  )}
                  <Trans>Save voice</Trans>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={
                    !enabled || serverIsDefault || resetBuddyVoice.isPending
                  }
                  onClick={handleResetVoice}
                >
                  {resetBuddyVoice.isPending && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  )}
                  <Trans>Reset to default</Trans>
                </Button>
              </div>
            </div>

            {/* Per-buddy generation */}
            <div className="flex flex-col gap-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-col gap-0.5">
                  <h4 className="text-[13px] font-semibold text-[#0a0a0a]">
                    <Trans>{selectedName}'s voice pack</Trans>
                  </h4>
                  <span className="text-[11.5px] text-[#a3a3a3]">
                    <Trans>Only affects {selectedName}.</Trans>
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={
                    !enabled ||
                    !hasApiKey ||
                    generateVoice.isPending ||
                    languages.length === 0
                  }
                  onClick={() =>
                    runVoice(false, { characters: [selectedBuddy.id] })
                  }
                >
                  {isBuddyAllLanguagesPending(selectedBuddy.id) ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Mic className="h-3.5 w-3.5" />
                  )}
                  <Trans>Generate {selectedName}'s voice</Trans>
                </Button>
              </div>
              <div className="flex flex-col gap-2">
                {languages.map((entry) => {
                  const buddyReady =
                    entry.hasPack && entry.characters.includes(selectedBuddy.id)
                  const pending = isBuddyLanguagePending(
                    selectedBuddy.id,
                    entry.language,
                  )
                  return (
                    <div
                      key={entry.language}
                      className="flex items-center justify-between gap-3 rounded-lg border border-[#e5e5e5] px-3 py-2"
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span className="text-[13px] font-medium uppercase text-[#0a0a0a]">
                          {entry.language}
                        </span>
                        {buddyReady ? (
                          <Badge
                            variant="outline"
                            className="gap-1 border-transparent bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800 hover:bg-emerald-50"
                          >
                            <CheckCircle2 className="h-3 w-3" />
                            <Trans>Ready</Trans>
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="gap-1 border-[#e5e5e5] px-2 py-0.5 text-[11px] font-medium text-[#737373]"
                          >
                            <CircleDashed className="h-3 w-3" />
                            <Trans>Not generated</Trans>
                          </Badge>
                        )}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={
                          !enabled || !hasApiKey || generateVoice.isPending
                        }
                        onClick={() =>
                          runVoice(false, {
                            languages: [entry.language],
                            characters: [selectedBuddy.id],
                          })
                        }
                      >
                        {pending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Mic className="h-3.5 w-3.5" />
                        )}
                        <Trans>Generate</Trans>
                      </Button>
                    </div>
                  )
                })}
                {languages.length === 0 && (
                  <p className="text-[12.5px] text-[#737373]">
                    <Trans>
                      Add languages to the book to generate voice packs.
                    </Trans>
                  </p>
                )}
              </div>
              {!hasApiKey && (
                <span className="text-[12.5px] text-[#737373]">
                  <Trans>Add your OpenAI key in Settings to generate.</Trans>
                </span>
              )}
            </div>

            {/* Lines */}
            <BuddyLinesPanel
              buddy={selectedBuddy}
              auditionLang={auditionLang}
              canAudition={canAuditionFor(selectedBuddy.id)}
              playingKey={playingKey}
              onToggleLine={(lineKey) => toggleAudition(selectedBuddy.id, lineKey)}
            />
          </div>
        </div>
      </section>

      {/* Global voice-pack plan */}
      <section className="flex flex-col gap-3 rounded-xl border border-[#e5e5e5] bg-white p-5">
        <div className="flex flex-col gap-1">
          <h3 className="text-[15px] font-semibold tracking-tight text-[#0a0a0a]">
            <Trans>Voice pack overview</Trans>
          </h3>
          <p className="text-[12.5px] leading-relaxed text-[#737373]">
            <Trans>
              Pre-generate spoken buddy phrases per language so the book talks
              offline. Clips are cached — re-runs only pay for lines that
              changed.
            </Trans>
          </p>
        </div>

        <div
          className={cn(
            "flex flex-col gap-3",
            !enabled && "pointer-events-none opacity-60",
          )}
        >
          {languages.length > 0 && !anyPackReady && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-sky-50 px-4 py-3">
              <p className="text-[13px] leading-relaxed text-[#0a0a0a]">
                <Trans>
                  No buddy voices generated yet — check the plan to see cost
                  and clip count before running it for real.
                </Trans>
              </p>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              disabled={
                !enabled ||
                !hasApiKey ||
                generateVoice.isPending ||
                languages.length === 0
              }
              onClick={() => runVoice(false)}
              className="shrink-0"
            >
              {isGlobalGeneratePending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Mic className="h-3.5 w-3.5" />
              )}
              <Trans>Generate all buddy voices</Trans>
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!enabled || generateVoice.isPending}
              onClick={() => runVoice(true)}
              className="shrink-0 bg-white"
            >
              {isDryRunPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              <Trans>Check plan</Trans>
            </Button>
            {!hasApiKey && (
              <span className="text-[12.5px] text-[#737373]">
                <Trans>Add your OpenAI key in Settings to generate.</Trans>
              </span>
            )}
          </div>
          <p className="text-[12px] text-[#a3a3a3]">
            <Trans>
              Generates every shipped buddy in every book language.
            </Trans>
          </p>

          {voiceError && (
            <p className="text-[12.5px] leading-relaxed text-red-600">
              {voiceError}
            </p>
          )}

          {lastRun && !voiceError && (
            <p className="text-[12.5px] leading-relaxed text-[#737373]">
              {lastRun.dryRun ? (
                <Trans>
                  Plan: {lastRun.total} clips across {lastRun.languages.length}{" "}
                  language(s) × {lastRun.characters.length} buddies —{" "}
                  {lastRun.cachedHits} already cached,{" "}
                  {lastRun.total - lastRun.cachedHits} would call the API
                  (model {lastRun.model}).
                </Trans>
              ) : (
                <Trans>
                  Done: {lastRun.total} clips ready — {lastRun.generated} newly
                  generated, {lastRun.cachedHits} from cache.
                </Trans>
              )}
            </p>
          )}
        </div>
      </section>
    </div>
  )
}

function BuddyRailRow({
  buddy,
  shipped,
  selected,
  hasPack,
  enabled,
  onSelect,
  onToggleShipped,
}: {
  buddy: KidsBuddyMeta
  shipped: boolean
  selected: boolean
  hasPack: boolean
  enabled: boolean
  onSelect: () => void
  onToggleShipped: () => void
}) {
  const { t } = useLingui()
  const name = buddy.defaultNameFallback

  return (
    <div
      role="button"
      tabIndex={enabled ? 0 : -1}
      aria-pressed={selected}
      aria-disabled={!enabled}
      aria-label={name}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (!enabled) return
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          onSelect()
        }
      }}
      className={cn(
        "group flex cursor-pointer items-center gap-2.5 rounded-lg border pl-2.5 pr-2 py-2 transition duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-1",
        selected
          ? "border-transparent bg-indigo-50/70 ring-1 ring-inset ring-indigo-600"
          : "border-transparent hover:bg-[#fafafa]",
      )}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-50">
        <img
          src={BUDDY_IMAGES[buddy.id]}
          alt=""
          width={36}
          height={36}
          className={cn(
            "h-9 w-9 object-contain transition duration-200",
            !shipped && "opacity-50 grayscale",
          )}
        />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[13.5px] font-semibold text-[#0a0a0a]">
            {name}
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                aria-label={
                  hasPack
                    ? t`Voice pack ready for ${name}`
                    : t`No voice pack yet for ${name}`
                }
                className={cn(
                  "h-1.5 w-1.5 shrink-0 rounded-full",
                  hasPack ? "bg-emerald-500" : "bg-[#d4d4d4]",
                )}
              />
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={6} variant="light">
              {hasPack ? (
                <Trans>Voice pack ready</Trans>
              ) : (
                <Trans>No voice pack yet</Trans>
              )}
            </TooltipContent>
          </Tooltip>
        </span>
        <span className="truncate text-[11.5px] text-[#737373]">
          {buddy.labelFallback}
        </span>
      </span>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          >
            <Switch
              checked={shipped}
              onCheckedChange={onToggleShipped}
              disabled={!enabled}
              aria-label={t`${name} ships with this book`}
              className="shrink-0"
            />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={6} variant="light">
          <Trans>Ships with this book</Trans>
        </TooltipContent>
      </Tooltip>
    </div>
  )
}

function AddBuddyRailTile() {
  const { t } = useLingui()
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          role="button"
          aria-disabled="true"
          aria-label={t`Add your own buddy`}
          className="flex cursor-not-allowed items-center gap-2.5 rounded-lg border border-dashed border-[#d4d4d4] pl-2.5 pr-2 py-2 text-[#a3a3a3]"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#fafafa]">
            <Plus className="h-5 w-5 text-[#c9c9c9]" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-[13px] font-medium text-[#a3a3a3]">
              <Trans>Add your own buddy</Trans>
            </span>
            <span className="inline-flex w-fit items-center rounded-full border border-[#e5e5e5] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[#a3a3a3]">
              <Trans>Coming soon</Trans>
            </span>
          </span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={6} variant="light">
        <Trans>Custom buddies are coming soon</Trans>
      </TooltipContent>
    </Tooltip>
  )
}

function BuddyLinesPanel({
  buddy,
  auditionLang,
  canAudition,
  playingKey,
  onToggleLine,
}: {
  buddy: KidsBuddyMeta
  auditionLang: string | null
  canAudition: boolean
  playingKey: string | null
  onToggleLine: (lineKey: string) => void
}) {
  const { t } = useLingui()
  const name = buddy.defaultNameFallback
  const languageName = auditionLang
    ? (KIDS_LANGUAGE_NAMES[auditionLang] ?? auditionLang)
    : null
  const renderLine = (fallback: string) => {
    let text = fallback.replace(/\$\{name\}/g, name)
    if (languageName) text = text.replace(/\$\{language\}/g, languageName)
    return text
  }

  const speakableLines = getKidsSpeakableLines(buddy.id)
  const sayLines = speakableLines.filter(
    (line) => !line.key.startsWith("kids-pick-phrase"),
  )
  const pickLines = speakableLines.filter((line) =>
    line.key.startsWith("kids-pick-phrase"),
  )

  const renderRow = (line: KidsBuddyLine) => {
    const key = `${buddy.id}:${line.key}`
    const playing = playingKey === key
    return (
      <li
        key={line.key}
        className="flex items-center justify-between gap-3 rounded-lg border border-[#e5e5e5] bg-white px-3 py-2"
      >
        <span className="min-w-0 flex-1 text-[13px] leading-snug text-[#0a0a0a]">
          {renderLine(line.fallback)}
        </span>
        <button
          type="button"
          disabled={!canAudition}
          aria-label={t`Play this line`}
          onClick={() => onToggleLine(line.key)}
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border bg-white shadow-sm transition duration-150",
            canAudition
              ? "cursor-pointer border-[#e5e5e5] text-[#0a0a0a] hover:border-indigo-600 hover:text-indigo-700"
              : "cursor-not-allowed border-[#e5e5e5] text-[#c9c9c9]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-1",
            playing && "border-indigo-600 text-indigo-700 motion-safe:animate-pulse",
          )}
        >
          {playing ? (
            <Square className="h-3 w-3 fill-current" />
          ) : (
            <Play className="h-3 w-3" />
          )}
        </button>
      </li>
    )
  }

  return (
    <div className="flex min-h-0 flex-col gap-2.5">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-[13px] font-semibold text-[#0a0a0a]">
          <Trans>Lines</Trans>
        </h4>
        {!canAudition && (
          <span className="text-[11.5px] text-[#a3a3a3]">
            <Trans>Generate voices to preview lines</Trans>
          </span>
        )}
      </div>
      <div className="max-h-[340px] overflow-y-auto rounded-lg border border-[#e5e5e5] bg-[#fafafa] p-3">
        <div className="grid grid-cols-1 gap-x-4 gap-y-4 xl:grid-cols-2">
          <div className="flex flex-col gap-2">
            <h5 className="text-[11.5px] font-semibold uppercase tracking-wide text-[#737373]">
              <Trans>Things {name} says</Trans>
            </h5>
            <ul className="flex flex-col gap-1.5">{sayLines.map(renderRow)}</ul>
          </div>
          <div className="flex flex-col gap-2">
            <h5 className="text-[11.5px] font-semibold uppercase tracking-wide text-[#737373]">
              <Trans>Picking phrases</Trans>
            </h5>
            <ul className="flex flex-col gap-1.5">{pickLines.map(renderRow)}</ul>
          </div>
        </div>
      </div>
    </div>
  )
}
