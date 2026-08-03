import { useEffect, useRef, useState } from "react"
import { Plural, Trans, useLingui } from "@lingui/react/macro"
import { msg } from "@lingui/core/macro"
import type { MessageDescriptor } from "@lingui/core"
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  CircleDashed,
  Images,
  Languages,
  Loader2,
  MessageSquareText,
  Mic,
  PackageCheck,
  Pencil,
  Play,
  Plus,
  Smile,
  Sparkles,
  Square,
  Volume2,
} from "lucide-react"
import { Link } from "@tanstack/react-router"
import {
  getKidsSpeakableLines,
  KIDS_BUDDIES,
  KIDS_BUDDY_LINES,
  KIDS_LANGUAGE_NAMES,
  type KidsBuddyId,
  type KidsBuddyLine,
  type KidsBuddyMeta,
  type KidsOpenAiVoice,
} from "@adt/types/kids"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Collapsible } from "@/components/ui/collapsible"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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
  useTranslateKidsInterface,
  useUpdateKidsBuddyVoice,
  useUpdateKidsMode,
} from "@/hooks/use-kids-mode"
import {
  getKidsVoiceClipUrl,
  type KidsVoiceGenerationSummary,
} from "@/api/client"
import { cn } from "@/lib/utils"
import dino1 from "@kids-buddies/dino/dino_1.png"
import dino2 from "@kids-buddies/dino/dino_2.png"
import dino3 from "@kids-buddies/dino/dino_3.png"
import dino4 from "@kids-buddies/dino/dino_4.png"
import dino5 from "@kids-buddies/dino/dino_5.png"
import dino6 from "@kids-buddies/dino/dino_6.png"
import dino7 from "@kids-buddies/dino/dino_7.png"
import robot1 from "@kids-buddies/robot/robot_1.png"
import robot2 from "@kids-buddies/robot/robot_2.png"
import robot3 from "@kids-buddies/robot/robot_3.png"
import robot4 from "@kids-buddies/robot/robot_4.png"
import robot5 from "@kids-buddies/robot/robot_5.png"
import robot6 from "@kids-buddies/robot/robot_6.png"
import robot7 from "@kids-buddies/robot/robot_7.png"
import bunny1 from "@kids-buddies/bunny/bunny_1.png"
import bunny2 from "@kids-buddies/bunny/bunny_2.png"
import bunny3 from "@kids-buddies/bunny/bunny_3.png"
import bunny4 from "@kids-buddies/bunny/bunny_4.png"
import bunny5 from "@kids-buddies/bunny/bunny_5.png"
import bunny6 from "@kids-buddies/bunny/bunny_6.png"
import bunny7 from "@kids-buddies/bunny/bunny_7.png"
import cat1 from "@kids-buddies/cat/cat_1.png"
import cat2 from "@kids-buddies/cat/cat_2.png"
import cat3 from "@kids-buddies/cat/cat_3.png"
import cat4 from "@kids-buddies/cat/cat_4.png"
import cat5 from "@kids-buddies/cat/cat_5.png"
import cat6 from "@kids-buddies/cat/cat_6.png"
import cat7 from "@kids-buddies/cat/cat_7.png"
import alien1 from "@kids-buddies/alien/alien_1.png"
import alien2 from "@kids-buddies/alien/alien_2.png"
import alien3 from "@kids-buddies/alien/alien_3.png"
import alien4 from "@kids-buddies/alien/alien_4.png"
import alien5 from "@kids-buddies/alien/alien_5.png"
import alien6 from "@kids-buddies/alien/alien_6.png"
import alien7 from "@kids-buddies/alien/alien_7.png"

/**
 * Expression file-number convention from the runtime's buddy-images.ts
 * contract: images/<id>/<id>_<n>.png, 1 = standing … 7 = encouraging.
 */
const BUDDY_EXPRESSION_IMAGES: Record<string, string[]> = {
  dino: [dino1, dino2, dino3, dino4, dino5, dino6, dino7],
  robot: [robot1, robot2, robot3, robot4, robot5, robot6, robot7],
  bunny: [bunny1, bunny2, bunny3, bunny4, bunny5, bunny6, bunny7],
  cat: [cat1, cat2, cat3, cat4, cat5, cat6, cat7],
  alien: [alien1, alien2, alien3, alien4, alien5, alien6, alien7],
}

const EXPRESSION_LABELS: { key: string; label: MessageDescriptor }[] = [
  { key: "standing", label: msg`Standing` },
  { key: "signature", label: msg`Signature` },
  { key: "happy", label: msg`Happy` },
  { key: "excited", label: msg`Excited` },
  { key: "thinking", label: msg`Thinking` },
  { key: "surprised", label: msg`Surprised` },
  { key: "encouraging", label: msg`Encouraging` },
]

interface KidsBuddyExpression {
  key: string
  number: number
  label: MessageDescriptor
  src: string
}

/** Per-buddy expression sets, in expression order (standing first). */
const BUDDY_EXPRESSIONS: Record<string, KidsBuddyExpression[]> =
  Object.fromEntries(
    Object.entries(BUDDY_EXPRESSION_IMAGES).map(([id, images]) => [
      id,
      EXPRESSION_LABELS.map((entry, index) => ({
        key: entry.key,
        number: index + 1,
        label: entry.label,
        src: images[index],
      })),
    ]),
  )

/** The buddy's standing pose — used everywhere a single portrait is needed. */
function buddyPortrait(id: string): string {
  return BUDDY_EXPRESSION_IMAGES[id]?.[0] ?? ""
}

const KIDS_INTRO_COLLAPSED_KEY = "adt.kids-mode-intro-collapsed"

function readKidsIntroCollapsed(): boolean {
  if (typeof window === "undefined") return false
  try {
    // No stored preference yet (first visit) → default to expanded so the
    // intro explains Kids Mode up front. An explicit "1" (the author
    // previously collapsed it) overrides that default.
    const stored = window.localStorage.getItem(KIDS_INTRO_COLLAPSED_KEY)
    return stored === null ? false : stored === "1"
  } catch {
    // localStorage can throw in private mode / disabled storage — default to expanded.
    return false
  }
}

function writeKidsIntroCollapsed(collapsed: boolean): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(KIDS_INTRO_COLLAPSED_KEY, collapsed ? "1" : "0")
  } catch {
    // localStorage can throw on quota / private mode — persistence is best-effort.
  }
}

interface VoiceDraft {
  voice: KidsOpenAiVoice
  instructions: string
}

interface BuddyVoiceInfo {
  voice: KidsOpenAiVoice
  instructions: string
  isDefault: boolean
}

export function KidsModeScreen({ bookLabel }: { bookLabel: string }) {
  const { t, i18n } = useLingui()
  const { data: config } = useKidsMode(bookLabel)
  const updateKidsMode = useUpdateKidsMode(bookLabel)
  const { data: voiceStatus } = useKidsVoiceStatus(bookLabel)
  const { data: voicesData } = useKidsVoices(bookLabel)
  const generateVoice = useGenerateKidsVoice(bookLabel)
  const translateInterface = useTranslateKidsInterface(bookLabel)
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
    () => KIDS_BUDDIES[0].id,
  )
  const [shownExpression, setShownExpression] = useState<string>("standing")
  const [centerTab, setCenterTab] = useState<"lines" | "art">("art")
  const [voiceDraft, setVoiceDraft] = useState<VoiceDraft | null>(null)
  const [introExpanded, setIntroExpanded] = useState<boolean>(
    () => !readKidsIntroCollapsed(),
  )
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
  const buddyExpressions = BUDDY_EXPRESSIONS[selectedBuddy.id] ?? []
  const stageExpression =
    buddyExpressions.find((expression) => expression.key === shownExpression) ??
    buddyExpressions[0]

  const getBuddyVoiceInfo = (buddy: KidsBuddyMeta): BuddyVoiceInfo => {
    const override = voicesData?.buddies.find((entry) => entry.id === buddy.id)
    return {
      voice: override?.voice ?? (buddy.voice.voice as KidsOpenAiVoice),
      instructions: override?.instructions ?? buddy.voice.instructions,
      isDefault: override?.isDefault ?? true,
    }
  }

  const selectedVoiceInfo = getBuddyVoiceInfo(selectedBuddy)
  const savedVoice = selectedVoiceInfo.voice
  const savedInstructions = selectedVoiceInfo.instructions
  const serverIsDefault = selectedVoiceInfo.isDefault
  const effectiveVoice = voiceDraft?.voice ?? savedVoice
  const effectiveInstructions = voiceDraft?.instructions ?? savedInstructions
  const isDirty =
    effectiveVoice !== savedVoice || effectiveInstructions !== savedInstructions

  useEffect(() => {
    setVoiceDraft(null)
    setShownExpression("standing")
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

  const toggleIntro = () => {
    setIntroExpanded((prev) => {
      const next = !prev
      writeKidsIntroCollapsed(!next)
      return next
    })
  }

  const toggleBuddy = (id: KidsBuddyId) => {
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

  const runTranslate = () => {
    translateInterface.mutate({ apiKey })
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

  const canAuditionSelected = canAuditionFor(selectedBuddy.id)

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-7xl flex-col gap-3 overflow-hidden px-6 py-4">
      {/* BACK LINK */}
      <div className="flex shrink-0 items-center">
        <Link
          to="/books/$label/$step"
          params={{ label: bookLabel, step: "book" }}
          className="inline-flex w-fit items-center gap-1.5 rounded text-[13px] font-medium text-[#737373] transition-colors duration-150 hover:text-[#0a0a0a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-2"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <Trans>Back to book</Trans>
        </Link>
      </div>

      {/* INTRO — collapsible "What is Kids Mode" section */}
      <Card className="shrink-0 overflow-hidden rounded-xl border-[#e5e5e5] bg-white shadow-none">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0 p-4">
          <div className="flex flex-wrap items-center gap-3">
            {introExpanded ? (
              <div className="flex shrink-0 -space-x-3" aria-hidden>
                {KIDS_BUDDIES.map((buddy) => (
                  <span
                    key={buddy.id}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sky-50 ring-2 ring-white transition-transform duration-150 motion-reduce:transition-none"
                  >
                    <img
                      src={buddyPortrait(buddy.id)}
                      alt=""
                      width={34}
                      height={34}
                      className="h-[34px] w-[34px] object-contain"
                    />
                  </span>
                ))}
              </div>
            ) : (
              <div className="flex shrink-0 -space-x-2.5" aria-hidden>
                {KIDS_BUDDIES.slice(0, 3).map((buddy) => (
                  <span
                    key={buddy.id}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-50 ring-2 ring-white"
                  >
                    <img
                      src={buddyPortrait(buddy.id)}
                      alt=""
                      width={24}
                      height={24}
                      className="h-6 w-6 object-contain"
                    />
                  </span>
                ))}
                {KIDS_BUDDIES.length > 3 && (
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#f5f5f5] text-[10px] font-semibold text-[#737373] ring-2 ring-white">
                    +{KIDS_BUDDIES.length - 3}
                  </span>
                )}
              </div>
            )}
            <h1 className="text-[17px] font-semibold leading-tight tracking-tight text-[#0a0a0a]">
              <Trans>Kids Mode</Trans>
            </h1>
            <label className="flex items-center gap-2 text-[13px] font-medium text-[#0a0a0a]">
              <Switch
                checked={enabled}
                onCheckedChange={setEnabled}
                disabled={updateKidsMode.isPending || !config}
                aria-label={t`This is a kids book`}
              />
              <Trans>This is a kids book</Trans>
            </label>
            <Badge
              variant="outline"
              className={cn(
                "px-2 py-0.5 text-[11px] font-medium",
                enabled
                  ? "border-transparent bg-emerald-50 text-emerald-800"
                  : "border-[#e5e5e5] text-[#737373]",
              )}
            >
              {enabled ? (
                <Trans>On for this book</Trans>
              ) : (
                <Trans>Off by default</Trans>
              )}
            </Badge>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-expanded={introExpanded}
            aria-controls="kids-mode-intro-content"
            aria-label={
              introExpanded
                ? t`Hide Kids Mode details`
                : t`Show Kids Mode details`
            }
            onClick={toggleIntro}
            className="h-9 w-9 shrink-0 text-[#737373] hover:bg-[#f5f5f5] hover:text-[#0a0a0a]"
          >
            <ChevronDown
              className={cn(
                "h-4 w-4 transition-transform duration-200 motion-reduce:transition-none",
                introExpanded && "rotate-180",
              )}
            />
          </Button>
        </CardHeader>
        <Collapsible shown={introExpanded}>
          <CardContent
            id="kids-mode-intro-content"
            className="flex flex-col gap-4 p-4 pt-0"
          >
            <p className="max-w-3xl text-[13px] leading-relaxed text-[#404040]">
              <Trans>
                Kids Mode swaps the standard reading menus for a friendly,
                buddy-guided experience. The author chooses which buddies ship
                with the book, and the reader picks one during onboarding. The
                setting is baked into the live preview and web book exports,
                so readers can't turn Kids Mode off.
              </Trans>
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="flex flex-col gap-2.5 rounded-xl border border-[#f0f0f0] bg-white p-3.5 shadow-sm transition-shadow duration-200 hover:shadow-md">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-700">
                  <Smile className="h-5 w-5" aria-hidden />
                </span>
                <div className="flex flex-col gap-1">
                  <span className="text-[12.5px] font-semibold text-[#0a0a0a]">
                    <Trans>Buddy-guided interface</Trans>
                  </span>
                  <p className="text-[12px] leading-relaxed text-[#737373]">
                    <Trans>
                      A friendly character fronts every reading tool, from
                      text-to-speech to font size.
                    </Trans>
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-2.5 rounded-xl border border-[#f0f0f0] bg-white p-3.5 shadow-sm transition-shadow duration-200 hover:shadow-md">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700">
                  <Volume2 className="h-5 w-5" aria-hidden />
                </span>
                <div className="flex flex-col gap-1">
                  <span className="text-[12.5px] font-semibold text-[#0a0a0a]">
                    <Trans>Spoken buddy voices</Trans>
                  </span>
                  <p className="text-[12px] leading-relaxed text-[#737373]">
                    <Trans>
                      Each buddy talks in the reader's language, generated once
                      per language and cached for offline use.
                    </Trans>
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-2.5 rounded-xl border border-[#f0f0f0] bg-white p-3.5 shadow-sm transition-shadow duration-200 hover:shadow-md">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-800">
                  <PackageCheck className="h-5 w-5" aria-hidden />
                </span>
                <div className="flex flex-col gap-1">
                  <span className="text-[12.5px] font-semibold text-[#0a0a0a]">
                    <Trans>Baked into the book</Trans>
                  </span>
                  <p className="text-[12px] leading-relaxed text-[#737373]">
                    <Trans>
                      Applies to the live preview and web book exports — readers
                      can't turn it off.
                    </Trans>
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Collapsible>
      </Card>

      {/* GLOBAL ACTIONS — audition, plan check, bulk voice generation */}
      <div className="flex shrink-0 flex-col gap-2 border-b border-[#e5e5e5] pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-[11px] font-medium text-[#a3a3a3]">
            <Plural
              value={buddies.length}
              one={`# of ${KIDS_BUDDIES.length} shipping`}
              other={`# of ${KIDS_BUDDIES.length} shipping`}
            />
          </span>

          <div className="flex flex-wrap items-center gap-2">
            {languages.length > 0 && (
              <div className="flex items-center gap-1.5 text-[12px] font-medium text-[#737373]">
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
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={
                    !enabled ||
                    !hasApiKey ||
                    translateInterface.isPending ||
                    languages.length <= 1
                  }
                  onClick={runTranslate}
                  className="shrink-0 bg-white"
                >
                  {translateInterface.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Languages className="h-3.5 w-3.5" />
                  )}
                  <Trans>Translate interface</Trans>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={6} variant="light">
                <Trans>
                  Translates the kids onboarding and menu into the book's other
                  languages. Run this before generating voices so clips speak
                  the translated text.
                </Trans>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
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
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={6} variant="light">
                <Trans>
                  Generates every shipped buddy in every book language.
                </Trans>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        <div className="flex flex-wrap items-start justify-end gap-3 empty:hidden">
          {enabled &&
            (voiceError ||
              lastRun ||
              !hasApiKey ||
              (languages.length > 0 && !anyPackReady)) && (
              <p
                className={cn(
                  "max-w-md text-right text-[12px] leading-snug",
                  voiceError ? "text-red-600" : "text-[#737373]",
                )}
              >
                {voiceError ? (
                  voiceError
                ) : lastRun ? (
                  lastRun.dryRun ? (
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
                      Done: {lastRun.total} clips ready —{" "}
                      {lastRun.generated} newly generated,{" "}
                      {lastRun.cachedHits} from cache.
                    </Trans>
                  )
                ) : !hasApiKey ? (
                  <Trans>
                    Add your OpenAI key in Settings to generate voices.
                  </Trans>
                ) : (
                  <Trans>
                    No buddy voices generated yet — check the plan to see cost
                    before generating.
                  </Trans>
                )}
              </p>
            )}

          {enabled && (translateInterface.data || translateInterface.error) && (
            <p
              className={cn(
                "max-w-md text-right text-[12px] leading-snug",
                translateInterface.isError ? "text-red-600" : "text-[#737373]",
              )}
            >
              {translateInterface.isError ? (
                translateInterface.error instanceof Error ? (
                  translateInterface.error.message
                ) : (
                  String(translateInterface.error)
                )
              ) : (translateInterface.data?.languages.length ?? 0) > 0 ? (
                <Trans>
                  Translated the kids interface into{" "}
                  {translateInterface.data?.languages.length} language(s).
                </Trans>
              ) : (
                <Trans>
                  Nothing to translate — the book has no other languages.
                </Trans>
              )}
            </p>
          )}

          {!enabled && (
            <p className="text-[12px] text-[#737373]">
              <Trans>Turn on kids mode to configure buddies and voices.</Trans>
            </p>
          )}
        </div>
      </div>

      {/* THREE ZONES: avatar rail · buddy stage · inspector */}
      <div className="flex min-h-0 flex-1 gap-3">
        {/* LEFT — persistent avatar switcher rail */}
        <aside
          aria-label={t`Buddies`}
          className="flex w-20 shrink-0 flex-col items-center gap-2 overflow-y-auto px-2 py-2"
        >
          <div className="flex flex-col items-center gap-2">
            {KIDS_BUDDIES.map((buddy) => {
              const selected = buddy.id === selectedBuddy.id
              const shipped = buddies.includes(buddy.id)
              const packReady = canAuditionFor(buddy.id)
              return (
                <Tooltip key={buddy.id}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label={buddy.defaultNameFallback}
                      aria-pressed={selected}
                      onClick={() => setSelectedBuddyId(buddy.id)}
                      className={cn(
                        "relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-sky-50 transition duration-150",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-1",
                        selected
                          ? "bg-indigo-50 ring-2 ring-indigo-600 ring-offset-1"
                          : "hover:bg-sky-100",
                      )}
                    >
                      <img
                        src={buddyPortrait(buddy.id)}
                        alt=""
                        width={40}
                        height={40}
                        className={cn(
                          "h-10 w-10 object-contain transition duration-150",
                          !shipped && "opacity-45 grayscale",
                        )}
                      />
                      <span
                        aria-hidden
                        className={cn(
                          "absolute bottom-1.5 right-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-white",
                          packReady ? "bg-emerald-500" : "bg-[#d4d4d4]",
                        )}
                      />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right" sideOffset={6} variant="light">
                    {buddy.defaultNameFallback}
                  </TooltipContent>
                </Tooltip>
              )
            })}
          </div>

          <Tooltip>
            <TooltipTrigger asChild>
              <span className="mt-auto pt-2">
                <button
                  type="button"
                  disabled
                  aria-label={t`Add your own buddy`}
                  className={cn(
                    "flex h-14 w-14 shrink-0 cursor-not-allowed items-center justify-center rounded-2xl border-[1.5px] border-dashed border-slate-200 bg-slate-50/70 text-slate-400 transition duration-150 motion-reduce:transition-none",
                    "motion-safe:hover:-translate-y-0.5 motion-safe:hover:border-indigo-200 motion-safe:hover:bg-indigo-50/70 motion-safe:hover:text-indigo-400",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-1",
                  )}
                >
                  <Plus className="h-5 w-5" aria-hidden />
                </button>
              </span>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={6} variant="light">
              <Trans>Custom buddies are coming soon</Trans>
            </TooltipContent>
          </Tooltip>
        </aside>

        {/* CENTER + RIGHT — dimmed together while kids mode is off */}
        <div
          className={cn(
            "flex min-h-0 flex-1 gap-4",
            !enabled && "pointer-events-none opacity-60",
          )}
        >
          {/* CENTER — buddy stage */}
          <div
            key={selectedBuddy.id}
            className="flex min-h-0 flex-1 flex-col gap-3 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-150"
          >
            <Tabs
              value={centerTab}
              onValueChange={(value) => setCenterTab(value as "lines" | "art")}
              className="flex min-h-0 flex-1 flex-col gap-3"
            >
              <TabsList
                aria-label={t`Buddy stage view`}
                className="h-auto shrink-0 self-start gap-1 rounded-lg bg-[#f5f5f5] p-1"
              >
                <TabsTrigger
                  value="art"
                  className="gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-medium transition-colors duration-150 focus-visible:ring-offset-1 motion-reduce:transition-none"
                >
                  <Images className="h-3.5 w-3.5" aria-hidden />
                  <Trans>Character art</Trans>
                </TabsTrigger>
                <TabsTrigger
                  value="lines"
                  className="gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-medium transition-colors duration-150 focus-visible:ring-offset-1 motion-reduce:transition-none"
                >
                  <MessageSquareText className="h-3.5 w-3.5" aria-hidden />
                  <Trans>Lines</Trans>
                </TabsTrigger>
              </TabsList>

              <TabsContent
                value="lines"
                className="mt-0 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto rounded-xl border border-[#e5e5e5] bg-[#fafafa] p-3.5 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-1"
              >
                {!canAuditionSelected && (
                  <p className="shrink-0 text-[11px] text-[#a3a3a3]">
                    <Trans>Generate voices to preview lines</Trans>
                  </p>
                )}
                <BuddyLinesPanel
                  buddy={selectedBuddy}
                  auditionLang={auditionLang}
                  canAudition={canAuditionSelected}
                  playingKey={playingKey}
                  onToggleLine={(lineKey) =>
                    toggleAudition(selectedBuddy.id, lineKey)
                  }
                />
              </TabsContent>

              <TabsContent
                value="art"
                className="mt-0 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto rounded-xl border border-[#e5e5e5] bg-white p-4 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-1"
              >
                <div className="flex w-full shrink-0 items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <h3 className="text-[13px] font-semibold text-[#0a0a0a]">
                      <Trans>Character art</Trans>
                    </h3>
                    <p className="truncate text-[12px] text-[#737373]">
                      <Trans>
                        The expression set {selectedBuddy.defaultNameFallback}{" "}
                        uses across the reading experience
                      </Trans>
                    </p>
                  </div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="shrink-0">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled
                          className="h-7 cursor-not-allowed gap-1.5 bg-white px-2 text-[12px]"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          <Trans>Edit</Trans>
                        </Button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" sideOffset={6} variant="light">
                      <Trans>Editing character art is coming soon</Trans>
                    </TooltipContent>
                  </Tooltip>
                </div>

                <div className="flex min-h-0 flex-1 flex-col gap-3">
                  <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 rounded-2xl border border-[#e5e5e5] bg-gradient-to-b from-sky-50 to-white p-4 shadow-sm">
                    <div className="flex min-h-0 w-full flex-1 items-center justify-center rounded-[28px] bg-white p-3 shadow-sm ring-1 ring-[#f0f0f0]">
                      {stageExpression && (
                        <img
                          key={stageExpression.key}
                          src={stageExpression.src}
                          alt={selectedBuddy.defaultNameFallback}
                          className="max-h-full w-auto max-w-full object-contain motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-150"
                        />
                      )}
                    </div>
                    {stageExpression && (
                      <span className="shrink-0 rounded-full border border-[#e5e5e5] bg-white px-3 py-1 text-[12px] font-medium text-[#0a0a0a] shadow-sm motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-150">
                        {i18n._(stageExpression.label)}
                      </span>
                    )}
                  </div>

                  <div className="flex shrink-0 flex-col gap-2">
                    <h4 className="text-[11.5px] font-semibold uppercase tracking-wide text-[#737373]">
                      <Trans>All expressions</Trans>
                    </h4>
                    <ExpressionGallery
                      buddy={selectedBuddy}
                      shownKey={shownExpression}
                      onSelect={setShownExpression}
                    />
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>

          {/* RIGHT — inspector */}
          <aside className="flex min-h-0 w-[336px] shrink-0 flex-col gap-2.5 overflow-y-auto border-l border-[#e5e5e5] py-1 pl-4 pr-1">
            <div className="flex shrink-0 items-center gap-3 pb-1">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-sky-50">
                <img
                  src={buddyPortrait(selectedBuddy.id)}
                  alt=""
                  width={38}
                  height={38}
                  className="h-[38px] w-[38px] object-contain"
                />
              </span>
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-[15px] font-semibold tracking-tight text-[#0a0a0a]">
                  {selectedBuddy.defaultNameFallback}
                </span>
                <span className="truncate text-[12px] text-[#737373]">
                  {selectedBuddy.labelFallback}
                </span>
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="ml-auto flex items-center gap-2">
                    <Switch
                      checked={buddies.includes(selectedBuddy.id)}
                      onCheckedChange={() => toggleBuddy(selectedBuddy.id)}
                      disabled={!enabled || updateKidsMode.isPending}
                      aria-label={t`${selectedBuddy.defaultNameFallback} ships with this book`}
                    />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom" sideOffset={6} variant="light">
                  <Trans>Ships with this book</Trans>
                </TooltipContent>
              </Tooltip>
            </div>

            <div className="flex shrink-0 flex-col gap-2 rounded-xl border border-[#e5e5e5] bg-white p-3">
              <div className="flex shrink-0 items-center justify-between gap-3">
                <h4 className="text-[12.5px] font-semibold text-[#0a0a0a]">
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

              <div className="flex shrink-0 flex-col gap-1.5">
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
                      voice: value as KidsOpenAiVoice,
                      instructions: effectiveInstructions,
                    })
                  }
                  disabled={!voicesData || !enabled}
                >
                  <SelectTrigger
                    id="kids-buddy-voice-select"
                    className="h-9 w-full border-[#e5e5e5] text-[13px]"
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
                  className="shrink-0 text-[11.5px] font-medium text-[#737373]"
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
                  className="min-h-[120px] max-h-[200px] resize-y font-mono text-[12px] leading-relaxed"
                />
              </div>

              <div className="flex shrink-0 flex-wrap items-center gap-2">
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

            <div className="flex shrink-0 flex-col gap-2 rounded-xl border border-[#e5e5e5] bg-white p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-[12.5px] font-semibold text-[#0a0a0a]">
                  <Trans>{selectedBuddy.defaultNameFallback}'s voice pack</Trans>
                </h4>
                {languages.length > 1 && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!enabled || !hasApiKey || generateVoice.isPending}
                    onClick={() =>
                      runVoice(false, { characters: [selectedBuddy.id] })
                    }
                  >
                    {isBuddyAllLanguagesPending(selectedBuddy.id) ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Mic className="h-3.5 w-3.5" />
                    )}
                    <Trans>Generate all languages</Trans>
                  </Button>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
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
                      className="flex items-center justify-between gap-3 rounded-lg border border-[#e5e5e5] px-2.5 py-1.5"
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span className="text-[12.5px] font-medium uppercase text-[#0a0a0a]">
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
                  <p className="text-[12px] text-[#737373]">
                    <Trans>
                      Add languages to the book to generate voice packs.
                    </Trans>
                  </p>
                )}
              </div>
              {!hasApiKey && (
                <span className="text-[12px] text-[#737373]">
                  <Trans>Add your OpenAI key in Settings to generate.</Trans>
                </span>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
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
  )
}

function ExpressionGallery({
  buddy,
  shownKey,
  onSelect,
}: {
  buddy: KidsBuddyMeta
  shownKey: string
  onSelect: (key: string) => void
}) {
  const { t, i18n } = useLingui()
  const name = buddy.defaultNameFallback
  const expressions = BUDDY_EXPRESSIONS[buddy.id] ?? []

  return (
    <div
      role="tablist"
      aria-label={t`${name}'s expressions`}
      className="flex w-full items-stretch gap-1.5 overflow-x-auto px-1 py-1.5"
    >
      {expressions.map((expression) => {
        const label = i18n._(expression.label)
        const active = shownKey === expression.key
        return (
          <button
            key={expression.key}
            type="button"
            role="tab"
            aria-selected={active}
            aria-label={`${name} — ${label}`}
            onClick={() => onSelect(expression.key)}
            className={cn(
              "flex min-h-11 min-w-0 flex-1 flex-col items-center gap-1 rounded-xl border border-transparent px-1 py-1.5 transition duration-150 motion-reduce:transition-none",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-1",
              active
                ? "border-indigo-100 bg-indigo-50 ring-2 ring-indigo-600"
                : "hover:bg-sky-50",
            )}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-50">
              <img
                src={expression.src}
                alt=""
                width={28}
                height={28}
                className="h-7 w-7 object-contain"
              />
            </span>
            <span className="w-full truncate text-center text-[10.5px] font-medium text-[#404040]">
              {label}
            </span>
          </button>
        )
      })}
    </div>
  )
}
