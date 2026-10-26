import type { CSSProperties } from "react"
import * as SliderPrimitive from "@radix-ui/react-slider"

type SliderProps = React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> & {
  color?: string
}

export function Slider({ color, ...props }: SliderProps) {
  const isRange = Array.isArray(props.value) && props.value.length === 2
  const accentColor = color ?? "#2b7fff"

  const thumbStyle: CSSProperties = { borderColor: accentColor, transition: "border-color 0.4s ease" }

  return (
    <SliderPrimitive.Root
      {...props}
      className={`relative flex items-center select-none touch-none w-full h-5 ${props.className ?? ""} ${props.disabled ? "opacity-40 pointer-events-none" : ""}`}
    >
      <SliderPrimitive.Track className="bg-muted relative grow rounded-full h-1.5">
        <SliderPrimitive.Range
          className="absolute rounded-full h-full"
          style={{ background: accentColor, transition: "background 0.4s ease" }}
        />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        className="block w-4 h-4 bg-background border-2 rounded-full shadow focus:outline-none cursor-pointer"
        style={thumbStyle}
      />
      {isRange && (
        <SliderPrimitive.Thumb
          className="block w-4 h-4 bg-background border-2 rounded-full shadow focus:outline-none cursor-pointer"
          style={thumbStyle}
        />
      )}
    </SliderPrimitive.Root>
  )
}
