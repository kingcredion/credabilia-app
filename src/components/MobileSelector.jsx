import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Check } from "lucide-react";

// Hook to reactively track desktop breakpoint (updates on resize/orientation change)
function useIsDesktop() {
  const [isDesktop, setIsDesktop] = React.useState(
    () => typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches
  );
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(min-width: 768px)");
    const handler = (e) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isDesktop;
}

/**
 * MobileSelector
 * - Desktop (≥768px): renders a shadcn/Radix Select dropdown
 * - Mobile (<768px): renders a bottom Drawer chooser
 *
 * Props:
 *   value          — current selected value
 *   onValueChange  — callback(newValue)
 *   trigger        — JSX content for the trigger label
 *   items          — [{ value, label, icon? }]
 *   title          — Drawer heading (mobile only)
 *   placeholder    — optional placeholder for Select (desktop only)
 */
export default function MobileSelector({ value, onValueChange, trigger, items, title, placeholder }) {
  const [open, setOpen] = useState(false);
  const isDesktop = useIsDesktop();

  if (isDesktop) {
    return (
      <Select value={value} onValueChange={onValueChange}>
         <SelectTrigger className="w-auto min-w-[140px]">
           <SelectValue placeholder={placeholder || title || "Select"} />
         </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              <div className="flex items-center gap-2">
                {item.icon && <span>{item.icon}</span>}
                <span>{item.label}</span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  // Mobile: Drawer
  return (
    <>
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        className="w-full md:w-auto justify-between"
      >
        {trigger}
      </Button>

      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent className="max-h-96">
          <DrawerHeader>
            <DrawerTitle>{title}</DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pb-6 space-y-2 overflow-y-auto max-h-80">
            {items.map((item) => (
              <button
                key={item.value}
                onClick={() => {
                  onValueChange(item.value);
                  setOpen(false);
                }}
                className={`w-full flex items-center justify-between p-4 rounded-lg border-2 transition-all ${
                  value === item.value
                    ? "border-blue-600 bg-blue-50"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <div className="flex items-center gap-3 text-left">
                  {item.icon && <span className="text-xl">{item.icon}</span>}
                  <span className="font-medium text-gray-900">{item.label}</span>
                </div>
                {value === item.value && (
                  <Check className="w-5 h-5 text-blue-600 flex-shrink-0" />
                )}
              </button>
            ))}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}