import { Check, MessageCircle, X } from "lucide-react"
import { useAtom, useAtomValue } from "jotai"
import {
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
  type RefObject,
} from "react"
import { useBuddySpeech } from "@/features/kids/hooks/useBuddySpeech"
import { useKidsAvailableLanguages } from "@/features/kids/hooks/useKidsAvailableLanguages"
import { BUDDY_LINES } from "@/features/kids/lib/buddy-lines"
import { useKidsTranslation } from "@/features/kids/hooks/useKidsTranslation"
import { usePrefersReducedMotion } from "@/features/kids/hooks/usePrefersReducedMotion"
import { KidsAvatarBuilder } from "@/features/kids/components/KidsAvatarBuilder"
import {
  kidsAccessibilityDialogOpenAtom,
  kidsAvatarAtom,
  kidsAvatarDialogOpenAtom,
  kidsBuddyChatterAtom,
  kidsLanguageDialogOpenAtom,
  kidsLastSpotAtom,
  kidsReadingFontAtom,
  kidsResumeChipDismissedAtom,
  kidsStoryMapDialogOpenAtom,
  kidsTextScaleAtom,
  type KidsLastSpot,
  type KidsReadingFont,
  type KidsTextScale,
} from "@/features/kids/state/kids.atoms"
import { currentLanguageAtom } from "@/features/language/state/language.atoms"
import { navigateToHref } from "@/features/navigation/lib/page-navigation"
import {
  currentPageNumberAtom,
  currentSectionIdAtom,
  pagesAtom,
  tocAtom,
  type TocEntry,
} from "@/features/navigation/state/nav.atoms"
import { cn } from "@/shared/lib/utils"

const RESUME_SESSION_KEY = "kidsLastSpotOfferChecked"

export function KidsLanguageDialog() {
  const { tk } = useKidsTranslation()
  const [open, setOpen] = useAtom(kidsLanguageDialogOpenAtom)
  const [currentLanguage, setCurrentLanguage] = useAtom(currentLanguageAtom)
  // Languages the kids reader can meaningfully switch to — the book content
  // or the kids interface (buddy UI + onboarding + voices) is translated.
  const { languages, names } = useKidsAvailableLanguages()
  const { say } = useBuddySpeech()
  const reduceMotion = usePrefersReducedMotion()

  return (
    <KidsModal
      open={open}
      onClose={() => setOpen(false)}
      title={tk("kids-language-title", "Pick a language")}
      reduceMotion={reduceMotion}
      closeLabel={tk("kids-dialog-close", "Close")}
    >
      <div className="grid gap-2">
        {languages.map((language) => {
          const active = language === currentLanguage
          // Prefer the book's own language-name catalog (handles locale
          // variants like en-US / pt-BR); fall back to a built-in map, then
          // the raw code.
          const name = names[language] ?? getLanguageName(language)
          return (
            <button
              type="button"
              key={language}
              aria-current={active ? "true" : undefined}
              onClick={() => {
                setCurrentLanguage(language)
                setOpen(false)
                say(
                  BUDDY_LINES.languageOn,
                  { language: name },
                  { language },
                )
              }}
              className={cn(
                "flex min-h-16 items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3 text-left text-xl font-extrabold shadow-sm ring-1 ring-slate-200",
                "transition-all duration-150 hover:bg-sky-50 active:scale-[0.99]",
                "focus:outline-none focus-visible:ring-4 focus-visible:ring-sky-500",
                active && "bg-[#FFF6D6] ring-2 ring-[#FFC800]",
              )}
            >
              <span>{name}</span>
              {active ? <Check className="h-6 w-6" aria-hidden="true" /> : null}
            </button>
          )
        })}
      </div>
    </KidsModal>
  )
}

export function KidsStoryMapDialog() {
  const { tk } = useKidsTranslation()
  const [open, setOpen] = useAtom(kidsStoryMapDialogOpenAtom)
  const toc = useAtomValue(tocAtom)
  const pages = useAtomValue(pagesAtom)
  const currentSectionId = useAtomValue(currentSectionIdAtom)
  const reduceMotion = usePrefersReducedMotion()
  const entries = useMemo<TocEntry[]>(
    () =>
      toc.length > 0
        ? toc
        : pages.map((page, index) => ({
            section_id: page.section_id,
            href: page.href,
            title: `${tk("kids-page-label", "Page")} ${index + 1}`,
            chapter_id: page.section_id,
          })),
    [pages, tk, toc],
  )

  return (
    <KidsModal
      open={open}
      onClose={() => setOpen(false)}
      title={tk("kids-story-map-title", "Story map")}
      reduceMotion={reduceMotion}
      closeLabel={tk("kids-dialog-close", "Close")}
      wide
    >
      <div
        className="grid max-h-[60vh] gap-2 overflow-y-auto px-1.5 py-2 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
        role="region"
        aria-label={tk("kids-story-map-list-region", "Story map sections")}
        tabIndex={0}
      >
        {entries.map((entry) => {
          const active = entry.section_id === currentSectionId
          return (
            <button
              type="button"
              key={entry.section_id}
              aria-current={active ? "page" : undefined}
              onClick={() => navigateToHref(entry.href)}
              className={cn(
                "min-h-16 rounded-2xl bg-white px-4 py-3 text-left text-xl font-extrabold shadow-sm ring-1 ring-slate-200",
                "transition-all duration-150 hover:bg-sky-50 active:scale-[0.99]",
                "focus:outline-none focus-visible:ring-4 focus-visible:ring-sky-500",
                active && "bg-[#FFF6D6] ring-2 ring-[#FFC800]",
                entry.level === 2 && "ml-5",
                entry.level === 3 && "ml-9",
              )}
            >
              {entry.title}
            </button>
          )
        })}
      </div>
    </KidsModal>
  )
}

export function KidsAccessibilityDialog() {
  const { tk } = useKidsTranslation()
  const [open, setOpen] = useAtom(kidsAccessibilityDialogOpenAtom)
  const [scale, setScale] = useAtom(kidsTextScaleAtom)
  const [font, setFont] = useAtom(kidsReadingFontAtom)
  const [chatter, setChatter] = useAtom(kidsBuddyChatterAtom)
  const reduceMotion = usePrefersReducedMotion()

  const sizeOptions: { value: KidsTextScale; label: string; px: string }[] = [
    { value: "1", label: tk("kids-comfort-size-normal", "Normal"), px: "text-lg" },
    { value: "1.25", label: tk("kids-comfort-size-big", "Big"), px: "text-2xl" },
    { value: "1.5", label: tk("kids-comfort-size-bigger", "Bigger"), px: "text-3xl" },
    { value: "2", label: tk("kids-comfort-size-biggest", "Biggest"), px: "text-4xl" },
  ]

  const fontOptions: {
    value: KidsReadingFont
    label: string
    className: string
  }[] = [
    {
      value: "default",
      label: tk("kids-comfort-font-book", "Book"),
      className: "",
    },
    {
      value: "plain",
      label: tk("kids-comfort-font-plain", "Plain"),
      className: "font-sans",
    },
    {
      value: "spaced",
      label: tk("kids-comfort-font-spaced", "Spaced"),
      className: "font-sans tracking-wide [word-spacing:0.16em]",
    },
  ]

  return (
    <KidsModal
      open={open}
      onClose={() => setOpen(false)}
      title={tk("kids-comfort-title", "Make it comfy")}
      reduceMotion={reduceMotion}
      closeLabel={tk("kids-dialog-close", "Close")}
    >
      <div className="grid gap-5">
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-lg font-black text-slate-950">
            {tk("kids-comfort-size-label", "Text size")}
          </legend>
          <div className="grid grid-cols-4 gap-2">
            {sizeOptions.map((option) => {
              const active = scale === option.value
              return (
                <button
                  type="button"
                  key={option.value}
                  aria-pressed={active}
                  onClick={() => setScale(option.value)}
                  className={cn(
                    "flex min-h-20 flex-col items-center justify-center gap-1 rounded-2xl bg-white px-2 py-2 shadow-sm ring-1 ring-slate-200",
                    "transition-all duration-150 hover:bg-sky-50 active:scale-[0.98]",
                    "focus:outline-none focus-visible:ring-4 focus-visible:ring-sky-500",
                    active && "bg-[#FFF6D6] ring-2 ring-[#FFC800]",
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn("font-black leading-none text-slate-900", option.px)}
                  >
                    A
                  </span>
                  <span className="text-sm font-bold text-slate-700">
                    {option.label}
                  </span>
                </button>
              )
            })}
          </div>
        </fieldset>

        <fieldset className="grid gap-2">
          <legend className="mb-1 text-lg font-black text-slate-950">
            {tk("kids-comfort-font-label", "Letters")}
          </legend>
          <div className="grid grid-cols-3 gap-2">
            {fontOptions.map((option) => {
              const active = font === option.value
              return (
                <button
                  type="button"
                  key={option.value}
                  aria-pressed={active}
                  onClick={() => setFont(option.value)}
                  className={cn(
                    "flex min-h-20 flex-col items-center justify-center gap-1 rounded-2xl bg-white px-2 py-2 shadow-sm ring-1 ring-slate-200",
                    "transition-all duration-150 hover:bg-sky-50 active:scale-[0.98]",
                    "focus:outline-none focus-visible:ring-4 focus-visible:ring-sky-500",
                    active && "bg-[#FFF6D6] ring-2 ring-[#FFC800]",
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "text-2xl font-bold leading-none text-slate-900",
                      option.className,
                    )}
                  >
                    Aa
                  </span>
                  <span className="text-sm font-bold text-slate-700">
                    {option.label}
                  </span>
                </button>
              )
            })}
          </div>
        </fieldset>

        <button
          type="button"
          aria-pressed={chatter}
          onClick={() => setChatter((value) => !value)}
          className={cn(
            "flex min-h-16 items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3 text-left shadow-sm ring-1 ring-slate-200",
            "transition-all duration-150 hover:bg-sky-50 active:scale-[0.99]",
            "focus:outline-none focus-visible:ring-4 focus-visible:ring-sky-500",
            chatter && "bg-[#FFF6D6] ring-2 ring-[#FFC800]",
          )}
        >
          <span className="flex items-center gap-3">
            <MessageCircle className="h-6 w-6 text-slate-700" aria-hidden="true" />
            <span className="text-lg font-extrabold text-slate-900">
              {tk("kids-comfort-chatter-label", "My buddy chats with me")}
            </span>
          </span>
          <span
            className={cn(
              "rounded-full px-3 py-1 text-sm font-black",
              chatter ? "bg-[#FFC800] text-slate-950" : "bg-slate-200 text-slate-600",
            )}
          >
            {chatter
              ? tk("kids-comfort-chatter-on", "On")
              : tk("kids-comfort-chatter-off", "Off")}
          </span>
        </button>
      </div>
    </KidsModal>
  )
}

export function KidsAvatarDialog() {
  const { tk } = useKidsTranslation()
  const [open, setOpen] = useAtom(kidsAvatarDialogOpenAtom)
  const [avatar, setAvatar] = useAtom(kidsAvatarAtom)
  const reduceMotion = usePrefersReducedMotion()

  return (
    <KidsModal
      open={open}
      onClose={() => setOpen(false)}
      title={tk("kids-avatar-title", "Your character")}
      reduceMotion={reduceMotion}
      closeLabel={tk("kids-dialog-close", "Close")}
      wider
    >
      <KidsAvatarBuilder value={avatar} onChange={setAvatar} />
    </KidsModal>
  )
}

function KidsModal({
  open,
  onClose,
  title,
  closeLabel,
  reduceMotion,
  wide,
  wider,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  closeLabel: string
  reduceMotion: boolean
  wide?: boolean
  wider?: boolean
  children: ReactNode
}) {
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    const dialog = dialogRef.current
    const focusable = getFocusable(dialog)
    ;(focusable[0] ?? dialog)?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose()
        return
      }
      if (event.key !== "Tab") return
      const items = getFocusable(dialog)
      if (items.length === 0) {
        event.preventDefault()
        dialog?.focus()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("keydown", handleKeyDown)
      previous?.focus()
    }
  }, [onClose, open])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      role="presentation"
    >
      <button
        type="button"
        aria-label={closeLabel}
        className={cn(
          "absolute inset-0 bg-black/25 backdrop-blur-sm",
          "transition-opacity duration-200",
        )}
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cn(
          "relative grid max-h-[min(80vh,42rem)] w-full gap-4 overflow-hidden rounded-[2rem] bg-white p-5 text-slate-900 shadow-2xl ring-2 ring-sky-100",
          wider ? "max-w-4xl" : wide ? "max-w-2xl" : "max-w-lg",
          "transition-all duration-200 ease-out",
          !reduceMotion && "animate-kidsBuddyPop",
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-2xl font-black text-slate-950">{title}</h2>
          <KidsDialogClose label={closeLabel} onClick={onClose} />
        </div>
        {children}
      </div>
    </div>
  )
}

function getFocusable(root: HTMLElement | null): HTMLElement[] {
  if (!root) return []
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.hasAttribute("disabled"))
}

export function KidsResumeChip() {
  const { tk } = useKidsTranslation()
  const [lastSpot, setLastSpot] = useAtom(kidsLastSpotAtom)
  const [dismissed, setDismissed] = useAtom(kidsResumeChipDismissedAtom)
  const pages = useAtomValue(pagesAtom)
  const currentSectionId = useAtomValue(currentSectionIdAtom)
  const currentPage = useAtomValue(currentPageNumberAtom)
  const initialLastSpotRef = useRef<KidsLastSpot | null>(lastSpot)
  const shouldOfferResumeRef = useRef(
    typeof window !== "undefined" &&
      window.sessionStorage.getItem(RESUME_SESSION_KEY) !== "true",
  )
  const currentSpot = useMemo(
    () => getCurrentSpot(pages, currentSectionId, currentPage),
    [currentPage, currentSectionId, pages],
  )

  useEffect(() => {
    if (typeof window === "undefined") return
    window.sessionStorage.setItem(RESUME_SESSION_KEY, "true")
  }, [])

  useEffect(() => {
    if (!currentSpot) return
    setLastSpot(currentSpot)
  }, [currentSpot, setLastSpot])

  const initialLastSpot = initialLastSpotRef.current
  const show =
    shouldOfferResumeRef.current &&
    !dismissed &&
    !!initialLastSpot &&
    !!currentSpot &&
    initialLastSpot.sectionId !== currentSpot.sectionId

  if (!show || !initialLastSpot) return null

  return (
    <div
      data-testid="kids-resume-chip"
      className="mb-1 flex max-w-[min(22rem,calc(100vw-2rem))] items-center gap-2 rounded-full bg-white px-2 py-2 shadow-xl ring-2 ring-sky-100"
    >
      <button
        type="button"
        onClick={() => navigateToHref(initialLastSpot.href)}
        className="min-h-11 rounded-full bg-[#FFE58A] px-4 text-sm font-extrabold text-slate-950 transition-all duration-150 hover:bg-[#FFDD66] active:scale-[0.98] focus:outline-none focus-visible:ring-4 focus-visible:ring-sky-500"
      >
        {tk("kids-resume-chip", "Take me back to where I was")}
      </button>
      <button
        type="button"
        aria-label={tk("kids-resume-dismiss", "Dismiss")}
        onClick={() => setDismissed(true)}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-600 transition-all duration-150 hover:bg-slate-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-sky-500"
      >
        <X className="h-5 w-5" aria-hidden="true" />
      </button>
    </div>
  )
}

export function KidsDialogClose({
  buttonRef,
  label,
  onClick,
}: {
  buttonRef?: RefObject<HTMLButtonElement | null>
  label: string
  onClick: () => void
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white text-slate-700 shadow-sm ring-2 ring-sky-100 transition-all duration-150 hover:bg-sky-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-sky-500"
    >
      <X className="h-6 w-6" aria-hidden="true" />
    </button>
  )
}

function getCurrentSpot(
  pages: { section_id: string; href: string; page_number?: number }[],
  currentSectionId: string | null,
  currentPage: number | null,
): KidsLastSpot | null {
  const current = pages.find((page) => page.section_id === currentSectionId)
  if (!current) return null
  return {
    sectionId: current.section_id,
    href: current.href,
    page: currentPage ?? current.page_number ?? null,
  }
}

function getLanguageName(language: string) {
  const names: Record<string, string> = {
    en: "English",
    es: "Español",
    fr: "Français",
    "pt-BR": "Português (Brasil)",
    sq: "Shqip",
  }
  return names[language] ?? language
}
