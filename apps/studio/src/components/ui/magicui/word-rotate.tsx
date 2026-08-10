import { useEffect, useState } from "react"
import { AnimatePresence, motion, type MotionProps } from "motion/react"
import { cn } from "@/lib/utils"

interface WordRotateProps {
  words: string[]
  duration?: number
  /** When false, stops on the last word instead of cycling forever. */
  loop?: boolean
  motionProps?: MotionProps
  className?: string
}

export function WordRotate({
  words,
  duration = 2500,
  loop = true,
  motionProps = {
    initial: { opacity: 0, y: -50 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: 50 },
    transition: { duration: 0.25, ease: "easeOut" },
  },
  className,
}: WordRotateProps) {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    if (!loop && index >= words.length - 1) return
    const interval = setInterval(() => {
      setIndex((prevIndex) => {
        const next = prevIndex + 1
        return loop ? next % words.length : Math.min(next, words.length - 1)
      })
    }, duration)

    return () => clearInterval(interval)
  }, [words, duration, loop, index])

  return (
    <div className="overflow-hidden py-2">
      <AnimatePresence mode="wait">
        <motion.span key={words[index]} className={cn("inline-block", className)} {...motionProps}>
          {words[index]}
        </motion.span>
      </AnimatePresence>
    </div>
  )
}
