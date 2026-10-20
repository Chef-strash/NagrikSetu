"use client";

import React, { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { safeNextPath } from "../../../lib/auth/next-path";
import Link from "next/link";
import { useApp } from "../../../lib/context/AppContext";
import { ArrowRight, Mail, KeyRound, ShieldCheck } from "lucide-react";
import {
  AuthShell,
  AuthHeading,
  AuthStepRail,
  AuthField,
  OtpInput,
  AuthError,
  AuthNote,
  AUTH_PRIMARY_BTN,
  AUTH_GHOST_BTN,
} from "../../../components/AuthShell";

export default function SignInPage() {
  return (
    <Suspense fallback={null}>
      <SignInPageInner />
    </Suspense>
  );
}

function SignInPageInner() {
  const router = useRouter();
  const { requestOtp, verifyOtp, login, language, isAuthenticated } = useApp();
  const searchParams = useSearchParams();
  const next = safeNextPath(searchParams.get("next"));
  const [busy, setBusy] = useState(false);
  const demo = !process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_DEMO_AUTH === "true";

  React.useEffect(() => {
    if (isAuthenticated) router.replace(next);
  }, [isAuthenticated, next, router]);
  const mr = language === "mr";

  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"email" | "otp">("email");
  const [error, setError] = useState("");

  const emailLooksValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailLooksValid) {
      setError(mr ? "कृपया वैध ईमेल पत्ता प्रविष्ट करा." : "Enter a valid email address.");
      return;
    }
    setError("");
    setOtp("");
    if (demo) {
      setStep("otp");
      return;
    }
    setBusy(true);
    const { error: err } = await requestOtp(email, false);
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    setStep("otp");
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length < 6) {
      setError(
        mr ? "सत्यापन कोड प्रविष्ट करा (किमान ६ अंक)." : "Enter the verification code (at least 6 digits)."
      );
      return;
    }
    setError("");
    if (demo) {
      login("Citizen User", email);
      router.push(next);
      return;
    }
    setBusy(true);
    const { error: err } = await verifyOtp(email, otp);
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    router.push(next);
  };

  const backToEmail = () => {
    setStep("email");
    setOtp("");
    setError("");
  };

  return (
    <AuthShell>
      <AuthHeading
        title={mr ? "साइन इन करा" : "Sign in to NagrikSetu"}
        subtitle={
          mr
            ? "तुमचा नागरिक डॅशबोर्ड उघडण्यासाठी ईमेलवर पाठवलेला एक-वेळ कोड वापरा."
            : "Use a one-time code sent to your email to open your civic dashboard."
        }
      />

      <div className="mt-7">
        <AuthStepRail
          steps={[mr ? "ईमेल" : "Email", mr ? "सत्यापन" : "Verify"]}
          current={step === "email" ? 0 : 1}
        />

        {step === "email" ? (
          <form key="email" className="ww-rise space-y-5" onSubmit={handleRequestOtp} noValidate>
            <AuthField
              id="email"
              type="email"
              label={mr ? "ईमेल पत्ता" : "Email address"}
              placeholder="you@example.com"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              icon={<Mail className="h-4 w-4" />}
              hint={
                mr
                  ? "आम्ही पासवर्ड कधीही विचारत नाही; फक्त एक-वेळ कोड पाठवतो."
                  : "We never ask for a password. Only a one-time code is sent."
              }
            />

            <AuthError>{error}</AuthError>

            <button type="submit" className={AUTH_PRIMARY_BTN} disabled={busy}>
              {mr ? "कोड पाठवा" : "Send verification code"}
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>
        ) : (
          <form key="otp" className="ww-rise space-y-5" onSubmit={handleVerifyOtp} noValidate>
            <OtpInput value={otp} onChange={setOtp} />

            <AuthNote>
              {mr ? "कोड पाठवला: " : "Code sent to "}
              <span className="font-medium text-gray-200">{email}</span>
              {" · "}
              <button
                type="button"
                onClick={backToEmail}
                className="font-medium text-emerald-500 hover:text-emerald-400"
              >
                {mr ? "बदला" : "Change"}
              </button>
            </AuthNote>

            <AuthError>{error}</AuthError>

            <button type="submit" className={AUTH_PRIMARY_BTN} disabled={otp.length < 6 || busy}>
              <KeyRound className="h-4 w-4" />
              {mr ? "सत्यापित करा आणि साइन इन करा" : "Verify & Sign In"}
            </button>

            <button type="button" className={AUTH_GHOST_BTN} onClick={backToEmail}>
              {mr ? "वेगळा ईमेल वापरा" : "Use a different email"}
            </button>
          </form>
        )}

        <div className="mt-6 border-t border-[#1a1a1a] pt-4 text-center">
          <p className="text-xs text-gray-500">
            {mr ? "खाते नाहीये?" : "Don't have an account?"}{" "}
            <Link
              href="/auth/signup"
              className="font-medium text-emerald-500 hover:text-emerald-400"
            >
              {mr ? "येथे नोंदणी करा" : "Sign up here"}
            </Link>
          </p>
        </div>

        <p className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-gray-600">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-500/70" />
          {mr
            ? "ईमेल पत्ता कोणत्याही शासकीय नोंदीशी जोडला जात नाही."
            : "Your email is never tied to any statutory record."}
        </p>
      </div>
    </AuthShell>
  );
}

