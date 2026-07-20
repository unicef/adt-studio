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
} from "lucide-react"
import { useApiKey } from "@/hooks/use-api-key"
import { useAppVersion } from "@/hooks/use-app-version"

type Section = "language" | "theme" | "notifications" | "api" | "about"
type ThemeMode = "light" | "dark" | "system"
const THEME_KEY = "adt.theme"

const LOCALES: { code: MessageDescriptor; name: MessageDescriptor; native: MessageDescriptor; key: string }[] = [
  { code: msg`EN`, name: msg`English`, native: msg`English`, key: "en" },
  { code: msg`PT`, name: msg`Portuguese (BR)`, native: msg`Português (Brasil)`, key: "pt-BR" },
  { code: msg`ES`, name: msg`Spanish`, native: msg`Español`, key: "es" },
  { code: msg`FR`, name: msg`French`, native: msg`Français`, key: "fr" },
  { code: msg`SQ`, name: msg`Albanian`, native: msg`Shqip`, key: "sq" },
]

const POSITIONS = [
  { key: "top-left", label: "Top left", ph: { top: 22, left: 6 } },
  { key: "top-center", label: "Top center", ph: { top: 22, left: "50%", transform: "translateX(-38%)" } },
  { key: "top-right", label: "Top right", ph: { top: 22, right: 6 } },
  { key: "bottom-left", label: "Bottom left", ph: { bottom: 6, left: 6 } },
  { key: "bottom-center", label: "Bottom center", ph: { bottom: 6, left: "50%", transform: "translateX(-38%)" } },
  { key: "bottom-right", label: "Bottom right", ph: { bottom: 6, right: 6 } },
] as const

const THEMES = [
  { key: "light" as const, label: "Light", icon: Sun, previewBg: "#fafafa", railBg: "#f4f5f7", hairline: "#e4e4e7", barStrong: "#a1a1aa", barSoft: "#d4d4d8", cardBg: "#ffffff", split: false },
  { key: "dark" as const, label: "Dark", icon: Moon, previewBg: "#0f172a", railBg: "#1e293b", hairline: "#334155", barStrong: "#64748b", barSoft: "#334155", cardBg: "#1e293b", split: false },
  { key: "system" as const, label: "System", icon: Monitor, previewBg: "#fafafa", railBg: "#f4f5f7", hairline: "#e4e4e7", barStrong: "#a1a1aa", barSoft: "#d4d4d8", cardBg: "#ffffff", split: true },
]

const TABS: { key: Section; label: string; icon: typeof Languages }[] = [
  { key: "language", label: "Language", icon: Languages },
  { key: "theme", label: "Theme", icon: Palette },
  { key: "notifications", label: "Notifications", icon: Bell },
  { key: "api", label: "AI providers", icon: Sparkles },
  { key: "about", label: "About", icon: Info },
]

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

export interface SettingsScreenProps {
  onOpenApiKeys: () => void
}

export function SettingsScreen({ onOpenApiKeys }: SettingsScreenProps) {
  const { t, i18n } = useLingui()
  const version = useAppVersion()
  const { apiKey, anthropicKey, googleKey, customApiKey, customBaseUrl, azureKey } = useApiKey()

  const [section, setSection] = useState<Section>("language")
  const [locale, setLocale] = useState("en")
  const [theme, setTheme] = useState<ThemeMode>("light")
  const [motion, setMotion] = useState(false)
  const [toastPos, setToastPos] = useState("top-center")
  const [sound, setSound] = useState(true)
  const [auto, setAuto] = useState(true)

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
      { name: "OpenAI", icon: Sparkles, desc: t`GPT models for pipeline tasks.`, key: apiKey, tileBg: "#ecfdf5", tileFg: "#059669" },
      { name: "Anthropic", icon: Sparkles, desc: t`Claude models — Opus, Sonnet.`, key: anthropicKey, tileBg: "#fff7ed", tileFg: "#d97706" },
      { name: "Google AI", icon: Sparkles, desc: t`Gemini — LLM and TTS voices.`, key: googleKey, tileBg: "#eff6ff", tileFg: "#2563eb" },
      { name: "Custom (OpenAI-compatible)", icon: Server, desc: t`Ollama, vLLM, Together AI — any compatible endpoint.`, key: customApiKey || customBaseUrl, tileBg: "var(--muted)", tileFg: "var(--muted-foreground)" },
      { name: "Azure Speech", icon: AudioLines, desc: t`Azure TTS voices · subscription key + region.`, key: azureKey, tileBg: "#eef2ff", tileFg: "#4338ca" },
    ],
    [apiKey, anthropicKey, googleKey, customApiKey, customBaseUrl, azureKey, t],
  )

  const posLabel = POSITIONS.find((p) => p.key === toastPos)?.label

  return (
    <div style={{ height: "100%", overflow: "auto", background: "var(--background)" }}>
      <div style={{ font: "700 22px var(--font-sans)", letterSpacing: "-0.02em", padding: "24px 34px 0" }}><Trans>Settings</Trans></div>
      <div style={{ padding: "0 34px", borderBottom: "1px solid var(--border)", position: "sticky", top: 0, background: "var(--background)", zIndex: 2, marginTop: 14 }}>
        <div style={{ display: "flex", gap: 24 }}>
          {TABS.map((tab) => {
            const Icon = tab.icon
            return (
              <div key={tab.key} className={`stab${section === tab.key ? " on" : ""}`} onClick={() => setSection(tab.key)}>
                <Icon className="lucide" />
                {tab.label}
              </div>
            )
          })}
        </div>
      </div>

      <div style={{ padding: "26px 34px 40px", maxWidth: 820 }}>
        {section === "language" && (
          <>
            <div style={{ font: "700 24px var(--font-sans)", letterSpacing: "-0.02em", marginBottom: 4 }}><Trans>Language</Trans></div>
            <div style={{ font: "400 13.5px var(--font-sans)", color: "var(--muted-foreground)", marginBottom: 22 }}>
              <Trans>The language ADT Studio's interface is shown in. This does not change a book's output languages.</Trans>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {LOCALES.map((l) => {
                const sel = locale === l.key
                return (
                  <div
                    key={l.key}
                    onClick={() => setLocale(l.key)}
                    style={{ display: "flex", alignItems: "center", gap: 14, padding: "15px 16px", borderRadius: 13, cursor: "pointer", background: "var(--card)", border: `1.5px solid ${sel ? "var(--brand-600)" : "var(--border)"}`, boxShadow: sel ? "0 0 0 3px var(--brand-50)" : "none" }}
                  >
                    <span style={{ width: 40, height: 28, borderRadius: 7, display: "grid", placeItems: "center", font: "700 12px var(--font-mono)", background: sel ? "var(--brand-600)" : "var(--muted)", color: sel ? "#fff" : "var(--muted-foreground)", flex: "none" }}>
                      {i18n._(l.code)}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ font: "600 14px var(--font-sans)", color: sel ? "var(--brand-700)" : "var(--foreground)" }}>{i18n._(l.name)}</div>
                      <div style={{ font: "400 12px var(--font-sans)", color: "var(--muted-foreground)", marginTop: 1 }}>{i18n._(l.native)}</div>
                    </div>
                    <span style={{ width: 20, height: 20, borderRadius: 999, display: "grid", placeItems: "center", background: sel ? "var(--brand-600)" : "var(--muted)", flex: "none" }}>
                      <Check className="lucide" style={{ width: 12, height: 12, color: "#fff", opacity: sel ? 1 : 0 }} />
                    </span>
                  </div>
                )
              })}
            </div>
          </>
        )}

        {section === "theme" && (
          <>
            <div style={{ font: "700 24px var(--font-sans)", letterSpacing: "-0.02em", marginBottom: 4 }}><Trans>Theme</Trans></div>
            <div style={{ font: "400 13.5px var(--font-sans)", color: "var(--muted-foreground)", marginBottom: 22 }}><Trans>How ADT Studio looks on this machine.</Trans></div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 16 }}>
              {THEMES.map((th) => {
                const sel = theme === th.key
                const Icon = th.icon
                return (
                  <div
                    key={th.key}
                    onClick={() => {
                      setTheme(th.key)
                      applyTheme(th.key)
                    }}
                    style={{ cursor: "pointer", borderRadius: 14, border: `1.5px solid ${sel ? "var(--brand-600)" : "var(--border)"}`, boxShadow: sel ? "0 0 0 3px var(--brand-50)" : "var(--shadow-sm)", overflow: "hidden", background: "var(--card)" }}
                  >
                    <div style={{ position: "relative", height: 96, background: th.previewBg, display: "flex", overflow: "hidden" }}>
                      <div style={{ width: "34%", background: th.railBg, borderRight: `1px solid ${th.hairline}`, padding: "8px 7px", display: "flex", flexDirection: "column", gap: 5 }}>
                        <div style={{ width: 14, height: 14, borderRadius: 4, background: "var(--brand-600)" }} />
                        <div style={{ height: 5, borderRadius: 3, background: th.barStrong, width: "85%" }} />
                        <div style={{ height: 5, borderRadius: 3, background: th.barSoft, width: "70%" }} />
                        <div style={{ height: 5, borderRadius: 3, background: th.barSoft, width: "78%" }} />
                      </div>
                      <div style={{ flex: 1, padding: "9px 10px", display: "flex", flexDirection: "column", gap: 6 }}>
                        <div style={{ height: 7, borderRadius: 3, background: th.barStrong, width: "55%" }} />
                        <div style={{ height: 5, borderRadius: 3, background: th.barSoft, width: "88%" }} />
                        <div style={{ height: 5, borderRadius: 3, background: th.barSoft, width: "74%" }} />
                        <div style={{ display: "flex", gap: 5, marginTop: "auto" }}>
                          <div style={{ flex: 1, height: 22, borderRadius: 6, background: th.cardBg, border: `1px solid ${th.hairline}` }} />
                          <div style={{ flex: 1, height: 22, borderRadius: 6, background: th.cardBg, border: `1px solid ${th.hairline}` }} />
                        </div>
                      </div>
                      {th.split && <div style={{ position: "absolute", inset: 0, background: "linear-gradient(105deg, transparent 49.8%, #0f172a 50.2%)" }} />}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 13px", borderTop: "1px solid var(--border)" }}>
                      <Icon className="lucide" style={{ width: 15, height: 15, color: sel ? "var(--brand-700)" : "var(--foreground)" }} />
                      <span style={{ font: "600 13px var(--font-sans)", color: sel ? "var(--brand-700)" : "var(--foreground)" }}>{th.label}</span>
                      <span style={{ marginLeft: "auto", width: 18, height: 18, borderRadius: 999, display: "grid", placeItems: "center", background: sel ? "var(--brand-600)" : "var(--muted)" }}>
                        <Check className="lucide" style={{ width: 11, height: 11, color: "#fff", opacity: sel ? 1 : 0 }} />
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="set-card">
              <div className="set-row">
                <div className="set-row-txt">
                  <div className="set-row-ttl"><Trans>Reduce motion</Trans></div>
                  <p className="set-row-sub"><Trans>Minimise onboarding and list-reorder animations.</Trans></p>
                </div>
                <div className={`sw${motion ? " on" : ""}`} onClick={() => setMotion((v) => !v)} />
              </div>
            </div>
          </>
        )}

        {section === "notifications" && (
          <>
            <div style={{ font: "700 24px var(--font-sans)", letterSpacing: "-0.02em", marginBottom: 4 }}><Trans>Notifications</Trans></div>
            <div style={{ font: "400 13.5px var(--font-sans)", color: "var(--muted-foreground)", marginBottom: 22 }}>
              <Trans>Toasts appear when a stage finishes, an export is ready, or something needs attention.</Trans>
            </div>
            <div className="set-card">
              <div className="set-row" style={{ alignItems: "flex-start" }}>
                <div className="set-row-txt">
                  <div className="set-row-ttl"><Trans>Position</Trans></div>
                  <p className="set-row-sub">
                    <Trans>Click a corner to move toasts — currently <b style={{ color: "var(--foreground)" }}>{posLabel}</b>.</Trans>
                  </p>
                </div>
                <div style={{ position: "relative", width: 230, height: 140, background: "var(--muted)", border: "1px solid var(--border)", borderRadius: 12, flex: "none", overflow: "hidden" }}>
                  <div style={{ height: 16, background: "var(--neutral-700)", display: "flex", alignItems: "center", gap: 3, padding: "0 6px" }}>
                    <span style={{ width: 5, height: 5, borderRadius: 99, background: "#ff5f57" }} />
                    <span style={{ width: 5, height: 5, borderRadius: 99, background: "#febc2e" }} />
                    <span style={{ width: 5, height: 5, borderRadius: 99, background: "#28c840" }} />
                  </div>
                  {POSITIONS.map((p) => {
                    const sel = toastPos === p.key
                    return (
                      <div
                        key={p.key}
                        onClick={() => setToastPos(p.key)}
                        title={p.label}
                        style={{ position: "absolute", width: 52, height: 17, borderRadius: 5, cursor: "pointer", display: "flex", alignItems: "center", gap: 3, padding: "0 4px", boxSizing: "border-box", background: sel ? "var(--card)" : "transparent", border: `1px solid ${sel ? "var(--brand-400)" : "transparent"}`, ...p.ph }}
                      >
                        <span style={{ width: 7, height: 7, borderRadius: 99, background: sel ? "var(--brand-600)" : "var(--neutral-400)", flex: "none" }} />
                        <span style={{ flex: 1, height: 4, borderRadius: 2, background: "var(--neutral-300)" }} />
                      </div>
                    )
                  })}
                </div>
              </div>
              <div className="set-row">
                <div className="set-row-txt">
                  <div className="set-row-ttl"><Trans>Play a sound</Trans></div>
                  <p className="set-row-sub"><Trans>A soft chime when a long task completes.</Trans></p>
                </div>
                <div className={`sw${sound ? " on" : ""}`} onClick={() => setSound((v) => !v)} />
              </div>
              <div className="set-row">
                <div className="set-row-txt">
                  <div className="set-row-ttl"><Trans>Auto-dismiss</Trans></div>
                  <p className="set-row-sub"><Trans>Hide toasts automatically after a delay.</Trans></p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <select className="sel" style={{ opacity: auto ? 1 : 0.4 }}>
                    <option><Trans>after 4s</Trans></option>
                    <option><Trans>after 6s</Trans></option>
                    <option><Trans>after 10s</Trans></option>
                  </select>
                  <div className={`sw${auto ? " on" : ""}`} onClick={() => setAuto((v) => !v)} />
                </div>
              </div>
            </div>
          </>
        )}

        {section === "api" && (
          <>
            <div style={{ font: "700 24px var(--font-sans)", letterSpacing: "-0.02em", marginBottom: 4 }}><Trans>AI providers</Trans></div>
            <div style={{ font: "400 13.5px var(--font-sans)", color: "var(--muted-foreground)", marginBottom: 22 }}>
              <Trans>API keys for the AI pipeline. Keys are stored locally on this machine and never leave it except to call the provider.</Trans>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {providers.map((pr) => {
                const Icon = pr.icon
                const connected = !!pr.key
                return (
                  <div key={pr.name} style={{ display: "flex", alignItems: "center", gap: 14, padding: "15px 18px", background: "var(--card)", border: "1px solid var(--border)", borderRadius: 13, boxShadow: "var(--shadow-sm)" }}>
                    <div style={{ width: 40, height: 40, borderRadius: 11, background: pr.tileBg, display: "grid", placeItems: "center", color: pr.tileFg, flex: "none" }}>
                      <Icon className="lucide" style={{ width: 19, height: 19 }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ font: "600 14px var(--font-sans)" }}>{pr.name}</span>
                        <span className={`bdg ${connected ? "bdg-ok" : "bdg-sec"}`}>
                          {connected ? <Check className="lucide" /> : <Minus className="lucide" />}
                          {connected ? <Trans>Connected</Trans> : <Trans>Not set</Trans>}
                        </span>
                      </div>
                      <div style={{ font: "400 12px var(--font-sans)", color: "var(--muted-foreground)", marginTop: 3 }}>{pr.desc}</div>
                    </div>
                    {connected ? (
                      <>
                        <span style={{ font: "500 12.5px var(--font-mono)", color: "var(--muted-foreground)" }}>{mask(pr.key)}</span>
                        <button className="btn btn-out btn-sm" onClick={onOpenApiKeys}>
                          <Pencil className="lucide" style={{ width: 14, height: 14 }} />
                          <Trans>Update</Trans>
                        </button>
                      </>
                    ) : (
                      <button className="btn btn-out btn-sm" onClick={onOpenApiKeys}>
                        <Plus className="lucide" style={{ width: 14, height: 14 }} />
                        <Trans>Add key</Trans>
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14, font: "400 12px var(--font-sans)", color: "var(--muted-foreground)" }}>
              <ShieldCheck className="lucide" style={{ width: 14, height: 14, color: "#059669" }} />
              <Trans>Keys are kept in this machine's local storage. Custom uses any OpenAI-compatible endpoint; Azure powers Speech TTS.</Trans>
            </div>
          </>
        )}

        {section === "about" && (
          <>
            <div style={{ font: "700 24px var(--font-sans)", letterSpacing: "-0.02em", marginBottom: 4 }}><Trans>About</Trans></div>
            <div style={{ font: "400 13.5px var(--font-sans)", color: "var(--muted-foreground)", marginBottom: 22 }}>
              <Trans>ADT Studio turns PDFs into accessible digital textbooks.</Trans>
            </div>
            <div style={{ position: "relative", background: "var(--card)", border: "1px solid var(--border)", borderRadius: 16, boxShadow: "var(--shadow-sm)", padding: 30, overflow: "hidden", marginBottom: 14 }}>
              <div style={{ position: "absolute", width: 340, height: 340, right: -90, top: -140, borderRadius: "50%", background: "radial-gradient(circle, rgba(43,127,255,.10), transparent 70%)", pointerEvents: "none" }} />
              <div style={{ display: "flex", alignItems: "center", gap: 20, position: "relative" }}>
                <div style={{ width: 74, height: 74, borderRadius: 19, background: "#fff", display: "grid", placeItems: "center", boxShadow: "var(--shadow-brand-soft)", flex: "none" }}>
                  <img src="/logo.png" style={{ width: 56, height: 56 }} alt="" />
                </div>
                <div>
                  <div style={{ font: "600 22px var(--font-mono)", letterSpacing: "-0.02em" }}>
                    adt<span style={{ color: "var(--brand-600)" }}>/</span>studio
                  </div>
                  <div style={{ font: "700 10px var(--font-sans)", letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--muted-foreground)", marginTop: 5 }}>
                    <Trans>Accessible digital textbook</Trans>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 9 }}>
                    <span className="bdg bdg-out" style={{ fontFamily: "var(--font-mono)" }}>v{version ?? "—"}</span>
                    <span className="bdg bdg-ok">
                      <Check className="lucide" />
                      <Trans>Up to date</Trans>
                    </span>
                  </div>
                </div>
                <button className="btn btn-out btn-sm" style={{ marginLeft: "auto", flex: "none" }}>
                  <RotateCcw className="lucide" style={{ width: 14, height: 14 }} />
                  <Trans>Check for updates</Trans>
                </button>
              </div>
            </div>
            <div className="set-card">
              <div className="set-row">
                <div className="set-row-txt">
                  <div className="set-row-ttl"><Trans>Books folder</Trans></div>
                  <p className="set-row-sub"><Trans>Where book projects live on this machine.</Trans></p>
                </div>
                <button className="btn btn-out btn-sm">
                  <Folder className="lucide" style={{ width: 14, height: 14 }} />
                  <Trans>~/ADT/Books</Trans>
                </button>
              </div>
              <div className="set-row">
                <div className="set-row-txt">
                  <div className="set-row-ttl"><Trans>Diagnostics</Trans></div>
                  <p className="set-row-sub"><Trans>Logs help us debug pipeline failures.</Trans></p>
                </div>
                <button className="btn btn-out btn-sm">
                  <FileDown className="lucide" style={{ width: 14, height: 14 }} />
                  <Trans>Export logs</Trans>
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
