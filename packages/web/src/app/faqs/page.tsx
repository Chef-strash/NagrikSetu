"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useApp } from "../../lib/context/AppContext";
import { SchemePicker } from "../../components/feedback/SchemePicker";
import { FaqAccordion } from "../../components/feedback/FaqAccordion";
import { AskQuestion } from "../../components/feedback/AskQuestion";
import type { Faq } from "../../lib/feedback/types";
import { HelpCircle } from "lucide-react";

export default function FaqsPage() {
  const { schemes, language } = useApp();
  const [selected, setSelected] = useState<string>(schemes[0]?.id ?? "");
  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [loading, setLoading] = useState(false);

  const options = useMemo(
    () => schemes.map((s) => ({ id: s.id, name: s.name, categoryLabel: s.categoryLabel })),
    [schemes]
  );

  // Re-select when schemes load/change and the current choice is missing.
  useEffect(() => {
    if (schemes.length > 0 && !schemes.some((s) => s.id === selected)) {
      setSelected(schemes[0].id);
    }
  }, [schemes, selected]);

  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    setLoading(true);

    fetch(`/api/v1/schemes/${selected}/faqs?lang=${language}`, { signal: controller.signal })
      .then((res) => res.json())
      .then((data: { faqs?: Faq[] }) => setFaqs(data.faqs ?? []))
      .catch((err) => {
        if (err?.name !== "AbortError") setFaqs([]);
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [selected, language]);

  const schemeName = schemes.find((s) => s.id === selected)?.name ?? "";

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="border-b border-[#222] pb-4 space-y-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
            {language === "mr" ? "योजना प्रश्न व उत्तरे" : "Scheme FAQs"}
          </h1>
          <p className="text-xs sm:text-sm text-gray-400">
            {language === "mr"
              ? "निवडलेल्या योजनेविषयी निगडीत प्रश्न विचारा आणि अधिकृत माहितीवर आधारित उत्तर मिळवा."
              : "Ask a question about a scheme and get an answer grounded only in its maintained FAQ records."}
          </p>
        </div>
        {options.length > 0 && (
          <SchemePicker schemes={options} value={selected} onChange={setSelected} language={language} />
        )}
      </div>

      {selected && (
        <section className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-white">
            {language === "mr" ? "प्रश्न विचारा" : "Ask a question"}
          </h2>
          <AskQuestion slug={selected} language={language} />
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-white flex items-center space-x-1.5">
          <HelpCircle className="w-4 h-4 text-saffron-600" />
          <span>
            {language === "mr" ? "वारंवार विचारले जाणारे प्रश्न" : "Frequently asked questions"}
            {schemeName ? ` — ${schemeName}` : ""}
          </span>
        </h2>
        {loading ? (
          <p className="text-xs text-gray-400">Loading…</p>
        ) : (
          <FaqAccordion faqs={faqs} language={language} />
        )}
      </section>
    </div>
  );
}
