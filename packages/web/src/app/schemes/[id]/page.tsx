"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { shown } from "../../../lib/schemes/load";
import { useApp } from "../../../lib/context/AppContext";
import { FaqAccordion } from "../../../components/feedback/FaqAccordion";
import { ReviewList } from "../../../components/feedback/ReviewList";
import { ReviewForm } from "../../../components/feedback/ReviewForm";
import { AskQuestion } from "../../../components/feedback/AskQuestion";
import type { Faq, SchemeReview } from "../../../lib/feedback/types";
import { ArrowLeft, Check, ArrowRight, HelpCircle, MessageSquareText } from "lucide-react";

export default function SchemeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { schemes, user, createSession, language, isAuthenticated } = useApp();

  const schemeId = params.id as string;
  const scheme = schemes.find((s) => s.id === schemeId);

  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [reviews, setReviews] = useState<SchemeReview[]>([]);

  useEffect(() => {
    if (!scheme?.id) return;
    const controller = new AbortController();

    fetch(`/api/v1/schemes/${scheme.id}/faqs?lang=${language}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((d: { faqs?: Faq[] }) => setFaqs(d.faqs ?? []))
      .catch((err) => {
        if (err?.name !== "AbortError") setFaqs([]);
      });

    fetch(`/api/v1/schemes/${scheme.id}/reviews?limit=20`, { signal: controller.signal })
      .then((r) => r.json())
      .then((d: { reviews?: SchemeReview[] }) => setReviews(d.reviews ?? []))
      .catch((err) => {
        if (err?.name !== "AbortError") setReviews([]);
      });

    return () => controller.abort();
  }, [scheme?.id, language]);

  const wardDetailsMap: Record<string, { office: string, address: string }> = {
    "Ward 14: Kothrud - Bawdhan": {
      office: "Kothrud - Bawdhan Ward No. 14",
      address: "Paud Road, Opp. More Vidyalaya"
    },
    "Ward 7: Kasba - Vishrambaugwada": {
      office: "Kasba - Vishrambaugwada Ward No. 7",
      address: "Near Shaniwar Wada, Kasba Peth"
    },
    "Ward 9: Bhavani Peth": {
      office: "Bhavani Peth Ward No. 9",
      address: "General Hospital Compound, Bhavani Peth"
    },
    "Ward 2: Shivajinagar - Ghole Road": {
      office: "Shivajinagar - Ghole Road Ward No. 2",
      address: "Ghole Road, Near Balgandharva"
    },
    "Ward 4: Nagar Road - Vadgaon Sheri": {
      office: "Nagar Road - Vadgaon Sheri Ward No. 4",
      address: "Ramwadi, Pune-Nagar Road"
    }
  };

  const currentWardDetails = wardDetailsMap[user.ward] || {
    office: scheme?.counterLocation.office ?? "",
    address: scheme?.counterLocation.address ?? ""
  };

  const handleStartApply = () => {
    if (!scheme) return;
    if (!isAuthenticated) {
      router.push("/auth/signin");
      return;
    }
    const newSessionId = createSession(scheme.id, user.name);
    if (!newSessionId) return;
    router.push(`/assistant?session=${newSessionId}`);
  };

  if (!scheme) {
    return (
      <div className="space-y-4 max-w-4xl mx-auto text-center py-16">
        <h1 className="text-lg font-bold text-white">Scheme not found</h1>
        <p className="text-xs text-gray-400">
          We could not find a scheme with this link. It may have been removed or is still loading.
        </p>
        <Link href="/schemes" className="text-xs font-semibold text-emerald-500 hover:text-emerald-400">
          Back to Schemes Directory
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Back button */}
      <div>
        <Link
          href="/schemes"
          className="inline-flex items-center space-x-1 text-xs font-semibold text-gray-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Schemes Directory</span>
        </Link>
      </div>

      {/* Main Scheme Header Card */}
      <div className="bg-[#050505] border border-[#333] rounded-lg p-6 shadow-subtle space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500 border-b border-[#222] pb-3">
          <span className="font-semibold text-gray-200 bg-[#1a1a1a] px-2 py-0.5 rounded text-[11px]">
            {scheme.categoryLabel}
          </span>
          <div className="flex items-center space-x-2">
            <span>{scheme.department}</span>
            <span>•</span>
            <span className="text-gray-400">{scheme.resolutionNo}</span>
          </div>
        </div>

        <div className="space-y-1">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">{scheme.name}</h1>
          <p className="text-xs sm:text-sm font-medium text-gray-500">{scheme.vernacularName}</p>
        </div>

        <div className="bg-emerald-50 border border-emerald-100 rounded p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs">
          <div>
            <span className="text-emerald-800 font-bold text-base tabular-nums block">{scheme.benefitAmount}</span>
            <span className="text-emerald-700 text-xs">{scheme.benefitType}</span>
          </div>
          <div className="text-gray-400 text-xs sm:text-right">
            <span className="block text-gray-600">Application Deadline</span>
            <span className="font-semibold text-gray-200">{shown(scheme.deadline)}</span>
          </div>
        </div>

        <p className="text-xs text-gray-300 leading-relaxed pt-1">{scheme.description}</p>
      </div>

      {/* Criteria & Submission Location Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Who Qualifies */}
        <div className="bg-[#050505] border border-[#333] rounded-lg p-5 shadow-subtle space-y-3">
          <h2 className="font-bold text-xs text-white uppercase tracking-wider border-b border-[#222] pb-2">
            Who Qualifies
          </h2>
          {scheme.eligibility ? (
            <ul className="space-y-2 text-xs text-gray-300">
              {scheme.eligibility
                .split("\n")
                .map((line) => line.trim())
                .filter(Boolean)
                .map((line, idx) => (
                  <li key={idx} className="flex items-start space-x-2">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>{line}</span>
                  </li>
                ))}
            </ul>
          ) : (
            <p className="text-xs text-gray-500">
              Eligibility conditions are not published yet. Check at the ward office before applying.
            </p>
          )}
        </div>

        {/* Ward Facilitation */}
        <div className="bg-[#050505] border border-[#333] rounded-lg p-5 shadow-subtle space-y-3">
          <h2 className="font-bold text-xs text-white uppercase tracking-wider border-b border-[#222] pb-2">
            Ward Facilitation
          </h2>
          <div className="space-y-2 text-xs text-gray-300">
            <div>
              <span className="text-[11px] text-gray-600 block font-medium">Assigned Ward Office:</span>
              <span className="font-semibold text-white">{shown(currentWardDetails.office)}</span>
              {currentWardDetails.address && <p className="text-gray-500 text-[11px]">{currentWardDetails.address}</p>}
            </div>
            <div>
              <span className="text-[11px] text-gray-600 block font-medium">Submission Desk:</span>
              <span className="font-semibold text-white">{shown(scheme.counterLocation.desk)}</span>
            </div>
            <div>
              <span className="text-[11px] text-gray-600 block font-medium">Working Hours:</span>
              <span className="font-semibold text-white">{shown(scheme.counterLocation.hours)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Start Application Action Bar */}
      <div className="bg-[#0a0a0a] text-white rounded-lg p-5 shadow-card flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h3 className="font-semibold text-sm">Ready to check your papers and prepare your submission?</h3>
          <p className="text-xs text-gray-400">
            Our assistant will check your documents and verify IFSC codes before you visit the counter.
          </p>
        </div>
        <button
          onClick={handleStartApply}
          className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold rounded transition-colors shadow-subtle flex items-center space-x-1.5 whitespace-nowrap"
        >
          <span>Start Application in Assistant</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {/* Scheme FAQ Section (read-only, maintained records) */}
      <div className="space-y-4 pt-2">
        <div className="border-b border-[#222] pb-2">
          <h2 className="text-sm font-bold tracking-tight text-white uppercase flex items-center space-x-1.5">
            <HelpCircle className="w-4 h-4 text-saffron-600" />
            <span>{language === "mr" ? "वारंवार विचारले जाणारे प्रश्न" : "Frequently Asked Questions"}</span>
          </h2>
          <p className="text-xs text-gray-400">
            {language === "mr"
              ? "या योजनेच्या अधिकृत माहितीवर आधारित प्रश्न व उत्तरे. खाली स्वतःचा प्रश्न विचारू शकता."
              : "Answers drawn from this scheme's maintained information. Ask your own question below."}
          </p>
        </div>
        <FaqAccordion faqs={faqs} language={language} />
        <AskQuestion slug={scheme.id} language={language} />
      </div>

      {/* Citizen Reviews Section */}
      <div className="space-y-4 pt-2">
        <div className="border-b border-[#222] pb-2">
          <h2 className="text-sm font-bold tracking-tight text-white uppercase flex items-center space-x-1.5">
            <MessageSquareText className="w-4 h-4 text-saffron-600" />
            <span>{language === "mr" ? "नागरिक अभिप्राय" : "Reports from Other Applicants"}</span>
          </h2>
          <p className="text-xs text-gray-400">
            {language === "mr"
              ? "नागरिकांनी नोंदवलेले प्रत्यक्ष काउंटर अनुभव. हे अधिकृत नियम नाहीत."
              : "Counter experiences reported by citizens. These are reports, not official rules."}
          </p>
        </div>
        <ReviewForm
          schemeSlug={scheme.id}
          language={language}
          defaultCounter={scheme.counterLocation?.office}
          onSaved={(review) => setReviews((prev) => [review, ...prev])}
        />
        <ReviewList reviews={reviews} language={language} />
      </div>
    </div>
  );
}
