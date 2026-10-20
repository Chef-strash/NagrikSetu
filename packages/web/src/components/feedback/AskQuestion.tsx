"use client";

import React, { useState } from "react";
import { Search, ExternalLink, AlertCircle, Info } from "lucide-react";
import type { GroundedAnswer } from "../../lib/feedback/types";

interface AskQuestionProps {
  slug: string;
  language: "en" | "mr";
}

export function AskQuestion({ slug, language }: AskQuestionProps) {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GroundedAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = question.trim();
    if (trimmed.length < 3) {
      setError(
        language === "mr"
          ? "कृपया किमान ३ अक्षरांचा प्रश्न लिहा."
          : "Please enter a question of at least 3 characters."
      );
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch(`/api/v1/schemes/${slug}/faq-answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: trimmed, lang: language })
      });
      const data = (await res.json()) as GroundedAnswer & { error?: string };
      if (!res.ok) {
        throw new Error(data.error || "The FAQ service is unavailable right now.");
      }
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2">
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          maxLength={300}
          placeholder={
            language === "mr"
              ? "उदा. कोणती कागदपत्रे लागतात?"
              : "e.g. Which documents are required?"
          }
          className="flex-1 text-xs px-3 py-2 border border-civic-300 rounded focus:border-saffron-600 outline-none"
        />
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 bg-saffron-600 hover:bg-saffron-700 disabled:opacity-60 text-white text-xs font-semibold rounded transition-colors flex items-center justify-center space-x-1.5 whitespace-nowrap"
        >
          <Search className="w-4 h-4" />
          <span>{loading ? (language === "mr" ? "शोधत आहे…" : "Searching…") : language === "mr" ? "प्रश्न विचारा" : "Ask"}</span>
        </button>
      </form>

      {error && (
        <div className="flex items-start space-x-2 text-xs text-friction-700 bg-friction-50 border border-friction-100 rounded p-3">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {result && (
        <div
          className={`rounded-lg border p-4 space-y-3 shadow-subtle ${
            result.answered ? "bg-white border-civic-200" : "bg-civic-50 border-civic-200"
          }`}
        >
          <p className="text-xs text-civic-800 leading-relaxed whitespace-pre-line">{result.answer}</p>

          {result.references.length > 0 && (
            <div className="space-y-1">
              <span className="text-[11px] font-semibold text-civic-500 uppercase tracking-wide">
                {language === "mr" ? "आधारित FAQ" : "Based on"}
              </span>
              <ul className="space-y-0.5">
                {result.references.map((ref) => (
                  <li key={ref.id} className="text-[11px] text-civic-600 flex items-start space-x-1.5">
                    <Info className="w-3 h-3 text-civic-400 shrink-0 mt-0.5" />
                    <span>{ref.question}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pt-1 border-t border-civic-100">
            <p className="text-[11px] text-civic-500 max-w-lg">{result.guidance}</p>
            {result.officialUrl && (
              <a
                href={result.officialUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center space-x-1 text-[11px] font-semibold text-saffron-700 hover:text-saffron-600 whitespace-nowrap"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>{language === "mr" ? "अधिकृत पृष्ठ" : "Official page"}</span>
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
