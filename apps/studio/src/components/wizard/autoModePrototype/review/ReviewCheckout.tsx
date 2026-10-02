import { Plural, Trans } from "@lingui/react/macro"
import { cn } from "@/lib/utils"
import { Avatar } from "../decide/intro/parts"
import { AllSettingsLink, CoverBox, LanguageFields, NameField, PickedByAi, ProcessingList, useCreate, type ReviewProps } from "./parts"
import { ScopeField } from "./ScopeField"
import { SettingRows } from "./SettingRows"
import { BackButton, ENTER, PrimaryButton } from "../ui"

const CARD = "rounded-[24px] border bg-card shadow-[0_1px_2px_rgba(15,23,42,0.04),0_18px_44px_-26px_rgba(15,23,42,0.28)]"

/**
 * Checkout — what you fill in on the left (the book, its name, its language and how much of it to
 * process), what the AI set up on
 * the right as an order summary that ends in "Create book". Both cards stretch to the same height
 * (the summary's actions sit at its bottom). Nothing to scroll for at 1440×900.
 */
export function ReviewCheckout({ settings, set, processing, title, numPages, cover, onBack, onCreate, onAllSettings }: ReviewProps) {
  const create = useCreate(onCreate)
  const preset = settings.find((s) => s.key === "type")
  return (
    <div className="m-auto flex w-full max-w-[1120px] flex-col gap-6 py-8">
      <div className={cn("flex items-center gap-3", ENTER)}>
        <Avatar size="lg" />
        <div className="flex flex-col">
          <h1 className="text-[30px] font-bold leading-[1.1] tracking-[-0.025em]">
            <Trans>Review and create</Trans>
          </h1>
          <p className="text-[14.5px] text-muted-foreground">
            <Trans>I set up {title} for you. Give it a name, check the setup and create it.</Trans>
          </p>
        </div>
      </div>

      <div className="grid grid-cols-[1fr_420px] items-stretch gap-6">
        <div className={cn("relative z-10 flex flex-col gap-5 p-6", CARD, ENTER)} style={{ animationDelay: "60ms" }}>
          <div className="flex items-center gap-4">
            <CoverBox src={cover} title={title} size={96} glow={false} />
            <div className="flex min-w-0 flex-col">
              <p className="truncate text-[20px] font-bold leading-tight">{title}</p>
              <p className="text-[13px] text-muted-foreground">
                <Plural value={numPages} one="# page" other="# pages" /> · {preset?.answer}
              </p>
            </div>
          </div>
          <div className="h-px bg-border" />
          <NameField />
          <LanguageFields only="editing" />
          <ScopeField />
        </div>

        <aside className={cn("flex flex-col px-5 pb-5 pt-4", CARD, ENTER)} style={{ animationDelay: "120ms" }}>
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
              <Trans>Setup</Trans>
            </p>
            <PickedByAi settings={settings} />
          </div>
          <SettingRows settings={settings} set={set} />
          <div className="flex flex-col gap-2 border-t pt-3">
            <p className="text-[11.5px] font-medium text-muted-foreground">
              <Trans>Content Processing</Trans>
            </p>
            <ProcessingList processing={processing} />
          </div>
          <div className="mt-auto flex flex-col gap-2 pt-4">
            <PrimaryButton onClick={create} className="w-full">
              <Trans>Create book</Trans>
            </PrimaryButton>
            <AllSettingsLink onClick={onAllSettings} className="self-center" />
          </div>
        </aside>
      </div>

      <div className={cn("flex items-center justify-between", ENTER)} style={{ animationDelay: "200ms" }}>
        <BackButton onClick={onBack} />
        <p className="text-[12.5px] text-muted-foreground">
          <Trans>Nothing is converted until you create the book.</Trans>
        </p>
      </div>
    </div>
  )
}
