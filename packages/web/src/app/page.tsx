"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useApp, type CandidateScheme } from "../lib/context/AppContext";
import { Search, Mic, ArrowRight, GraduationCap, HeartPulse, Store, Inbox, Loader2 } from "lucide-react";
import { offlineMatchMessage } from "../lib/chatbot/offline";
import { categoryBlurb } from "../lib/schemes/load";
import { toChatProfile } from "../lib/chatbot/profile";
import { startChatSession, selectChatScheme, ChatbotApiError } from "../lib/chatbot/api";
import { useVoiceInput } from "../lib/voice/useVoiceInput";
import { FooterContent } from "../components/Footer";
import { CivicBackground } from "../components/CivicBackground";
import { ProfilePrompt } from "../components/ProfilePrompt";

export default function HomePage() {
  const { isAuthenticated } = useApp();
  
  const [currentSection, setCurrentSection] = useState(0);
  const isScrolling = useRef(false);

  useEffect(() => {
    // Hide default scrollbar for this page only
    const scrollArea = document.getElementById('main-scroll-area');
    if (scrollArea) scrollArea.style.overflowY = 'hidden';
    return () => {
      if (scrollArea) scrollArea.style.overflowY = 'auto';
    };
  }, []);

  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      // Allow scroll inside specific elements if they overflow
      const target = e.target as HTMLElement;
      if (target.closest('.no-snap-scroll')) return;

      e.preventDefault();
      if (isScrolling.current) return;
      
      const threshold = 20;
      if (Math.abs(e.deltaY) < threshold) return;

      isScrolling.current = true;
      if (e.deltaY > 0) {
        setCurrentSection(prev => Math.min(prev + 1, 3));
      } else {
        setCurrentSection(prev => Math.max(prev - 1, 0));
      }

      setTimeout(() => {
        isScrolling.current = false;
      }, 700);
    };

    const scrollArea = document.getElementById('main-scroll-area');
    if (scrollArea) {
      scrollArea.addEventListener('wheel', handleWheel, { passive: false });
    }
    return () => {
      if (scrollArea) scrollArea.removeEventListener('wheel', handleWheel);
    };
  }, []);

  const touchStartY = useRef(0);
  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('.no-snap-scroll')) return;
      touchStartY.current = e.touches[0].clientY;
    };
    
    const handleTouchMove = (e: TouchEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('.no-snap-scroll')) return;
      
      e.preventDefault();
      if (isScrolling.current) return;
      
      const touchEndY = e.touches[0].clientY;
      const deltaY = touchStartY.current - touchEndY;
      
      if (Math.abs(deltaY) > 40) {
        isScrolling.current = true;
        if (deltaY > 0) {
          setCurrentSection(prev => Math.min(prev + 1, 3));
        } else {
          setCurrentSection(prev => Math.max(prev - 1, 0));
        }
        setTimeout(() => {
          isScrolling.current = false;
        }, 700);
      }
    };
    
    const scrollArea = document.getElementById('main-scroll-area');
    if (scrollArea) {
      scrollArea.addEventListener('touchstart', handleTouchStart, { passive: true });
      scrollArea.addEventListener('touchmove', handleTouchMove, { passive: false });
    }
    return () => {
      if (scrollArea) {
        scrollArea.removeEventListener('touchstart', handleTouchStart);
        scrollArea.removeEventListener('touchmove', handleTouchMove);
      }
    };
  }, []);

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#020202]">
      {/* Layered decorative backdrop. Swap the variant to preview alternatives:
          "blueprint" | "dots" | "contour" | "hatch" | "none" */}
      <CivicBackground variant="blueprint" />

      {/* Landing nudge for the profile facts scheme matching depends on. */}
      <ProfilePrompt />

      <div 
        className="absolute inset-0 w-full h-full transition-transform duration-[800ms] ease-[cubic-bezier(0.76,0,0.24,1)]"
        style={{ transform: `translateY(-${currentSection * 100}%)` }}
      >
        {/* Section 0: Hero */}
        <div className="w-full h-full flex flex-col items-center justify-center p-4">
          <div className="w-full max-w-4xl mx-auto transition-all duration-700 delay-300" style={{ opacity: currentSection === 0 ? 1 : 0, transform: currentSection === 0 ? 'translateY(0)' : 'translateY(20px)' }}>
            {isAuthenticated ? <AuthenticatedHero /> : <PublicHero />}
          </div>
        </div>
        
        {/* Section 1: Explore */}
        <div className="w-full h-full flex flex-col items-center justify-center p-4">
          <div className="w-full max-w-5xl mx-auto transition-all duration-700 delay-300" style={{ opacity: currentSection === 1 ? 1 : 0, transform: currentSection === 1 ? 'translateY(0)' : 'translateY(20px)' }}>
            <ExploreCategories />
          </div>
        </div>
        
        {/* Section 2: Application in Progress */}
        <div className="w-full h-full flex flex-col items-center justify-center p-4">
          <div className="w-full max-w-5xl mx-auto transition-all duration-700 delay-300" style={{ opacity: currentSection === 2 ? 1 : 0, transform: currentSection === 2 ? 'translateY(0)' : 'translateY(20px)' }}>
            {isAuthenticated ? <ApplicationInProgress /> : <EmptyApplication />}
          </div>
        </div>

        {/* Section 3: Footer */}
        <div className="w-full h-full flex flex-col items-end justify-end">
          <FooterContent />
        </div>
      </div>
    </div>
  );
}

function PublicHero() {
  const router = useRouter();
  const { language } = useApp();
  const [searchQuery, setSearchQuery] = useState("");

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/schemes?q=${encodeURIComponent(searchQuery.trim())}`);
    } else {
      router.push("/schemes");
    }
  };

  return (
    <div className="bg-black/40 backdrop-blur-xl border border-white/10 hover:border-white/20 rounded-2xl p-8 sm:p-10 text-center w-full space-y-4 shadow-[0_8px_32px_0_rgba(0,0,0,0.3)] hover:-translate-y-1 hover:shadow-[0_16px_48px_0_rgba(0,0,0,0.5)] transition-all duration-500">
      <div className="space-y-1">
        <h1 className="text-2xl sm:text-4xl font-bold tracking-tight text-white">
          {language === "mr"
            ? "पुणे महानगरपालिकेच्या योजनांची माहिती"
            : "Discover Municipal Schemes in Pune"}
        </h1>
        <p className="text-sm text-gray-400 max-w-2xl mx-auto mt-2">
          {language === "mr"
            ? "शिक्षण, आरोग्य आणि उपजीविका योजनांची माहिती मिळवा. अधिक माहितीसाठी नोंदणी करा."
            : "Explore official education, healthcare, and livelihood welfare schemes. Sign in to check your eligibility and prepare your applications."}
        </p>
      </div>

      <form onSubmit={handleSearchSubmit} className="max-w-2xl mx-auto pt-4">
        <div className="flex items-center rounded-md border border-[#333] bg-[#0a0a0a] shadow-sm overflow-hidden focus-within:border-emerald-500">
          <div className="pl-4 text-gray-500">
            <Search className="w-5 h-5" />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              language === "mr"
                ? "योजना शोधा (उदा. शिक्षण, आरोग्य)..."
                : "Search for schemes (e.g. 'Scholarship' or 'Health')..."
            }
            className="w-full text-sm px-3 py-3 bg-transparent text-white placeholder-gray-500 outline-none"
          />
          <button
            type="submit"
            className="px-4 py-3 bg-[#111] hover:bg-[#222] border-l border-[#333] text-xs font-medium text-gray-300 transition-colors"
          >
            Search
          </button>
        </div>
      </form>

      <div className="flex flex-wrap items-center justify-center gap-3 pt-4">
        <Link
          href="/auth/signup"
          className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold rounded shadow-subtle transition-colors"
        >
          {language === "mr" ? "साइन अप करा" : "Create an Account"}
        </Link>
        <Link
          href="/schemes"
          className="px-6 py-2.5 bg-[#0a0a0a] hover:bg-[#111] text-gray-300 border border-[#333] text-sm font-semibold rounded shadow-subtle transition-colors"
        >
          {language === "mr" ? "सर्व योजना पहा" : "Browse Schemes"}
        </Link>
      </div>
    </div>
  );
}

function AuthenticatedHero() {
  const router = useRouter();
  const { language, createSession, createCandidateSession, schemes, user } = useApp();
  const [searchQuery, setSearchQuery] = useState("");
  const voice = useVoiceInput({ language, onTranscript: (text) => setSearchQuery(text) });
  const isRecording = voice.state === "recording";
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiNotice, setApiNotice] = useState<string | null>(null);

  /** Local keyword match — used only when the decomposition service is unreachable. */
  const matchSchemeLocally = (query: string) => {
    const q = query.toLowerCase();
    return (
      schemes.find(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.category.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          ((q.includes("health") || q.includes("hospital") || q.includes("ration") || q.includes("medical")) &&
            s.category === "healthcare") ||
          ((q.includes("vendor") || q.includes("hawker") || q.includes("stall") || q.includes("loan") || q.includes("business")) &&
            s.category === "livelihood") ||
          ((q.includes("10th") || q.includes("12th") || q.includes("ssc") || q.includes("hsc") || q.includes("scholarship")) &&
            s.category === "education")
      ) || null
    );
  };

  /**
   * Decompose the typed query once via the Layer-2 API, select the closest scheme
   * for its eligibility check, then open the application page with an opening
   * message built from that real result.
   */
  const runDecomposition = async () => {
    const query = searchQuery.trim();
    if (!query) {
      router.push("/schemes");
      return;
    }

    setIsSubmitting(true);
    setApiNotice(null);

    try {
      // 1. Decompose ONCE → intent, category, applicant facts + ranked schemes.
      const session = await startChatSession({
        query,
        lang: language,
        profileWard: user.ward,
        profile: toChatProfile(user)
      });

      // 2. Build the top-2 candidates. The decomposer either ranks matches
      //    (DISCOVER_SCHEMES) or detects a named scheme (`schemeQuery`).
      const candidates: CandidateScheme[] = session.schemes.slice(0, 2).map((match) => ({
        slug: match.scheme.slug,
        name: match.scheme.name,
        categoryLabel: match.scheme.categoryLabel,
        benefitAmount: match.scheme.benefitAmount,
        description: match.scheme.description,
        score: match.score,
        named: false
      }));

      if (candidates.length === 0 && session.decomposition.schemeQuery) {
        // The citizen named a scheme: fetch its details so the card can render.
        const selection = await selectChatScheme(
          session.sessionId,
          session.decomposition.schemeQuery,
          language
        );
        candidates.push({
          slug: selection.scheme.slug,
          name: selection.scheme.name,
          categoryLabel: selection.scheme.categoryLabel,
          benefitAmount: selection.scheme.benefitAmount,
          description: selection.scheme.description,
          score: 100,
          named: true
        });
      }

      if (candidates.length === 0) {
        setApiNotice(`No PMC scheme matched "${query}". Try rephrasing, or browse all schemes.`);
        return;
      }

      // 3. Open a session that awaits the citizen's choice — the document checklist
      //    stays empty until they pick one on the application page.
      const newSessionId = createCandidateSession({
        beneficiaryName: user.name,
        initialQuery: query,
        chatSessionId: session.sessionId,
        candidates
      });
      router.push(`/assistant?session=${newSessionId}`);
    } catch (error) {
      // Protocol 5: never dead-end the demo when the backend is offline.
      const message =
        error instanceof ChatbotApiError ? error.message : "Scheme assistant is unavailable.";
      setApiNotice(`${message} Falling back to a local match.`);

      const fallback = matchSchemeLocally(query);
      if (!fallback) {
        setApiNotice(`${message} No scheme in the offline list matched "${query}". Browse all schemes instead.`);
        return;
      }
      const newSessionId = createSession(
        fallback.id,
        user.name,
        query,
        offlineMatchMessage(query, fallback.name)
      );
      router.push(`/assistant?session=${newSessionId}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void runDecomposition();
  };

  const handleStartApplication = () => {
    void runDecomposition();
  };

  const handleVoiceRecord = () => voice.toggle();

  return (
    <div className="w-full bg-black/40 backdrop-blur-xl border border-white/10 hover:border-white/20 rounded-2xl p-8 sm:p-10 text-center space-y-4 shadow-[0_8px_32px_0_rgba(0,0,0,0.3)] hover:-translate-y-1 hover:shadow-[0_16px_48px_0_rgba(0,0,0,0.5)] transition-all duration-500">
      <div className="space-y-1">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
          {language === "mr"
            ? "तुमच्या डॅशबोर्डवर स्वागत आहे"
            : "Welcome to your Civic Dashboard"}
        </h1>
        <p className="text-sm text-gray-400 max-w-2xl mx-auto">
          {language === "mr"
            ? "स्थानिक शिक्षण शिष्यवृत्ती, शहरी गरीब आरोग्य योजना आणि पेरी-अर्बन कृषी लाभांची पडताळणी."
            : "Verify eligibility, check your documents for common errors, and prepare your application for ward desk submission."}
        </p>
      </div>

      <form onSubmit={handleSearchSubmit} className="max-w-2xl mx-auto pt-2">
        <div className="flex items-center rounded-md border border-[#333] bg-[#0a0a0a] shadow-sm overflow-hidden focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500">
          <div className="pl-4 text-gray-500">
            <Search className="w-5 h-5" />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              language === "mr"
                ? "आपली गरज प्रविष्ट करा (उदा. '१०वी पास ८२% शिष्यवृत्ती')..."
                : "Tell us what you need (e.g. 'Daughter scored 82% in 10th' or 'Hospital cover')..."
            }
            className="w-full text-sm px-3 py-3 bg-transparent text-white placeholder-gray-500 outline-none"
          />
          <button
            type="button"
            onClick={handleVoiceRecord}
            className={`px-4 py-3 border-l border-[#333] flex items-center space-x-1.5 text-xs font-medium transition-colors ${
              isRecording
                ? "bg-[#1a0505] text-red-500 animate-pulse"
                : "bg-[#111] text-gray-300 hover:bg-[#222]"
            }`}
          >
            <Mic className="w-4 h-4 text-emerald-500" />
            <span className="hidden sm:inline">
              {isRecording ? `Stop 0:${String(voice.seconds).padStart(2, "0")}` : voice.state === "transcribing" ? "Transcribing…" : "Voice"}
            </span>
          </button>
        </div>
        {voice.error && <p className="text-[11px] text-amber-400 mt-2 text-left">{voice.error}</p>}
        <p className="text-[11px] text-gray-500 mt-2 text-left">
          Try: &quot;Class 10 above 80%&quot;, &quot;Yellow ration card hospital cover&quot;, &quot;Street vendor loan&quot;
        </p>
      </form>

      {isSubmitting && (
        <p className="max-w-2xl mx-auto text-[11px] text-gray-400 text-left">
          Reading your request, matching PMC schemes, and checking eligibility…
        </p>
      )}

      {apiNotice && (
        <p className="max-w-2xl mx-auto text-[11px] text-amber-400 text-left leading-relaxed">
          {apiNotice}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
        <button
          onClick={handleStartApplication}
          disabled={isSubmitting}
          className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 disabled:cursor-not-allowed text-white text-xs font-semibold rounded shadow-subtle transition-colors flex items-center space-x-2"
        >
          {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          <span>{language === "mr" ? "नवीन अर्ज सुरू करा" : "Start Application"}</span>
          <ArrowRight className="w-4 h-4" />
        </button>
        <Link
          href="/schemes"
          className="px-5 py-2.5 bg-[#0a0a0a] hover:bg-[#111] text-gray-300 border border-[#333] text-xs font-semibold rounded shadow-subtle transition-colors"
        >
          {language === "mr" ? "सर्व योजना पहा" : "Browse All Schemes"}
        </Link>
      </div>
    </div>
  );
}

function ExploreCategories() {
  const { language, schemes } = useApp();
  
  return (
    <div className="space-y-4 w-full">
      <div className="flex items-center justify-between border-b border-[#222] pb-2">
        <h2 className="text-sm font-bold tracking-tight text-white uppercase">
          {language === "mr" ? "योजनांचे मुख्य विभाग" : "Explore by Category"}
        </h2>
        <Link href="/schemes" className="text-xs text-emerald-500 hover:text-emerald-400 font-medium">
          View All {schemes.length} Schemes →
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="bg-black/40 backdrop-blur-xl border border-white/10 hover:border-white/20 rounded-2xl p-5 shadow-[0_8px_32px_0_rgba(0,0,0,0.3)] hover:-translate-y-1 hover:shadow-[0_16px_48px_0_rgba(0,0,0,0.5)] flex flex-col justify-between transition-all duration-500">
          <div className="space-y-2">
            <div className="w-9 h-9 rounded bg-[#0a0a0a] text-emerald-500 flex items-center justify-center border border-[#333]">
              <GraduationCap className="w-5 h-5" />
            </div>
            <h3 className="font-semibold text-sm text-white">
              {language === "mr" ? "शैक्षणिक शिष्यवृत्ती" : "Education Grants"}
            </h3>
            <p className="text-xs text-gray-400 leading-relaxed">
              {categoryBlurb(schemes, "education", language)}
            </p>
          </div>
          <div className="pt-4 mt-2 border-t border-[#111]">
            <Link
              href="/schemes?category=education"
              className="text-xs font-semibold text-emerald-500 hover:text-emerald-400 flex items-center space-x-1"
            >
              <span>View Education Schemes</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        <div className="bg-black/40 backdrop-blur-xl border border-white/10 hover:border-white/20 rounded-2xl p-5 shadow-[0_8px_32px_0_rgba(0,0,0,0.3)] hover:-translate-y-1 hover:shadow-[0_16px_48px_0_rgba(0,0,0,0.5)] flex flex-col justify-between transition-all duration-500">
          <div className="space-y-2">
            <div className="w-9 h-9 rounded bg-[#0a0a0a] text-emerald-500 flex items-center justify-center border border-[#333]">
              <HeartPulse className="w-5 h-5" />
            </div>
            <h3 className="font-semibold text-sm text-white">
              {language === "mr" ? "आरोग्य व उपचार सवलत" : "Health & Hospital Care"}
            </h3>
            <p className="text-xs text-gray-400 leading-relaxed">
              {categoryBlurb(schemes, "healthcare", language)}
            </p>
          </div>
          <div className="pt-4 mt-2 border-t border-[#111]">
            <Link
              href="/schemes?category=healthcare"
              className="text-xs font-semibold text-emerald-500 hover:text-emerald-400 flex items-center space-x-1"
            >
              <span>View Health Schemes</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        <div className="bg-black/40 backdrop-blur-xl border border-white/10 hover:border-white/20 rounded-2xl p-5 shadow-[0_8px_32px_0_rgba(0,0,0,0.3)] hover:-translate-y-1 hover:shadow-[0_16px_48px_0_rgba(0,0,0,0.5)] flex flex-col justify-between transition-all duration-500">
          <div className="space-y-2">
            <div className="w-9 h-9 rounded bg-[#0a0a0a] text-emerald-500 flex items-center justify-center border border-[#333]">
              <Store className="w-5 h-5" />
            </div>
            <h3 className="font-semibold text-sm text-white">
              {language === "mr" ? "उपजीविका व स्वयंरोजगार" : "Livelihood & Self-Employment"}
            </h3>
            <p className="text-xs text-gray-400 leading-relaxed">
              Collateral-free PM SVANidhi working-capital loans for street vendors and hawkers.
            </p>
          </div>
          <div className="pt-4 mt-2 border-t border-[#111]">
            <Link
              href="/schemes?category=livelihood"
              className="text-xs font-semibold text-emerald-500 hover:text-emerald-400 flex items-center space-x-1"
            >
              <span>View Livelihood Schemes</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function ApplicationInProgress() {
  const { sessions } = useApp();
  const activeSession = sessions[0];

  if (!activeSession) {
    return (
      <div className="w-full space-y-4">
        <h2 className="text-sm font-bold tracking-tight text-white uppercase border-b border-[#222] pb-2">
          Application in Progress
        </h2>
        <div className="w-full bg-black/40 backdrop-blur-xl border border-white/10 border-dashed hover:border-white/20 rounded-2xl p-10 flex flex-col items-center justify-center text-center space-y-3 shadow-[0_8px_32px_0_rgba(0,0,0,0.3)] transition-all duration-500">
          <Inbox className="w-8 h-8 text-gray-600" />
          <p className="text-gray-400 text-sm">No active applications.</p>
          <Link href="/schemes" className="text-emerald-500 hover:text-emerald-400 text-xs font-semibold mt-2">
            Find a scheme to apply for →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-4">
      <h2 className="text-sm font-bold tracking-tight text-white uppercase border-b border-[#222] pb-2">
        Application in Progress
      </h2>
      <div className="w-full bg-black/40 backdrop-blur-xl text-white rounded-2xl p-6 border border-white/10 hover:border-white/20 shadow-[0_8px_32px_0_rgba(0,0,0,0.3)] hover:-translate-y-1 hover:shadow-[0_16px_48px_0_rgba(0,0,0,0.5)] transition-all duration-500 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center space-x-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
              Active Draft
            </span>
            <span className="text-gray-500 text-xs">•</span>
            <span className="text-xs text-gray-400 tabular-nums">
              {activeSession.documentsLeft} documents left to check
            </span>
          </div>
          <h4 className="font-semibold text-lg text-white">
            {activeSession.beneficiaryName} — {activeSession.schemeName}
          </h4>
          <p className="text-sm text-gray-500">
            Submission Desk: {activeSession.counterLocation}
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <Link
            href={`/assistant?session=${activeSession.id}`}
            className="px-6 py-3 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold rounded transition-colors whitespace-nowrap shadow-subtle"
          >
            Resume in Assistant →
          </Link>
        </div>
      </div>
    </div>
  );
}

function EmptyApplication() {
  return (
    <div className="w-full space-y-4">
      <h2 className="text-sm font-bold tracking-tight text-white uppercase border-b border-[#222] pb-2">
        Application in Progress
      </h2>
      <div className="w-full bg-black/40 backdrop-blur-xl border border-white/10 border-dashed hover:border-white/20 rounded-2xl p-10 flex flex-col items-center justify-center text-center space-y-3 shadow-[0_8px_32px_0_rgba(0,0,0,0.3)] transition-all duration-500">
        <Inbox className="w-8 h-8 text-gray-600" />
        <p className="text-gray-400 text-sm">Sign in to track your applications.</p>
        <Link href="/auth/signup" className="text-emerald-500 hover:text-emerald-400 text-xs font-semibold mt-2">
          Create an Account →
        </Link>
      </div>
    </div>
  );
}
