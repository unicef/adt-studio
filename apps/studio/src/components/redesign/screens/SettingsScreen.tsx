import type { ReactNode } from "react"
import { useEffect, useMemo, useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { msg } from "@lingui/core/macro"
import type { MessageDescriptor } from "@lingui/core"
import {
  Languages,
  Palette,
  Bell,
  Sparkles,
  Info,
  Check,
  Sun,
  Moon,
  Monitor,
  Server,
  AudioLines,
  Minus,
  ShieldCheck,
  Pencil,
  Plus,
  RotateCcw,
  Folder,
  FileDown,
  type LucideIcon,
} from "lucide-react"
import { activateLocale, type AppLocale } from "@/i18n/locales"
import { useApiKey } from "@/hooks/use-api-key"
import { useAppVersion } from "@/hooks/use-app-version"
import { useSettingsDialog } from "@/routes/__root"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

type Section = "language" | "theme" | "notifications" | "api" | "about"
type ThemeMode = "light" | "dark" | "system"
const THEME_KEY = "adt.theme"

const LOCALES: { code: MessageDescriptor; name: MessageDescriptor; native: MessageDescriptor; key: AppLocale }[] = [
  { code: msg`EN`, name: msg`English`, native: msg`English`, key: "en" },
  { code: msg`PT`, name: msg`Portuguese (BR)`, native: msg`Português (Brasil)`, key: "pt-BR" },
  { code: msg`ES`, name: msg`Spanish`, native: msg`Español`, key: "es" },
  { code: msg`FR`, name: msg`French`, native: msg`Français`, key: "fr" },
  { code: msg`SQ`, name: msg`Albanian`, native: msg`Shqip`, key: "sq" },
]

const POSITIONS: { key: string; label: MessageDescriptor }[] = [
  { key: "top-left", label: msg`Top left` },
  { key: "top-center", label: msg`Top center` },
  { key: "top-right", label: msg`Top right` },
  { key: "bottom-left", label: msg`Bottom left` },
  { key: "bottom-center", label: msg`Bottom center` },
  { key: "bottom-right", label: msg`Bottom right` },
]

/* eslint-disable lingui/no-unlocalized-strings -- Tailwind position utilities, not user-visible text */
const POS_CLASS: Record<string, string> = {
  "top-left": "top-[22px] left-1.5",
  "top-center": "top-[22px] left-1/2 -translate-x-[38%]",
  "top-right": "top-[22px] right-1.5",
  "bottom-left": "bottom-1.5 left-1.5",
  "bottom-center": "bottom-1.5 left-1/2 -translate-x-[38%]",
  "bottom-right": "bottom-1.5 right-1.5",
}
/* eslint-enable lingui/no-unlocalized-strings */

const THEMES = [
  { key: "light" as const, label: msg`Light`, icon: Sun, previewBg: "#fafafa", railBg: "#f4f5f7", hairline: "#e4e4e7", barStrong: "#a1a1aa", barSoft: "#d4d4d8", cardBg: "#ffffff", split: false },
  { key: "dark" as const, label: msg`Dark`, icon: Moon, previewBg: "#0f172a", railBg: "#1e293b", hairline: "#334155", barStrong: "#64748b", barSoft: "#334155", cardBg: "#1e293b", split: false },
  { key: "system" as const, label: msg`System`, icon: Monitor, previewBg: "#fafafa", railBg: "#f4f5f7", hairline: "#e4e4e7", barStrong: "#a1a1aa", barSoft: "#d4d4d8", cardBg: "#ffffff", split: true },
]

const TABS: { key: Section; label: MessageDescriptor; icon: LucideIcon }[] = [
  { key: "language", label: msg`Language`, icon: Languages },
  { key: "theme", label: msg`Theme`, icon: Palette },
  { key: "notifications", label: msg`Notifications`, icon: Bell },
  { key: "api", label: msg`AI providers`, icon: Sparkles },
  { key: "about", label: msg`About`, icon: Info },
]

const CARD = "rounded-2xl border bg-card px-[22px] py-1.5 shadow-sm"
const HEADING = "mb-1 text-2xl font-bold tracking-[-0.02em]"
const LEAD = "mb-[22px] text-[13.5px] text-muted-foreground"

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

function mask(key: string): string {
  if (!key) return ""
  const tail = key.slice(-4)
  const head = key.startsWith("sk-ant") ? "sk-ant-" : key.startsWith("sk-") ? "sk-" : ""
  return `${head}••••${tail}`
}

function SettingRow({
  title,
  subtitle,
  alignStart,
  children,
}: {
  title: ReactNode
  subtitle: ReactNode
  alignStart?: boolean
  children: ReactNode
}) {
  return (
    <div className={cn("flex gap-5 border-t py-[18px] first:border-t-0", alignStart ? "items-start" : "items-center")}>
      <div className="flex-1">
        <div className="text-sm font-semibold">{title}</div>
        <p className="mt-0.5 text-[12.5px] leading-normal text-muted-foreground">{subtitle}</p>
      </div>
      {children}
    </div>
  )
}

export function SettingsScreen() {
  const { i18n } = useLingui()
  const { openSettings } = useSettingsDialog()
  const version = useAppVersion()
  const { apiKey, anthropicKey, googleKey, customApiKey, customBaseUrl, azureKey } = useApiKey()

  const [section, setSection] = useState<Section>("language")
  const [theme, setTheme] = useState<ThemeMode>("light")
  const [motion, setMotion] = useState(false)
  const [toastPos, setToastPos] = useState("top-center")
  const [sound, setSound] = useState(true)
  const [auto, setAuto] = useState(true)
  const [autoDelay, setAutoDelay] = useState("4")

  useEffect(() => {
    let saved: ThemeMode = "light"
    try {
      saved = (localStorage.getItem(THEME_KEY) as ThemeMode) || "light"
    } catch {
      /* ignore */
    }
    setTheme(saved)
  }, [])

  const providers = useMemo(
    () => [
      { name: "OpenAI", icon: Sparkles, desc: msg`GPT models for pipeline tasks.`, key: apiKey, tile: "bg-emerald-50 text-emerald-600" },
      { name: "Anthropic", icon: Sparkles, desc: msg`Claude models — Opus, Sonnet.`, key: anthropicKey, tile: "bg-amber-50 text-amber-600" },
      { name: "Google AI", icon: Sparkles, desc: msg`Gemini — LLM and TTS voices.`, key: googleKey, tile: "bg-blue-50 text-blue-600" },
      { name: "Custom (OpenAI-compatible)", icon: Server, desc: msg`Ollama, vLLM, Together AI — any compatible endpoint.`, key: customApiKey || customBaseUrl, tile: "bg-muted text-muted-foreground" },
      { name: "Azure Speech", icon: AudioLines, desc: msg`Azure TTS voices · subscription key + region.`, key: azureKey, tile: "bg-indigo-50 text-indigo-600" },
    ],
    [apiKey, anthropicKey, googleKey, customApiKey, customBaseUrl, azureKey],
  )

  const posLabel = i18n._(POSITIONS.find((p) => p.key === toastPos)?.label ?? msg`Top center`)

  const changeLocale = (next: AppLocale) => {
    if (next === i18n.locale) return
    activateLocale(next)
    const search = new URLSearchParams(window.location.search)
    search.set("lang", next)
    window.history.replaceState(null, "", `${window.location.pathname}?${search.toString()}`)
  }

  return (
    <Tabs value={section} onValueChange={(v) => setSection(v as Section)} className="h-full gap-0 overflow-auto bg-background">
      <div className="px-[34px] pt-6 text-[22px] font-bold tracking-[-0.02em]">
        <Trans>Settings</Trans>
      </div>
      <div className="sticky top-0 z-[2] mt-3.5 border-b bg-background px-[34px]">
        <TabsList className="h-auto justify-start gap-6 rounded-none bg-transparent p-0">
          {TABS.map((tab) => {
            const Icon = tab.icon
            return (
              <TabsTrigger
                key={tab.key}
                value={tab.key}
                className="h-auto gap-1.5 rounded-none border-b-2 border-transparent px-0.5 py-[15px] text-[13.5px] font-medium text-muted-foreground data-[state=active]:border-brand-600 data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:text-brand-700 data-[state=active]:shadow-none"
              >
                <Icon className="size-4" />
                {i18n._(tab.label)}
              </TabsTrigger>
            )
          })}
        </TabsList>
      </div>

      <div className="max-w-[820px] px-[34px] pb-10 pt-[26px]">
        {section === "language" && (
          <>
            <div className={HEADING}>
              <Trans>Language</Trans>
            </div>
            <div className={LEAD}>
              <Trans>The language ADT Studio's interface is shown in. This does not change a book's output languages.</Trans>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {LOCALES.map((l) => {
                const sel = i18n.locale === l.key
                return (
                  <button
                    key={l.key}
                    type="button"
                    onClick={() => changeLocale(l.key)}
                    className={cn(
                      "flex items-center gap-3.5 rounded-xl border-[1.5px] bg-card px-4 py-[15px] text-left transition-colors hover:border-brand-300",
                      sel ? "border-brand-600 shadow-[0_0_0_3px_var(--brand-50)]" : "border-border",
                    )}
                  >
                    <span
                      className={cn(
                        "grid h-7 w-10 shrink-0 place-items-center rounded-md font-mono text-xs font-bold",
                        sel ? "bg-brand-600 text-white" : "bg-muted text-muted-foreground",
                      )}
                    >
                      {i18n._(l.code)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className={cn("text-sm font-semibold", sel && "text-brand-700")}>{i18n._(l.name)}</div>
                      <div className="mt-px text-xs text-muted-foreground">{i18n._(l.native)}</div>
                    </div>
                    <span className={cn("grid size-5 shrink-0 place-items-center rounded-full", sel ? "bg-brand-600 text-white" : "bg-muted")}>
                      {sel && <Check className="size-3" />}
                    </span>
                  </button>
                )
              })}
            </div>
          </>
        )}

        {section === "theme" && (
          <>
            <div className={HEADING}>
              <Trans>Theme</Trans>
            </div>
            <div className={LEAD}>
              <Trans>How ADT Studio looks on this machine.</Trans>
            </div>
            <div className="mb-4 grid grid-cols-3 gap-3.5">
              {THEMES.map((th) => {
                const sel = theme === th.key
                const Icon = th.icon
                return (
                  <button
                    key={th.key}
                    type="button"
                    onClick={() => {
                      setTheme(th.key)
                      applyTheme(th.key)
                    }}
                    className={cn(
                      "overflow-hidden rounded-2xl border-[1.5px] bg-card text-left transition-colors hover:border-brand-300",
                      sel ? "border-brand-600 shadow-[0_0_0_3px_var(--brand-50)]" : "border-border shadow-sm",
                    )}
                  >
                    <div className="relative flex h-24 overflow-hidden" style={{ background: th.previewBg }}>
                      <div className="flex w-[34%] flex-col gap-[5px] px-[7px] py-2" style={{ background: th.railBg, borderRight: `1px solid ${th.hairline}` }}>
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
                      {th.split && <div className="absolute inset-0" style={{ background: "linear-gradient(105deg, transparent 49.8%, #0f172a 50.2%)" }} />}
                    </div>
                    <div className="flex items-center gap-2 border-t px-3.5 py-[11px]">
                      <Icon className={cn("size-[15px]", sel ? "text-brand-700" : "text-foreground")} />
                      <span className={cn("text-[13px] font-semibold", sel ? "text-brand-700" : "text-foreground")}>{i18n._(th.label)}</span>
                      <span className={cn("ml-auto grid size-[18px] place-items-center rounded-full", sel ? "bg-brand-600 text-white" : "bg-muted")}>
                        {sel && <Check className="size-[11px]" />}
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
            <div className={CARD}>
              <SettingRow title={<Trans>Reduce motion</Trans>} subtitle={<Trans>Minimise onboarding and list-reorder animations.</Trans>}>
                <Switch checked={motion} onCheckedChange={setMotion} />
              </SettingRow>
            </div>
          </>
        )}

        {section === "notifications" && (
          <>
            <div className={HEADING}>
              <Trans>Notifications</Trans>
            </div>
            <div className={LEAD}>
              <Trans>Toasts appear when a stage finishes, an export is ready, or something needs attention.</Trans>
            </div>
            <div className={CARD}>
              <SettingRow
                alignStart
                title={<Trans>Position</Trans>}
                subtitle={
                  <Trans>
                    Click a corner to move toasts — currently <b className="text-foreground">{posLabel}</b>.
                  </Trans>
                }
              >
                <div className="relative h-[140px] w-[230px] shrink-0 overflow-hidden rounded-xl border bg-muted">
                  <div className="flex h-4 items-center gap-[3px] bg-neutral-700 px-1.5">
                    <span className="size-[5px] rounded-full bg-[#ff5f57]" />
                    <span className="size-[5px] rounded-full bg-[#febc2e]" />
                    <span className="size-[5px] rounded-full bg-[#28c840]" />
                  </div>
                  {POSITIONS.map((p) => {
                    const sel = toastPos === p.key
                    return (
                      <button
                        key={p.key}
                        type="button"
                        onClick={() => setToastPos(p.key)}
                        title={i18n._(p.label)}
                        className={cn(
                          "absolute flex h-[17px] w-[52px] items-center gap-[3px] rounded-[5px] border px-1",
                          POS_CLASS[p.key],
                          sel ? "border-brand-400 bg-card" : "border-transparent",
                        )}
                      >
                        <span className={cn("size-[7px] shrink-0 rounded-full", sel ? "bg-brand-600" : "bg-neutral-400")} />
                        <span className="h-1 flex-1 rounded-full bg-neutral-300" />
                      </button>
                    )
                  })}
                </div>
              </SettingRow>
              <SettingRow title={<Trans>Play a sound</Trans>} subtitle={<Trans>A soft chime when a long task completes.</Trans>}>
                <Switch checked={sound} onCheckedChange={setSound} />
              </SettingRow>
              <SettingRow title={<Trans>Auto-dismiss</Trans>} subtitle={<Trans>Hide toasts automatically after a delay.</Trans>}>
                <div className="flex items-center gap-3">
                  <Select value={autoDelay} onValueChange={setAutoDelay} disabled={!auto}>
                    <SelectTrigger className="h-9 w-[124px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent align="end">
                      <SelectItem value="4">
                        <Trans>after 4s</Trans>
                      </SelectItem>
                      <SelectItem value="6">
                        <Trans>after 6s</Trans>
                      </SelectItem>
                      <SelectItem value="10">
                        <Trans>after 10s</Trans>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <Switch checked={auto} onCheckedChange={setAuto} />
                </div>
              </SettingRow>
            </div>
          </>
        )}

        {section === "api" && (
          <>
            <div className={HEADING}>
              <Trans>AI providers</Trans>
            </div>
            <div className={LEAD}>
              <Trans>API keys for the AI pipeline. Keys are stored locally on this machine and never leave it except to call the provider.</Trans>
            </div>
            <div className="flex flex-col gap-2.5">
              {providers.map((pr) => {
                const Icon = pr.icon
                const connected = !!pr.key
                return (
                  <div key={pr.name} className="flex items-center gap-3.5 rounded-xl border bg-card px-[18px] py-[15px] shadow-sm">
                    <div className={cn("grid size-10 shrink-0 place-items-center rounded-[11px]", pr.tile)}>
                      <Icon className="size-[19px]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">{pr.name}</span>
                        <Badge variant={connected ? "success" : "secondary"} className="gap-1 px-2 text-[10.5px]">
                          {connected ? <Check className="size-3" /> : <Minus className="size-3" />}
                          {connected ? <Trans>Connected</Trans> : <Trans>Not set</Trans>}
                        </Badge>
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">{i18n._(pr.desc)}</div>
                    </div>
                    {connected && <span className="font-mono text-[12.5px] text-muted-foreground">{mask(pr.key)}</span>}
                    <Button variant="outline" size="sm" onClick={() => openSettings()}>
                      {connected ? <Pencil className="size-3.5" /> : <Plus className="size-3.5" />}
                      {connected ? <Trans>Update</Trans> : <Trans>Add key</Trans>}
                    </Button>
                  </div>
                )
              })}
            </div>
            <div className="mt-3.5 flex items-center gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="size-3.5 text-emerald-600" />
              <Trans>Keys are kept in this machine's local storage. Custom uses any OpenAI-compatible endpoint; Azure powers Speech TTS.</Trans>
            </div>
          </>
        )}

        {section === "about" && (
          <>
            <div className={HEADING}>
              <Trans>About</Trans>
            </div>
            <div className={LEAD}>
              <Trans>ADT Studio turns PDFs into accessible digital textbooks.</Trans>
            </div>
            <div className="relative mb-3.5 overflow-hidden rounded-2xl border bg-card p-[30px] shadow-sm">
              <div className="pointer-events-none absolute -top-[140px] right-[-90px] size-[340px] rounded-full bg-[radial-gradient(circle,rgba(43,127,255,.10),transparent_70%)]" />
              <div className="relative flex items-center gap-5">
                <div className="grid size-[74px] shrink-0 place-items-center rounded-[19px] bg-white shadow-[0_30px_60px_-20px_rgba(43,127,255,0.25),0_4px_14px_rgba(0,0,0,0.08)]">
                  <img src="/logo.png" className="size-14" alt="" />
                </div>
                <div>
                  <div className="font-mono text-[22px] font-semibold tracking-[-0.02em]">
                    adt<span className="text-brand-600">/</span>studio
                  </div>
                  <div className="mt-[5px] text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                    <Trans>Accessible digital textbook</Trans>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <Badge variant="outline" className="px-2 font-mono text-[10.5px]">
                      v{version ?? "—"}
                    </Badge>
                    <Badge variant="success" className="gap-1 px-2 text-[10.5px]">
                      <Check className="size-3" />
                      <Trans>Up to date</Trans>
                    </Badge>
                  </div>
                </div>
                <Button variant="outline" size="sm" className="ml-auto shrink-0">
                  <RotateCcw className="size-3.5" />
                  <Trans>Check for updates</Trans>
                </Button>
              </div>
            </div>
            <div className={CARD}>
              <SettingRow title={<Trans>Books folder</Trans>} subtitle={<Trans>Where book projects live on this machine.</Trans>}>
                <Button variant="outline" size="sm">
                  <Folder className="size-3.5" />
                  <Trans>~/ADT/Books</Trans>
                </Button>
              </SettingRow>
              <SettingRow title={<Trans>Diagnostics</Trans>} subtitle={<Trans>Logs help us debug pipeline failures.</Trans>}>
                <Button variant="outline" size="sm">
                  <FileDown className="size-3.5" />
                  <Trans>Export logs</Trans>
                </Button>
              </SettingRow>
            </div>
          </>
        )}
      </div>
    </Tabs>
  )
}
