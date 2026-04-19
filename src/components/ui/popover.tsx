"use client"

import * as React from "react"
import { Popover as PopoverPrimitive } from "@base-ui/react"
import { cn } from "@/lib/utils"

function Popover({ ...props }: PopoverPrimitive.Root.Props) {
  return <PopoverPrimitive.Root {...props} />
}

function PopoverTrigger({ ...props }: PopoverPrimitive.Trigger.Props) {
  return <PopoverPrimitive.Trigger {...props} />
}

function PopoverContent({
  className,
  side = "bottom",
  align = "start",
  sideOffset = 8,
  collisionPadding = 16,
  children,
  ...props
}: PopoverPrimitive.Positioner.Props & {
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner
        side={side}
        align={align}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        {...props}
      >
        <PopoverPrimitive.Popup
          className={cn(
            "z-50 max-w-[280px] rounded-xl bg-[#1C1C1F] border border-[#27272A] px-3 py-2.5 text-xs text-[#A1A1AA] shadow-lg outline-none",
            "data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95",
            "data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            className
          )}
        >
          {children}
        </PopoverPrimitive.Popup>
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  )
}

export { Popover, PopoverTrigger, PopoverContent }
