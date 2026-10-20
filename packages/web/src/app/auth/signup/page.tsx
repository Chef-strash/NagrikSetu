"use client";

import React, { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useApp } from "../../../lib/context/AppContext";
import {
  ArrowRight,
  ArrowLeft,
  Mail,
  KeyRound,
  Check,
  User,
  Phone,
  MapPin,
  Building2,
  Wallet,
  BadgeCheck,
  Landmark,
  IndianRupee,
} from "lucide-react";
import {
  AuthShell,
  AuthHeading,
  AuthStepRail,
  AuthField,
  AuthSelect,
  AuthSection,
  AuthRadioGroup,
  AuthCheckbox,
  OtpInput,
  AuthError,
  AuthNote,
  AUTH_PRIMARY_BTN,
  AUTH_GHOST_BTN,
} from "../../../components/AuthShell";

import { WARDS, HOSPITALS } from "../../../lib/data/wards";
import { loadWards, loadHospitals } from "../../../lib/data/wards-remote";
import { safeNextPath } from "../../../lib/auth/next-path";

/* Value/label pairs, copied from /profile. There the stored value is the short
   code while the label is the full expansion, so both must be carried. */
const CATEGORIES = [
  { value: "Open / General", label: "Open / General" },
  { value: "OBC", label: "OBC (Other Backward Class)" },
  { value: "SC", label: "SC (Scheduled Caste)" },
  { value: "ST", label: "ST (Scheduled Tribe)" },
  { value: "VJNT", label: "VJNT (Nomadic Tribes)" },
  { value: "EWS", label: "EWS (Economically Weaker Section)" },
];

const DOMICILE = [
  { value: "", label: "Select" },
  { value: "1", label: "1 Year" },
  { value: "2", label: "2 Years" },
  { value: "3", label: "3 Years (Meets statutory norm)" },
  { value: "5", label: "5+ Years" },
];

const RATION_CARDS = [
  "Yellow (BPL)",
  "Orange (APL Low-Income)",
  "White (Above 1 Lakh)",
  "None",
];

/* The trailing space on the first entry is deliberate: /profile stores that
   exact string, so changing it here would make a saved value fail to match any
   option when the citizen later opens the profile screen. */
const DISABILITY_OPTIONS = [
  { value: "None", label: "None" },
  { value: "Visual Impairment (40%+) ", label: "Visual Impairment (40%+)" },
  { value: "Locomotor Disability (40%+)", label: "Locomotor Disability (40%+)" },
  { value: "Hearing Impairment (40%+)", label: "Hearing Impairment (40%+)" },
  { value: "Other Disability (UDID Holder)", label: "Other Disability (UDID Holder)" },
];

export default function SignUpPage() {
  return (
    <Suspense fallback={null}>
      <SignUpPageInner />
    </Suspense>
  );
}

function SignUpPageInner() {
  const router = useRouter();
  const { requestOtp, verifyOtp, saveProfile, login, updateUser, language } = useApp();
  const searchParams = useSearchParams();
  const next = safeNextPath(searchParams.get("next"));
  const [busy, setBusy] = useState(false);
  const demo = !process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_DEMO_AUTH === "true";
  const [wards, setWards] = useState<string[]>(WARDS);
  const [hospitals, setHospitals] = useState(HOSPITALS);
  React.useEffect(() => {
    void loadWards().then((w) => {
      setWards(w);
      setWard((cur) => (w.includes(cur) ? cur : w[0]));
    });
    void loadHospitals().then(setHospitals);
  }, []);
  const mr = language === "mr";

  const [step, setStep] = useState<"email" | "otp" | "profile">("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");

  // Household mini-KYC. Every field here also exists on /profile, with the same
  // defaults, so completing signup and editing the profile produce one record.
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [ward, setWard] = useState(WARDS[0]);
  const [income, setIncome] = useState("");
  const [domicileYears, setDomicileYears] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0].value);
  const [rationCard, setRationCard] = useState(RATION_CARDS[1]);
  const [dbtEnabled, setDbtEnabled] = useState(true);
  const [disabilityStatus, setDisabilityStatus] = useState(DISABILITY_OPTIONS[0].value);
  const [hasProduceVendor, setHasProduceVendor] = useState(false);
  const [empaneledHospitals, setEmpaneledHospitals] = useState<string[]>([]);

  const toggleHospital = (hospitalName: string) =>
    setEmpaneledHospitals((prev) =>
      prev.includes(hospitalName)
        ? prev.filter((h) => h !== hospitalName)
        : [...prev, hospitalName]
    );

  const emailLooksValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailLooksValid) {
      setError(mr ? "कृपया वैध ईमेल पत्ता प्रविष्ट करा." : "Enter a valid email address.");
      return;
    }
    setError("");
    setOtp("");
    if (!demo) {
      setBusy(true);
      const { error: err } = await requestOtp(email, true);
      setBusy(false);
      if (err) {
        setError(err);
        return;
      }
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
    if (!demo) {
      setBusy(true);
      const { error: err } = await verifyOtp(email, otp);
      setBusy(false);
      if (err) {
        setError(err);
        return;
      }
    }
    setStep("profile");
  };

  const handleCompleteSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !mobile.trim() || !income.trim()) {
      setError(
        mr
          ? "कृपया नाव, मोबाइल क्रमांक आणि वार्षिक उत्पन्न भरा."
          : "Enter your name, mobile number and annual income."
      );
      return;
    }
    if (!domicileYears) {
      setError(mr ? "कृपया पुण्यातील वास्तव्याचा कालावधी निवडा." : "Select how long you have lived in Pune.");
      return;
    }
    setError("");
    const profile = {
      name,
      mobile,
      ward,
      income: Number(income),
      domicileYears: Number(domicileYears),
      category,
      rationCard,
      dbtEnabled,
      disabilityStatus,
      hasProduceVendor,
      empaneledHospitals,
    };
    if (demo) {
      updateUser(profile);
      login(name, mobile);
      router.push(next);
      return;
    }
    setBusy(true);
    const { error: err } = await saveProfile(profile);
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    router.push(next);
  };

  const stepIndex = step === "email" ? 0 : step === "otp" ? 1 : 2;

  return (
    <AuthShell width={step === "profile" ? "2xl" : "md"}>
      <AuthHeading
        title={mr ? "नवीन खाते उघडा" : "Create your NagrikSetu account"}
        subtitle={
          step === "profile"
            ? mr
              ? "पात्र योजना शोधण्यासाठी तुमची नागरिक माहिती पूर्ण करा."
              : "Complete your civic profile to discover the schemes you qualify for."
            : mr
              ? "महानगरपालिका अर्ज सुरक्षितपणे सांभाळण्यासाठी ईमेलची पडताळणी करा."
              : "Verify your email so your municipal applications stay tied to you."
        }
      />

      <div className="mt-7">
        <AuthStepRail
          steps={[
            mr ? "ईमेल" : "Email",
            mr ? "सत्यापन" : "Verify",
            mr ? "माहिती" : "Profile",
          ]}
          current={stepIndex}
        />

        {/* STEP 1 — EMAIL */}
        {step === "email" && (
          <form key="email" className="ww-rise space-y-5" onSubmit={handleRequestOtp} noValidate>
            <AuthField
              id="signup-email"
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

            <div className="border-t border-[#1a1a1a] pt-4 text-center">
              <p className="text-xs text-gray-500">
                {mr ? "आधीच खाते आहे?" : "Already have an account?"}{" "}
                <Link
                  href="/auth/signin"
                  className="font-medium text-emerald-500 hover:text-emerald-400"
                >
                  {mr ? "साइन इन करा" : "Sign in"}
                </Link>
              </p>
            </div>
          </form>
        )}

        {/* STEP 2 — OTP */}
        {step === "otp" && (
          <form key="otp" className="ww-rise space-y-5" onSubmit={handleVerifyOtp} noValidate>
            <OtpInput value={otp} onChange={setOtp} />

            <AuthNote>
              {mr ? "कोड पाठवला: " : "Code sent to "}
              <span className="font-medium text-gray-200">{email}</span>
              {" · "}
              <button
                type="button"
                onClick={() => {
                  setStep("email");
                  setError("");
                }}
                className="font-medium text-emerald-500 hover:text-emerald-400"
              >
                {mr ? "बदला" : "Change email"}
              </button>
            </AuthNote>

            <AuthError>{error}</AuthError>

            <button type="submit" className={AUTH_PRIMARY_BTN} disabled={otp.length < 6 || busy}>
              <KeyRound className="h-4 w-4" />
              {mr ? "कोड सत्यापित करा" : "Verify code"}
            </button>

            <button
              type="button"
              className={AUTH_GHOST_BTN}
              onClick={() => {
                setStep("email");
                setOtp("");
                setError("");
              }}
            >
              {mr ? "वेगळा ईमेल वापरा" : "Use a different email"}
            </button>
          </form>
        )}

        {/* STEP 3 — HOUSEHOLD PROFILE. Sections 1-3 mirror the numbered cards
            on /profile, so the citizen meets the same document twice. */}
        {step === "profile" && (
          <form
            key="profile"
            className="ww-rise space-y-5"
            onSubmit={handleCompleteSignup}
            noValidate
          >
            <AuthNote tone="affirmative">
              {mr
                ? "ईमेल सत्यापित झाला. आता तुमची नागरिक माहिती भरा."
                : "Email verified. Now let us set up your civic profile."}
            </AuthNote>

            <AuthSection
              index={1}
              icon={<MapPin className="h-3.5 w-3.5" />}
              title={mr ? "१. कुटुंब व कार्यक्षेत्र तपशील" : "1. Household & Jurisdiction Details"}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <AuthField
                  id="signup-name"
                  label={mr ? "पूर्ण नाव (ओळखपत्राप्रमाणे)" : "Full name (as on identity)"}
                  placeholder={mr ? "उदा. रमेश पाटील" : "e.g. Ramesh Patil"}
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  icon={<User className="h-4 w-4" />}
                />

                <AuthField
                  id="signup-mobile"
                  type="tel"
                  label={mr ? "मोबाइल क्रमांक" : "Mobile number"}
                  placeholder="+91 98220 00000"
                  autoComplete="tel"
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                  icon={<Phone className="h-4 w-4" />}
                />

                <AuthSelect
                  id="signup-ward"
                  label={mr ? "प्रशासकीय प्रभाग" : "Administrative ward"}
                  value={ward}
                  onChange={(e) => setWard(e.target.value)}
                  hint={
                    mr
                      ? "प्रभाग ठरवतो की तुमचा अर्ज कोणत्या कार्यालयात जाईल."
                      : "The ward decides which counter your application is filed at."
                  }
                >
                  {wards.map((w) => (
                    <option key={w} value={w}>
                      {w}
                    </option>
                  ))}
                </AuthSelect>

                <AuthField
                  id="signup-income"
                  type="number"
                  inputMode="numeric"
                  label={mr ? "वार्षिक कौटुंबिक उत्पन्न (रु.)" : "Annual household income (Rs.)"}
                  placeholder="150000"
                  value={income}
                  onChange={(e) => setIncome(e.target.value)}
                  icon={<IndianRupee className="h-4 w-4" />}
                  hint={
                    mr
                      ? "तहसीलदार प्रमाणपत्राप्रमाणे."
                      : "As per Tahsildar certificate."
                  }
                />

                <AuthSelect
                  id="signup-domicile"
                  label={mr ? "पुण्यातील सतत वास्तव्य" : "Continuous Pune domicile"}
                  value={domicileYears}
                  onChange={(e) => setDomicileYears(e.target.value)}
                >
                  {DOMICILE.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </AuthSelect>

                <AuthSelect
                  id="signup-category"
                  label={mr ? "सामाजिक प्रवर्ग" : "Social category"}
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </AuthSelect>
              </div>
            </AuthSection>

            <AuthSection
              index={2}
              icon={<Wallet className="h-3.5 w-3.5" />}
              title={mr ? "२. कल्याण व उपजीविका स्थिती" : "2. Welfare & Livelihood Status"}
            >
              <div className="space-y-4">
                <AuthRadioGroup
                  label={mr ? "शिधापत्रिका प्रवर्ग:" : "Ration card category:"}
                  name="signup-ration"
                  value={rationCard}
                  onChange={setRationCard}
                  options={RATION_CARDS.map((r) => ({ value: r, label: r }))}
                  hint={
                    mr
                      ? "रंग शिधापत्रिका अनेक महानगरपालिका योजनांची पूर्वअट आहे."
                      : "Card colour is a hard precondition on several PMC schemes."
                  }
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-[#1c1c1c] pt-4">
                  <AuthRadioGroup
                    label={
                      mr
                        ? "आधारशी जोडलेले बँक खाते (DBT)?"
                        : "Bank account linked to Aadhaar (DBT)?"
                    }
                    name="signup-dbt"
                    value={dbtEnabled ? "yes" : "no"}
                    onChange={(next) => setDbtEnabled(next === "yes")}
                    options={[
                      {
                        value: "yes",
                        label: mr ? "हो (NPCI जोडलेले)" : "Yes (NPCI Mapped)",
                      },
                      {
                        value: "no",
                        label: mr ? "नाही / माहीत नाही" : "No / Don't Know",
                        accent: "accent-red-500",
                      },
                    ]}
                    hint={
                      mr
                        ? "थेट लाभ हस्तांतरणासाठी आधार-जोडलेले खाते आवश्यक आहे."
                        : "Direct benefit transfers require an Aadhaar-seeded account."
                    }
                  />

                  <AuthSelect
                    id="signup-disability"
                    label={mr ? "अपंगत्व स्थिती (दिव्यांगजन)" : "Disability status (Divyangjan)"}
                    value={disabilityStatus}
                    onChange={(e) => setDisabilityStatus(e.target.value)}
                  >
                    {DISABILITY_OPTIONS.map((d) => (
                      <option key={d.value} value={d.value}>
                        {d.label}
                      </option>
                    ))}
                  </AuthSelect>
                </div>

                <div className="border-t border-[#1c1c1c] pt-4">
                  <AuthCheckbox
                    id="signup-vendor"
                    label={
                      mr
                        ? "पथविक्रेता किंवा साप्ताहिक बाजारातील फेरीवाला (PM SVANidhi)"
                        : "Street vendor or weekly-market hawker (PM SVANidhi)"
                    }
                    checked={hasProduceVendor}
                    onChange={setHasProduceVendor}
                    hint={
                      mr
                        ? "निवडल्यास कर्ज व उपजीविका योजना दिसतील."
                        : "Unlocks the street-vendor loan and livelihood schemes."
                    }
                  />
                </div>
              </div>
            </AuthSection>

            <AuthSection
              index={3}
              icon={<Building2 className="h-3.5 w-3.5" />}
              title={
                mr
                  ? "३. जवळची एम्पॅनेल्ड रुग्णालये"
                  : "3. Nearest Empaneled Hospitals"
              }
              description={
                mr
                  ? "तुमचे कुटुंब ज्या रुग्णालयांना भेट देते ती निवडा. सहाय्यक या रुग्णालयांची एम्पॅनेलमेंट तपासतो. (ऐच्छिक)"
                  : "Select the hospitals your family visits. The assistant verifies treatment empanelment for these facilities. (Optional)"
              }
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {hospitals.map((hosp) => {
                  const isSelected = empaneledHospitals.includes(hosp.name);
                  return (
                    <button
                      key={hosp.name}
                      type="button"
                      onClick={() => toggleHospital(hosp.name)}
                      aria-pressed={isSelected}
                      className={`flex items-start gap-2.5 rounded border p-3 text-left transition-colors ${
                        isSelected
                          ? "border-emerald-500 bg-emerald-500/10"
                          : "border-[#333] bg-[#050505] hover:border-[#444]"
                      }`}
                    >
                      <span
                        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border transition-colors ${
                          isSelected
                            ? "border-emerald-500 bg-emerald-500"
                            : "border-[#444]"
                        }`}
                      >
                        {isSelected && (
                          <Check className="h-3 w-3 text-black" strokeWidth={3} />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs font-semibold text-white">
                          {hosp.name}
                        </span>
                        <span className="block text-[11px] text-gray-500">{hosp.area}</span>
                        <span className="block text-[11px] font-medium text-emerald-500">
                          {hosp.type}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </AuthSection>

            <AuthError>{error}</AuthError>

            <button type="submit" className={AUTH_PRIMARY_BTN} disabled={busy}>
              <BadgeCheck className="h-4 w-4" />
              {mr ? "सेटअप पूर्ण करा आणि डॅशबोर्ड उघडा" : "Complete setup & open dashboard"}
            </button>

            <button
              type="button"
              className={AUTH_GHOST_BTN}
              onClick={() => {
                setStep("otp");
                setError("");
              }}
            >
              <ArrowLeft className="h-4 w-4" />
              {mr ? "मागे" : "Back"}
            </button>

            <p className="flex items-start justify-center gap-1.5 text-center text-[11px] text-gray-600">
              <Landmark className="mt-px h-3.5 w-3.5 shrink-0 text-gray-600" />
              {mr
                ? "ही माहिती फक्त पात्रता तपासण्यासाठी वापरली जाते आणि ती कधीही शासकीय निकषांशी जोडली जात नाही."
                : "Used only to check eligibility. Never linked to any statutory record."}
            </p>
          </form>
        )}
      </div>
    </AuthShell>
  );
}
