import { useState, type CSSProperties } from "react"
import { useNavigate } from "@tanstack/react-router"
import { Trans, useLingui } from "@lingui/react/macro"
import { Check } from "lucide-react"
import { SegmentedControl } from "@/components/ui/segmented-control"
import { Switch } from "@/components/ui/switch"
import { useUiVersion } from "@/hooks/use-ui-version"
import { cn } from "@/lib/utils"
import { ComingSoon, SettingsCard, SettingsHeading, SettingsLead, SettingRow } from "./ui"
import { THEME_OPTIONS, type ThemeMode, type ThemeOption } from "./options"
import { SETTINGS_ANCHORS } from "./nav"

const THEME_KEY = "adt.theme"
const EASE = "ease-[cubic-bezier(0.23,1,0.32,1)]"

function storedTheme(): ThemeMode {
  try {
    return (localStorage.getItem(THEME_KEY) as ThemeMode) || "light"
  } catch {
    return "light"
  }
}

function applyTheme(mode: ThemeMode) {
  const dark =
    mode === "dark" ||
    // eslint-disable-next-line lingui/no-unlocalized-strings
    (mode === "system" && window.matchMedia?.("(prefers-color-scheme: dark)").matches)
  document.documentElement.classList.toggle("dark", !!dark)
  try {
    localStorage.setItem(THEME_KEY, mode)
  } catch {
    /* ignore */
  }
}

/** A mini window mock painted from the option's token set, used as the theme swatch. */
function ThemePreview({ th }: { th: ThemeOption }) {
  return (
    <div className="relative flex h-[104px] overflow-hidden" style={{ background: th.previewBg }}>
      <div className="flex w-[34%] flex-col gap-[5px] px-[7px] pb-2 pt-[9px]" style={{ background: th.railBg, borderRight: `1px solid ${th.hairline}` }}>
        <div className="mb-1 flex gap-1">
          <span className="size-[5px] rounded-full" style={{ background: th.barStrong }} />
          <span className="size-[5px] rounded-full" style={{ background: th.barSoft }} />
          <span className="size-[5px] rounded-full" style={{ background: th.barSoft }} />
        </div>
        <div className="size-3.5 rounded bg-brand-600" />
        <div className="h-[5px] w-[85%] rounded-full" style={{ background: th.barStrong }} />
        <div className="h-[5px] w-[70%] rounded-full" style={{ background: th.barSoft }} />
        <div className="h-[5px] w-[78%] rounded-full" style={{ background: th.barSoft }} />
      </div>
      <div className="flex flex-1 flex-col gap-1.5 px-2.5 py-[9px]">
        <div className="h-[7px] w-[55%] rounded-full" style={{ background: th.barStrong }} />
        <div className="h-[5px] w-[88%] rounded-full" style={{ background: th.barSoft }} />
        <div className="h-[5px] w-[74%] rounded-full" style={{ background: th.barSoft }} />
        <div className="mt-auto flex gap-[5px]">
          <div className="h-[22px] flex-1 rounded-md" style={{ background: th.cardBg, border: `1px solid ${th.hairline}` }} />
          <div className="h-[22px] flex-1 rounded-md" style={{ background: th.cardBg, border: `1px solid ${th.hairline}` }} />
        </div>
      </div>
      {th.split && <div className="absolute inset-0" style={{ background: "linear-gradient(112deg, transparent 49.6%, #0f172a 50%)" }} />}
    </div>
  )
}

function ThemeCard({ th, selected, onSelect, index }: { th: ThemeOption; selected: boolean; onSelect: () => void; index: number }) {
  const { i18n } = useLingui()
  const Icon = th.icon
  return (
    <div
      className={cn("transition-[opacity,transform] duration-500 [transition-delay:var(--d)] starting:translate-y-2 starting:opacity-0 motion-reduce:transition-none", EASE)}
      style={{ "--d": `${index * 55}ms` } as CSSProperties}
    >
      <button
        type="button"
        aria-pressed={selected}
        onClick={onSelect}
        className={cn(
          "group block w-full overflow-hidden rounded-2xl bg-card text-left transition-[transform,box-shadow] duration-200 will-change-transform",
          EASE,
          "hover:-translate-y-0.5 motion-safe:active:translate-y-0 motion-safe:active:scale-[0.985] motion-reduce:transform-none",
          selected
            ? "shadow-[0_0_0_1.5px_var(--brand-600),0_0_0_4px_var(--brand-50),0_12px_28px_-14px_rgba(43,127,255,0.45)]"
            : "shadow-[0_0_0_1px_var(--border),0_1px_2px_rgba(0,0,0,0.04)] hover:shadow-[0_0_0_1px_var(--brand-300),0_10px_24px_-16px_rgba(0,0,0,0.35)]",
        )}
      >
        <ThemePreview th={th} />
        <div className="flex items-center gap-2 border-t px-3.5 py-[11px]">
          <Icon className={cn("size-[15px] transition-colors duration-200", selected ? "text-brand-700" : "text-muted-foreground group-hover:text-foreground")} />
          <span className={cn("text-[13px] font-semibold transition-colors duration-200", selected ? "text-brand-700" : "text-foreground")}>{i18n._(th.label)}</span>
          <span
            className={cn(
              "ml-auto grid size-[18px] place-items-center rounded-full text-white transition-all duration-200",
              EASE,
              selected ? "scale-100 bg-brand-600 opacity-100" : "scale-90 bg-muted opacity-0",
            )}
          >
            <Check className="size-[11px]" />
          </span>
        </div>
      </button>
    </div>
  )
}

export function AppearanceSection() {
  const { t } = useLingui()
  const navigate = useNavigate()
  const [theme, setTheme] = useState<ThemeMode>(storedTheme)
  const [uiVersion, setUiVersion] = useUiVersion()

  return (
    <>
      <SettingsHeading>
        <Trans>Appearance</Trans>
      </SettingsHeading>
      <SettingsLead>
        <Trans>How ADT Studio looks on this machine.</Trans>
      </SettingsLead>

      <div className="mb-2 text-[11.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
        <Trans>Theme</Trans>
      </div>
      <div id={SETTINGS_ANCHORS.themeMode} className="mb-6 grid scroll-mt-24 grid-cols-3 gap-3.5">
        {THEME_OPTIONS.map((th, i) => (
          <ThemeCard
            key={th.key}
            th={th}
            index={i}
            selected={theme === th.key}
            onSelect={() => {
              setTheme(th.key)
              applyTheme(th.key)
            }}
          />
        ))}
      </div>

      <SettingsCard>
        <SettingRow
          anchorId={SETTINGS_ANCHORS.interface}
          title={<Trans>Interface</Trans>}
          subtitle={<Trans>Switch between the new and the classic ADT Studio interface.</Trans>}
        >
          <SegmentedControl
            className="w-52"
            options={[
              { value: "new", label: t`New` },
              { value: "old", label: t`Classic` },
            ]}
            value={uiVersion}
            onValueChange={(version) => {
              setUiVersion(version)
              if (version === "old") {
                void navigate({ to: "/settings", search: { section: "default-model" } })
              }
            }}
          />
        </SettingRow>
        <SettingRow
          anchorId={SETTINGS_ANCHORS.reduceMotion}
          title={
            <span className="inline-flex items-center gap-2">
              <Trans>Reduce motion</Trans>
              <ComingSoon title={t`Coming soon — not wired up yet.`} />
            </span>
          }
          subtitle={<Trans>Minimise onboarding and list-reorder animations.</Trans>}
        >
          <Switch checked={false} disabled aria-label={t`Reduce motion`} />
        </SettingRow>
      </SettingsCard>
    </>
  )
}
