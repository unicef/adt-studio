import { useState } from "react"
import { ChevronRight } from "lucide-react"
import { useLingui } from "@lingui/react/macro"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { DEFAULT_ELEVENLABS_VOICE_SETTINGS } from "@adt/types"

interface TuningSliderProps {
  id: string
  label: string
  help: string
  /** Empty string means "unset" — the default applies. */
  value: string
  onChange: (value: string) => void
  min: number
  max: number
  step: number
  /** Shown when the value is unset, so the user sees what will actually apply. */
  defaultValue?: number
}

function TuningSlider({
  id, label, help, value, onChange, min, max, step, defaultValue,
}: TuningSliderProps) {
  const { t } = useLingui()
  const numeric = value === "" ? defaultValue ?? min : Number(value)

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id} className="text-xs">{label}</Label>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] text-muted-foreground">
            {value === ""
              ? t`${String(defaultValue ?? min)} (default)`
              : numeric.toFixed(2)}
          </span>
          {value !== "" && (
            <Button
              variant="ghost"
              size="sm"
              className="h-5 px-1.5 text-[10px] text-muted-foreground"
              onClick={() => onChange("")}
            >
              {t`Reset`}
            </Button>
          )}
        </div>
      </div>
      <Slider
        id={id}
        value={[numeric]}
        min={min}
        max={max}
        step={step}
        onValueChange={([next]) => onChange(String(next))}
      />
      <p className="text-[11px] text-muted-foreground">{help}</p>
    </div>
  )
}

interface ElevenLabsVoiceTuningProps {
  stability: string; setStability: (v: string) => void
  similarityBoost: string; setSimilarityBoost: (v: string) => void
  style: string; setStyle: (v: string) => void
  useSpeakerBoost: string; setUseSpeakerBoost: (v: string) => void
  speed: string; setSpeed: (v: string) => void
  markDirty: (field: string) => void
}

/**
 * ElevenLabs `voice_settings` controls, collapsed by default.
 *
 * These exist because ElevenLabs applies the *voice's own stored settings* when
 * the request omits `voice_settings`, which for community and cloned voices can
 * mean the model invents filler sounds ("ehm") that aren't in the text. We now
 * always send a resolved block using the narration defaults shown here; these
 * controls let a book deliberately trade that stability for expressiveness.
 *
 * Values are held as strings (empty = unset, so the default applies), matching
 * the Gemini temperature/seed inputs in the same panel.
 */
export function ElevenLabsVoiceTuning({
  stability, setStability,
  similarityBoost, setSimilarityBoost,
  style, setStyle,
  useSpeakerBoost, setUseSpeakerBoost,
  speed, setSpeed,
  markDirty,
}: ElevenLabsVoiceTuningProps) {
  const { t } = useLingui()
  const [open, setOpen] = useState(false)

  const update = (setter: (v: string) => void) => (value: string) => {
    setter(value)
    markDirty("speech")
  }

  const speakerBoostEnabled =
    useSpeakerBoost === ""
      ? DEFAULT_ELEVENLABS_VOICE_SETTINGS.use_speaker_boost
      : useSpeakerBoost === "true"

  return (
    <div className="pt-1 border-t">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 pt-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground"
      >
        <ChevronRight className={cn("h-3 w-3 transition-transform", open && "rotate-90")} aria-hidden="true" />
        {t`Voice tuning (advanced)`}
      </button>

      {open && (
        <div className="space-y-3 pt-3">
          <p className="text-[11px] text-muted-foreground">
            {t`Defaults follow ElevenLabs' own narration recommendation. Lowering stability or raising style makes delivery more expressive, but also makes ElevenLabs more likely to add sounds that aren't in the text — such as filled pauses like "ehm". Changing any of these regenerates ElevenLabs audio on the next run.`}
          </p>

          <TuningSlider
            id="elevenlabs-stability"
            label={t`Stability`}
            help={t`Higher keeps tone consistent across sentences. Lower widens emotional range at the cost of hallucinated sounds.`}
            value={stability}
            onChange={update(setStability)}
            min={0}
            max={1}
            step={0.05}
            defaultValue={DEFAULT_ELEVENLABS_VOICE_SETTINGS.stability}
          />

          <TuningSlider
            id="elevenlabs-similarity"
            label={t`Similarity`}
            help={t`How closely to match the original voice recording. Lower it if you hear audio artifacts.`}
            value={similarityBoost}
            onChange={update(setSimilarityBoost)}
            min={0}
            max={1}
            step={0.05}
            defaultValue={DEFAULT_ELEVENLABS_VOICE_SETTINGS.similarity_boost}
          />

          <TuningSlider
            id="elevenlabs-style"
            label={t`Style exaggeration`}
            help={t`Amplifies the speaker's style. ElevenLabs recommends leaving this at 0 — raising it can cause inconsistent speed, mispronunciation, and extra sounds.`}
            value={style}
            onChange={update(setStyle)}
            min={0}
            max={1}
            step={0.05}
            defaultValue={DEFAULT_ELEVENLABS_VOICE_SETTINGS.style}
          />

          <TuningSlider
            id="elevenlabs-speed"
            label={t`Speed`}
            help={t`Leave unset to keep ElevenLabs' own pacing. Extreme values reduce quality.`}
            value={speed}
            onChange={update(setSpeed)}
            min={0.7}
            max={1.2}
            step={0.05}
            defaultValue={1}
          />

          <div className="flex items-start gap-3">
            <Switch
              id="elevenlabs-speaker-boost"
              checked={speakerBoostEnabled}
              onCheckedChange={(v) => update(setUseSpeakerBoost)(String(v))}
            />
            <div className="space-y-1 flex-1">
              <Label htmlFor="elevenlabs-speaker-boost" className="text-xs">{t`Speaker boost`}</Label>
              <p className="text-[11px] text-muted-foreground">
                {t`Boosts similarity to the original speaker, at some cost in latency.`}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
