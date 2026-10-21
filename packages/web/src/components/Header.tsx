"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { useApp } from "../lib/context/AppContext";
import { WARDS } from "../lib/data/wards";
import { loadWards } from "../lib/data/wards-remote";
import { MapPin, User, LogOut, ChevronDown } from "lucide-react";

/** Skip-login builds (`NEXT_PUBLIC_AUTO_LOGIN=true`) have no real session to end. */
const AUTO_LOGIN = process.env.NEXT_PUBLIC_AUTO_LOGIN === "true";

export function Header() {
  const { user, isAuthenticated, logout, language, toggleLanguage, saveProfile, authLoading, authEmail } = useApp();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showWardMenu, setShowWardMenu] = useState(false);
  const [wards, setWards] = useState<string[]>(WARDS);
  useEffect(() => {
    void loadWards().then(setWards);
  }, []);
  const menuRef = useRef<HTMLDivElement>(null);
  const wardMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
      if (wardMenuRef.current && !wardMenuRef.current.contains(event.target as Node)) {
        setShowWardMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Navigation logic has been moved to Sidebar.tsx
  // Modal removed in favor of dedicated auth pages

  return (
    <>
      <header className="bg-[#0a0a0a] border-b border-[#222] text-white select-none">
        {/* Top Authority & Location Bar */}
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between text-sm">
          <div className="flex items-center space-x-3">
            {/* Show logo only on mobile since desktop has sidebar */}
            <Link href="/" className="md:hidden w-8 h-8 rounded overflow-hidden flex items-center justify-center shrink-0">
              <Image src="/logo.jpg" alt="NagrikSetu Logo" width={32} height={32} className="object-cover scale-[1.6] origin-top" />
            </Link>
            <div className="flex flex-col">
              <div className="flex items-center space-x-2">
                <span className="font-semibold tracking-tight text-white text-base md:hidden">NagrikSetu</span>
                <span className="text-gray-400 text-xs font-medium">
                  {language === "mr" ? "पुणे महानगरपालिका योजना कक्ष" : "Pune Municipal Schemes Guide"}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-5">
            {/* Active Ward */}
            {isAuthenticated && (
              <div className="relative" ref={wardMenuRef}>
                <button
                  onClick={() => setShowWardMenu(!showWardMenu)}
                  className="flex items-center justify-between space-x-1.5 text-xs text-gray-400 bg-[#1a1a1a]/80 px-2.5 py-1 rounded border border-[#333] hover:border-[#444] transition-colors group w-48"
                >
                  <div className="flex items-center space-x-1.5 truncate">
                    <MapPin className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span className="truncate group-hover:text-white transition-colors">{user.ward}</span>
                  </div>
                  <ChevronDown className="w-3 h-3 text-gray-600 shrink-0" />
                </button>

                {showWardMenu && (
                  <div className="absolute top-full left-0 mt-1 w-56 bg-[#050505] text-white rounded-md shadow-card border border-[#333] py-1 z-50 animate-in fade-in duration-100">
                    {wards.map((w) => (
                      <button
                        key={w}
                        onClick={() => {
                          void saveProfile({ ward: w });
                          setShowWardMenu(false);
                        }}
                        className={`w-full text-left px-3 py-2 text-xs transition-colors truncate ${
                          user.ward === w ? "text-emerald-500 bg-[#111]" : "text-gray-300 hover:bg-black hover:text-white"
                        }`}
                      >
                        {w}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Language Switcher */}
            <button
              onClick={toggleLanguage}
              className="text-xs font-medium text-gray-300 hover:text-white transition-colors px-2 py-1 rounded hover:bg-[#1a1a1a] border border-transparent hover:border-[#333]"
              title="Switch Language"
            >
              {language === "mr" ? "English" : "मराठी"}
            </button>

            {/* User Auth Section */}
            {authLoading ? null : isAuthenticated ? (
              <div className="relative" ref={menuRef}>
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="flex items-center space-x-2 text-xs font-medium text-gray-200 hover:text-white bg-[#1a1a1a] px-3 py-1.5 rounded border border-[#333] transition-colors"
                >
                  <User className="w-3.5 h-3.5 text-gray-600" />
                  <span>{user.name.split(" ")[0] || authEmail?.split("@")[0] || "Account"}</span>
                  <ChevronDown className="w-3 h-3 text-gray-600" />
                </button>

                {showUserMenu && (
                  <div className="absolute right-0 mt-2 w-48 bg-[#050505] text-white rounded-md shadow-card border border-[#333] py-1.5 z-50 animate-in fade-in duration-100">
                    <div className="px-3 py-2 border-b border-[#222]">
                      <p className="text-xs font-semibold text-white truncate">{user.name || authEmail}</p>
                      <p className="text-[11px] text-gray-500 truncate">{user.mobile}</p>
                    </div>
                    <Link
                      href="/profile"
                      onClick={() => setShowUserMenu(false)}
                      className="block px-3 py-2 text-xs text-gray-300 hover:bg-black hover:text-white transition-colors"
                    >
                      {language === "mr" ? "नागरिक नोंदणी व पात्रता" : "Citizen Profile"}
                    </Link>
                    <Link
                      href="/sessions"
                      onClick={() => setShowUserMenu(false)}
                      className="block px-3 py-2 text-xs text-gray-300 hover:bg-black hover:text-white transition-colors"
                    >
                      {language === "mr" ? "माझे सक्रिय अर्ज" : "My Sessions"}
                    </Link>
                    {!AUTO_LOGIN && (
                      <>
                        <div className="border-t border-[#222] my-1"></div>
                        <button
                          onClick={() => {
                            logout();
                            setShowUserMenu(false);
                          }}
                          className="w-full text-left flex items-center space-x-2 px-3 py-2 text-xs text-red-500 hover:bg-[#1a0505] transition-colors"
                        >
                          <LogOut className="w-3.5 h-3.5" />
                          <span>{language === "mr" ? "साइन आउट" : "Sign Out"}</span>
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center space-x-2">
                <Link
                  href="/auth/signin"
                  className="text-xs font-medium text-gray-300 hover:text-white px-3 py-1.5 rounded transition-colors"
                >
                  {language === "mr" ? "साइन इन" : "Sign In"}
                </Link>
                <Link
                  href="/auth/signup"
                  className="text-xs font-semibold bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1.5 rounded transition-colors"
                >
                  {language === "mr" ? "नोंदणी" : "Sign Up"}
                </Link>
              </div>
            )}
          </div>
        </div>

      </header>
      {/* Sign In Modal removed */}
    </>
  );
}
