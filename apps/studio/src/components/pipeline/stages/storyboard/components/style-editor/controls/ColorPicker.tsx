import Color from "color";
import {
  forwardRef,
  useEffect,
  useMemo,
  useState,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react";
import { Check, Search } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ColorPicker as PickerRoot,
  ColorPickerSelection as PickerSelection,
  ColorPickerHue as PickerHue,
  ColorPickerAlpha as PickerAlpha,
  ColorPickerFormat as PickerFormat,
  ColorPickerEyeDropper as PickerEyeDropper,
  ColorPickerOutput as PickerOutput,
} from "@/components/ui/color-picker";
import {
  KEYWORD_COLORS,
  TAILWIND_FAMILIES,
  hexFromTailwindName,
  tailwindNameFromHex,
} from "../tailwind-palette";
import { useOptionalElementContext } from "../element-context";

interface ColorPickerProps {
  /** Active color — either a hex string (`#abc123`) or a Tailwind token (`violet-500`). */
  value: string;
  onChange: (next: string) => void;
  /** Optional custom popover trigger. Defaults to a small swatch button. */
  children?: ReactNode;
  align?: "start" | "center" | "end";
  /** Hide the alpha slider and `transparent` affordances and always emit
   *  6-digit hex — for consumers whose value can't carry transparency
   *  (e.g. the activity theme accent). */
  opaqueOnly?: boolean;
}

const TRANSPARENT_PATTERN =
/* eslint-disable-next-line lingui/no-unlocalized-strings -- CSS gradient definition, not user-facing copy */
  "linear-gradient(45deg, #ccc 25%, transparent 25%, transparent 75%, #ccc 75%, #ccc), linear-gradient(45deg, #ccc 25%, transparent 25%, transparent 75%, #ccc 75%, #ccc)";


/**
 * Two-tab color picker (Custom / Variables). The Custom tab composes the
 * kibo-ui-style primitives from `@/components/ui/color-picker` (HSV pad,
 * hue slider, alpha slider, format-aware readout, eyedropper). The
 * Variables tab is a searchable grid of Tailwind palette tokens (theme
 * keywords + 22 hue families × 11 shades).
 *
 * Returns either a 6-/8-digit hex string (`#abc123` / `#abc123ff`) or a
 * Tailwind token name (`violet-500`, `transparent`). 8-digit hex carries
 * partial alpha through onChange. Step 5 of the style-editor plan turns
 * tokens + alpha into Tailwind classes (`text-violet-500/50`) instead of
 * arbitrary-value escapes.
 */
export function ColorPicker({
  value,
  onChange,
  children,
  align = "end",
  opaqueOnly = false,
}: ColorPickerProps) {
  const hex = isHex(value) ? value : (hexFromTailwindName(value) ?? "#000000");
  // Optional so the picker can be reused outside the style-editor sidebar
  // (e.g. the step-by-step activity panel), where no element is selected.
  const dataId = useOptionalElementContext()?.dataId ?? null;
  const [open, setOpen] = useState(false);

  // Close when the user picks a different element in the preview — clicks
  // inside the iframe don't reach Radix's outside-click listener.
  useEffect(() => {
    setOpen(false);
  }, [dataId]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {children ?? <SwatchButton color={hex} />}
      </PopoverTrigger>
      <PopoverContent
        align={align}
        sideOffset={8}
        collisionPadding={12}
        className="w-68 p-0 rounded-xl overflow-hidden border border-border/60 shadow-xl"
      >
        <ColorPickerBody value={hex} onChange={onChange} opaqueOnly={opaqueOnly} />
      </PopoverContent>
    </Popover>
  );
}

function ColorPickerBody({
  value,
  onChange,
  opaqueOnly,
}: {
  value: string;
  onChange: (next: string) => void;
  opaqueOnly: boolean;
}) {
  const initialTab = tailwindNameFromHex(value) ? "variables" : "custom";
  const [tab, setTab] = useState<"custom" | "variables">(initialTab);

  return (
    <div className="flex flex-col">
      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as "custom" | "variables")}
        className="flex flex-col"
      >
        <div className="px-2.5 pt-2.5">
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="custom" className="text-[11px]">
              <Trans>Custom</Trans>
            </TabsTrigger>
            <TabsTrigger value="variables" className="text-[11px]">
              <Trans>Variables</Trans>
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="custom" className="px-2.5 pb-2.5 mt-2.5">
          <CustomPanel value={value} onChange={onChange} opaqueOnly={opaqueOnly} />
        </TabsContent>

        <TabsContent value="variables" className="mt-2.5">
          <VariablesPanel value={value} onChange={onChange} opaqueOnly={opaqueOnly} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function CustomPanel({
  value,
  onChange,
  opaqueOnly,
}: {
  value: string;
  onChange: (next: string) => void;
  opaqueOnly: boolean;
}) {
  return (
    <PickerRoot
      value={value}
      onChange={([r, g, b, a]) => {
        const c = Color.rgb(r, g, b).alpha(a);
        // Use 8-digit hex when alpha < 1, plain 6-digit otherwise. Lets the
        // alpha slider round-trip without losing transparency, and matches
        // the keyword `transparent` from the Variables tab.
        const next = !opaqueOnly && a < 1 ? c.hexa() : c.hex();
        onChange(next);
      }}
      className="gap-2"
    >
      <PickerSelection className="h-32 rounded-md" />
      <PickerHue />
      {!opaqueOnly && <PickerAlpha />}
      <div className="flex gap-2">
        <PickerEyeDropper />
        <PickerOutput />
        <PickerFormat />
      </div>
      {!opaqueOnly && <TransparentButton onClick={() => onChange("transparent")} />}
    </PickerRoot>
  );
}

function VariablesPanel({
  value,
  onChange,
  opaqueOnly,
}: {
  value: string;
  onChange: (next: string) => void;
  opaqueOnly: boolean;
}) {
  const { t } = useLingui();
  const [query, setQuery] = useState("");
  const lowered = query.trim().toLowerCase();

  const filteredFamilies = useMemo(() => {
    if (!lowered) return TAILWIND_FAMILIES;
    return TAILWIND_FAMILIES.map((f) => ({
      ...f,
      shades: f.shades.filter(
        (s) =>
          s.name.toLowerCase().includes(lowered) ||
          s.hex.toLowerCase().includes(lowered),
      ),
    })).filter((f) => f.shades.length > 0);
  }, [lowered]);

  const filteredKeywords = useMemo(() => {
    const keywords = opaqueOnly
      ? KEYWORD_COLORS.filter((k) => k.hex !== "transparent")
      : KEYWORD_COLORS;
    if (!lowered) return keywords;
    return keywords.filter((k) => k.name.toLowerCase().includes(lowered));
  }, [lowered, opaqueOnly]);

  const matchedName = tailwindNameFromHex(value);

  return (
    <div className="flex flex-col">
      <div className="px-2.5 pb-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t`Search colors`}
          prependIcon={<Search className="h-3.5 w-3.5" />}
          className={cn(
            "h-7 py-0 text-[11px]",
            "border-0 bg-muted/60 ring-offset-0",
            "focus-visible:bg-background focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-violet-500 focus-visible:ring-offset-0",
          )}
        />
      </div>

      <div className="max-h-60 overflow-y-auto px-2.5 pb-2.5 scrollbar-hide">
        {filteredKeywords.length > 0 ? (
          <div className="mb-2.5">
            <p className="text-[10px] uppercase tracking-[0.08em] font-semibold text-muted-foreground/80 mb-1">
              <Trans>Theme</Trans>
            </p>
            <div className="grid grid-cols-6 gap-1">
              {filteredKeywords.map((k) => (
                <SwatchTile
                  key={k.name}
                  hex={k.hex}
                  active={
                    value.toLowerCase() === k.hex.toLowerCase() ||
                    matchedName === k.name
                  }
                  label={k.name}
                  onClick={() => onChange(k.name)}
                  showCheckerboard={k.hex === "transparent"}
                />
              ))}
            </div>
          </div>
        ) : null}

        {filteredFamilies.length === 0 && filteredKeywords.length === 0 ? (
          <p className="py-6 text-center text-[12px] text-muted-foreground">
            <Trans>No colors found</Trans>
          </p>
        ) : null}

        {filteredFamilies.map((family) => (
          <div key={family.name} className="mb-2">
            <p className="text-[10px] capitalize tracking-wide font-medium text-muted-foreground/80 mb-1">
              {family.name}
            </p>
            <div className="grid grid-cols-11 gap-1">
              {family.shades.map((s) => (
                <SwatchTile
                  key={s.name}
                  hex={s.hex}
                  active={
                    value.toLowerCase() === s.hex.toLowerCase() ||
                    matchedName === s.name
                  }
                  label={s.name}
                  compact
                  onClick={() => onChange(s.name)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SwatchTile({
  hex,
  active,
  label,
  onClick,
  compact,
  showCheckerboard,
}: {
  hex: string;
  active: boolean;
  label: string;
  onClick: () => void;
  compact?: boolean;
  showCheckerboard?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        "relative aspect-square rounded-sm overflow-hidden cursor-pointer transition-all",
        "ring-1 ring-inset ring-border/80",
        active ? "scale-105" : "hover:ring-foreground/30",
        compact ? "min-h-5" : "min-h-7",
      )}
      style={
        showCheckerboard
          ? {
              backgroundImage: TRANSPARENT_PATTERN,
              backgroundSize: "6px 6px",
              backgroundPosition: "0 0, 3px 3px",
            }
          : { backgroundColor: hex }
      }
    >
      {active ? (
        <Check
          strokeWidth={4}
          className={cn(
            "absolute inset-0 m-auto drop-shadow-sm",
            compact ? "h-3 w-3" : "h-3.5 w-3.5",
            isLight(hex) ? "text-foreground" : "text-white",
          )}
        />
      ) : null}
    </button>
  );
}

function TransparentButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-8 w-full inline-flex items-center justify-center gap-2 rounded-md border border-dashed border-border text-[12px] text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-violet-500"
    >
      <span
        className="h-3.5 w-3.5 rounded-sm overflow-hidden ring-1 ring-inset ring-border/60"
        style={{
          backgroundImage: TRANSPARENT_PATTERN,
          backgroundSize: "6px 6px",
          backgroundPosition: "0 0, 3px 3px",
        }}
      />
      <Trans>Transparent</Trans>
    </button>
  );
}

// Must forward the ref and spread injected props: when no custom trigger is
// passed, `<PopoverTrigger asChild>` renders this as the trigger and needs to
// attach its ref + onClick here. Dropping them (the previous bug) left the
// swatch inert, so the picker never opened (e.g. the activity editor's accent).
const SwatchButton = forwardRef<
  HTMLButtonElement,
  { color: string } & ComponentPropsWithoutRef<"button">
>(function SwatchButton({ color, style, ...props }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      {...props}
      className="relative inline-block h-5 w-5 shrink-0 overflow-hidden rounded border border-border/60 cursor-pointer"
      aria-label={color}
      style={{
        ...(color === "transparent"
          ? {
              backgroundImage: TRANSPARENT_PATTERN,
              backgroundSize: "6px 6px",
              backgroundPosition: "0 0, 3px 3px",
            }
          : { backgroundColor: color }),
        ...style,
      }}
    />
  );
});

function isHex(s: string): boolean {
  // 6-digit (#abcdef) or 8-digit (#abcdefab — RGBA) hex.
  return /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(s);
}

/** Quick brightness check for choosing legible check-mark color. */
function isLight(hex: string): boolean {
  const m = hex.match(/^#?([0-9a-f]{6})$/i);
  if (!m) return true;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  // Perceived luminance (Rec. 709)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 160;
}
