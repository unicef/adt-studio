import { Link } from "@tanstack/react-router"
import { Trans, useLingui } from "@lingui/react/macro"
import {
  Accessibility,
  AlertTriangle,
  ArrowRight,
  Baby,
  BookOpen,
  Check,
  Info,
  Loader2,
} from "lucide-react"
import type { KidsExportReadiness } from "@/lib/kids-export-readiness"
import { cn } from "@/lib/utils"

export type ReadingExperience = "standard" | "kids"

export function ReadingExperiencePicker({
  bookLabel,
  selected,
  onSelect,
  readiness,
  loading,
  disabled,
  kidsSupported,
}: {
  bookLabel: string
  selected: ReadingExperience
  onSelect: (experience: ReadingExperience) => void
  readiness: KidsExportReadiness
  loading: boolean
  disabled: boolean
  kidsSupported: boolean
}) {
  const { t } = useLingui()
  return (
    <div className="flex flex-col gap-3">
      <div
        role="radiogroup"
        aria-label={t`Reading experience`}
        className="grid grid-cols-1 gap-2"
      >
        <ExperienceOption
          selected={selected === "standard"}
          disabled={disabled}
          icon={BookOpen}
          title={<Trans>Standard</Trans>}
          description={
            <Trans>Use the familiar reader menus and controls.</Trans>
          }
          onClick={() => onSelect("standard")}
        />
        <ExperienceOption
          selected={selected === "kids"}
          disabled={disabled || !kidsSupported}
          icon={Baby}
          title={<Trans>Kids Mode</Trans>}
          description={
            <Trans>Use buddy-guided onboarding and reading controls.</Trans>
          }
          badge={
            !kidsSupported ? (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                <Trans>Web Export only</Trans>
              </span>
            ) : loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />
            ) : readiness.ready ? (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                <Trans>Ready</Trans>
              </span>
            ) : (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-900">
                <Trans>Setup needed</Trans>
              </span>
            )
          }
          onClick={() => onSelect("kids")}
        />
      </div>

      {!kidsSupported ? (
        <div
          role="note"
          className="flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2.5 text-xs leading-relaxed text-slate-700 ring-1 ring-inset ring-slate-200"
        >
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <Trans>
            This format uses its own reader controls. Choose Web Export to
            include the Kids Mode interface.
          </Trans>
        </div>
      ) : null}

      {kidsSupported && selected === "kids" && !loading ? (
        readiness.ready ? (
          <div
            role="status"
            className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2.5 text-xs text-emerald-900 ring-1 ring-inset ring-emerald-200"
          >
            <Check className="h-4 w-4 shrink-0" strokeWidth={3} />
            <span>
              <Trans>
                Ready for export: {readiness.buddyCount} buddies and{" "}
                {readiness.languageCount} languages.
              </Trans>
            </span>
          </div>
        ) : (
          <div
            role="alert"
            className="flex flex-col gap-3 rounded-lg bg-amber-50 px-3 py-3 text-xs text-amber-950 ring-1 ring-inset ring-amber-200"
          >
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="flex flex-col gap-1">
                <span className="font-semibold">
                  <Trans>Finish Kids Mode setup before exporting.</Trans>
                </span>
                <ul className="list-disc space-y-0.5 pl-4 text-amber-900">
                  {!readiness.setupEnabled ? (
                    <li><Trans>Turn on Kids Mode setup for this book.</Trans></li>
                  ) : null}
                  {!readiness.interfaceReady ? (
                    <li>
                      <Trans>
                        Complete interface translations
                        {readiness.missingInterfaceLanguages.length > 0
                          ? `: ${readiness.missingInterfaceLanguages.join(", ").toUpperCase()}`
                          : ""}.
                      </Trans>
                    </li>
                  ) : null}
                  {!readiness.voicesReady ? (
                    <li>
                      <Trans>
                        Generate complete buddy voices
                        {readiness.missingVoiceLanguages.length > 0
                          ? `: ${readiness.missingVoiceLanguages.join(", ").toUpperCase()}`
                          : ""}.
                      </Trans>
                    </li>
                  ) : null}
                </ul>
              </div>
            </div>
            <Link
              to="/books/$label/kids"
              params={{ label: bookLabel }}
              search={{ returnTo: "export" }}
              className="inline-flex w-fit items-center gap-1.5 rounded-md bg-amber-950 px-3 py-2 font-semibold text-amber-50 transition-colors hover:bg-amber-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-2"
            >
              <Trans>Finish Kids Mode setup</Trans>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        )
      ) : null}

      {kidsSupported && selected === "kids" ? (
        <div
          role="note"
          className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-950 ring-1 ring-inset ring-amber-200"
        >
          <Accessibility className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            <Trans>
              Accessibility notice: the character creator is not accessible
              yet.
            </Trans>
          </span>
        </div>
      ) : null}
    </div>
  )
}

function ExperienceOption({
  selected,
  disabled,
  icon: Icon,
  title,
  description,
  badge,
  onClick,
}: {
  selected: boolean
  disabled: boolean
  icon: typeof BookOpen
  title: React.ReactNode
  description: React.ReactNode
  badge?: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex min-h-20 items-start gap-3 rounded-xl border-2 px-3.5 py-3 text-left transition-[background-color,border-color,box-shadow] duration-200 ease-out",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60",
        selected
          ? "border-indigo-500 bg-indigo-50/70 shadow-sm"
          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/60",
      )}
    >
      <span
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
          selected
            ? "bg-indigo-600 text-indigo-50"
            : "bg-slate-100 text-slate-600",
        )}
      >
        <Icon className="h-4.5 w-4.5" aria-hidden />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-slate-950">{title}</span>
          {badge}
        </span>
        <span className="text-xs leading-relaxed text-slate-600">
          {description}
        </span>
      </span>
      <span
        aria-hidden
        className={cn(
          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
          selected
            ? "border-indigo-600 bg-indigo-600 text-indigo-50"
            : "border-slate-300 bg-white text-transparent",
        )}
      >
        <Check className="h-3 w-3" strokeWidth={3} />
      </span>
    </button>
  )
}
