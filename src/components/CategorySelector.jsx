import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

const categories = {
  display_type: {
    title: "Display Type",
    gradient: "from-orange-600 to-amber-600",
    options: [
      { value: "framed", label: "Framed" },
      { value: "unframed", label: "Unframed / Loose" },
      { value: "shadow_box", label: "Shadow Box / Display Case" },
      { value: "encased_slabbed", label: "Encased / Slabbed (PSA / BGS / CGC / SGC)" },
      { value: "mounted", label: "Mounted (Plaque or Stand)" }
    ]
  },
  autograph_status: {
    title: "Autograph Status",
    gradient: "from-blue-600 to-indigo-600",
    subtitle: "Real signatures only; facsimiles, reprints, or printed signatures are prohibited",
    options: [
      { value: "signed", label: "Signed" },
      { value: "inscribed", label: 'Inscribed (e.g., "HOF 1998", "To John")' },
      { value: "signed_certified", label: "Signed & Certified (COA / Graded Auto)" },
      { value: "raw_signed", label: "Raw Signed (Real autograph, not certified)" }
    ]
  },
  condition_use: {
    title: "Condition / Use",
    gradient: "from-green-600 to-emerald-600",
    options: [
      { value: "new_unused", label: "New / Unused" },
      { value: "game_used", label: "Game-Used / Worn" },
      { value: "practice_used", label: "Practice-Used" },
      { value: "vintage", label: "Vintage (20+ years old)" },
      { value: "replica", label: "Replica (Licensed replica only, not reprint autograph)" }
    ]
  },
  certification_type: {
    title: "Certification",
    gradient: "from-purple-600 to-pink-600",
    subtitle: "COA uploads automatically tag certification state",
    options: [
      { value: "graded", label: "Graded (PSA / Beckett / CGC / SGC)" },
      { value: "hologram_qr", label: "Hologram / QR Verification" },
      { value: "authentication_pending", label: "Authentication Pending" },
      { value: "none", label: "None" }
    ]
  },
  display_readiness: {
    title: "Display Readiness",
    gradient: "from-amber-600 to-orange-600",
    options: [
      { value: "wall_ready", label: "Wall-Ready (Frame or Hanger Included)" },
      { value: "table_display", label: "Table Display (Stand Included)" },
      { value: "protective_case", label: "Protective Case Included" },
      { value: "custom_plaque", label: "Custom Plaque / Nameplate Included" }
    ]
  },
  era_origin: {
    title: "Era & Origin",
    gradient: "from-red-600 to-rose-600",
    options: [
      { value: "modern", label: "Modern (2000s–Present)" },
      { value: "vintage", label: "Vintage (1980s–1990s)" },
      { value: "classic", label: "Classic (Pre-1980)" },
      { value: "limited_edition", label: "Limited Edition / Numbered" },
      { value: "event_issued", label: "Event-Issued / Team-Issued" }
    ]
  },
  media_category: {
    title: "Media / Category",
    gradient: "from-cyan-600 to-blue-600",
    options: [
      { value: "sports", label: "Sports Memorabilia" },
      { value: "entertainment", label: "Entertainment / Film" },
      { value: "music", label: "Music / Artist" },
      { value: "historical", label: "Historical / Political" },
      { value: "comic_pop_culture", label: "Comic / Anime / Pop Culture" },
      { value: "fine_art", label: "Fine Art / Painting / Sculpture" }
    ]
  }
};

export default function CategorySelector({ selectedCategories = {}, onChange }) {
  const [expandedCategories, setExpandedCategories] = useState({});

  const toggleCategory = (categoryKey) => {
    setExpandedCategories(prev => ({
      ...prev,
      [categoryKey]: !prev[categoryKey]
    }));
  };

  const handleOptionChange = (categoryKey, optionValue, checked) => {
    const currentValues = selectedCategories[categoryKey] || [];
    const newValues = checked
      ? [...currentValues, optionValue]
      : currentValues.filter(v => v !== optionValue);
    
    onChange({
      ...selectedCategories,
      [categoryKey]: newValues
    });
  };

  const isAnyOptionSelected = (categoryKey) => {
    return (selectedCategories[categoryKey] || []).length > 0;
  };

  return (
    <div className="space-y-4">
      {Object.entries(categories).map(([categoryKey, category]) => {
        const isExpanded = expandedCategories[categoryKey];
        const hasSelections = isAnyOptionSelected(categoryKey);

        return (
          <div
            key={categoryKey}
            className="border-2 rounded-xl overflow-hidden transition-all"
            style={{
              borderColor: hasSelections ? '#f59e0b' : '#e5e7eb',
              boxShadow: hasSelections ? '0 4px 6px -1px rgba(245, 158, 11, 0.1)' : 'none'
            }}
          >
            {/* Category Header */}
            <button
              type="button"
              onClick={() => toggleCategory(categoryKey)}
              className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
            >
              <div className="flex-1 text-left">
                <h3
                  className={`text-lg font-bold bg-gradient-to-r ${category.gradient} bg-clip-text text-transparent mb-1`}
                >
                  {category.title}
                  {hasSelections && (
                    <span className="ml-2 text-sm font-normal text-orange-600">
                      • {selectedCategories[categoryKey].length} selected
                    </span>
                  )}
                </h3>
                {category.subtitle && (
                  <p className="text-xs text-gray-500 mt-1">
                    {category.subtitle}
                  </p>
                )}
              </div>
              <div className="ml-4">
                {isExpanded ? (
                  <ChevronDown className="w-5 h-5 text-gray-400" />
                ) : (
                  <ChevronRight className="w-5 h-5 text-gray-400" />
                )}
              </div>
            </button>

            {/* Category Options */}
            <AnimatePresence>
              {isExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3, ease: "easeInOut" }}
                  className="border-t border-gray-200 bg-gray-50"
                >
                  <div className="p-6 space-y-3">
                    {category.options.map((option) => {
                      const isChecked = (selectedCategories[categoryKey] || []).includes(option.value);
                      
                      return (
                        <div
                          key={option.value}
                          className={`flex items-start gap-3 p-3 rounded-lg transition-all ${
                            isChecked ? 'bg-white shadow-sm ring-2 ring-orange-200' : 'bg-white hover:shadow-sm'
                          }`}
                        >
                          <Checkbox
                            id={`${categoryKey}-${option.value}`}
                            checked={isChecked}
                            onCheckedChange={(checked) => 
                              handleOptionChange(categoryKey, option.value, checked)
                            }
                            className="mt-0.5"
                          />
                          <Label
                            htmlFor={`${categoryKey}-${option.value}`}
                            className="flex-1 cursor-pointer text-sm leading-relaxed"
                          >
                            {option.label}
                          </Label>
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}