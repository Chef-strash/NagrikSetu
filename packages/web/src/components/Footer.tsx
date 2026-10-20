"use client";

import React from "react";
import Link from "next/link";
import { useApp } from "../lib/context/AppContext";
import { usePathname } from "next/navigation";
import Image from "next/image";

// Placeholder-free: items needing an address are hidden unless this env var is set.
const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || "";

export function Footer() {
  const pathname = usePathname();

  if (pathname === "/") return null;
  return <FooterContent />;
}

export function FooterContent() {
  const { language } = useApp();

  return (
    <footer className="bg-[#050505] border-t border-[#333] text-gray-400 text-xs py-8 mt-auto w-full">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 pb-8 border-b border-[#222]">
          <div className="md:col-span-2 space-y-2">
            <div className="flex items-center space-x-2 text-white font-semibold text-sm">
              <div className="w-5 h-5 rounded overflow-hidden flex items-center justify-center shrink-0">
                <Image src="/logo.jpg" alt="NagrikSetu Logo" width={20} height={20} className="object-cover scale-[1.6] origin-top" />
              </div>
              <span>NagrikSetu</span>
            </div>
            <p className="text-gray-500 text-xs leading-relaxed max-w-md">
              {language === "mr"
                ? "पुणे महानगरपालिकेतील नागरिकांसाठी स्थानिक थेट लाभ व सामाजिक विकास योजनांची माहिती व अर्ज तयारी सहाय्यक कक्ष. ही एक स्वतंत्र नागरिक सेवा आहे."
                : "Independent citizen facilitation portal for discovering municipal welfare schemes, checking documents, and preparing submissions for Pune Municipal Corporation ward desks."}
            </p>
            <p className="text-[11px] text-gray-600 pt-2">
              Disclaimer: NagrikSetu is an independent preparation tool for citizens with no official government affiliation. Final eligibility and disbursement are determined by municipal desk officers under the Maharashtra Municipal Corporations Act 1949.
            </p>
          </div>

          <div>
            <h4 className="font-semibold text-white text-xs mb-3">
              {language === "mr" ? "जलद कृती" : "Quick Actions"}
            </h4>
            <ul className="space-y-2 text-gray-400 text-xs">
              <li>
                <Link href="/schemes" className="hover:text-emerald-400 transition-colors">
                  {language === "mr" ? "नवीन अर्ज सुरू करा" : "Start New Application"}
                </Link>
              </li>
              <li>
                <Link href="/sessions" className="hover:text-emerald-400 transition-colors">
                  {language === "mr" ? "अर्जाची स्थिती तपासा" : "Check Draft Status"}
                </Link>
              </li>
              <li>
                <Link href="/profile" className="hover:text-emerald-400 transition-colors">
                  {language === "mr" ? "नागरिक प्रोफाइल अद्यतनित करा" : "Update Citizen Profile"}
                </Link>
              </li>
              <li>
                <span className="cursor-pointer hover:text-emerald-400 transition-colors">
                  {language === "mr" ? "कोरे फॉर्म डाउनलोड करा" : "Download Blank Forms"}
                </span>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-white text-xs mb-3">
              {language === "mr" ? "मदत व समर्थन" : "Help & Support"}
            </h4>
            <ul className="space-y-2 text-gray-400 text-xs">
              <li>
                <Link href="/schemes" className="hover:text-emerald-400 transition-colors">
                  {language === "mr" ? "कागदपत्रे मार्गदर्शक" : "Document Requirements Guide"}
                </Link>
              </li>
              <li>
                <Link href="/faqs" className="hover:text-emerald-400 transition-colors">
                  {language === "mr" ? "सामान्य प्रश्न (FAQ)" : "FAQ & Common Issues"}
                </Link>
              </li>
              <li>
                <Link href="/assistant" className="hover:text-emerald-400 transition-colors">
                  {language === "mr" ? "असिस्टंट कसे वापरावे?" : "How to use the Assistant"}
                </Link>
              </li>
              {SUPPORT_EMAIL && (
                <li>
                  <a href={`mailto:${SUPPORT_EMAIL}`} className="hover:text-emerald-400 transition-colors">
                    {language === "mr" ? "तक्रार निवारण संपर्क" : "Contact Grievance Redressal"}
                  </a>
                </li>
              )}
            </ul>
          </div>
        </div>

        <div className="pt-4 flex flex-col sm:flex-row items-center justify-between text-gray-500 text-[11px]">
          <p>© 2026 NagrikSetu. Built for Urban Local Bodies.</p>
          <div className="flex space-x-4 mt-2 sm:mt-0">
            <Link href="/schemes" className="hover:text-gray-200 transition-colors">
              All Schemes
            </Link>
            <Link href="/faqs" className="hover:text-gray-200 transition-colors">
              FAQs
            </Link>
            <Link href="/reviews" className="hover:text-gray-200 transition-colors">
              Reviews
            </Link>
            <Link href="/profile" className="hover:text-gray-200 transition-colors">
              Citizen Profile
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
