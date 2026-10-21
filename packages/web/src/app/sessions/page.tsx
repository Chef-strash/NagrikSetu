"use client";

import React from "react";
import Link from "next/link";
import { useApp } from "../../lib/context/AppContext";
import { ArrowRight, CheckCircle2, Clock, MapPin, Plus } from "lucide-react";

export default function SessionsPage() {
  const { sessions, language } = useApp();

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[#333] pb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
            {language === "mr" ? "सक्रिय अर्ज सत्रे" : "Active Sessions"}
          </h1>
          <p className="text-xs sm:text-sm text-gray-400">
            {language === "mr"
              ? "आपले चालू असलेले अर्ज. असिस्टंटमध्ये उघडा किंवा थेट कागदपत्रे तपासा."
              : "Review your in-progress applications. Resume counseling in Assistant or check your documents directly."}
          </p>
        </div>

        <Link
          href="/schemes"
          className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold rounded shadow-subtle transition-colors flex items-center space-x-1.5 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>{language === "mr" ? "नवीन अर्ज सुरू करा" : "Start New Application"}</span>
        </Link>
      </div>

      {/* Sessions List */}
      <div className="space-y-4">
        {sessions.length === 0 ? (
          <div className="bg-[#050505] border border-[#333] rounded-lg p-10 text-center space-y-3">
            <p className="text-xs text-gray-500">You do not have any active scheme preparation sessions.</p>
            <Link
              href="/schemes"
              className="inline-block px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold rounded"
            >
              Browse Schemes to Start
            </Link>
          </div>
        ) : (
          sessions.map((session) => (
            <div
              key={session.id}
              className="bg-[#050505] border border-[#333] rounded-lg p-5 shadow-subtle space-y-4 hover:border-[#444] transition-colors"
            >
              {/* Header Row */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#222] pb-3">
                <div className="space-y-0.5">
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-sm text-white">{session.beneficiaryName}</span>
                    <span className="text-gray-600 text-xs">•</span>
                    <span className="text-xs font-semibold text-emerald-700 tabular-nums">
                      {session.targetBenefit}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 font-medium">{session.schemeName}</p>
                </div>

                <div>
                  {session.status === "completed" ? (
                    <span className="inline-flex items-center space-x-1 px-2.5 py-1 bg-emerald-50 text-emerald-800 text-[11px] font-semibold rounded border border-emerald-200">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Ready to Submit</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center space-x-1 px-2.5 py-1 bg-amber-50 text-amber-800 text-[11px] font-semibold rounded border border-amber-200">
                      <Clock className="w-3.5 h-3.5 text-amber-600" />
                      <span>{session.documentsLeft} Documents Left</span>
                    </span>
                  )}
                </div>
              </div>

              {/* Counter Location & Last Activity */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-black/70 p-3 rounded border border-[#222]">
                <div>
                  <span className="text-[11px] text-gray-600 block font-medium">Assigned Counter:</span>
                  <div className="flex items-start space-x-1 text-gray-200">
                    <MapPin className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                    <span>{session.counterLocation}</span>
                  </div>
                </div>
                <div>
                  <span className="text-[11px] text-gray-600 block font-medium">Last Activity:</span>
                  <span className="text-gray-300">{session.lastActivity}</span>
                </div>
              </div>

              {/* Actions: Open in Assistant vs Direct Document Check */}
              <div className="flex flex-wrap items-center justify-end gap-2.5 pt-1">
                <Link
                  href={`/audit?session=${session.id}`}
                  className="px-3.5 py-1.5 text-xs font-semibold text-gray-300 hover:text-white border border-[#444] hover:bg-black rounded transition-colors"
                >
                  Check Documents
                </Link>
                <Link
                  href={`/assistant?session=${session.id}`}
                  className="px-4 py-1.5 text-xs font-semibold bg-emerald-500 hover:bg-emerald-600 text-white rounded transition-colors shadow-subtle flex items-center space-x-1"
                >
                  <span>Open in Assistant</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
