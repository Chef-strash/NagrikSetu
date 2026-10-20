"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useSearchParams } from "next/navigation";
import { useApp } from "../lib/context/AppContext";
import { Home, List, FolderOpen, UserCircle, ChevronDown, ChevronRight, GraduationCap, HeartPulse, Store } from "lucide-react";

export function Sidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { isAuthenticated, language, sessions } = useApp();
  
  // Keep schemes dropdown open if we are in the schemes route
  const [isSchemesOpen, setIsSchemesOpen] = useState(pathname.startsWith("/schemes"));

  // Ensure it opens automatically if we navigate to schemes from elsewhere
  useEffect(() => {
    if (pathname.startsWith("/schemes")) {
      setIsSchemesOpen(true);
    }
  }, [pathname]);

  const categoryParam = searchParams.get("category");

  const navLinks = [
    { id: "home", href: "/", label: language === "mr" ? "मुख्यपृष्ठ" : "Home", icon: <Home className="w-5 h-5" /> },
    { 
      id: "schemes", 
      href: "/schemes", 
      label: language === "mr" ? "योजना सूची" : "Schemes", 
      icon: <List className="w-5 h-5" />,
      subLinks: [
        { href: "/schemes", queryCategory: null, label: language === "mr" ? "सर्व योजना" : "All Schemes", icon: <List className="w-4 h-4" /> },
        { href: "/schemes?category=education", queryCategory: "education", label: language === "mr" ? "शिक्षण" : "Education Grants", icon: <GraduationCap className="w-4 h-4" /> },
        { href: "/schemes?category=healthcare", queryCategory: "healthcare", label: language === "mr" ? "आरोग्य" : "Health & Care", icon: <HeartPulse className="w-4 h-4" /> },
        { href: "/schemes?category=livelihood", queryCategory: "livelihood", label: language === "mr" ? "उपजीविका" : "Livelihood", icon: <Store className="w-4 h-4" /> },
      ]
    },
    ...(isAuthenticated ? [
      {
        id: "sessions",
        href: "/sessions",
        label: language === "mr" ? "सक्रिय अर्ज" : "Sessions",
        icon: <FolderOpen className="w-5 h-5" />,
        badge: sessions.length > 0 ? sessions.length : undefined
      },
      { id: "profile", href: "/profile", label: language === "mr" ? "नागरिक नोंदणी" : "Profile", icon: <UserCircle className="w-5 h-5" /> }
    ] : [])
  ];

  return (
    <aside className="w-64 bg-[#050505] border-r border-[#222] flex-col hidden md:flex shrink-0">
      <div className="h-16 flex items-center px-6 border-b border-[#222]">
        <Link href="/" className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded overflow-hidden flex items-center justify-center shrink-0">
            <Image src="/logo.jpg" alt="NagrikSetu Logo" width={32} height={32} className="object-cover scale-[1.6] origin-top" />
          </div>
          <span className="font-semibold tracking-tight text-white text-lg">NagrikSetu</span>
        </Link>
      </div>

      <nav className="flex-1 py-6 px-4 space-y-2 overflow-y-auto">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-3">
          {language === "mr" ? "मेनू" : "Menu"}
        </div>
        
        {navLinks.map((link) => {
          // Normal link rendering
          if (!link.subLinks) {
            const isActive = pathname === link.href || (link.href !== "/" && pathname.startsWith(link.href));
            return (
              <Link
                key={link.id}
                href={link.href}
                className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                    : "text-gray-400 hover:bg-[#111] hover:text-gray-200 border border-transparent"
                }`}
              >
                <div className="flex items-center space-x-3">
                  {link.icon}
                  <span>{link.label}</span>
                </div>
                {link.badge !== undefined && (
                  <span className="bg-emerald-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full tabular-nums">
                    {link.badge}
                  </span>
                )}
              </Link>
            );
          }

          // Link with subLinks (Schemes dropdown)
          const isParentActive = pathname.startsWith(link.href);
          
          return (
            <div key={link.id} className="space-y-1">
              <div 
                className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer ${
                  isParentActive && !isSchemesOpen
                    ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                    : "text-gray-400 hover:bg-[#111] hover:text-gray-200 border border-transparent"
                }`}
                onClick={() => setIsSchemesOpen(!isSchemesOpen)}
              >
                <div className="flex items-center space-x-3">
                  {link.icon}
                  <span>{link.label}</span>
                </div>
                {isSchemesOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </div>
              
              {/* Dropdown Content */}
              {isSchemesOpen && (
                <div className="pl-9 pr-2 py-1 space-y-1 animate-in slide-in-from-top-2 duration-200 fade-in">
                  {link.subLinks.map((sub) => {
                    // It's active if it matches the current category, or if it's the "All Schemes" link and there is no category
                    const isSubActive = pathname === "/schemes" && 
                      ((sub.queryCategory === null && !categoryParam) || (categoryParam === sub.queryCategory));
                    
                    return (
                      <Link
                        key={sub.label}
                        href={sub.href}
                        className={`flex items-center space-x-3 px-3 py-2 rounded-md text-xs font-medium transition-colors ${
                          isSubActive
                            ? "bg-emerald-500/10 text-emerald-400"
                            : "text-gray-400 hover:bg-[#1a1a1a] hover:text-gray-200"
                        }`}
                      >
                        <span className={`${isSubActive ? "text-emerald-500" : "text-gray-500"}`}>
                          {sub.icon}
                        </span>
                        <span>{sub.label}</span>
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>
      

    </aside>
  );
}
