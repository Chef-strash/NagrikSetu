"use client";

import React, { useState } from "react";
import { Loader2 } from "lucide-react";
import type { SchemeReview } from "../../lib/feedback/types";

interface ReviewFormProps {
  schemeSlug: string;
  language: "en" | "mr";
  defaultCounter?: string;
  onSaved: (review: SchemeReview) => void;
}

const MAX_TEXT = 1000;

export function ReviewForm({ schemeSlug, language, defaultCounter, onSaved }: ReviewFormProps) {
  const mr = language === "mr";
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [author, setAuthor] = useState("");
  const [counter, setCounter] = useState(defaultCounter ?? "");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [published, setPublished] = useState(true);

  const canSubmit = text.trim().length >= 10 && !saving;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    setErrors([]);
    try {
      const res = await fetch(`/api/v1/schemes/${encodeURIComponent(schemeSlug)}/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, author, counter })
      });
      const data = (await res.json().catch(() => ({}))) as { review?: SchemeReview; errors?: string[]; published?: boolean };
      if (!res.ok || !data.review) {
        setErrors(data.errors?.length ? data.errors : ["Couldn't save your review. Try again."]);
        return;
      }
      setPublished(data.published !== false);
      onSaved(data.review);
      setText("");
      setSaved(true);
      setOpen(false);
    } catch {
      setErrors(["Couldn't save your review. Try again."]);
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            setSaved(false);
          }}
          className="px-3 py-1.5 text-xs font-medium rounded border border-[#444] text-gray-200 hover:bg-[#1a1a1a]"
        >
          {mr ? "तुमचा अनुभव सांगा" : "Share your experience"}
        </button>
        {saved && <span className="text-[11px] text-emerald-500">{published
          ? (mr ? "धन्यवाद! प्रकाशित झाले." : "Thanks - your review is published.")
          : (mr ? "धन्यवाद! तपासणीसाठी पाठवले." : "Thanks - your review is awaiting review.")}</span>}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="border border-[#333] rounded-lg p-4 space-y-3 bg-[#050505]">
      <label className="block text-xs text-gray-300">
        {mr ? "काउंटरवर काय झाले?" : "What happened at the counter?"}
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, MAX_TEXT))}
          rows={4}
          maxLength={MAX_TEXT}
          placeholder={mr ? "उदा. दोन पासपोर्ट फोटो मागितले..." : "e.g. The clerk asked for two passport photos…"}
          className="mt-1 w-full text-xs px-3 py-2 bg-black border border-[#444] rounded text-white outline-none focus:border-emerald-500"
        />
        <span className="text-[11px] text-gray-500">
          {text.length}/{MAX_TEXT} · {mr ? "आधार, फोन नंबर किंवा लिंक लिहू नका." : "No Aadhaar, phone numbers or links."}
        </span>
      </label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block text-xs text-gray-300">
          {mr ? "नाव (ऐच्छिक)" : "Name (optional)"}
          <input
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            maxLength={80}
            className="mt-1 w-full text-xs px-3 py-2 bg-black border border-[#444] rounded text-white outline-none focus:border-emerald-500"
          />
        </label>
        <label className="block text-xs text-gray-300">
          {mr ? "कार्यालय / काउंटर" : "Office / counter"}
          <input
            value={counter}
            onChange={(e) => setCounter(e.target.value)}
            maxLength={128}
            className="mt-1 w-full text-xs px-3 py-2 bg-black border border-[#444] rounded text-white outline-none focus:border-emerald-500"
          />
        </label>
      </div>
      {errors.length > 0 && (
        <ul className="text-[11px] text-amber-400 space-y-0.5">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={!canSubmit}
          className="px-3 py-1.5 text-xs font-semibold rounded bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white flex items-center gap-1.5"
        >
          {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          {mr ? "जतन करा" : "Post review"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="px-3 py-1.5 text-xs text-gray-400 hover:text-white">
          {mr ? "रद्द करा" : "Cancel"}
        </button>
      </div>
    </form>
  );
}
