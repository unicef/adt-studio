import { Headphones } from "lucide-react"
import { Trans } from "@lingui/react/macro"
import { msg } from "@lingui/core/macro"
import { i18n as linguiI18n } from "@lingui/core"
import type { MessageDescriptor } from "@lingui/core"
import { ACCENT_VAR } from "@/components/pipeline/lib/accent-var"

export type GradeLevelKey = "early" | "middle" | "advanced"

const CAPTION_SAMPLES: Record<GradeLevelKey, MessageDescriptor> = {
  early: msg`A long row of shelves filled with food in a big store.`,
  middle: msg`A supermarket aisle with shelves of colorful cereal boxes and packaged goods, lit by overhead lights, with a single shopper in the distance.`,
  advanced: msg`A wide-angle view down a fluorescent-lit supermarket aisle, with stacked branded cereal boxes lining the left shelves and assorted packaged dry goods on the right; a lone shopper stands at the far end, providing scale to the receding perspective.`,
}

export function CaptionsPreview({ grade }: { grade: GradeLevelKey }) {
  /* eslint-disable lingui/no-unlocalized-strings -- mock textbook content, illustrative only */
  return (
    <div className="flex flex-1 min-h-0 flex-col bg-background">
      <div className="flex flex-1 min-h-0 gap-4 px-6 py-6">
      {/* Left column — placeholder body text (lorem ipsum, locale-agnostic) */}
      <div className="flex flex-1 flex-col gap-2 overflow-hidden">
        <p className="text-center text-base font-semibold leading-snug tracking-tight text-foreground">
          Lorem ipsum
        </p>
        <p className="text-[11px] leading-[15px] text-justify text-foreground/70">
          Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do
          eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim
          ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut
          aliquip ex ea commodo consequat.
        </p>
        <p className="text-[11px] leading-[15px] text-justify text-foreground/70">
          Duis aute irure dolor in reprehenderit in voluptate velit esse
          cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat
          cupidatat non proident, sunt in culpa qui officia deserunt mollit
          anim id est laborum.
        </p>
        <div className="text-[11px] leading-[15px] text-justify text-foreground/70">
          <p>Sed ut perspiciatis unde omnis iste natus error:</p>
          <ul className="list-disc ml-3 mt-1 space-y-0.5">
            <li>
              <span>
                Voluptatem accusantium doloremque laudantium totam rem
                aperiam.
              </span>
            </li>
            <li>
              <span>
                Eaque ipsa quae ab illo inventore veritatis et quasi
                architecto.
              </span>
            </li>
            <li>
              <span>
                Beatae vitae dicta sunt explicabo nemo enim ipsam voluptatem.
              </span>
            </li>
          </ul>
        </div>
        <p className="text-[11px] leading-[15px] text-justify text-foreground/70">
          Quia voluptas sit aspernatur aut odit aut fugit, sed quia
          consequuntur magni dolores eos qui ratione voluptatem sequi
          nesciunt. Neque porro quisquam est, qui dolorem ipsum quia dolor
          sit amet.
        </p>
        <p className="text-[11px] leading-[15px] text-justify text-foreground/70">
          Consectetur, adipisci velit, sed quia non numquam eius modi tempora
          incidunt ut labore et dolore magnam aliquam quaerat voluptatem.
        </p>
      </div>

      {/* Right column — text + image + alt-text card + text */}
      <div className="flex flex-1 flex-col gap-2 overflow-hidden">
        <p className="text-[11px] leading-[15px] text-justify text-foreground/70">
          Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do
          eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim
          ad minim veniam, quis nostrud exercitation.
        </p>

        {/* Demo image — supermarket aisle (Unsplash, free to use). The
            alt-text card is positioned absolutely just below the image so it
            can grow with caption length without reflowing the page text. */}
        <div className="relative shrink-0">
          <img
            src="/previews/supermarket-aisle.jpg"
            alt=""
            className="aspect-[4/3] w-full rounded-sm border-2 object-cover"
            style={{ borderColor: ACCENT_VAR }}
          />
          <div className="absolute inset-x-0 top-full z-10 mt-2">
            <AltTextCard grade={grade} />
          </div>
        </div>

        <p className="text-[11px] leading-[15px] text-justify text-foreground/70">
          Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris
          nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in
          reprehenderit in voluptate velit esse cillum dolore eu fugiat
          nulla pariatur.
        </p>
        <p className="text-[11px] leading-[15px] text-justify text-foreground/70">
          Excepteur sint occaecat cupidatat non proident, sunt in culpa qui
          officia deserunt mollit anim id est laborum.
        </p>
      </div>
      </div>
      {/* Accessibility callout — explains who the captions are for. Kept
          visually quiet so it informs without competing with the preview. */}
      <AccessibilityCallout />
    </div>
  )
  /* eslint-enable lingui/no-unlocalized-strings */
}

function AccessibilityCallout() {
  return (
    <div
      className="mx-6 mb-5 flex shrink-0 items-start gap-3.5 rounded-lg border border-teal-200 bg-gradient-to-br from-teal-50 to-white px-4 py-3.5 shadow-[0_6px_18px_-10px_rgba(13,148,136,0.35)]"
    >
      <span
        className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-foreground shadow-sm ring-4 ring-border"
        style={{ background: ACCENT_VAR }}
        aria-hidden
      >
        <Headphones className="h-7 w-7 text-white" strokeWidth={2} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-[12.5px] font-semibold leading-tight text-teal-800">
          <Trans>Captions support accessibility.</Trans>
        </span>
        <p className="text-[11px] leading-3.75  text-black">
          <Trans>
            Captions make visual and audio content accessible to people who
            are blind or have low vision by providing information that screen
            readers can read aloud. Adding captions helps ensure everyone can
            access and understand your content.
          </Trans>
        </p>
      </div>
    </div>
  )
}

function AltTextCard({ grade }: { grade: GradeLevelKey }) {
  return (
    <div className="flex shrink-0 flex-col gap-1 rounded-md border border-[#e5e5e5] bg-background p-2.5 shadow-[0px_4px_10px_0px_rgba(0,0,0,0.08)] transition-[height] duration-300 ease-out">
      <span className="text-[11px] font-semibold tracking-tight text-foreground">
        <Trans>Image Alt-Text</Trans>
      </span>
      <p
        key={grade}
        className="text-[10px] font-medium leading-[13px] text-foreground text-justify motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-200 motion-safe:ease-out"
      >
        &ldquo;{linguiI18n._(CAPTION_SAMPLES[grade])}&rdquo;
      </p>
      <p className="text-[9px] font-medium text-[#99a1af]">
        <Trans>This text is only perceptible to assistive technologies.</Trans>
      </p>
    </div>
  )
}
