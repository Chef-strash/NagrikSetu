"use client";

import React from "react";
import { Layers } from "lucide-react";

interface SchemeOption {
  id: string;
  name: string;
  categoryLabel: string;
}

interface SchemePickerProps {
  schemes: SchemeOption[];
  value: string;
  onChange: (slug: string) => void;
  language: "en" | "mr";
}

export function SchemePicker({ schemes, value, onChange, language }: SchemePickerProps) {
  return (
    <div className="flex items-center space-x-2">
      <Layers className="w-4 h-4 text-civic-400 shrink-0" />
      <label className="sr-only" htmlFor="scheme-picker">
        {language === "mr" ? "योजना निवडा" : "Select a scheme"}
      </label>
      <select
        id="scheme-picker"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="text-xs px-3 py-2 border border-civic-300 rounded focus:border-saffron-600 outline-none bg-white text-civic-800 w-full sm:w-auto sm:max-w-xl"
      >
        {schemes.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name} — {s.categoryLabel}
          </option>
        ))}
      </select>
    </div>
  );
}
