import { Trans } from "@lingui/react/macro"
import { msg } from "@lingui/core/macro"
import type { MessageDescriptor } from "@lingui/core"
import { Sparkles } from "lucide-react"
import type { DockSlug } from "@/components/app/screens/pipeline/shared/plugins"

export interface PluginCopy {
  /** Headline for the never-run state. */
  emptyTitle: MessageDescriptor
  /** Label of the primary "run it" action. */
  runVerb: MessageDescriptor
  /** Label of the secondary "do it by hand" action. */
  manualVerb: MessageDescriptor
  /** A concrete example of what this plugin produces. */
  sample: React.ReactNode
  /** One line explaining the shape of every produced item. */
  sampleNote: React.ReactNode
  /** Overrides the sample heading for plugins that do not generate with AI. */
  sampleTitle?: MessageDescriptor
}

function SampleCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-[10px] border bg-card px-3 py-2.5 opacity-80">{children}</div>
  )
}

function SampleHead({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <Sparkles className="size-3 shrink-0 text-muted-foreground" />
      {children}
    </div>
  )
}

const GENERIC: Pick<PluginCopy, "sample" | "sampleNote"> = {
  sample: (
    <SampleCard>
      <SampleHead>
        <span className="text-sm font-bold">
          <Trans>Generated item</Trans>
        </span>
      </SampleHead>
      <p className="text-[12.5px] leading-relaxed text-muted-foreground">
        <Trans>Every item is produced per section, linked back to the page it came from.</Trans>
      </p>
    </SampleCard>
  ),
  sampleNote: <Trans>Everything is editable and saved as a new version — nothing is overwritten.</Trans>,
}

export const PLUGIN_COPY: Record<DockSlug, PluginCopy> = {
  extract: {
    emptyTitle: msg`Nothing extracted yet`,
    runVerb: msg`Extract the PDF`,
    manualVerb: msg`Upload a different PDF`,
    sampleTitle: msg`What extraction pulls out`,
    sample: (
      <SampleCard>
        <SampleHead>
          <span className="text-sm font-bold">
            <Trans>Page 10</Trans>
          </span>
        </SampleHead>
        <p className="text-[12.5px] leading-relaxed text-foreground">
          <Trans>The text of the page, in reading order, plus every illustration cut out of it.</Trans>
        </p>
        <p className="font-mono text-[10px] text-muted-foreground">
          <Trans>112 words · 1 image · 2 fonts</Trans>
        </p>
      </SampleCard>
    ),
    sampleNote: (
      <Trans>Pages with no text layer are read from the page image instead, and flagged so you can check them.</Trans>
    ),
  },
  sectioning: {
    emptyTitle: msg`Nothing sectioned yet`,
    runVerb: msg`Generate sections`,
    manualVerb: msg`Create a section manually`,
    sampleTitle: msg`What sectioning produces`,
    sample: (
      <SampleCard>
        <SampleHead>
          <span className="text-sm font-bold">
            <Trans>text_and_single_image</Trans>
          </span>
        </SampleHead>
        <p className="text-[12.5px] leading-relaxed text-foreground">
          <Trans>A stanza and the illustration beside it, kept together as one readable unit.</Trans>
        </p>
        <p className="font-mono text-[10px] text-muted-foreground">
          <Trans>page 10 · 7 nodes</Trans>
        </p>
      </SampleCard>
    ),
    sampleNote: (
      <Trans>Sections are what the reader navigates — every later step attaches its output to them.</Trans>
    ),
  },
  glossary: {
    emptyTitle: msg`No terms in the glossary`,
    runVerb: msg`Suggest terms from the book`,
    manualVerb: msg`Add a term manually`,
    sample: (
      <SampleCard>
        <SampleHead>
          <span className="text-sm font-bold">
            <Trans>misanthrope</Trans>
          </span>
          <span className="tracking-[2px]">🚪🧍🙃</span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
            <Trans>misanthropic</Trans>
          </span>
        </SampleHead>
        <p className="text-[12.5px] leading-relaxed text-foreground">
          <Trans>Someone who prefers to live alone and avoids the company of others.</Trans>
        </p>
        <p className="font-mono text-[10px] text-muted-foreground">
          <Trans>1× in the book · page 12</Trans>
        </p>
      </SampleCard>
    ),
    sampleNote: (
      <Trans>Each term comes with a definition, emojis, variants and where it appears — all editable, saved as a version.</Trans>
    ),
  },
  captions: {
    emptyTitle: msg`No image captions yet`,
    runVerb: msg`Describe the book's images`,
    manualVerb: msg`Write a description manually`,
    sample: (
      <SampleCard>
        <SampleHead>
          <span className="text-sm font-bold">
            <Trans>Illustration, page 10</Trans>
          </span>
        </SampleHead>
        <p className="text-[12.5px] leading-relaxed text-foreground">
          <Trans>Woodcut in orange and black: a crowded tram crosses the street while passengers board from the side stairs.</Trans>
        </p>
        <p className="font-mono text-[10px] text-muted-foreground">
          <Trans>alt-text · 148 characters</Trans>
        </p>
      </SampleCard>
    ),
    sampleNote: <Trans>Every image gets an alternative description a screen reader can announce.</Trans>,
  },
  quizzes: {
    emptyTitle: msg`No quizzes yet`,
    runVerb: msg`Generate comprehension questions`,
    manualVerb: msg`Write a question manually`,
    sample: (
      <SampleCard>
        <SampleHead>
          <span className="text-sm font-bold">
            <Trans>Why does the tram stop?</Trans>
          </span>
        </SampleHead>
        <p className="text-[12.5px] leading-relaxed text-foreground">
          <Trans>Multiple choice · 4 options · 1 correct answer</Trans>
        </p>
        <p className="font-mono text-[10px] text-muted-foreground">
          <Trans>section 2 · page 10</Trans>
        </p>
      </SampleCard>
    ),
    sampleNote: <Trans>Questions are tied to the section they test, so they move with the content.</Trans>,
  },
  toc: {
    emptyTitle: msg`No table of contents yet`,
    runVerb: msg`Build the table of contents`,
    manualVerb: msg`Add an entry manually`,
    sample: (
      <SampleCard>
        <SampleHead>
          <span className="text-sm font-bold">
            <Trans>1. The afternoon tram</Trans>
          </span>
        </SampleHead>
        <p className="text-[12.5px] leading-relaxed text-muted-foreground">
          <Trans>1.1 The station · 1.2 Boarding · 1.3 The ride home</Trans>
        </p>
        <p className="font-mono text-[10px] text-muted-foreground">
          <Trans>3 levels · pages 9–12</Trans>
        </p>
      </SampleCard>
    ),
    sampleNote: <Trans>Headings are grouped into a navigable outline the reader can jump through.</Trans>,
  },
  "easy-read": {
    emptyTitle: msg`No Easy Read text yet`,
    runVerb: msg`Rewrite the book in Easy Read`,
    manualVerb: msg`Write a block manually`,
    sample: (
      <SampleCard>
        <SampleHead>
          <span className="text-sm font-bold">
            <Trans>Easy Read block</Trans>
          </span>
        </SampleHead>
        <p className="text-[12.5px] leading-relaxed text-foreground">
          <Trans>The tram is full. People get on using the stairs on the side.</Trans>
        </p>
        <p className="font-mono text-[10px] text-muted-foreground">
          <Trans>short sentences · one idea per line</Trans>
        </p>
      </SampleCard>
    ),
    sampleNote: <Trans>Readers toggle between the original text and the Easy Read version.</Trans>,
  },
  translate: {
    emptyTitle: msg`No translations yet`,
    runVerb: msg`Translate the book`,
    manualVerb: msg`Edit a translation manually`,
    sample: (
      <SampleCard>
        <SampleHead>
          <span className="text-sm font-bold">
            <Trans>The afternoon tram</Trans>
          </span>
        </SampleHead>
        <p className="text-[12.5px] leading-relaxed text-foreground">
          <Trans>El tranvía de la tarde · O bonde da tarde · Le tram de l'après-midi</Trans>
        </p>
        <p className="font-mono text-[10px] text-muted-foreground">
          <Trans>195 strings · 3 target languages</Trans>
        </p>
      </SampleCard>
    ),
    sampleNote: <Trans>Every translatable string lands in one catalog you can review language by language.</Trans>,
  },
  speech: {
    emptyTitle: msg`No narration yet`,
    runVerb: msg`Generate the narration`,
    manualVerb: msg`Upload audio manually`,
    sample: (
      <SampleCard>
        <SampleHead>
          <span className="text-sm font-bold">
            <Trans>Page 10 · narration</Trans>
          </span>
        </SampleHead>
        <p className="text-[12.5px] leading-relaxed text-foreground">
          <Trans>0:42 of audio, aligned word by word with the text on screen.</Trans>
        </p>
        <p className="font-mono text-[10px] text-muted-foreground">
          <Trans>voice · reading speed 1.0×</Trans>
        </p>
      </SampleCard>
    ),
    sampleNote: <Trans>Word timestamps let the reader highlight each word as it is spoken.</Trans>,
  },
  "sign-language": {
    emptyTitle: msg`No sign language videos yet`,
    runVerb: msg`Upload sign language videos`,
    manualVerb: msg`Assign a video manually`,
    sampleTitle: msg`What a video looks like here`,
    sample: (
      <SampleCard>
        <SampleHead>
          <span className="text-sm font-bold">
            <Trans>interpreter-page-10.mp4</Trans>
          </span>
        </SampleHead>
        <p className="text-[12.5px] leading-relaxed text-foreground">
          <Trans>Assigned to section 1 of page 10, so it plays alongside that passage.</Trans>
        </p>
        <p className="font-mono text-[10px] text-muted-foreground">
          <Trans>uploaded · not AI-generated</Trans>
        </p>
      </SampleCard>
    ),
    sampleNote: (
      <Trans>Videos are recorded by an interpreter and uploaded here, then assigned to a section.</Trans>
    ),
  },
  validation: {
    emptyTitle: msg`No validation run yet`,
    runVerb: msg`Package and check the book`,
    manualVerb: msg`Review pages in Preview`,
    sampleTitle: msg`What a check reports`,
    sample: (
      <SampleCard>
        <SampleHead>
          <span className="text-sm font-bold">
            <Trans>Images must have alternate text</Trans>
          </span>
        </SampleHead>
        <p className="text-[12.5px] leading-relaxed text-foreground">
          <Trans>Serious · found on 4 pages, each linked back to the page it came from.</Trans>
        </p>
        <p className="font-mono text-[10px] text-muted-foreground">
          <Trans>axe-core · not AI-generated</Trans>
        </p>
      </SampleCard>
    ),
    sampleNote: (
      <Trans>Checks run over the packaged book, so they see exactly what a reader gets.</Trans>
    ),
  },
}
