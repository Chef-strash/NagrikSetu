"use client";

import React, { useState } from "react";
import { ChevronDown, HelpCircle } from "lucide-react";
import type { Faq } from "../../lib/feedback/types";

interface FaqAccordionProps {
  faqs: Faq[];
  language: "en" | "mr";
  emptyText?: string;
}

export function FaqAccordion({ faqs, language, emptyText }: FaqAccordionProps) {
  const [openId, setOpenId] = useState<string | null>(faqs[0]?.id ?? null);

  if (faqs.length === 0) {
    return (
      <p className="text-xs text-civic-500 bg-white border border-civic-200 rounded-lg p-4 shadow-subtle">
        {emptyText ??
          (language === "mr"
            ? "या योजनेसाठी अद्याप वारंवार विचारले जाणारे प्रश्न उपलब्ध नाहीत."
            : "No maintained FAQs are published for this scheme yet.")}
      </p>
    );
  }

  return (
    <div className="bg-white border border-civic-200 rounded-lg shadow-subtle divide-y divide-civic-100">
      {faqs.map((faq) => {
        const isOpen = openId === faq.id;
        return (
          <div key={faq.id}>
            <button
              type="button"
              onClick={() => setOpenId(isOpen ? null : faq.id)}
              aria-expanded={isOpen}
              className="w-full flex items-start justify-between gap-3 text-left px-4 py-3 hover:bg-civic-50 transition-colors"
            >
              <span className="flex items-start space-x-2">
                <HelpCircle className="w-4 h-4 text-saffron-600 shrink-0 mt-0.5" />
                <span className="text-xs font-semibold text-civic-900">{faq.question}</span>
              </span>
              <ChevronDown
                className={`w-4 h-4 text-civic-400 shrink-0 mt-0.5 transition-transform ${
                  isOpen ? "rotate-180" : ""
                }`}
              />
            </button>
            {isOpen && (
              <div className="px-4 pb-4 pl-10">
                <p className="text-xs text-civic-700 leading-relaxed whitespace-pre-line">{faq.answer}</p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
