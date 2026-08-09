import { useMemo, useState } from "react"
import { Eye, EyeOff, Check } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
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
  fields: Field[]
}

function mask(key: string): string {
  if (!key) return ""
  const head = key.startsWith("sk-ant") ? "sk-ant-" : key.startsWith("sk-") ? "sk-" : ""
  return `${head}••••${key.slice(-4)}`
}

export function ProviderScene(_props: OnboardingStepProps) {
  const { t } = useLingui()
  const k = useApiKey()
  const [openId, setOpenId] = useState<string | null>(null)
  const [reveal, setReveal] = useState(false)
  const [drafts, setDrafts] = useState<Record<string, string>>({})

  const providers = useMemo<Provider[]>(
    () => [
      {
        id: "openai",
        name: "OpenAI",
        desc: t`GPT models for pipeline tasks.`,
        letter: "O",
        tint: "#e9f9f1",
        tone: "#059669",
        fields: [{ id: "openai", label: t`OpenAI API Key`, placeholder: "sk-...", secret: true, value: k.apiKey, set: k.setApiKey }],
      },
      {
        id: "anthropic",
        name: "Anthropic",
        desc: t`Claude — Opus, Sonnet.`,
        letter: "A",
        tint: "#fdf1e3",
        tone: "#c2620a",
        fields: [{ id: "anthropic", label: t`Anthropic API Key`, placeholder: "sk-ant-...", secret: true, value: k.anthropicKey, set: k.setAnthropicKey }],
      },
      {
        id: "google",
        name: "Google AI",
        desc: t`Gemini — LLM & TTS voices.`,
        letter: "G",
        tint: "#e8f0fe",
        tone: "#1a73e8",
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
    [k, t],
  )

  const active = providers.find((p) => p.id === openId) ?? null
  const connectedOf = (p: Provider) => p.fields[0].value.trim().length > 0

  const openDialog = (p: Provider) => {
    setDrafts(Object.fromEntries(p.fields.map((f) => [f.id, f.value])))
    setReveal(false)
    setOpenId(p.id)
  }
  const save = () => {
    if (!active) return
    for (const f of active.fields) f.set((drafts[f.id] ?? "").trim())
    setOpenId(null)
  }

  return (
    <div className="animate-onboarding-fade-in flex h-full w-full flex-col items-center px-10 pt-7">
      <h2 className="text-[23px] font-semibold tracking-[-0.02em] text-[#0a0a0a]">
        <Trans>Connect an AI provider</Trans>
      </h2>
      <p className="mt-1.5 max-w-lg text-center text-[13px] leading-relaxed text-[#737373]">
        <Trans>
          ADT Studio runs on your own API keys — stored locally on this device,
          never sent anywhere else.
        </Trans>
      </p>

      <div className="mt-4 w-full max-w-[620px] space-y-2">
        {providers.map((p) => {
          const connected = connectedOf(p)
          return (
            <div
              key={p.id}
              className="flex items-center gap-3.5 rounded-2xl border border-black/[0.08] bg-white px-3.5 py-2.5"
            >
              <span
                className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] text-[13px] font-bold"
                style={{ backgroundColor: p.tint, color: p.tone }}
              >
                {p.letter}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-semibold text-[#0a0a0a]">{p.name}</div>
                <div className="truncate text-[12px] text-[#737373]">{p.desc}</div>
              </div>
              {connected ? (
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
                  <Button variant="outline" size="sm" className="h-8 rounded-lg" onClick={() => openDialog(p)}>
                    <Trans>Update</Trans>
                  </Button>
                </>
              ) : (
                <Button variant="outline" size="sm" className="h-8 rounded-lg" onClick={() => openDialog(p)}>
                  + <Trans>Add key</Trans>
                </Button>
              )}
            </div>
          )
        })}
      </div>

      <Dialog open={active !== null} onOpenChange={(o) => !o && setOpenId(null)}>
        <DialogContent className="sm:max-w-lg">
          {active && (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                save()
              }}
            >
              <DialogHeader>
                <DialogTitle>{active.name}</DialogTitle>
                <DialogDescription>{active.desc}</DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-4 py-5">
                {active.fields.map((f) => (
                  <div key={f.id} className="space-y-2">
                    <Label htmlFor={`onb-${f.id}`}>{f.label}</Label>
                    <div className="relative">
                      <Input
                        id={`onb-${f.id}`}
                        type={f.secret && !reveal ? "password" : "text"}
                        autoComplete="off"
                        spellCheck={false}
                        placeholder={f.placeholder}
                        value={drafts[f.id] ?? ""}
                        onChange={(e) => setDrafts((d) => ({ ...d, [f.id]: e.target.value }))}
                        className={cn("h-10 rounded-lg", f.secret && "pr-10")}
                      />
                      {f.secret && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-0 top-0 h-10 w-10"
                          onClick={() => setReveal((v) => !v)}
                          tabIndex={-1}
                        >
                          {reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpenId(null)}>
                  <Trans>Cancel</Trans>
                </Button>
                <Button type="submit">
                  <Trans>Save</Trans>
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
