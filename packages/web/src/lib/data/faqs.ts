import type { Faq } from "../feedback/types";

// Offline fallback for the FAQ portal (Protocol 5). Mirrors the maintained
// `scheme_faqs` seed rows in docs/migrations/003_feedback_system.sql so the
// demo never depends on venue Wi-Fi. Every answer comes from the scheme's own
// stored fields (see that migration), never from invented rules.

function makeFaqs(
  slug: string,
  entries: Array<{ question: string; answer: string; lang?: string }>
): Faq[] {
  return entries.map((e, i) => ({
    id: `faq-${slug}-${i + 1}`,
    schemeId: slug,
    question: e.question,
    answer: e.answer,
    languageCode: e.lang ?? "en",
    displayOrder: i + 1,
    publishedAt: null
  }));
}

export const FAQ_FIXTURES: Record<string, Faq[]> = {
  "pmc-azad-class10": makeFaqs("pmc-azad-class10", [
    {
      question: "What is this scheme?",
      answer:
        "Financial assistance for meritorious students who passed Class 10 (SSC) and are admitted to Junior College (Class 11) or a recognised diploma course within Pune municipal limits."
    },
    {
      question: "Who is eligible?",
      answer:
        "Passed Class 10 (SSC) and admitted to Class 11 or a recognised diploma course. Minimum 80% marks in Class 10 (open category); 70% for backward-class students of state-government or PMC-aided schools; 65% for children of waste-pickers, construction or unorganised workers; 45% for students with more than 40% disability. Resident within Pune Municipal Corporation limits. Bank account in a nationalised bank, linked to Aadhaar."
    },
    {
      question: "How much is the benefit?",
      answer: "Rs. 15,000, paid as a one-time Direct Bank Transfer (DBT) to the student's bank account."
    },
    {
      question: "Which documents are required?",
      answer:
        "Attested copy of Class 10 (SSC) marksheet; Tahsildar Family Income Certificate (FY 2025-26); student bank passbook copy with active IFSC; student Aadhaar card; current-year Junior College or Diploma fee receipt or bonafide; proof of 3-year continuous residence in PMC limits; and a signed Small Family Undertaking Declaration."
    },
    {
      question: "What is the application deadline?",
      answer:
        "The published deadline for this scheme is October 31, 2026. Confirm the current window at the ward office before travelling."
    },
    {
      question: "Where do I submit the application?",
      answer:
        "Submit at the Kothrud - Bawdhan Ward Office No. 14, Counter No. 3 (Samaj Vikas DBT Desk), Monday to Friday, 10:30 AM to 03:30 PM. The official form is available from the PMC DBT portal."
    },
    {
      question: "ही योजना काय आहे?",
      answer:
        "पुणे महानगरपालिका हद्दीतील इयत्ता 10 वी (एसएससी) उत्तीर्ण व अकरावी किंवा मान्यताप्राप्त डिप्लोमा अभ्यासक्रमात प्रवेश घेतलेल्या गुणवंत विद्यार्थ्यांसाठी आर्थिक सहाय्य.",
      lang: "mr"
    },
    {
      question: "पात्रता निकष काय आहेत?",
      answer:
        "इयत्ता 10 वी (एसएससी) उत्तीर्ण व 11 वी किंवा मान्यताप्राप्त डिप्लोमा अभ्यासक्रमात प्रवेश; खुल्या प्रवर्गासाठी किमान 80% गुण; पुणे महानगरपालिका हद्दीत रहिवासी; राष्ट्रीयीकृत बँकेत आधार जोडलेले खाते.",
      lang: "mr"
    }
  ]),
  "pmc-sathe-class12": makeFaqs("pmc-sathe-class12", [
    {
      question: "What is this scheme?",
      answer:
        "One-time cash assistance grant for Pune students who cleared Class 12 (HSC) and enrolled into higher degree programs (Engineering, Medical, Commerce, Science, Arts, IT)."
    },
    {
      question: "Who is eligible?",
      answer:
        "Passed Class 12 (HSC) and admitted to a degree course. Minimum 80% marks in Class 12 (open category); 70% for backward-class students of state-government or PMC-aided schools; 65% for children of waste-pickers, construction or unorganised workers; 45% for students with more than 40% disability. Resident within Pune Municipal Corporation limits. Bank account in a nationalised bank, linked to Aadhaar."
    },
    {
      question: "How much is the benefit?",
      answer: "Rs. 25,000, paid as a one-time Direct Bank Transfer (DBT) to the student's bank account."
    },
    {
      question: "Which documents are required?",
      answer:
        "Attested copy of Class 12 (HSC) marksheet; degree college bonafide certificate or first-term fee receipt; Tahsildar Family Income Certificate; student bank passbook copy; student Aadhaar card; and proof of 3 years Pune domicile."
    },
    {
      question: "Where do I submit the application?",
      answer:
        "Submit at the Kothrud - Bawdhan Ward Office No. 14, Counter No. 3 (Samaj Vikas DBT Desk). The official form is available from the PMC DBT portal."
    }
  ]),
  "pmc-savitribai-girls": makeFaqs("pmc-savitribai-girls", [
    {
      question: "What is this scheme?",
      answer:
        "Financial assistance toward technical training, nursing diplomas, and computer certification fees for female students residing in Pune municipal corporation wards."
    },
    {
      question: "Who is eligible?",
      answer:
        "Girl student enrolled in an ITI, polytechnic, nursing or computer diploma course. Family annual income under Rs. 2,50,000 (waived for orphans). Resident within Pune Municipal Corporation limits."
    },
    {
      question: "How much is the benefit?",
      answer: "Rs. 10,000 to Rs. 20,000 as financial assistance toward course fees."
    },
    {
      question: "Which documents are required?",
      answer:
        "Admission fee receipt from an accredited Technical or ITI institute; Class 10 or 12 marksheet copy; Tahsildar income certificate; student bank passbook copy; and student Aadhaar card."
    },
    {
      question: "What is the application deadline?",
      answer:
        "The published deadline for this scheme is October 31, 2026. Confirm the current window at the ward office before travelling."
    },
    {
      question: "Where do I submit the application?",
      answer: "Submit at the Kothrud - Bawdhan Ward Office No. 14, Counter No. 3 (Samaj Vikas DBT Desk)."
    }
  ]),
  "pmc-sgay-health": makeFaqs("pmc-sgay-health", [
    {
      question: "What is this scheme?",
      answer:
        "Shahari Garib Arogya Yojana (SGAY) provides 100% free treatment at municipal civic hospitals and 50% direct concession on CGHS billing rates across 50+ empaneled private hospitals in Pune. It covers general inpatient hospitalization, nephrology dialysis, and chemotherapy."
    },
    {
      question: "Who is eligible?",
      answer:
        "Family annual income below Rs. 1,60,000. Resident within Pune Municipal Corporation limits. Yellow or Orange ration card holder. Annual membership renewal required."
    },
    {
      question: "How much is the benefit?",
      answer:
        "Rs. 1,00,000 to Rs. 2,00,000 in medical cover, with 100% free treatment at municipal hospitals and 50% concession at empaneled private hospitals."
    },
    {
      question: "Which documents are required?",
      answer:
        "Copy of Yellow (BPL) or Orange (APL Low-Income) ration card; Tahsildar Family Income Certificate (under Rs. 1,60,000); head of family and patient Aadhaar cards; proof of 3 years residence in PMC limits (property tax or election card); doctor's treatment estimation certificate or admission advice; and two passport-size photographs of the patient."
    },
    {
      question: "What is the application deadline?",
      answer: "This scheme is open round the year with an annual membership. Confirm renewal at the ward office."
    },
    {
      question: "Where do I submit the application?",
      answer:
        "Submit at the Kothrud - Bawdhan Ward Office No. 14 health desk. The official form is available from the SGAY PMC portal."
    }
  ]),
  "pmc-svanidhi-hawker": makeFaqs("pmc-svanidhi-hawker", [
    {
      question: "What is this scheme?",
      answer:
        "PM SVANidhi provides working capital loans to street vendors who sell fresh farm produce, fruits, vegetables, and dairy in Pune municipal weekly markets (Athawadi Bajar) and roadside haats."
    },
    {
      question: "Who is eligible?",
      answer:
        "Street vendor selling in Pune municipal limits (vegetables, fruit, flowers, produce, dairy). Holds a Vending Certificate or Identity Card, or appears in the ward vendor survey, or has a recommendation letter from the Town Vending Committee or ward office. The next loan tranche is available only after repaying the previous one."
    },
    {
      question: "How much is the loan?",
      answer: "1st tranche: Rs. 10,000; 2nd tranche: Rs. 20,000; 3rd tranche: Rs. 50,000."
    },
    {
      question: "Which documents are required?",
      answer:
        "Vendor identification card (vending certificate or ward survey slip); bank passbook copy with active UPI QR linkage; Aadhaar card copy; and a recommendation letter from the local ward hawkers committee or market supervisor."
    },
    {
      question: "What is the application deadline?",
      answer: "This scheme is open round the year."
    }
  ])
};

export function getFixtureFaqs(slug: string): Faq[] {
  return FAQ_FIXTURES[slug] ?? [];
}
