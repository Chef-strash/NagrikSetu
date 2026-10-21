"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, MapPin, Users, Wallet, X } from "lucide-react";
import { useApp } from "../lib/context/AppContext";
import {
  PROFILE_PROMPT_STORAGE_KEY,
  missingProfileFacts,
  shouldPromptProfile,
  type ProfilePromptFact
} from "../lib/profile/prompt";

/** Survives client-side navigation, so the nudge cannot flash back on return. */
let dismissedThisSession = false;

function readDismissed(): boolean {
  if (dismissedThisSession) return true;
  try {
    return window.localStorage.getItem(PROFILE_PROMPT_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

const FACT_COPY: Record<ProfilePromptFact, { en: string; mr: string; icon: typeof MapPin }> = {
  ward: { en: "Ward", mr: "प्रभाग", icon: MapPin },
  income: { en: "Household income", mr: "कुटुंबाचे उत्पन्न", icon: Wallet },
  category: { en: "Category", mr: "प्रवर्ग", icon: Users }
};

/**
 * Dashboard onboarding nudge: asks the citizen for the profile facts scheme
 * matching depends on. Shown once per browser; "Set up profile" opens /profile.
 */
export function ProfilePrompt() {
  const { isAuthenticated, authLoading, user, language } = useApp();
  const router = useRouter();
  const mr = language === "mr";
  const [open, setOpen] = useState(() =>
    shouldPromptProfile({ isAuthenticated, dismissed: dismissedThisSession })
  );
  const primaryRef = useRef<HTMLButtonElement>(null);

  const dismiss = useCallback(() => {
    dismissedThisSession = true;
    try {
      window.localStorage.setItem(PROFILE_PROMPT_STORAGE_KEY, "1");
    } catch {
      /* storage unavailable: the nudge simply returns on the next visit */
    }
    setOpen(false);
  }, []);

  // A returning visitor may have dismissed it already: correct once hydrated.
  useEffect(() => {
    if (readDismissed()) setOpen(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    primaryRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, dismiss]);

  if (!open) return null;

  // Judge the profile only once auth has settled: during SSR it is still the empty
  // default, which would otherwise flash "ward and income missing" at the citizen.
  const missing = authLoading ? [] : missingProfileFacts(user);

  return (
    <div
      role="presentation"
      onClick={dismiss}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-prompt-title"
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-md bg-[#050505] border border-[#333] rounded-lg shadow-card p-6 space-y-4"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id="profile-prompt-title" className="text-lg font-bold tracking-tight text-white">
            {mr ? "तुमची प्रोफाइल भरा" : "Set your profile"}
          </h2>
          <button
            type="button"
            onClick={dismiss}
            aria-label={mr ? "बंद करा" : "Close"}
            className="text-gray-600 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs sm:text-sm text-gray-400">
          {missing.length > 0
            ? mr
              ? "योजना जुळवण्यासाठी तुमचा प्रभाग, उत्पन्न आणि प्रवर्ग वापरला जातो. ते भरल्यास जुळणी अचूक होईल."
              : "Scheme matching uses your ward, income and category. Add them so the schemes you see actually apply to you."
            : mr
              ? "तुमचा प्रभाग, उत्पन्न आणि प्रवर्ग यांवर योजना जुळवणी अवलंबून आहे. एकदा तपासा, म्हणजे जुळणी अचूक राहील."
              : "Your ward, income and category drive scheme matching. Check them once so the matches stay accurate."}
        </p>

        {missing.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {missing.map((fact) => {
              const Icon = FACT_COPY[fact].icon;
              return (
                <li
                  key={fact}
                  className="inline-flex items-center gap-1.5 text-[11px] font-medium text-gray-300 bg-[#111] border border-[#333] rounded px-2 py-1"
                >
                  <Icon className="w-3.5 h-3.5 text-emerald-500" />
                  {mr ? FACT_COPY[fact].mr : FACT_COPY[fact].en}
                </li>
              );
            })}
          </ul>
        )}

        <p className="text-[11px] text-gray-600">
          {mr
            ? "ही माहिती फक्त योजना जुळवणीसाठी वापरली जाते. अंतिम निर्णय प्रभाग कार्यालयाचा असतो."
            : "Used only to match schemes. The final decision is always the ward office's."}
        </p>

        <div className="flex items-center justify-end gap-2.5 pt-1">
          <button
            type="button"
            onClick={dismiss}
            className="px-3.5 py-2 text-xs font-semibold text-gray-300 border border-[#444] hover:bg-black rounded transition-colors"
          >
            {mr ? "नंतर" : "Later"}
          </button>
          <button
            type="button"
            ref={primaryRef}
            onClick={() => {
              dismiss();
              router.push("/profile");
            }}
            className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold rounded shadow-subtle transition-colors inline-flex items-center gap-1.5"
          >
            <span>{mr ? "प्रोफाइल भरा" : "Set up profile"}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
