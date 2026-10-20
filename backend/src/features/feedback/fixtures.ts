// Offline fixtures for the feedback feature (Protocol 5: hackathon resilience).
// Mirrors `packages/web/src/lib/data/faqs.ts` and the migration 003 seed rows so
// the API answers identically with or without Supabase. Every answer is derived
// only from the scheme's own stored fields; no invented rules.

import type { Faq, SchemeReview } from "./types.ts";

interface RawFaq {
  q: string;
  a: string;
  lang?: string;
}

function makeFaqs(slug: string, entries: RawFaq[]): Faq[] {
  return entries.map((e, i) => ({
    id: `faq-${slug}-${i + 1}`,
    schemeId: slug,
    question: e.q,
    answer: e.a,
    languageCode: e.lang ?? "en",
    displayOrder: i + 1,
    publishedAt: null
  }));
}

export const FAQ_FIXTURES: Record<string, Faq[]> = {
  "pmc-azad-class10": makeFaqs("pmc-azad-class10", [
    {
      q: "What is this scheme?",
      a: "Financial assistance for meritorious students who passed Class 10 (SSC) and are admitted to Junior College (Class 11) or a recognised diploma course within Pune municipal limits."
    },
    {
      q: "Who is eligible?",
      a: "Passed Class 10 (SSC) and admitted to Class 11 or a recognised diploma course. Minimum 80% marks in Class 10 (open category); 70% for backward-class students of state-government or PMC-aided schools; 65% for children of waste-pickers, construction or unorganised workers; 45% for students with more than 40% disability. Resident within Pune Municipal Corporation limits. Bank account in a nationalised bank, linked to Aadhaar."
    },
    {
      q: "How much is the benefit?",
      a: "Rs. 15,000, paid as a one-time Direct Bank Transfer (DBT) to the student's bank account."
    },
    {
      q: "Which documents are required?",
      a: "Attested copy of Class 10 (SSC) marksheet; Tahsildar Family Income Certificate (FY 2025-26); student bank passbook copy with active IFSC; student Aadhaar card; current-year Junior College or Diploma fee receipt or bonafide; proof of 3-year continuous residence in PMC limits; and a signed Small Family Undertaking Declaration."
    },
    {
      q: "What is the application deadline?",
      a: "The published deadline for this scheme is October 31, 2026. Confirm the current window at the ward office before travelling."
    },
    {
      q: "Where do I submit the application?",
      a: "Submit at the Kothrud - Bawdhan Ward Office No. 14, Counter No. 3 (Samaj Vikas DBT Desk), Monday to Friday, 10:30 AM to 03:30 PM. The official form is available from the PMC DBT portal."
    },
    {
      q: "ही योजना काय आहे?",
      a: "पुणे महानगरपालिका हद्दीतील इयत्ता 10 वी (एसएससी) उत्तीर्ण व अकरावी किंवा मान्यताप्राप्त डिप्लोमा अभ्यासक्रमात प्रवेश घेतलेल्या गुणवंत विद्यार्थ्यांसाठी आर्थिक सहाय्य.",
      lang: "mr"
    },
    {
      q: "पात्रता निकष काय आहेत?",
      a: "इयत्ता 10 वी (एसएससी) उत्तीर्ण व 11 वी किंवा मान्यताप्राप्त डिप्लोमा अभ्यासक्रमात प्रवेश; खुल्या प्रवर्गासाठी किमान 80% गुण; पुणे महानगरपालिका हद्दीत रहिवासी; राष्ट्रीयीकृत बँकेत आधार जोडलेले खाते.",
      lang: "mr"
    }
  ]),
  "pmc-sathe-class12": makeFaqs("pmc-sathe-class12", [
    {
      q: "What is this scheme?",
      a: "One-time cash assistance grant for Pune students who cleared Class 12 (HSC) and enrolled into higher degree programs (Engineering, Medical, Commerce, Science, Arts, IT)."
    },
    {
      q: "Who is eligible?",
      a: "Passed Class 12 (HSC) and admitted to a degree course. Minimum 80% marks in Class 12 (open category); 70% for backward-class students of state-government or PMC-aided schools; 65% for children of waste-pickers, construction or unorganised workers; 45% for students with more than 40% disability. Resident within Pune Municipal Corporation limits. Bank account in a nationalised bank, linked to Aadhaar."
    },
    {
      q: "How much is the benefit?",
      a: "Rs. 25,000, paid as a one-time Direct Bank Transfer (DBT) to the student's bank account."
    },
    {
      q: "Which documents are required?",
      a: "Attested copy of Class 12 (HSC) marksheet; degree college bonafide certificate or first-term fee receipt; Tahsildar Family Income Certificate; student bank passbook copy; student Aadhaar card; and proof of 3 years Pune domicile."
    },
    {
      q: "Where do I submit the application?",
      a: "Submit at the Kothrud - Bawdhan Ward Office No. 14, Counter No. 3 (Samaj Vikas DBT Desk). The official form is available from the PMC DBT portal."
    }
  ]),
  "pmc-savitribai-girls": makeFaqs("pmc-savitribai-girls", [
    {
      q: "What is this scheme?",
      a: "Financial assistance toward technical training, nursing diplomas, and computer certification fees for female students residing in Pune municipal corporation wards."
    },
    {
      q: "Who is eligible?",
      a: "Girl student enrolled in an ITI, polytechnic, nursing or computer diploma course. Family annual income under Rs. 2,50,000 (waived for orphans). Resident within Pune Municipal Corporation limits."
    },
    {
      q: "How much is the benefit?",
      a: "Rs. 10,000 to Rs. 20,000 as financial assistance toward course fees."
    },
    {
      q: "Which documents are required?",
      a: "Admission fee receipt from an accredited Technical or ITI institute; Class 10 or 12 marksheet copy; Tahsildar income certificate; student bank passbook copy; and student Aadhaar card."
    },
    {
      q: "What is the application deadline?",
      a: "The published deadline for this scheme is October 31, 2026. Confirm the current window at the ward office before travelling."
    },
    {
      q: "Where do I submit the application?",
      a: "Submit at the Kothrud - Bawdhan Ward Office No. 14, Counter No. 3 (Samaj Vikas DBT Desk)."
    }
  ]),
  "pmc-sgay-health": makeFaqs("pmc-sgay-health", [
    {
      q: "What is this scheme?",
      a: "Shahari Garib Arogya Yojana (SGAY) provides 100% free treatment at municipal civic hospitals and 50% direct concession on CGHS billing rates across 50+ empaneled private hospitals in Pune. It covers general inpatient hospitalization, nephrology dialysis, and chemotherapy."
    },
    {
      q: "Who is eligible?",
      a: "Family annual income below Rs. 1,60,000. Resident within Pune Municipal Corporation limits. Yellow or Orange ration card holder. Annual membership renewal required."
    },
    {
      q: "How much is the benefit?",
      a: "Rs. 1,00,000 to Rs. 2,00,000 in medical cover, with 100% free treatment at municipal hospitals and 50% concession at empaneled private hospitals."
    },
    {
      q: "Which documents are required?",
      a: "Copy of Yellow (BPL) or Orange (APL Low-Income) ration card; Tahsildar Family Income Certificate (under Rs. 1,60,000); head of family and patient Aadhaar cards; proof of 3 years residence in PMC limits (property tax or election card); doctor's treatment estimation certificate or admission advice; and two passport-size photographs of the patient."
    },
    {
      q: "What is the application deadline?",
      a: "This scheme is open round the year with an annual membership. Confirm renewal at the ward office."
    },
    {
      q: "Where do I submit the application?",
      a: "Submit at the Kothrud - Bawdhan Ward Office No. 14 health desk. The official form is available from the SGAY PMC portal."
    }
  ]),
  "pmc-svanidhi-hawker": makeFaqs("pmc-svanidhi-hawker", [
    {
      q: "What is this scheme?",
      a: "PM SVANidhi provides working capital loans to street vendors who sell fresh farm produce, fruits, vegetables, and dairy in Pune municipal weekly markets (Athawadi Bajar) and roadside haats."
    },
    {
      q: "Who is eligible?",
      a: "Street vendor selling in Pune municipal limits (vegetables, fruit, flowers, produce, dairy). Holds a Vending Certificate or Identity Card, or appears in the ward vendor survey, or has a recommendation letter from the Town Vending Committee or ward office. The next loan tranche is available only after repaying the previous one."
    },
    {
      q: "How much is the loan?",
      a: "1st tranche: Rs. 10,000; 2nd tranche: Rs. 20,000; 3rd tranche: Rs. 50,000."
    },
    {
      q: "Which documents are required?",
      a: "Vendor identification card (vending certificate or ward survey slip); bank passbook copy with active UPI QR linkage; Aadhaar card copy; and a recommendation letter from the local ward hawkers committee or market supervisor."
    },
    {
      q: "What is the application deadline?",
      a: "This scheme is open round the year."
    }
  ])
};

// Minimal scheme metadata for the offline path (name + official form URL).
export const SCHEME_FIXTURES: Record<string, { name: string; officialUrl: string | null }> = {
  "pmc-azad-class10": {
    name: "Bharat Ratna Maulana Abul Kalam Azad Educational Assistance Scheme",
    officialUrl: "https://dbt.pmc.gov.in/forms/maulana_azad_ssc.pdf"
  },
  "pmc-sathe-class12": {
    name: "Lokshahir Annabhau Sathe Educational Assistance Scheme",
    officialUrl: "https://dbt.pmc.gov.in/forms/annabhau_sathe_hsc.pdf"
  },
  "pmc-savitribai-girls": {
    name: "Krantijyoti Savitribai Phule Scheme for Girl Students",
    officialUrl: null
  },
  "pmc-sgay-health": {
    name: "Shahari Garib Arogya Yojana (SGAY)",
    officialUrl: "https://sgy.pmc.gov.in/forms/sgay_registration.pdf"
  },
  "pmc-svanidhi-hawker": {
    name: "PM SVANidhi Urban Farm Produce & Vegetable Vendor Scheme",
    officialUrl: "https://pmsvanidhi.mohua.gov.in/forms/vendor_application.pdf"
  }
};

// slug -> approved review rows for the offline path (scheme-level, no ward filter).
export const REVIEW_FIXTURES: Record<string, SchemeReview[]> = {
  "pmc-azad-class10": [
    {
      id: "rev-azad-ifsc",
      schemeId: "pmc-azad-class10",
      text: "If you have an older Syndicate Bank or Allahabad Bank passbook, make sure the IFSC code is updated to the merged parent bank (Canara Bank / Indian Bank). The PMC DBT payment gateway will bounce the transaction if an obsolete code is submitted.",
      frictionTag: "IFSC_MERGER",
      severityLevel: "HIGH",
      counter: "Kothrud Ward 14, Counter 3",
      helpfulCount: 45,
      createdAt: null
    },
    {
      id: "rev-azad-photo",
      schemeId: "pmc-azad-class10",
      text: "Make sure to bring 2 physical passport size photos attached with a paperclip. The clerk asked for them even though it was not explicitly stated on the main notice. Other than that, file acceptance took 10 minutes.",
      frictionTag: "PHOTOCOPY_DEMAND",
      severityLevel: "MEDIUM",
      counter: "Kothrud Ward 14, Counter 3",
      helpfulCount: 28,
      createdAt: null
    },
    {
      id: "rev-azad-digilocker",
      schemeId: "pmc-azad-class10",
      text: "Online DigiLocker printout of the Tahsildar certificate is fully accepted as long as the 16-digit barcoded verification number is dark and clearly legible for scanning.",
      frictionTag: "DIGILOCKER_OK",
      severityLevel: "LOW",
      counter: "Yerawada Ward 5, Counter 1",
      helpfulCount: 19,
      createdAt: null
    }
  ],
  "pmc-sgay-health": [
    {
      id: "rev-sgay-msw",
      schemeId: "pmc-sgay-health",
      text: "The hospital's Medical Social Worker (MSW) must sign the treatment estimate quotation before you come to Counter 1. The municipal health clerk verifies the doctor's seal.",
      frictionTag: "MSW_SIGNATURE",
      severityLevel: "MEDIUM",
      counter: "Kothrud Ward 14, Counter 1",
      helpfulCount: 37,
      createdAt: null
    },
    {
      id: "rev-sgay-fee",
      schemeId: "pmc-sgay-health",
      text: "Annual membership fee is Rs. 200. Keep exact cash ready as the counter does not always have digital UPI QR scanners operational.",
      frictionTag: "UNOFFICIAL_FEE",
      severityLevel: "MEDIUM",
      counter: "Kothrud Ward 14, Counter 1",
      helpfulCount: 22,
      createdAt: null
    }
  ],
  "pmc-svanidhi-hawker": [
    {
      id: "rev-svanidhi-qr",
      schemeId: "pmc-svanidhi-hawker",
      text: "Link your Google Pay or PhonePe merchant QR to the bank account before applying.",
      frictionTag: "PHOTOCOPY_DEMAND",
      severityLevel: "LOW",
      counter: "Kothrud Ward 14, Counter 5",
      helpfulCount: 30,
      createdAt: null
    }
  ],
  "pmc-savitribai-girls": [
    {
      id: "rev-savitribai-receipt",
      schemeId: "pmc-savitribai-girls",
      text: "Ensure your institute fee receipt has the official GST or registration stamp of the ITI/college, otherwise the clerk asks for a bonafide letter.",
      frictionTag: "PHOTOCOPY_DEMAND",
      severityLevel: "MEDIUM",
      counter: "Kothrud Ward 14, Counter 3",
      helpfulCount: 17,
      createdAt: null
    }
  ],
  "pmc-sathe-class12": [
    {
      id: "rev-sathe-year",
      schemeId: "pmc-sathe-class12",
      text: "Ensure your college bonafide certificate mentions the academic year 2026-27 clearly. They will not accept previous year receipts.",
      frictionTag: "TIMING",
      severityLevel: "MEDIUM",
      counter: "Kothrud Ward 14, Counter 3",
      helpfulCount: 14,
      createdAt: null
    }
  ]
};