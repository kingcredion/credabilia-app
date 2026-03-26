import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerClose,
} from "@/components/ui/drawer";
import { Check } from "lucide-react";

const LANGUAGES = [
  { value: "en", label: "English", flag: "🇺🇸" },
  { value: "es", label: "Español", flag: "🇪🇸" },
  { value: "fr", label: "Français", flag: "🇫🇷" },
];

export default function LanguageSelector({ value, onSelect }) {
  const [open, setOpen] = useState(false);
  const current = LANGUAGES.find(l => l.value === value);

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        className="w-full justify-between"
      >
        <span>{current?.label}</span>
        <span>{current?.flag}</span>
      </Button>

      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent className="max-h-96">
          <DrawerHeader>
            <DrawerTitle>Select Language</DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pb-6 space-y-2">
            {LANGUAGES.map((lang) => (
              <button
                key={lang.value}
                onClick={() => {
                  onSelect(lang.value);
                  setOpen(false);
                }}
                className={`w-full flex items-center justify-between p-4 rounded-lg border-2 transition-all ${
                  value === lang.value
                    ? "border-blue-600 bg-blue-50"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{lang.flag}</span>
                  <span className="font-medium text-gray-900">{lang.label}</span>
                </div>
                {value === lang.value && (
                  <Check className="w-5 h-5 text-blue-600" />
                )}
              </button>
            ))}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}