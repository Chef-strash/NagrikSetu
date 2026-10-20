"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useApp } from "../../lib/context/AppContext";
import { SchemePicker } from "../../components/feedback/SchemePicker";
import { ReviewList } from "../../components/feedback/ReviewList";
import type { SchemeReview } from "../../lib/feedback/types";
import { MessageSquareText } from "lucide-react";

export default function ReviewsPage() {
  const { schemes, language } = useApp();
  const [selected, setSelected] = useState<string>(schemes[0]?.id ?? "");
  const [reviews, setReviews] = useState<SchemeReview[]>([]);
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

    fetch(`/api/v1/schemes/${selected}/reviews?limit=20`, { signal: controller.signal })
      .then((res) => res.json())
      .then((data: { reviews?: SchemeReview[] }) => setReviews(data.reviews ?? []))
      .catch((err) => {
        if (err?.name !== "AbortError") setReviews([]);
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
            {language === "mr" ? "नागरिक अभिप्राय" : "Citizen Reviews"}
          </h1>
          <p className="text-xs sm:text-sm text-gray-400">
            {language === "mr"
              ? "वार्ड कार्यालय व काउंटरवरील प्रत्यक्ष अनुभवांचे अभिप्राय (फक्त वाचनासाठी)."
              : "Reported counter experiences from citizens who applied. Read-only; these are reports, not official rules."}
          </p>
        </div>
        {options.length > 0 && (
          <SchemePicker schemes={options} value={selected} onChange={setSelected} language={language} />
        )}
      </div>

      <section className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-white flex items-center space-x-1.5">
          <MessageSquareText className="w-4 h-4 text-saffron-600" />
          <span>
            {language === "mr" ? "अभिप्राय" : "Reviews"}
            {schemeName ? ` — ${schemeName}` : ""}
          </span>
        </h2>
        {loading ? (
          <p className="text-xs text-gray-400">Loading…</p>
        ) : (
          <ReviewList reviews={reviews} language={language} />
        )}
      </section>
    </div>
  );
}
