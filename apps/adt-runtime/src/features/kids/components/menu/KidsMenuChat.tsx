import {
  ArrowLeft,
  ArrowRight,
  Gauge,
  PackageOpen,
  Rabbit,
  Turtle,
} from "lucide-react"
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { KidsAvatar } from "@/features/kids/components/KidsAvatar"
import { KidsBuddyImage } from "@/features/kids/components/KidsBuddyImage"
import { KidsDialogClose } from "@/features/kids/components/kids-dialogs"
import type { KidsSpeed } from "@/features/kids/components/KidsSpeedControl"
import {
  actionsInGroup,
  type KidsMenuAction,
  type KidsMenuGroup,
  type KidsMenuProps,
} from "@/features/kids/components/menu/kids-menu-model"
import { KIDS_SCROLLBAR_CLASS } from "@/features/kids/lib/kids-styles"
import { cn } from "@/shared/lib/utils"

type ChatLevel = KidsMenuGroup | "root" | "speed"
type Direction = "forward" | "back"
type Choice = KidsMenuAction | "speed"

const GROUP_TONE: Record<KidsMenuGroup, string> = {
  reading: "bg-sky-100 text-sky-950 ring-sky-300 hover:bg-sky-200",
  look: "bg-violet-100 text-violet-950 ring-violet-300 hover:bg-violet-200",
  mine: "bg-emerald-100 text-emerald-950 ring-emerald-300 hover:bg-emerald-200",
  footer: "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50",
}

const FOCUS =
  "focus:outline-none focus-visible:ring-4 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
// A young reader can hold about four choices at once; groups larger than this
// paginate rather than growing the reply column.
const CHOICES_PER_PAGE = 4

const STAGGER = [
  "[animation-delay:40ms]",
  "[animation-delay:90ms]",
  "[animation-delay:140ms]",
  "[animation-delay:190ms]",
  "[animation-delay:240ms]",
]

/** A staged conversation where the child answers one small question at a time. */
export function KidsMenuChat({
  model,
  panelRef,
  panelCloseRef,
  reduceMotion,
}: KidsMenuProps) {
  const [level, setLevel] = useState<ChatLevel>("root")
  const [page, setPage] = useState(0)
  const [direction, setDirection] = useState<Direction>("forward")
  const [leaving, setLeaving] = useState(false)
  const transitionTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const replyRef = useRef<HTMLDivElement>(null)
  const initialView = useRef(true)
  const footer = actionsInGroup(model, "footer")
  const activeGroup = model.groups.find((group) => group.id === level)
  const groupActions = activeGroup ? actionsInGroup(model, activeGroup.id) : []
  const groupChoices: Choice[] =
    activeGroup?.id === "reading" && model.showSpeed
      ? [...groupActions, "speed"]
      : groupActions
  const pages = chunk(groupChoices, CHOICES_PER_PAGE)
  // The action list is dynamic, so a group can shrink while a later page is
  // open — without clamping, the reply column would render zero choices and
  // hide its own pagination, leaving only "Go back".
  const pageIndex = Math.min(page, Math.max(pages.length - 1, 0))
  const visibleChoices = pages[pageIndex] ?? []
  const showReplyAvatar = !visibleChoices.some(
    (choice) => choice !== "speed" && choice.id === "avatar",
  )
  const viewKey = `${level}-${pageIndex}`

  useEffect(
    () => () => {
      if (transitionTimer.current) clearTimeout(transitionTimer.current)
    },
    [],
  )

  useLayoutEffect(() => {
    if (initialView.current) {
      initialView.current = false
      return
    }
    const firstChoice = replyRef.current?.querySelector<HTMLElement>(
      "[data-kids-menu-choice]:not(:disabled)",
    )
    ;(firstChoice ?? replyRef.current)?.focus()
  }, [viewKey])

  const changeView = (
    nextLevel: ChatLevel,
    nextPage: number,
    nextDirection: Direction,
  ) => {
    if (transitionTimer.current) clearTimeout(transitionTimer.current)
    setDirection(nextDirection)
    if (reduceMotion) {
      setLevel(nextLevel)
      setPage(nextPage)
      setLeaving(false)
      return
    }
    setLeaving(true)
    transitionTimer.current = setTimeout(() => {
      setLevel(nextLevel)
      setPage(nextPage)
      setLeaving(false)
      transitionTimer.current = null
    }, 180)
  }

  const goBack = () => {
    changeView(level === "speed" ? "reading" : "root", 0, "back")
  }

  const selectAction = (action: KidsMenuAction) => {
    action.onSelect()
  }

  const motionClass = reduceMotion
    ? undefined
    : leaving
      ? direction === "forward"
        ? "-translate-x-8 opacity-0"
        : "translate-x-8 opacity-0"
      : direction === "forward"
        ? "animate-kidsSlideFromRight"
        : "animate-kidsSlideFromLeft"

  return (
    <div
      ref={panelRef}
      data-testid="kids-buddy-panel"
      role="region"
      aria-labelledby="kids-buddy-panel-message"
      tabIndex={-1}
      className={cn(
        "relative mb-2 flex max-h-[min(calc(100dvh-7.75rem),46rem)] w-[min(42rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-[2rem] bg-white p-4 text-slate-950 shadow-2xl ring-2 ring-sky-100 sm:p-6 lg:p-7",
        "after:absolute after:-bottom-2 after:right-8 after:h-5 after:w-5 after:rotate-45 after:border-b-2 after:border-r-2 after:border-sky-100 after:bg-white",
        !reduceMotion && "animate-kidsPanelOpen",
      )}
    >
      <div className="absolute right-4 top-4 z-20 sm:right-5 sm:top-5">
        <KidsDialogClose
          buttonRef={panelCloseRef}
          label={model.closeLabel}
          onClick={model.close}
        />
      </div>

      <BuddyLine
        model={model}
        detail={activeGroup?.title ?? (level === "speed" ? model.speedLabels.group : undefined)}
        motionClass={motionClass}
        reduceMotion={reduceMotion}
      />

      <div
        className={cn(
          "relative z-10 mt-5 min-h-0 overflow-y-auto overscroll-contain sm:mt-6",
          KIDS_SCROLLBAR_CLASS,
        )}
      >
        <div className="flex items-start gap-3 sm:gap-4">
          {showReplyAvatar ? (
            <div className="relative mt-1 shrink-0">
              <KidsAvatar
                config={model.avatar}
                size={52}
                className="shadow-[0_3px_0_#D9EBF8] ring-2 ring-white sm:!h-16 sm:!w-16"
              />
              <span
                aria-hidden="true"
                className="absolute -right-3 top-5 h-4 w-4 rotate-45 border-b-2 border-r-2 border-sky-200 bg-sky-50"
              />
            </div>
          ) : null}

          <div
            key={viewKey}
            ref={replyRef}
            role="region"
            aria-label={model.regionLabel}
            aria-hidden={leaving || undefined}
            inert={leaving || undefined}
            tabIndex={-1}
            className={cn(
              "min-w-0 flex-1 rounded-[1.65rem] bg-sky-50/70 p-2.5 ring-2 ring-sky-100 sm:p-3",
              leaving && "pointer-events-none",
              !reduceMotion &&
                "transition-[transform,opacity] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
              motionClass,
            )}
          >
            <div className="flex flex-col gap-3">
              {level === "root" ? (
                <RootChoices
                  model={model}
                  onChoose={(group) => changeView(group, 0, "forward")}
                  reduceMotion={reduceMotion}
                  direction={direction}
                />
              ) : level === "speed" ? (
                <SpeedChoices
                  model={model}
                  reduceMotion={reduceMotion}
                  direction={direction}
                />
              ) : (
                <GroupChoices
                  choices={visibleChoices}
                  model={model}
                  reduceMotion={reduceMotion}
                  direction={direction}
                  onSpeed={() => changeView("speed", 0, "forward")}
                  onSelect={selectAction}
                />
              )}

              {level !== "root" && pages.length > 1 ? (
                <PaginationControls
                  model={model}
                  page={pageIndex}
                  pageCount={pages.length}
                  reduceMotion={reduceMotion}
                  direction={direction}
                  onPrevious={() => changeView(level, pageIndex - 1, "back")}
                  onNext={() => changeView(level, pageIndex + 1, "forward")}
                />
              ) : null}

              {level !== "root" ? (
                <BackButton
                  label={model.backLabel}
                  onClick={goBack}
                  reduceMotion={reduceMotion}
                  direction={direction}
                />
              ) : null}
            </div>
          </div>
        </div>

        {level === "root" && footer.length ? (
          <FooterActions
            actions={footer}
            reduceMotion={reduceMotion}
            onSelect={selectAction}
          />
        ) : null}
      </div>
    </div>
  )
}

function BuddyLine({
  model,
  detail,
  motionClass,
  reduceMotion,
}: {
  model: KidsMenuProps["model"]
  detail?: string
  motionClass?: string
  reduceMotion: boolean
}) {
  return (
    <div className="relative z-10 flex items-start gap-3 pr-12 sm:gap-4 sm:pr-14">
      <span
        className="flex h-[4.5rem] w-[4.5rem] shrink-0 items-end justify-center overflow-hidden rounded-2xl shadow-[0_3px_0_#D9EBF8] ring-2 ring-white sm:h-20 sm:w-20"
        style={{ backgroundColor: model.buddyBackground }}
      >
        <KidsBuddyImage
          images={model.buddyImages}
          variant="happy"
          title={model.buddyName}
          className="h-[92%] w-[92%]"
        />
      </span>
      <div
        className={cn(
          "min-w-0 rounded-2xl rounded-tl-sm bg-sky-50 px-4 py-3.5 ring-2 ring-sky-100 sm:px-5 sm:py-4",
          !reduceMotion &&
            "transition-[transform,opacity] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
          motionClass,
        )}
      >
        <h2
          id="kids-buddy-panel-message"
          data-testid="kids-buddy-panel-message"
          aria-live="polite"
          className="text-balance text-xl font-black leading-snug text-slate-950 sm:text-2xl"
        >
          {model.message}
        </h2>
        {detail ? (
          <p className="mt-1.5 text-base font-bold text-slate-700 sm:text-lg">
            {detail}
          </p>
        ) : null}
      </div>
    </div>
  )
}

function RootChoices({
  model,
  onChoose,
  reduceMotion,
  direction,
}: {
  model: KidsMenuProps["model"]
  onChoose: (group: KidsMenuGroup) => void
  reduceMotion: boolean
  direction: Direction
}) {
  return model.groups.map((group, index) => {
    const actions = actionsInGroup(model, group.id)
    const hasSpeed = group.id === "reading" && model.showSpeed
    if (!actions.length && !hasSpeed) return null
    return (
      <ReplyButton
        key={group.id}
        label={group.title}
        icon={group.id === "mine" ? <PackageOpen /> : actions[0]?.icon}
        tone={GROUP_TONE[group.id]}
        onClick={() => onChoose(group.id)}
        reduceMotion={reduceMotion}
        entranceIndex={index}
        entranceDirection={direction}
      />
    )
  })
}

function GroupChoices({
  choices,
  model,
  reduceMotion,
  direction,
  onSpeed,
  onSelect,
}: {
  choices: Choice[]
  model: KidsMenuProps["model"]
  reduceMotion: boolean
  direction: Direction
  onSpeed: () => void
  onSelect: (action: KidsMenuAction) => void
}) {
  return choices.map((choice, index) =>
    choice === "speed" ? (
      <ReplyButton
        key="speed"
        label={model.speedLabels.group}
        icon={<Gauge />}
        tone={GROUP_TONE.reading}
        onClick={onSpeed}
        reduceMotion={reduceMotion}
        entranceIndex={index}
        entranceDirection={direction}
      />
    ) : (
      <ActionReply
        key={choice.id}
        action={choice}
        model={model}
        reduceMotion={reduceMotion}
        entranceIndex={index}
        entranceDirection={direction}
        onSelect={() => onSelect(choice)}
      />
    ),
  )
}

function ActionReply({
  action,
  model,
  reduceMotion,
  entranceIndex,
  entranceDirection,
  onSelect,
}: {
  action: KidsMenuAction
  model: KidsMenuProps["model"]
  reduceMotion: boolean
  entranceIndex: number
  entranceDirection: Direction
  onSelect: () => void
}) {
  const state = action.active ? model.onLabel : model.offLabel
  return (
    <ReplyButton
      testId={action.testId}
      label={action.shortLabel}
      accessibleLabel={action.toggle ? `${action.label}: ${state}` : action.label}
      icon={action.icon}
      tone={GROUP_TONE[action.group]}
      onClick={onSelect}
      disabled={action.disabled}
      pressed={action.toggle ? action.active : undefined}
      state={action.toggle ? state : undefined}
      active={action.active}
      reduceMotion={reduceMotion}
      entranceIndex={entranceIndex}
      entranceDirection={entranceDirection}
    />
  )
}

function SpeedChoices({
  model,
  reduceMotion,
  direction,
}: Pick<KidsMenuProps, "model" | "reduceMotion"> & { direction: Direction }) {
  const choices: { value: KidsSpeed; label: string; icon: ReactNode }[] = [
    { value: 0.75, label: model.speedLabels.slow, icon: <Turtle /> },
    { value: 1, label: model.speedLabels.normal, icon: <Gauge /> },
    { value: 1.3, label: model.speedLabels.fast, icon: <Rabbit /> },
  ]
  return (
    <div
      role="group"
      aria-label={model.speedLabels.group}
      data-testid="kids-action-speed"
      className="contents"
    >
      {choices.map((choice, index) => {
        const active = matchesSpeed(model.speed, choice.value)
        return (
          <ReplyButton
            key={choice.value}
            testId={`kids-action-speed-${choice.value}`}
            label={choice.label}
            icon={choice.icon}
            tone={GROUP_TONE.reading}
            onClick={() => model.setSpeed(choice.value)}
            pressed={active}
            active={active}
            reduceMotion={reduceMotion}
            entranceIndex={index}
            entranceDirection={direction}
          />
        )
      })}
    </div>
  )
}

function FooterActions({
  actions,
  reduceMotion,
  onSelect,
}: {
  actions: KidsMenuAction[]
  reduceMotion: boolean
  onSelect: (action: KidsMenuAction) => void
}) {
  return (
    <div className="mt-4 border-t-2 border-sky-50 pt-3 sm:ml-20">
      {actions.map((action) => (
        <button
          key={action.id}
          type="button"
          data-testid={action.testId}
          aria-label={action.label}
          onClick={() => onSelect(action)}
          disabled={action.disabled}
          className={cn(
            "flex min-h-11 w-full items-center justify-end gap-2 rounded-full px-4 py-2 text-right text-sm font-bold text-slate-600 underline decoration-slate-300 decoration-2 underline-offset-4",
            "disabled:cursor-not-allowed disabled:opacity-45 hover:bg-slate-50",
            FOCUS,
            !reduceMotion && "transition-transform duration-150 active:scale-[0.98]",
          )}
        >
          <span aria-hidden="true" className="[&>svg]:h-5 [&>svg]:w-5">
            {action.icon}
          </span>
          {action.shortLabel}
        </button>
      ))}
    </div>
  )
}

function PaginationControls({
  model,
  page,
  pageCount,
  reduceMotion,
  direction,
  onPrevious,
  onNext,
}: {
  model: KidsMenuProps["model"]
  page: number
  pageCount: number
  reduceMotion: boolean
  direction: Direction
  onPrevious: () => void
  onNext: () => void
}) {
  return (
    <>
      {page > 0 ? (
        <ReplyButton
          label={model.previousLabel}
          icon={<ArrowLeft />}
          tone="bg-white text-slate-900 ring-sky-300 hover:bg-sky-100"
          onClick={onPrevious}
          reduceMotion={reduceMotion}
          entranceIndex={2}
          entranceDirection={direction}
        />
      ) : null}
      {page < pageCount - 1 ? (
        <ReplyButton
          label={model.moreLabel}
          accessibleLabel={model.nextLabel}
          icon={<ArrowRight />}
          trailingIcon={<ArrowRight />}
          tone="bg-[#FFF6D6] text-slate-950 ring-[#FFC800] hover:bg-amber-100"
          onClick={onNext}
          reduceMotion={reduceMotion}
          entranceIndex={page > 0 ? 3 : 2}
          entranceDirection={direction}
        />
      ) : null}
    </>
  )
}

function BackButton({
  label,
  onClick,
  reduceMotion,
  direction,
}: {
  label: string
  onClick: () => void
  reduceMotion: boolean
  direction: Direction
}) {
  return (
    <button
      type="button"
      data-kids-menu-choice
      aria-label={label}
      onClick={onClick}
      className={cn(
        "flex min-h-16 w-full items-center justify-center gap-3 rounded-[1.35rem] bg-white px-5 py-3 text-lg font-black text-sky-950 shadow-[0_3px_0_#D9EBF8] ring-2 ring-sky-300 hover:bg-sky-100 sm:min-h-[4.5rem] sm:text-xl",
        FOCUS,
        !reduceMotion &&
          cn(
            direction === "forward"
              ? "animate-kidsSlideFromRight"
              : "animate-kidsSlideFromLeft",
            "[animation-delay:240ms] transition-transform duration-150 hover:-translate-y-0.5 active:scale-[0.98]",
          ),
      )}
    >
      <span
        aria-hidden="true"
        className="flex h-11 w-11 items-center justify-center rounded-full bg-sky-200 text-sky-950 [&>svg]:h-8 [&>svg]:w-8"
      >
        <ArrowLeft strokeWidth={3} />
      </span>
      <span>{label}</span>
    </button>
  )
}

function ReplyButton({
  testId,
  label,
  accessibleLabel,
  icon,
  trailingIcon,
  tone,
  onClick,
  disabled,
  pressed,
  state,
  active,
  reduceMotion,
  entranceIndex,
  entranceDirection = "forward",
}: {
  testId?: string
  label: string
  accessibleLabel?: string
  icon?: ReactNode
  trailingIcon?: ReactNode
  tone: string
  onClick: () => void
  disabled?: boolean
  pressed?: boolean
  state?: string
  active?: boolean
  reduceMotion: boolean
  entranceIndex?: number
  entranceDirection?: Direction
}) {
  return (
    <button
      type="button"
      data-kids-menu-choice
      data-testid={testId}
      aria-label={accessibleLabel ?? label}
      aria-pressed={pressed}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex min-h-[4.25rem] w-full items-center justify-between gap-3 rounded-[1.35rem] px-4 py-3 text-left text-lg font-black shadow-[0_3px_0_#D9EBF8] ring-2 sm:min-h-[4.75rem] sm:px-5 sm:text-xl",
        "disabled:cursor-not-allowed disabled:opacity-45",
        tone,
        active && "bg-[#FFF6D6] ring-4 ring-[#FFC800]",
        FOCUS,
        !reduceMotion && [
          entranceDirection === "forward"
            ? "animate-kidsSlideFromRight"
            : "animate-kidsSlideFromLeft",
          "transition-[transform,background-color,box-shadow] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 active:scale-[0.98]",
          entranceIndex === undefined ? undefined : STAGGER[entranceIndex],
        ],
      )}
    >
      <span className="flex min-w-0 items-center gap-3 sm:gap-4">
        {icon ? (
          <span
            aria-hidden="true"
            className={cn(
              "flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white/80 [&>svg]:h-7 [&>svg]:w-7 sm:h-12 sm:w-12 sm:[&>svg]:h-8 sm:[&>svg]:w-8",
              !reduceMotion && "transition-transform duration-200",
              active && !reduceMotion && "scale-110",
            )}
          >
            {icon}
          </span>
        ) : null}
        <span className="leading-tight">{label}</span>
      </span>
      {state ? (
        <span
          className={cn(
            "shrink-0 rounded-full px-3 py-1.5 text-sm font-black sm:text-base",
            active ? "bg-[#FFC800] text-slate-950" : "bg-white text-slate-800 ring-2 ring-current",
            !reduceMotion && "transition-[transform,background-color] duration-200",
            active && !reduceMotion && "scale-105",
          )}
        >
          {state}
        </span>
      ) : trailingIcon ? (
        <span
          aria-hidden="true"
          className="shrink-0 rounded-full bg-[#FFC800] p-2 text-slate-950 [&>svg]:h-6 [&>svg]:w-6"
        >
          {trailingIcon}
        </span>
      ) : null}
    </button>
  )
}

function chunk<T>(items: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, index * size + size),
  )
}

function matchesSpeed(current: number, speed: KidsSpeed) {
  if (speed === 0.75) return current < 1
  if (speed === 1.3) return current > 1
  return current === 1
}
