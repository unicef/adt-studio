import { useMemo, useState } from "react"
import { Eye, EyeOff, Check, Lock, ExternalLink, ChevronDown } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useApiKey } from "@/hooks/use-api-key"
import type { OnboardingStepProps } from "../steps"

type Field = {
  id: string
  label: string
  placeholder: string
  secret: boolean
  value: string
  set: (v: string) => void
}
type Provider = {
  id: string
  name: string
  desc: string
  letter: string
  tint: string
  tone: string
  keyUrl?: string
  recommended?: boolean
  fields: Field[]
}
type Group = { title: string; providers: Provider[] }

function mask(key: string): string {
  if (!key) return ""
  const head = key.startsWith("sk-ant") ? "sk-ant-" : key.startsWith("sk-") ? "sk-" : ""
  return `${head}••••${key.slice(-4)}`
}

/**
 * Provider screen — Variant B ("list"). Keeps the full provider list but drops
 * the modal for inline accordion expansion, groups Language vs Speech, and adds
 * a "get a key" link and live connected state. Lower-churn evolution of today's
 * screen.
 */
export function ProviderSceneList(_props: OnboardingStepProps) {
  const { t } = useLingui()
  const k = useApiKey()
  const [openId, setOpenId] = useState<string | null>("openai")
  const [reveal, setReveal] = useState<Record<string, boolean>>({})

  const groups = useMemo<Group[]>(
    () => [
      {
        title: t`Language model`,
        providers: [
          {
            id: "openai",
            name: "OpenAI",
            desc: t`GPT models for pipeline tasks.`,
            letter: "O",
            tint: "#e9f9f1",
            tone: "#059669",
            keyUrl: "https://platform.openai.com/api-keys",
            recommended: true,
            fields: [{ id: "openai", label: t`OpenAI API Key`, placeholder: "sk-...", secret: true, value: k.apiKey, set: k.setApiKey }],
          },
          {
            id: "anthropic",
            name: "Anthropic",
            desc: t`Claude — Opus, Sonnet.`,
            letter: "A",
            tint: "#fdf1e3",
            tone: "#c2620a",
            keyUrl: "https://console.anthropic.com/settings/keys",
            fields: [{ id: "anthropic", label: t`Anthropic API Key`, placeholder: "sk-ant-...", secret: true, value: k.anthropicKey, set: k.setAnthropicKey }],
          },
          {
            id: "google",
            name: "Google AI",
            desc: t`Gemini — LLM & TTS voices.`,
            letter: "G",
            tint: "#e8f0fe",
            tone: "#1a73e8",
            keyUrl: "https://aistudio.google.com/app/apikey",
            // eslint-disable-next-line lingui/no-unlocalized-strings -- API key placeholder
            fields: [{ id: "google", label: t`Google AI API Key`, placeholder: "AIza...", secret: true, value: k.googleKey, set: (v) => { k.setGoogleKey(v); k.setGeminiKey(v) } }],
          },
          {
            id: "custom",
            name: "Custom (OpenAI-compatible)",
            desc: t`Ollama, vLLM, Together AI — any endpoint.`,
            letter: "C",
            tint: "#f1f2f4",
            tone: "#5a5f68",
            fields: [
              { id: "baseurl", label: t`Base URL`, placeholder: "http://localhost:11434/v1", secret: false, value: k.customBaseUrl, set: k.setCustomBaseUrl },
              { id: "customkey", label: t`API Key (optional)`, placeholder: t`Leave empty if not required`, secret: true, value: k.customApiKey, set: k.setCustomApiKey },
            ],
          },
        ],
      },
      {
        title: t`Speech`,
        providers: [
          {
            id: "azure",
            name: "Azure Speech",
            desc: t`Azure TTS · subscription key + region.`,
            // eslint-disable-next-line lingui/no-unlocalized-strings -- provider initials
            letter: "Az",
            tint: "#eceafd",
            tone: "#5b4bcc",
            fields: [
              { id: "azurekey", label: t`Subscription Key`, placeholder: t`Azure Speech key`, secret: true, value: k.azureKey, set: k.setAzureKey },
              { id: "region", label: t`Region`, placeholder: "eastus", secret: false, value: k.azureRegion, set: k.setAzureRegion },
            ],
          },
        ],
      },
    ],
    [k, t],
  )

  const connectedOf = (p: Provider) => p.fields[0].value.trim().length > 0

  return (
    <div className="animate-onboarding-fade-in flex h-full w-full flex-col items-center px-10 pt-6">
      <h2 className="text-[23px] font-semibold tracking-[-0.02em] text-[#0a0a0a]">
        <Trans>Connect an AI provider</Trans>
      </h2>
      <p className="mt-1.5 flex items-center gap-1.5 text-[13px] leading-relaxed text-[#737373]">
        <Lock className="h-3.5 w-3.5 text-[#9aa0aa]" />
        <Trans>Keys are stored locally on this device — never sent anywhere else.</Trans>
      </p>

      <div className="mt-4 w-full max-w-[620px] space-y-3 overflow-y-auto pr-0.5">
        {groups.map((g) => (
          <div key={g.title}>
            <div className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-[#9aa0aa]">
              {g.title}
            </div>
            <div className="space-y-2">
              {g.providers.map((p) => {
                const connected = connectedOf(p)
                const open = openId === p.id
                return (
                  <div
                    key={p.id}
                    className={cn(
                      "rounded-2xl border bg-white transition-colors",
                      open ? "border-[#3b82f7]/40" : "border-black/[0.08]",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => setOpenId(open ? null : p.id)}
                      className="flex w-full items-center gap-3.5 px-3.5 py-2.5 text-left cursor-pointer"
                    >
                      <span
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] text-[13px] font-bold"
                        style={{ backgroundColor: p.tint, color: p.tone }}
                      >
                        {p.letter}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[14px] font-semibold text-[#0a0a0a]">{p.name}</span>
                          {p.recommended && (
                            <span className="rounded-full bg-[#eef4ff] px-1.5 py-0.5 text-[10px] font-semibold text-[#3b82f7]">
                              <Trans>Recommended</Trans>
                            </span>
                          )}
                        </div>
                        <div className="truncate text-[12px] text-[#737373]">{p.desc}</div>
                      </div>
                      {connected && !open && (
                        <>
                          <span className="hidden font-mono text-[12px] text-[#9aa0aa] sm:block">
                            {mask(p.fields[0].value)}
                          </span>
                          <span className="flex items-center gap-1.5 rounded-full bg-[#e9f7ef] px-2.5 py-1.5">
                            <Check className="h-3 w-3 text-[#0f9d58]" strokeWidth={3} />
                            <span className="text-[12px] font-semibold text-[#0f9d58]">
                              <Trans>Connected</Trans>
                            </span>
                          </span>
                        </>
                      )}
                      <ChevronDown
                        className={cn(
                          "h-4 w-4 shrink-0 text-[#9aa0aa] transition-transform duration-200",
                          open && "rotate-180",
                        )}
                      />
                    </button>

                    {open && (
                      <div className="animate-onboarding-fade-in border-t border-black/[0.06] px-3.5 pb-3.5 pt-3">
                        {p.keyUrl && (
                          <a
                            href={p.keyUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="mb-2.5 inline-flex items-center gap-1 text-[12px] font-medium text-[#3b82f7] hover:underline"
                          >
                            <Trans>Where do I get a key?</Trans>
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                        <div className="flex flex-col gap-2.5">
                          {p.fields.map((f) => (
                            <div key={f.id} className="space-y-1.5">
                              <Label htmlFor={`list-${f.id}`} className="text-[12px]">{f.label}</Label>
                              <div className="relative">
                                <Input
                                  id={`list-${f.id}`}
                                  type={f.secret && !reveal[f.id] ? "password" : "text"}
                                  autoComplete="off"
                                  spellCheck={false}
                                  placeholder={f.placeholder}
                                  value={f.value}
                                  onChange={(e) => f.set(e.target.value)}
                                  className={cn("h-9 rounded-lg", f.secret && "pr-10")}
                                />
                                {f.secret && (
                                  <button
                                    type="button"
                                    tabIndex={-1}
                                    onClick={() => setReveal((r) => ({ ...r, [f.id]: !r[f.id] }))}
                                    className="absolute right-1 top-0 grid h-9 w-8 place-items-center text-[#9aa0aa] transition-colors hover:text-[#0a0a0a]"
                                  >
                                    {reveal[f.id] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      <p className="mt-auto pb-1 pt-3 text-[12px] text-[#9aa0aa]">
        <Trans>Not required to continue — you can add or change providers later in Settings.</Trans>
      </p>
    </div>
  )
}
