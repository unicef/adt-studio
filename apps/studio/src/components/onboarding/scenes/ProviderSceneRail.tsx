import { useMemo, useState, type ComponentType } from "react"
import {
  Eye,
  EyeOff,
  Check,
  Lock,
  ExternalLink,
  ClipboardPaste,
  KeyRound,
  Terminal,
  Blocks,
  Waves,
  Clock,
  AlertTriangle,
} from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { useApiKey } from "@/hooks/use-api-key"
import type { OnboardingStepProps } from "../steps"

/* --- brand marks (inline SVG so we stay dependency-free) --- */

function OpenAiMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7451-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z" />
    </svg>
  )
}

function AnthropicMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M17.3041 3.541h-3.6718l6.696 16.918H24Zm-10.6082 0L0 20.459h3.7442l1.3693-3.5527h7.0052l1.3693 3.5528h3.7442L10.5363 3.541Zm-.3712 10.2232 2.2914-5.9456 2.2914 5.9456Z" />
    </svg>
  )
}

function GeminiMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <defs>
        <linearGradient id="adt-gemini-grad" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
          <stop stopColor="#4285F4" />
          <stop offset="0.55" stopColor="#9B72CB" />
          <stop offset="1" stopColor="#D96570" />
        </linearGradient>
      </defs>
      <path
        fill="url(#adt-gemini-grad)"
        d="M12 24A14.304 14.304 0 0 0 0 12 14.304 14.304 0 0 0 12 0a14.305 14.305 0 0 0 12 12 14.305 14.305 0 0 0-12 12"
      />
    </svg>
  )
}

/* --- model --- */

type Method = {
  id: string
  label: string
  Icon: ComponentType<{ className?: string }>
  enabled: boolean
  keyUrl?: string
  prefix?: string
  placeholder?: string
  value?: string
  set?: (v: string) => void
}
type Provider = {
  id: string
  name: string
  desc: string
  accent: string
  tint: string
  Mark: ComponentType<{ className?: string }>
  enabled: boolean
  methods: Method[]
}

function firstEnabledMethod(p: Provider): string {
  return (p.methods.find((m) => m.enabled) ?? p.methods[0]).id
}

/**
 * Provider screen — master/detail rail. Brand-colored provider icons stack on
 * the left; the selected provider's connection methods and key inputs render on
 * the right. Providers/methods that aren't wired up yet (DeepSeek, OpenAI Codex,
 * Claude SDK) render disabled with a "Soon" tag. AI-agnostic by construction.
 */
export function ProviderSceneRail(_props: OnboardingStepProps) {
  const { t } = useLingui()
  const k = useApiKey()
  const [reveal, setReveal] = useState(false)

  const providers = useMemo<Provider[]>(
    () =>
      /* eslint-disable lingui/no-unlocalized-strings -- brand names, product names, key prefixes/placeholders and URLs are not translated */
      [
      {
        id: "openai",
        name: "OpenAI",
        desc: t`GPT-5, GPT-4o and the Responses API.`,
        accent: "#10A37F",
        tint: "#E7F7F1",
        Mark: OpenAiMark,
        enabled: true,
        methods: [
          {
            id: "api",
            label: t`API key`,
            Icon: KeyRound,
            enabled: true,
            keyUrl: "https://platform.openai.com/api-keys",
            prefix: "sk-",
            placeholder: "sk-...",
            value: k.apiKey,
            set: k.setApiKey,
          },
          { id: "codex", label: "Codex", Icon: Terminal, enabled: false },
        ],
      },
      {
        id: "anthropic",
        name: "Anthropic",
        desc: t`Claude Opus & Sonnet.`,
        accent: "#D97757",
        tint: "#FBEEE7",
        Mark: AnthropicMark,
        enabled: true,
        methods: [
          {
            id: "api",
            label: t`API key`,
            Icon: KeyRound,
            enabled: true,
            keyUrl: "https://console.anthropic.com/settings/keys",
            prefix: "sk-ant",
            placeholder: "sk-ant-...",
            value: k.anthropicKey,
            set: k.setAnthropicKey,
          },
          { id: "sdk", label: "Claude SDK", Icon: Blocks, enabled: false },
        ],
      },
      {
        id: "gemini",
        name: "Google Gemini",
        desc: t`Gemini models + TTS voices.`,
        accent: "#4285F4",
        tint: "#EAF0FE",
        Mark: GeminiMark,
        enabled: true,
        methods: [
          {
            id: "api",
            label: t`API key`,
            Icon: KeyRound,
            enabled: true,
            keyUrl: "https://aistudio.google.com/app/apikey",
            prefix: "AIza",
            placeholder: "AIza...",
            value: k.googleKey,
            set: (v) => {
              k.setGoogleKey(v)
              k.setGeminiKey(v)
            },
          },
        ],
      },
      {
        id: "deepseek",
        name: "DeepSeek",
        desc: t`DeepSeek-V3 & R1 reasoning.`,
        accent: "#4D6BFE",
        tint: "#EAEEFF",
        Mark: Waves,
        enabled: false,
        methods: [{ id: "api", label: t`API key`, Icon: KeyRound, enabled: false }],
      },
    ],
    /* eslint-enable lingui/no-unlocalized-strings */
    [k, t],
  )

  const [selectedId, setSelectedId] = useState("openai")
  const provider = providers.find((p) => p.id === selectedId) ?? providers[0]
  const [methodId, setMethodId] = useState(() => firstEnabledMethod(provider))
  const method = provider.methods.find((m) => m.id === methodId) ?? provider.methods[0]

  const selectProvider = (p: Provider) => {
    if (!p.enabled) return
    setSelectedId(p.id)
    setMethodId(firstEnabledMethod(p))
    setReveal(false)
  }

  const providerConnected = (p: Provider) =>
    p.methods.some((m) => (m.value ?? "").trim().length > 0)

  const val = (method.value ?? "").trim()
  const looksValid = val.length > 0 && (!method.prefix || val.startsWith(method.prefix))
  const looksWrong = val.length > 0 && !!method.prefix && !val.startsWith(method.prefix)

  const paste = async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (text && method.set) method.set(text.trim())
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <div className="animate-onboarding-fade-in flex h-full w-full flex-col px-8 pt-6">
      <div className="flex flex-col items-center">
        <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-[#0a0a0a]">
          <Trans>Connect an AI provider</Trans>
        </h2>
        <p className="mt-1 flex items-center gap-1.5 text-[12.5px] text-[#737373]">
          <Lock className="h-3.5 w-3.5 text-[#9aa0aa]" />
          <Trans>Keys are stored locally on this device — never sent anywhere else.</Trans>
        </p>
      </div>

      <div className="mt-4 flex min-h-0 flex-1 gap-4">
        {/* left rail */}
        <div className="flex w-[214px] shrink-0 flex-col gap-1.5 overflow-y-auto pr-0.5">
          {providers.map((p) => {
            const selected = p.id === selectedId
            const connected = providerConnected(p)
            return (
              <button
                key={p.id}
                type="button"
                disabled={!p.enabled}
                onClick={() => selectProvider(p)}
                className={cn(
                  "group relative flex items-center gap-3 rounded-xl border px-2.5 py-2.5 text-left transition-all duration-200",
                  p.enabled ? "cursor-pointer" : "cursor-not-allowed opacity-45",
                  selected
                    ? "border-transparent bg-[#f4f7ff] shadow-[inset_2px_0_0_0_var(--accent)]"
                    : "border-black/[0.06] bg-white hover:border-black/15",
                )}
                style={{ ["--accent" as string]: p.accent }}
              >
                <span
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-[11px]"
                  style={{ backgroundColor: p.tint }}
                >
                  <p.Mark className="h-[22px] w-[22px]" />
                  {p.Mark === Waves && (
                    <span className="sr-only">{p.name}</span>
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-semibold text-[#0a0a0a]">
                    {p.name}
                  </span>
                  <span className="mt-0.5 flex items-center gap-1 text-[11px] text-[#9aa0aa]">
                    {!p.enabled ? (
                      <>
                        <Clock className="h-3 w-3" />
                        <Trans>Soon</Trans>
                      </>
                    ) : connected ? (
                      <>
                        <span className="h-1.5 w-1.5 rounded-full bg-[#0f9d58]" />
                        <Trans>Connected</Trans>
                      </>
                    ) : (
                      <Trans>Not connected</Trans>
                    )}
                  </span>
                </span>
              </button>
            )
          })}
        </div>

        {/* detail panel */}
        <div className="flex min-w-0 flex-1 flex-col rounded-2xl border border-black/[0.08] bg-[#fbfbfc] p-5">
          <div className="flex items-center gap-3">
            <span
              className="grid h-11 w-11 shrink-0 place-items-center rounded-[13px]"
              style={{ backgroundColor: provider.tint }}
            >
              <provider.Mark className="h-6 w-6" />
            </span>
            <div className="min-w-0">
              <div className="text-[16px] font-semibold text-[#0a0a0a]">{provider.name}</div>
              <div className="truncate text-[12.5px] text-[#737373]">{provider.desc}</div>
            </div>
          </div>

          {/* method segmented control */}
          {provider.methods.length > 1 && (
            <div className="mt-4 inline-flex w-fit rounded-xl bg-black/[0.04] p-1">
              {provider.methods.map((m) => {
                const on = m.id === methodId
                return (
                  <button
                    key={m.id}
                    type="button"
                    disabled={!m.enabled}
                    onClick={() => m.enabled && setMethodId(m.id)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition-all duration-200",
                      !m.enabled && "cursor-not-allowed opacity-40",
                      on ? "bg-white text-[#0a0a0a] shadow-sm" : "text-[#5a5f68] hover:text-[#0a0a0a]",
                    )}
                  >
                    <m.Icon className="h-3.5 w-3.5" />
                    {m.label}
                    {!m.enabled && (
                      <span className="ml-0.5 rounded bg-black/[0.06] px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[#9aa0aa]">
                        <Trans>Soon</Trans>
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )}

          {/* method body */}
          {method.enabled && method.set ? (
            <div className="mt-4">
              <div className="mb-1.5 flex items-center justify-between">
                <label htmlFor="rail-key" className="text-[12.5px] font-semibold text-[#0a0a0a]">
                  {provider.name} <Trans>API key</Trans>
                </label>
                {method.keyUrl && (
                  <a
                    href={method.keyUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[12px] font-medium text-[#3b82f7] hover:underline"
                  >
                    <Trans>Get a key</Trans>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
              <div className="relative">
                <Input
                  id="rail-key"
                  type={reveal ? "text" : "password"}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={method.placeholder}
                  value={method.value ?? ""}
                  onChange={(e) => method.set?.(e.target.value)}
                  className={cn("h-10 rounded-lg bg-white pr-20", looksValid && "border-[#0f9d58]")}
                />
                <div className="absolute right-1 top-0 flex h-10 items-center">
                  <button
                    type="button"
                    onClick={paste}
                    title={t`Paste`}
                    className="grid h-8 w-8 place-items-center rounded-md text-[#9aa0aa] transition-colors hover:text-[#0a0a0a]"
                  >
                    <ClipboardPaste className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setReveal((v) => !v)}
                    className="grid h-8 w-8 place-items-center rounded-md text-[#9aa0aa] transition-colors hover:text-[#0a0a0a]"
                  >
                    {reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="mt-2 flex min-h-[18px] items-center text-[12px]">
                {looksValid ? (
                  <span className="flex items-center gap-1.5 font-medium text-[#0f9d58]">
                    <Check className="h-3.5 w-3.5" strokeWidth={3} />
                    <Trans>Connected — key saved</Trans>
                  </span>
                ) : looksWrong ? (
                  <span className="flex items-center gap-1.5 font-medium text-[#c2620a]">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    <Trans>This doesn't look like a {provider.name} key</Trans>
                  </span>
                ) : (
                  <span className="text-[#9aa0aa]">
                    <Trans>Paste your key to connect this provider.</Trans>
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className="mt-4 flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-black/[0.12] bg-white/60 px-6 py-8 text-center">
              <Clock className="h-5 w-5 text-[#9aa0aa]" />
              <div className="mt-2 text-[13px] font-semibold text-[#5a5f68]">
                <Trans>Coming soon</Trans>
              </div>
              <div className="mt-1 max-w-[280px] text-[12px] text-[#9aa0aa]">
                <Trans>This connection isn't available yet — it'll light up in a future release.</Trans>
              </div>
            </div>
          )}
        </div>
      </div>

      <p className="py-2.5 text-center text-[12px] text-[#9aa0aa]">
        <Trans>Not required to continue — you can add or change providers anytime in Settings.</Trans>
      </p>
    </div>
  )
}
