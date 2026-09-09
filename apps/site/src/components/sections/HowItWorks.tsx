import type { ReactNode } from "react";
import {
  Archive,
  BookOpen,
  FileText,
  FileUp,
  Globe,
  Layers,
  PackageOpen,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { msg } from "@lingui/core/macro";
import type { MessageDescriptor } from "@lingui/core";
import { Trans, useLingui } from "@lingui/react/macro";
import { Reveal } from "@/components/motion/Reveal";
import { SectionHeading } from "@/components/SectionHeading";
import { STAGES } from "@/data/stages";
import { withBase } from "@/lib/href";

type Format = { name: string; icon: LucideIcon; desc: MessageDescriptor; hex: string };

const FORMATS: Format[] = [
  { name: "Web", icon: Globe, desc: msg`Opens in any browser, no install`, hex: "#2563eb" },
  { name: "EPUB", icon: BookOpen, desc: msg`E-readers, tablets and phones`, hex: "#7c3aed" },
  { name: "WebPub", icon: Layers, desc: msg`Readium-compatible publications`, hex: "#0d9488" },
  { name: "PNLD .zip", icon: Archive, desc: msg`Brazil's national textbook program`, hex: "#d97706" },
];

function Step({
  number,
  icon: Icon,
  title,
  body,
  children,
}: {
  number: string;
  icon: LucideIcon;
  title: ReactNode;
  body: ReactNode;
  children?: ReactNode;
}) {
  return (
    <Reveal as="li" className="relative flex flex-col gap-4 rounded-3xl border border-ink-line bg-white p-6">
      <div className="flex items-center justify-between">
        <span className="grid size-11 place-items-center rounded-xl bg-brand text-white">
          <Icon className="size-5" />
        </span>
        <span className="font-mono text-sm font-bold text-ink-mute">{number}</span>
      </div>
      <div>
        <h3 className="font-display text-2xl font-extrabold tracking-tight text-ink">{title}</h3>
        <p className="mt-1.5 text-[14px] leading-relaxed text-ink-soft">{body}</p>
      </div>
      {children}
    </Reveal>
  );
}

/** Decorative replica of the app's "Convert a PDF" drop zone. */
function DropZone() {
  return (
    <div
      aria-hidden
      className="group relative mt-auto flex h-[196px] flex-col items-center justify-center overflow-hidden rounded-[24px] border border-ink-line bg-white text-center shadow-[0_1px_2px_rgb(18_27_43/0.04)] transition-[border-color,box-shadow,transform] duration-300 hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-card"
    >
      <span
        className="pointer-events-none absolute left-1/2 top-1/2 size-[300px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-[0.09] blur-[70px] transition-opacity duration-300 group-hover:opacity-[0.16]"
        style={{ background: "radial-gradient(circle, var(--color-brand) 0%, transparent 68%)" }}
      />
      <span className="relative mb-5 block h-[68px] w-[88px]">
        <span className="absolute inset-x-2.5 bottom-0 h-[56px] translate-y-1 -rotate-6 rounded-lg border border-ink-line bg-white shadow-sm transition-transform duration-300 group-hover:-rotate-[9deg]" />
        <span className="absolute inset-x-2.5 bottom-0 h-[56px] rotate-3 rounded-lg border border-ink-line bg-white shadow-sm transition-transform duration-300 group-hover:rotate-[6deg]" />
        <span className="absolute inset-x-2 bottom-1 grid h-[58px] place-items-center rounded-xl border border-ink-line bg-white text-ink-soft shadow-md transition-all duration-300 group-hover:-translate-y-1 group-hover:border-brand/40 group-hover:text-brand">
          <FileUp className="size-6" />
        </span>
      </span>
      <span className="relative text-[15px] font-semibold text-ink">
        <Trans>Drop a PDF here</Trans>
      </span>
      <span className="relative mt-1 text-[12.5px] text-ink-soft">
        <Trans>or click to browse your files</Trans>
      </span>
    </div>
  );
}

/** The ten real stages, laid out like the app's stage rail. */
function StageRail() {
  const { i18n } = useLingui();
  return (
    <ol className="mt-auto grid grid-cols-2 gap-x-3 gap-y-1 rounded-2xl border border-ink-line bg-white p-3">
      {STAGES.map((stage) => {
        const Icon = stage.icon;
        return (
          <li key={stage.slug} className="group flex items-center gap-2.5 rounded-lg px-1.5 py-1 transition-colors hover:bg-white">
            <span
              className="grid size-7 shrink-0 place-items-center rounded-md text-white"
              style={{ backgroundColor: stage.hex }}
            >
              <Icon className="size-3.5" strokeWidth={2.2} />
            </span>
            <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">
              {i18n._(stage.label)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function FormatList() {
  const { i18n } = useLingui();
  return (
    <ul className="mt-auto divide-y divide-ink-line overflow-hidden rounded-2xl border border-ink-line bg-white">
      {FORMATS.map((format) => {
        const Icon = format.icon;
        return (
          <li key={format.name} className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-white">
            <span
              className="grid size-9 shrink-0 place-items-center rounded-lg"
              style={{ backgroundColor: `${format.hex}1a`, color: format.hex }}
            >
              <Icon className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-bold text-ink">{format.name}</span>
              <span className="block truncate text-xs text-ink-soft">{i18n._(format.desc)}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function HowItWorks() {
  return (
    <section id="how" className="snap-section scroll-mt-[72px] md:scroll-mt-0 flex flex-col justify-center bg-white py-14">
      <div className="mx-auto w-full max-w-[1200px] px-5 sm:px-8">
        <Reveal>
          <SectionHeading
            eyebrow={<Trans>How it works</Trans>}
            title={<Trans>Three moves. Every step inspectable.</Trans>}
            body={
              <Trans>
                A pipeline of ten stages does the heavy lifting. You review,
                correct and re-run any of them; nothing is overwritten and
                unchanged steps come back from cache instantly.
              </Trans>
            }
          />
        </Reveal>

        <ol className="mt-8 grid grid-cols-1 gap-5 lg:grid-cols-3">
          <Step
            number="01"
            icon={FileText}
            title={<Trans>Add a PDF</Trans>}
            body={
              <Trans>
                Drop in a textbook or storybook and pick a preset. ADT Studio
                extracts text, images, math and layout into a real structure.
              </Trans>
            }
          >
            <DropZone />
          </Step>

          <Step
            number="02"
            icon={Workflow}
            title={<Trans>Run the pipeline</Trans>}
            body={
              <Trans>
                Ten stages, each a versioned, cached step you can inspect down
                to the prompt and the answer the model gave.
              </Trans>
            }
          >
            <StageRail />
          </Step>

          <Step
            number="03"
            icon={PackageOpen}
            title={<Trans>Export and share</Trans>}
            body={
              <Trans>
                Package the book with every accessibility feature baked in,
                validated against WCAG, ready for any browser or reader.
              </Trans>
            }
          >
            <FormatList />
          </Step>
        </ol>

        <Reveal className="mt-6 text-center">
          <a
            href={withBase("/docs/convert-pdf")}
            className="inline-flex items-center gap-1.5 text-[15px] font-bold text-brand-deep underline-offset-4 hover:underline"
          >
            <Trans>Read the step-by-step guide in the docs</Trans>
          </a>
        </Reveal>
      </div>
    </section>
  );
}
