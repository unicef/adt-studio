import { useId, useState } from "react";
import { CircleHelp, Minus, Plus } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface RangeSliderProps {
  label: string;
  hideLabel?: boolean;
  tooltip?: string;
  min: number;
  max: number;
  value: [number, number];
  onChange: (value: [number, number]) => void;
  disabled?: boolean;
  /**
   * Like `disabled` (non-interactive), but keeps the current values visible
   * instead of blanking the inputs. Use when a value is fixed/locked and the
   * user should still be able to read it.
   */
  readOnly?: boolean;
  startLabel?: string;
  endLabel?: string;
  color?: string;
}

export interface SingleValueSliderProps {
  label: string;
  tooltip?: string;
  min: number;
  max: number;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  minValueLabel?: string;
  valueUnit?: string;
  color?: string;
}

function clampToRange(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

function MinMaxInput({
  label,
  value,
  min,
  max,
  onChange,
  disabled,
  readOnly,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  readOnly?: boolean;
}) {
  const inputId = useId();
  const [draft, setDraft] = useState<string | null>(null);

  function clamp(v: number) {
    return Math.min(max, Math.max(min, v));
  }

  function commit(raw: string) {
    setDraft(null);
    const parsed = parseInt(raw, 10);
    if (!isNaN(parsed)) onChange(clamp(parsed));
  }

  // A locked field stays non-interactive, but a read-only lock keeps the value
  // visible (a plain `disabled` slider blanks the inputs).
  const locked = disabled || readOnly;
  return (
    <div className="flex w-full flex-col items-center gap-1 py-2">
      <Label
        htmlFor={inputId}
        className="cursor-pointer text-xs font-light text-black"
      >
        {label}
      </Label>
      <div className="flex h-8 items-center overflow-hidden rounded-[6.4px] border border-[#e5e5e5] w-full">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={locked || value <= min}
          onClick={() => onChange(clamp(value - 1))}
          className="h-8 w-8 shrink-0 rounded-none border-r border-[#e5e5e5] transition-colors duration-150"
        >
          <Minus className="h-3 w-3" />
        </Button>
        <Input
          id={inputId}
          type="number"
          disabled={locked}
          value={disabled && !readOnly ? "" : (draft ?? value)}
          min={min}
          max={max}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.currentTarget.blur();
            }
          }}
          className={cn(
            "h-8 w-full rounded-none border-0 bg-white px-2 py-0 text-center text-[11.2px] shadow-none",
            "focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0",
            "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
            // Keep the value legible when read-only (disabled inputs are dimmed).
            readOnly && "disabled:cursor-default disabled:opacity-100",
          )}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={locked || value >= max}
          onClick={() => onChange(clamp(value + 1))}
          className="h-8 w-8 shrink-0 rounded-none border-l border-[#e5e5e5] transition-colors duration-150"
        >
          <Plus className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

export function SingleValueSlider({
  label,
  tooltip,
  min,
  max,
  value,
  onChange,
  disabled,
  minValueLabel,
  valueUnit = "px",
  color,
}: SingleValueSliderProps) {
  const groupLabelId = useId();
  const boundedMin = Number.isFinite(min) ? min : 0;
  const boundedMax =
    Number.isFinite(max) && max >= boundedMin ? max : boundedMin;
  const v = clampToRange(value, boundedMin, boundedMax);

  return (
    <div
      className="flex flex-col gap-3"
      role="group"
      aria-labelledby={groupLabelId}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Label
            id={groupLabelId}
            className="cursor-default text-sm font-medium text-black"
          >
            {label}
          </Label>
          {tooltip && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="text-[#a3a3a3] transition-colors duration-150 hover:text-[#737373]"
                >
                  <CircleHelp className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">{tooltip}</TooltipContent>
            </Tooltip>
          )}
        </div>
        <span className="text-xs font-medium tabular-nums text-muted-foreground">
          {v <= boundedMin ? minValueLabel : `${v} ${valueUnit}`}
        </span>
      </div>

      <Slider
        aria-labelledby={groupLabelId}
        min={boundedMin}
        max={boundedMax}
        step={1}
        value={[v]}
        onValueChange={(next) => {
          const n = next[0];
          if (n !== undefined) onChange(n);
        }}
        disabled={disabled}
        color={color}
      />
    </div>
  );
}

export function RangeSlider({
  label,
  hideLabel,
  tooltip,
  min,
  max,
  value,
  onChange,
  disabled,
  readOnly,
  startLabel,
  endLabel,
  color,
}: RangeSliderProps) {
  const [start, end] = value;
  const groupLabelId = useId();

  const boundedMin = Number.isFinite(min) ? min : 0;
  const boundedMax =
    Number.isFinite(max) && max >= boundedMin ? max : boundedMin;
  const emptyRangePreview = disabled && boundedMax <= boundedMin;
  const sliderMax = emptyRangePreview ? boundedMin + 1 : boundedMax;

  const lo = clampToRange(Math.min(start, end), boundedMin, sliderMax);
  const hi = clampToRange(Math.max(start, end), boundedMin, sliderMax);
  const sliderValue: [number, number] = emptyRangePreview
    ? [boundedMin, sliderMax]
    : [Math.min(lo, hi), Math.max(lo, hi)];

  return (
    <div
      className="flex flex-col gap-3"
      role="group"
      aria-labelledby={groupLabelId}
    >
      <div className={cn("flex items-center gap-1.5", hideLabel && "sr-only")}>
        <Label
          id={groupLabelId}
          className="cursor-default text-sm font-medium text-black"
        >
          {label}
        </Label>
        {tooltip && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="text-[#a3a3a3] transition-colors duration-150 hover:text-[#737373]"
              >
                <CircleHelp className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">{tooltip}</TooltipContent>
          </Tooltip>
        )}
      </div>

      <Slider
        aria-labelledby={groupLabelId}
        min={boundedMin}
        max={sliderMax}
        step={1}
        value={sliderValue}
        onValueChange={([s, e]) => onChange([s, e])}
        disabled={disabled || readOnly}
        color={color}
      />

      <div className="flex items-center justify-between gap-2">
        <MinMaxInput
          label={startLabel ?? ""}
          value={start}
          min={boundedMin}
          max={end}
          onChange={(v) => onChange([v, end])}
          disabled={disabled}
          readOnly={readOnly}
        />
        <MinMaxInput
          label={endLabel ?? ""}
          value={end}
          min={start}
          max={boundedMax}
          onChange={(v) => onChange([start, v])}
          disabled={disabled}
          readOnly={readOnly}
        />
      </div>
    </div>
  );
}
