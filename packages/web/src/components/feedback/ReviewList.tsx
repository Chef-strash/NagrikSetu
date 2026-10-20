"use client";

import React, { useEffect, useState } from "react";
import { MessageSquareText, ThumbsUp } from "lucide-react";
import type { SchemeReview } from "../../lib/feedback/types";

const FRICTION_LABELS: Record<string, { en: string; mr: string; className: string }> = {
  IFSC_MERGER: { en: "Bank / IFSC", mr: "बँक / IFSC", className: "bg-friction-50 text-friction-700 border-friction-100" },
  PHOTOCOPY_DEMAND: { en: "Photocopies", mr: "झेरॉक्स", className: "bg-saffron-50 text-saffron-700 border-saffron-100" },
  UNOFFICIAL_FEE: { en: "Counter fee", mr: "काउंटर शुल्क", className: "bg-friction-50 text-friction-700 border-friction-100" },
  TIMING: { en: "Timings", mr: "वेळ", className: "bg-civic-100 text-civic-700 border-civic-200" },
  MSW_SIGNATURE: { en: "Hospital signature", mr: "रुग्णालय स्वाक्षरी", className: "bg-civic-100 text-civic-700 border-civic-200" },
  DIGILOCKER_OK: { en: "DigiLocker", mr: "डिजिलॉकर", className: "bg-emerald-50 text-emerald-700 border-emerald-100" }
};

function formatDate(value: string | null, language: "en" | "mr"): string {
  if (!value) return language === "mr" ? "नोंदणीकृत" : "Recorded";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return language === "mr" ? "नोंदणीकृत" : "Recorded";
  return d.toLocaleDateString(language === "mr" ? "mr-IN" : "en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

interface ReviewListProps {
  reviews: SchemeReview[];
  language: "en" | "mr";
  emptyText?: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VOTED_KEY = "nagriksetu-helpful-votes";

function readVotes(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(VOTED_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

function saveVotes(votes: Set<string>) {
  try {
    localStorage.setItem(VOTED_KEY, JSON.stringify([...votes]));
  } catch {
    // Storage unavailable: voting still works, it just isn't remembered.
  }
}

export function ReviewList({ reviews, language, emptyText }: ReviewListProps) {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [voted, setVoted] = useState<Set<string>>(new Set());

  useEffect(() => setVoted(readVotes()), []);

  const markHelpful = async (id: string, base: number) => {
    if (voted.has(id)) return;
    const nextVotes = new Set(voted).add(id);
    setVoted(nextVotes);
    setCounts((c) => ({ ...c, [id]: (c[id] ?? base) + 1 }));
    try {
      const res = await fetch(`/api/v1/reviews/${id}/helpful`, { method: "POST" });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { helpfulCount?: number };
      if (typeof data.helpfulCount === "number") setCounts((c) => ({ ...c, [id]: data.helpfulCount as number }));
      saveVotes(nextVotes);
    } catch {
      // Undo the optimistic vote.
      setCounts((c) => ({ ...c, [id]: base }));
      setVoted((v) => {
        const copy = new Set(v);
        copy.delete(id);
        return copy;
      });
    }
  };

  if (reviews.length === 0) {
    return (
      <p className="text-xs text-civic-500 bg-white border border-civic-200 rounded-lg p-4 shadow-subtle">
        {emptyText ??
          (language === "mr"
            ? "या योजनेसाठी अद्याप कोणताही अभिप्राय उपलब्ध नाही."
            : "No approved reviews are available for this scheme yet.")}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {reviews.map((review) => {
        const tag = review.frictionTag ? FRICTION_LABELS[review.frictionTag] : null;
        return (
          <div
            key={review.id}
            className="bg-white border border-civic-200 rounded-lg p-4 shadow-subtle space-y-2"
          >
            <div className="flex items-center justify-between gap-2 border-b border-civic-100 pb-2">
              <span className="flex items-center space-x-1.5 text-[11px] font-medium text-civic-500">
                <MessageSquareText className="w-3.5 h-3.5 text-civic-400" />
                <span>{formatDate(review.createdAt, language)}</span>
              </span>
              {tag && (
                <span className={`px-2 py-0.5 rounded text-[11px] font-medium border ${tag.className}`}>
                  {language === "mr" ? tag.mr : tag.en}
                </span>
              )}
            </div>
            <p className="text-xs text-civic-700 leading-relaxed">{review.text}</p>
            {UUID_RE.test(review.id) && (
            <button
              type="button"
              onClick={() => void markHelpful(review.id, review.helpfulCount)}
              disabled={voted.has(review.id)}
              className="pt-1 flex items-center space-x-1.5 text-[11px] text-civic-500 hover:text-emerald-500 disabled:hover:text-civic-500 disabled:cursor-default"
              title={voted.has(review.id) ? "You marked this helpful" : "Mark as helpful"}
            >
              <ThumbsUp className={`w-3.5 h-3.5 ${voted.has(review.id) ? "text-emerald-500" : "text-civic-400"}`} />
              <span className="tabular-nums">{counts[review.id] ?? review.helpfulCount}</span>
              <span>{language === "mr" ? "नागरिकांनी उपयुक्त म्हटले" : "found this helpful"}</span>
            </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
