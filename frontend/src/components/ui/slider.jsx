import { cn } from "@/lib/utils"

function Slider({ value, onValueChange, min = 0, max = 100, step = 1, className, ...props }) {
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value?.[0] ?? min}
      onChange={(e) => onValueChange?.([Number(e.target.value)])}
      className={cn("w-full accent-primary cursor-pointer", className)}
      {...props}
    />
  )
}

export { Slider }
