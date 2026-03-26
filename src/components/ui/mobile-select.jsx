"use client"

import React, { useState } from "react"
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerClose,
} from "@/components/ui/drawer"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Check, ChevronDown, X } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * iOS-optimized select component.
 * On mobile (touch devices), uses a bottom-sheet drawer.
 * On desktop, uses the standard popper select.
 * 
 * Usage is identical to standard Select component:
 * <MobileSelect value={value} onValueChange={setValue}>
 *   <SelectValue placeholder="Choose..." />
 *   <SelectContent>
 *     <SelectItem value="a">Option A</SelectItem>
 *   </SelectContent>
 * </MobileSelect>
 */
export function MobileSelect({ value, onValueChange, children, className, ...props }) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [tempValue, setTempValue] = useState(value)

  const isMobile = typeof window !== "undefined" 
    && (window.matchMedia("(max-width: 768px), (pointer: coarse)").matches)

  const selectedLabel = React.useMemo(() => {
    // Extract label from children SelectItem with matching value
    if (!value) return "Select..."
    const findLabel = (node) => {
      if (!node) return value
      if (Array.isArray(node)) {
        for (const child of node) {
          const result = findLabel(child)
          if (result && result !== value) return result
        }
      }
      if (node?.props?.value === value) {
        return node.props.children
      }
      return findLabel(node?.props?.children)
    }
    return findLabel(children) || value
  }, [value, children])

  if (!isMobile) {
    // Desktop: use standard select
    return (
      <Select value={value} onValueChange={onValueChange} {...props}>
        <SelectTrigger className={className}>
          <SelectValue />
        </SelectTrigger>
        {children}
      </Select>
    )
  }

  // Mobile: use drawer
  const handleConfirm = () => {
    onValueChange(tempValue)
    setIsDrawerOpen(false)
  }

  return (
    <Drawer open={isDrawerOpen} onOpenChange={setIsDrawerOpen}>
      <button
        onClick={() => {
          setTempValue(value)
          setIsDrawerOpen(true)
        }}
        className={cn(
          "w-full flex items-center justify-between rounded-lg border border-input bg-transparent px-3 py-2.5 text-sm shadow-sm transition-colors",
          "focus:outline-none focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        style={{ minHeight: "44px" }}
        type="button"
      >
        <span className="text-left flex-1">{selectedLabel}</span>
        <ChevronDown className="h-4 w-4 opacity-50 flex-shrink-0 ml-2" />
      </button>

      <DrawerContent className="px-4 pb-6">
        <DrawerHeader className="px-0 pt-2 pb-4">
          <div className="flex items-center justify-between">
            <DrawerTitle className="text-lg font-semibold">
              Select an option
            </DrawerTitle>
            <DrawerClose asChild>
              <button
                className="p-2 hover:bg-muted rounded-lg transition-colors"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </DrawerClose>
          </div>
        </DrawerHeader>

        <div className="space-y-2 max-h-[60vh] overflow-y-auto py-2">
          {React.Children.map(children, (child) => {
            if (child?.type?.name === "SelectContent") {
              // Extract SelectItem children from SelectContent
              return React.Children.map(child.props.children, (item) => {
                if (item?.type?.name === "SelectItem") {
                  const itemValue = item.props.value
                  const isSelected = itemValue === tempValue
                  return (
                    <button
                      key={itemValue}
                      onClick={() => setTempValue(itemValue)}
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors",
                        "active:bg-primary/10",
                        isSelected
                          ? "bg-primary/10 border-l-4 border-primary"
                          : "border-l-4 border-transparent hover:bg-muted"
                      )}
                      style={{ minHeight: "48px" }}
                    >
                      <span className="flex-1">{item.props.children}</span>
                      {isSelected && (
                        <Check className="h-5 w-5 text-primary flex-shrink-0" />
                      )}
                    </button>
                  )
                }
                return item
              })
            }
            return child
          })}
        </div>

        <div className="flex gap-2 pt-4 border-t">
          <DrawerClose asChild>
            <Button variant="outline" className="flex-1" style={{ minHeight: "44px" }}>
              Cancel
            </Button>
          </DrawerClose>
          <Button
            onClick={handleConfirm}
            className="flex-1"
            style={{ minHeight: "44px" }}
          >
            Confirm
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  )
}

export default MobileSelect