"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { shown } from "../../lib/schemes/load";
import { useApp } from "../../lib/context/AppContext";
import { Scheme } from "../../lib/data/schemes";
import { Search, Calendar, MapPin, ArrowRight } from "lucide-react";

function SchemesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { schemes, language, createSession, user, isAuthenticated } = useApp();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedIncomeLimit, setSelectedIncomeLimit] = useState<string>("all");

  useEffect(() => {
    const categoryParam = searchParams.get("category");
    if (categoryParam) {
      setSelectedCategory(categoryParam);
    } else {
      setSelectedCategory("all");
    }
  }, [searchParams]);

  const filteredSchemes = schemes.filter((scheme) => {
    if (selectedCategory !== "all" && scheme.category !== selectedCategory) {
      return false;
    }
    if (selectedIncomeLimit !== "all" && scheme.incomeLimit > 0 && scheme.incomeLimit < Number(selectedIncomeLimit)) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = scheme.name.toLowerCase().includes(q);
      const matchVernacular = scheme.vernacularName.toLowerCase().includes(q);
      const matchDesc = scheme.description.toLowerCase().includes(q);
      const matchDept = scheme.department.toLowerCase().includes(q);
      if (!matchName && !matchVernacular && !matchDesc && !matchDept) {
        return false;
      }
    }
    return true;
  });

  const handleStartApply = (scheme: Scheme) => {
    if (!isAuthenticated) {
      router.push("/auth/signin");
      return;
    }
    const newSessionId = createSession(scheme.id, user.name);
    router.push(`/assistant?session=${newSessionId}`);
  };

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="border-b border-[#333] pb-3 space-y-1">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
          {language === "mr" ? "पुणे महानगरपालिका कल्याणकारी योजना सूची" : "Schemes Directory"}
        </h1>
        <p className="text-xs sm:text-sm text-gray-400">
          {language === "mr"
            ? "समाविष्ट योजना, पात्रता अटी आणि संबंधित क्षेत्रीय कार्यालयातील काउंटर माहिती."
            : "Explore municipal schemes funded under Pune Municipal Corporation budget heads. Filter by category or income limits."}
        </p>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-[#050505] border border-[#333] rounded-lg p-3 px-4 shadow-subtle space-y-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="w-4 h-4 absolute left-3 top-3 text-gray-600" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by scheme name, keyword, or education level..."
              className="w-full text-xs pl-9 pr-3 py-2.5 border border-[#444] rounded focus:border-emerald-500 outline-none text-white placeholder-civic-400 bg-[#050505]"
            />
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-xs text-gray-500 font-medium">Family Income:</span>
            <select
              value={selectedIncomeLimit}
              onChange={(e) => setSelectedIncomeLimit(e.target.value)}
              className="text-xs px-2.5 py-2 border border-[#444] rounded focus:border-emerald-500 outline-none bg-[#050505] text-gray-200"
            >
              <option value="all">Any family income</option>
              <option value="160000">Family income under Rs. 1.6 Lakh</option>
              <option value="250000">Family income under Rs. 2.5 Lakh</option>
            </select>
          </div>
        </div>

      </div>

      {/* Scheme Listings */}
      <div className="flex flex-col pt-2">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider shrink-0 mb-3">
          Showing {filteredSchemes.length} Schemes
        </div>

        <div className="w-full py-4 space-y-4">
          {filteredSchemes.length === 0 ? (
            <div className="bg-[#050505] border border-[#333] rounded-lg p-8 text-center text-gray-500 text-xs">
              No municipal schemes matched your current filter criteria. Try clearing search filters.
            </div>
          ) : (
            filteredSchemes.map((currentScheme) => (
              <div 
                key={currentScheme.id} 
                className="group bg-[#050505] border border-[#333] hover:border-emerald-500 rounded-lg p-5 shadow-subtle transition-all duration-300 hover:scale-[1.01] hover:shadow-xl space-y-4 cursor-pointer"
              >
                {/* Top Row: Category tag, Department, Deadline */}
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500 border-b border-[#222] pb-3">
                  <div className="flex items-center space-x-2">
                    <span className="font-semibold text-gray-200 bg-[#1a1a1a] px-2 py-0.5 rounded text-[11px]">
                      {currentScheme.categoryLabel}
                    </span>
                    <span>•</span>
                    <span>{currentScheme.department}</span>
                  </div>
                  <div className="flex items-center space-x-1.5 text-gray-400">
                    <Calendar className="w-3.5 h-3.5 text-gray-600" />
                    <span>Deadline: {shown(currentScheme.deadline)}</span>
                  </div>
                </div>

                {/* Middle Row: Title, Vernacular subtitle, description */}
                <div className="space-y-1">
                  <Link
                    href={`/schemes/${currentScheme.id}`}
                    className="text-base font-bold text-white group-hover:text-emerald-500 transition-colors block"
                  >
                    {currentScheme.name}
                  </Link>
                  <p className="text-xs font-medium text-white group-hover:text-emerald-500 transition-colors duration-300">{currentScheme.vernacularName}</p>
                  <p className="text-xs text-gray-400 pt-1 leading-relaxed">{currentScheme.description}</p>
                </div>

                {/* Parameters Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-black/70 p-3 rounded border border-[#222] group-hover:border-emerald-500/50 text-xs transition-colors duration-300">
                  <div>
                    <span className="text-[11px] text-gray-600 block font-medium">Financial Benefit:</span>
                    <span className="font-bold text-white text-sm tabular-nums">{currentScheme.benefitAmount}</span>
                    <span className="text-[11px] text-gray-500 block">{currentScheme.benefitType}</span>
                  </div>

                  <div>
                    <span className="text-[11px] text-gray-600 block font-medium">Qualification Cutoff:</span>
                    <span className="font-semibold text-gray-200 text-xs">{shown(currentScheme.cutoff)}</span>
                    {currentScheme.incomeLimitFormatted && <span className="text-[11px] text-gray-500 block">{currentScheme.incomeLimitFormatted}</span>}
                  </div>

                  <div>
                    <span className="text-[11px] text-gray-600 block font-medium">Submission Desk:</span>
                    <div className="flex items-start space-x-1 text-xs text-gray-200">
                      <MapPin className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-medium block">{shown(currentScheme.counterLocation.office)}</span>
                        {currentScheme.counterLocation.desk && <span className="text-[11px] text-gray-500">{currentScheme.counterLocation.desk}</span>}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Bottom Action Row */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <div className="text-xs text-gray-500">
                    <span className="font-medium text-gray-300">{currentScheme.communityTips.length} tips</span> from fellow applicants
                  </div>

                  <div className="flex items-center space-x-2">
                    <Link
                      href={`/schemes/${currentScheme.id}`}
                      className="px-3.5 py-1.5 text-xs font-semibold text-gray-300 hover:text-white border border-[#444] hover:bg-black rounded transition-colors"
                    >
                      View Details & Tips
                    </Link>
                    <button
                      onClick={() => handleStartApply(currentScheme)}
                      className="px-4 py-1.5 text-xs font-semibold bg-emerald-500 hover:bg-emerald-600 text-white rounded transition-colors shadow-subtle flex items-center space-x-1"
                    >
                      <span>Start Application</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default function SchemesPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-xs text-gray-500">Loading Schemes Directory...</div>}>
      <SchemesContent />
    </Suspense>
  );
}
