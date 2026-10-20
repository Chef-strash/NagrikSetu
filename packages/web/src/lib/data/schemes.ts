export interface CommunityTip {
  id: string;
  author: string;
  role: string;
  date: string;
  counter: string;
  tip: string;
  helpfulCount: number;
}

export interface Scheme {
  id: string;
  category: 'education' | 'healthcare' | 'livelihood';
  categoryLabel: string;
  name: string;
  vernacularName: string;
  department: string;
  resolutionNo: string;
  benefitAmount: string;
  benefitType: string;
  deadline: string;
  cutoff: string;
  incomeLimit: number;
  incomeLimitFormatted: string;
  domicileYears: number;
  description: string;
  /** Full eligibility conditions as one block of text (one condition per line), taken from the official source. */
  eligibility: string;
  counterLocation: {
    office: string;
    desk: string;
    hours: string;
    address: string;
  };
  requiredDocuments: string[];
  stapleOrder: string[];
  officialFormName: string;
  officialFormUrl: string;
  communityTips: CommunityTip[];
}

export const SCHEMES: Scheme[] = [
  {
    id: "pmc-azad-class10",
    category: "education",
    categoryLabel: "Education Grants",
    name: "Bharat Ratna Maulana Abul Kalam Azad Educational Assistance Scheme",
    vernacularName: "भारतरत्न मौलाना अबुल कलाम आझाद शैक्षणिक अर्थसहाय्य योजना",
    department: "PMC Social Development Department (समाज विकास विभाग)",
    resolutionNo: "PMC Resolution No. 1184-B",
    benefitAmount: "Rs. 15,000",
    benefitType: "One-time Direct Bank Transfer (DBT)",
    deadline: "October 31, 2026",
    cutoff: "Minimum 80.00% in Class 10 SSC (70.00% for SC/ST/OBC/Municipal Schools)",
    incomeLimit: 250000,
    incomeLimitFormatted: "Under Rs. 2,50,000 per year",
    domicileYears: 3,
    description: "Financial assistance for meritorious students who passed Class 10 (SSC) and are admitted to Junior College (Class 11) or recognized diploma courses within Pune municipal limits.",
    eligibility: "Passed Class 10 (SSC) and admitted to Class 11 or a recognised diploma course.\nMinimum 80% marks in Class 10 (open category).\nMinimum 70% for backward-class students of state-government or PMC-aided schools.\nMinimum 65% for children of waste-pickers, construction or unorganised workers.\nMinimum 45% for students with more than 40% disability.\nResident within Pune Municipal Corporation limits.\nBank account in a nationalised bank, linked to Aadhaar.",
    counterLocation: {
      office: "Kothrud - Bawdhan Ward Office No. 14",
      desk: "Counter No. 3 (Samaj Vikas DBT Desk)",
      hours: "Monday to Friday | 10:30 AM to 03:30 PM",
      address: "Paud Road, Opposite More Vidyalaya, Kothrud, Pune 411038"
    },
    requiredDocuments: [
      "Attested copy of Class 10 (SSC) Marksheet",
      "Tahsildar Family Income Certificate (Financial Year 2025-26)",
      "Student Bank Passbook Copy (with active IFSC)",
      "Student Aadhaar Card",
      "Current Year Junior College / Diploma Fee Receipt or Bonafide",
      "Proof of 3-Year Continuous Residence in Pune Municipal Limits",
      "Small Family Undertaking Declaration Form"
    ],
    stapleOrder: [
      "1. Printed Application Form (Form 1184-B)",
      "2. Student Aadhaar Card Copy",
      "3. Attested Class 10 Marksheet Copy",
      "4. College Fee Receipt / Bonafide Certificate",
      "5. Tahsildar Family Income Certificate",
      "6. Student Bank Passbook Copy",
      "7. Signed Small Family Declaration Undertaking"
    ],
    officialFormName: "PMC Form 1184-B (SSC Educational Grant)",
    officialFormUrl: "https://dbt.pmc.gov.in/forms/maulana_azad_ssc.pdf",
    communityTips: [
      {
        id: "tip-1",
        author: "Rahul Shinde",
        role: "Parent Applicant",
        date: "3 days ago",
        counter: "Kothrud Ward 14, Counter 3",
        tip: "Make sure to bring 2 physical passport size photos attached with a paperclip. The clerk asked for them even though it was not explicitly stated on the main notice. Other than that, file acceptance took 10 minutes.",
        helpfulCount: 28
      },
      {
        id: "tip-2",
        author: "Sunita More",
        role: "Community Volunteer (Samaj Sevak)",
        date: "1 week ago",
        counter: "Kothrud Ward 14, Counter 3",
        tip: "If you have an older Syndicate Bank or Allahabad Bank passbook, make sure the IFSC code is updated to the merged parent bank (Canara Bank / Indian Bank). The PMC DBT payment gateway will bounce the transaction if an obsolete code is submitted.",
        helpfulCount: 45
      },
      {
        id: "tip-3",
        author: "Dnyaneshwar Jadhav",
        role: "Student Beneficiary",
        date: "2 weeks ago",
        counter: "Kothrud Ward 14, Counter 3",
        tip: "Online DigiLocker printout of the Tahsildar certificate is fully accepted as long as the 16-digit barcoded verification number is dark and clearly legible for scanning.",
        helpfulCount: 19
      }
    ]
  },
  {
    id: "pmc-sathe-class12",
    category: "education",
    categoryLabel: "Education Grants",
    name: "Lokshahir Annabhau Sathe Educational Assistance Scheme",
    vernacularName: "लोकशाहीर अण्णाभाऊ साठे शैक्षणिक अर्थसहाय्य योजना",
    department: "PMC Social Development Department (समाज विकास विभाग)",
    resolutionNo: "PMC Resolution No. 1184-C",
    benefitAmount: "Rs. 25,000",
    benefitType: "One-time Direct Bank Transfer (DBT)",
    deadline: "October 31, 2026",
    cutoff: "Minimum 75.00% to 80.00% in Class 12 (HSC) depending on stream and category",
    incomeLimit: 250000,
    incomeLimitFormatted: "Under Rs. 2,50,000 per year",
    domicileYears: 3,
    description: "One-time cash assistance grant for Pune students who successfully cleared Class 12 (HSC) and have enrolled into higher degree programs (Engineering, Medical, Commerce, Science, Arts, IT).",
    eligibility: "Passed Class 12 (HSC) and admitted to a degree course.\nMinimum 80% marks in Class 12 (open category).\nMinimum 70% for backward-class students of state-government or PMC-aided schools.\nMinimum 65% for children of waste-pickers, construction or unorganised workers.\nMinimum 45% for students with more than 40% disability.\nResident within Pune Municipal Corporation limits.\nBank account in a nationalised bank, linked to Aadhaar.",
    counterLocation: {
      office: "Kothrud - Bawdhan Ward Office No. 14",
      desk: "Counter No. 3 (Samaj Vikas DBT Desk)",
      hours: "Monday to Friday | 10:30 AM to 03:30 PM",
      address: "Paud Road, Opposite More Vidyalaya, Kothrud, Pune 411038"
    },
    requiredDocuments: [
      "Attested copy of Class 12 (HSC) Marksheet",
      "Degree College Bonafide Certificate or First Term Fee Receipt",
      "Tahsildar Family Income Certificate",
      "Student Bank Passbook Copy",
      "Student Aadhaar Card",
      "Proof of 3 Years Pune Domicile"
    ],
    stapleOrder: [
      "1. Printed Application Form (Form 1184-C)",
      "2. Student Aadhaar Card Copy",
      "3. Attested Class 12 Marksheet Copy",
      "4. Degree College Fee Receipt / Bonafide",
      "5. Tahsildar Income Certificate",
      "6. Bank Passbook Copy"
    ],
    officialFormName: "PMC Form 1184-C (HSC Higher Education Grant)",
    officialFormUrl: "https://dbt.pmc.gov.in/forms/annabhau_sathe_hsc.pdf",
    communityTips: [
      {
        id: "tip-sathe-1",
        author: "Prashant Kadam",
        role: "Student Beneficiary",
        date: "5 days ago",
        counter: "Kothrud Ward 14, Counter 3",
        tip: "Ensure your college bonafide certificate mentions the academic year 2026-27 clearly. They will not accept previous year receipts.",
        helpfulCount: 14
      }
    ]
  },
  {
    id: "pmc-sgay-health",
    category: "healthcare",
    categoryLabel: "Health & Hospital Care",
    name: "Shahari Garib Arogya Yojana (SGAY)",
    vernacularName: "शहरी गरीब आरोग्य योजना (वैद्यकीय उपचार सवलत)",
    department: "PMC Health Department (आरोग्य विभाग)",
    resolutionNo: "PMC Resolution No. GB/2010/CR-42",
    benefitAmount: "Rs. 1,00,000 to Rs. 2,00,000",
    benefitType: "50% Treatment Concession & Hospital Assistance",
    deadline: "Open Round-the-Year (Annual Membership)",
    cutoff: "Yellow or Orange Ration Card Holder | Annual Renewal Required",
    incomeLimit: 160000,
    incomeLimitFormatted: "Under Rs. 1,60,000 per year",
    domicileYears: 3,
    description: "Provides 100% free treatment at municipal civic hospitals and 50% direct concession on CGHS billing rates across 50+ empaneled private hospitals in Pune (including Poona Hospital, Sahyadri, KEM, Bharati). Covers general inpatient hospitalization, nephrology dialysis, and chemotherapy.",
    eligibility: "Family annual income below Rs. 1,60,000.\nResident within Pune Municipal Corporation limits.\nYellow or Orange ration card holder.\nAnnual membership renewal required.",
    counterLocation: {
      office: "Kothrud - Bawdhan Ward Office No. 14",
      desk: "Counter No. 1 (Arogya Vibhag Medical Desk)",
      hours: "Monday to Friday | 10:00 AM to 04:00 PM",
      address: "Paud Road, Opposite More Vidyalaya, Kothrud, Pune 411038"
    },
    requiredDocuments: [
      "Copy of Yellow (BPL) or Orange (APL Low-Income) Ration Card",
      "Tahsildar Family Income Certificate (Under Rs. 1,60,000)",
      "Head of Family and Patient Aadhaar Cards",
      "Proof of 3 Years Residence in PMC limits (Property Tax or Election Card)",
      "Doctor's Treatment Estimation Certificate / Admission Advice",
      "Two Passport Sized Photographs of Patient"
    ],
    stapleOrder: [
      "1. SGAY Health Card Application Form",
      "2. Certified Ration Card Copy (Front and Back)",
      "3. Tahsildar Family Income Certificate",
      "4. Patient and Family Head Aadhaar Card Copies",
      "5. Doctor's Medical Treatment Estimation Sheet",
      "6. Two Passport Sized Photos"
    ],
    officialFormName: "PMC SGAY Health Card Registration Form",
    officialFormUrl: "https://sgy.pmc.gov.in/forms/sgay_registration.pdf",
    communityTips: [
      {
        id: "tip-sgay-1",
        author: "Kavita Deshmukh",
        role: "Patient Family Member",
        date: "4 days ago",
        counter: "Ward 14 Health Desk",
        tip: "The hospital's Medical Social Worker (MSW) must sign the treatment estimate quotation before you come to Counter 1. The municipal health clerk verifies the doctor's seal.",
        helpfulCount: 37
      },
      {
        id: "tip-sgay-2",
        author: "Dr. Anand Kulkarni",
        role: "Hospital Social Worker",
        date: "2 weeks ago",
        counter: "Ward 14 Health Desk",
        tip: "Annual membership fee is Rs. 200. Keep exact cash ready as the counter does not always have digital UPI QR scanners operational.",
        helpfulCount: 22
      }
    ]
  },
  {
    id: "pmc-svanidhi-hawker",
    category: "livelihood",
    categoryLabel: "Livelihood & Self-Employment",
    name: "PM SVANidhi Urban Farm Produce & Vegetable Vendor Scheme",
    vernacularName: "पीएम स्वनिधी भाजीपाला व शेतमाल विक्रेते कर्ज योजना",
    department: "PMC Urban Livelihood Cell (शहरी उपजीविका अभियान)",
    resolutionNo: "MoHUA / PMC Urban Livelihood Resolution 2024",
    benefitAmount: "Rs. 10,000 to Rs. 50,000",
    benefitType: "Collateral-free Working Capital Micro-Credit with 7% Interest Subsidy",
    deadline: "Open Round-the-Year",
    cutoff: "Daily or weekly market produce seller, vegetable vendor, or flower hawker",
    incomeLimit: 200000,
    incomeLimitFormatted: "Under Rs. 2,00,000 per year",
    domicileYears: 1,
    description: "Working capital loan for local street vendors who sell fresh farm produce, fruits, vegetables, and dairy in Pune municipal weekly markets (*Athawadi Bajar*) and roadside haats. 1st tranche: Rs. 10,000; 2nd: Rs. 20,000; 3rd: Rs. 50,000.",
    eligibility: "Street vendor selling in Pune municipal limits (vegetables, fruit, flowers, produce, dairy).\nHolds a Vending Certificate or Identity Card, or appears in the ward vendor survey, or has a recommendation letter from the Town Vending Committee or ward office.\nNext loan tranche available after repaying the previous one.",
    counterLocation: {
      office: "Kothrud - Bawdhan Ward Office No. 14",
      desk: "Counter No. 5 (Street Vendor / Pathari Cell)",
      hours: "Monday to Friday | 11:00 AM to 03:00 PM",
      address: "Paud Road, Opposite More Vidyalaya, Kothrud, Pune 411038"
    },
    requiredDocuments: [
      "Vendor Identification Card (Vending Certificate or Ward Survey Slip)",
      "Bank Passbook Copy with active UPI QR linkage",
      "Aadhaar Card Copy",
      "Recommendation Letter from Local Ward Hawkers Committee or Market Supervisor"
    ],
    stapleOrder: [
      "1. SVANidhi Loan Application Form",
      "2. Vendor Identity Card / Survey Slip",
      "3. Aadhaar Card Copy",
      "4. Bank Passbook Copy"
    ],
    officialFormName: "PM SVANidhi Urban Vendor Form",
    officialFormUrl: "https://pmsvanidhi.mohua.gov.in/forms/vendor_application.pdf",
    communityTips: [
      {
        id: "tip-vendor-1",
        author: "Tukaram Gaikwad",
        role: "Vegetable Vendor (Kothrud Market)",
        date: "2 weeks ago",
        counter: "Ward 14, Counter 5",
        tip: "Link your Google Pay or PhonePe merchant QR to the bank account before applying. Doing at least 25 digital transactions a month gives you an extra Rs. 1,200 annual cash back.",
        helpfulCount: 30
      }
    ]
  },
  {
    id: "pmc-savitribai-girls",
    category: "education",
    categoryLabel: "Education Grants",
    name: "Krantijyoti Savitribai Phule Scheme for Girl Students",
    vernacularName: "क्रांतिज्योती सावित्रीबाई फुले कन्या शिक्षण सहाय्य योजना",
    department: "PMC Social Development Department (समाज विकास विभाग)",
    resolutionNo: "PMC Resolution No. 902-D",
    benefitAmount: "Rs. 10,000 to Rs. 20,000",
    benefitType: "Vocational & Technical Course Fee Reimbursement",
    deadline: "October 31, 2026",
    cutoff: "Girl students pursuing ITI, Polytechnic, Nursing, or Computer Diploma",
    incomeLimit: 250000,
    incomeLimitFormatted: "Under Rs. 2,50,000 per year (Waived for orphans)",
    domicileYears: 3,
    description: "Financial assistance toward technical training, nursing diplomas, and computer certification fees for female students residing in Pune municipal corporation wards.",
    eligibility: "Girl student enrolled in an ITI, polytechnic, nursing or computer diploma course.\nFamily annual income under Rs. 2,50,000 (waived for orphans).\nResident within Pune Municipal Corporation limits.",
    counterLocation: {
      office: "Kothrud - Bawdhan Ward Office No. 14",
      desk: "Counter No. 3 (Samaj Vikas DBT Desk)",
      hours: "Monday to Friday | 10:30 AM to 03:30 PM",
      address: "Paud Road, Opposite More Vidyalaya, Kothrud, Pune 411038"
    },
    requiredDocuments: [
      "Admission Fee Receipt from accredited Technical / ITI Institute",
      "Class 10 or 12 Marksheet Copy",
      "Tahsildar Income Certificate",
      "Student Bank Passbook Copy",
      "Student Aadhaar Card"
    ],
    stapleOrder: [
      "1. Savitribai Phule Scheme Application Form",
      "2. Student Aadhaar Card Copy",
      "3. Technical Institute Fee Receipt",
      "4. Marksheet Copy",
      "5. Income Certificate",
      "6. Bank Passbook"
    ],
    officialFormName: "PMC Savitribai Phule Technical Grant Form",
    officialFormUrl: "https://dbt.pmc.gov.in/forms/savitribai_phule_girls.pdf",
    communityTips: [
      {
        id: "tip-savitri-1",
        author: "Priya Bhosale",
        role: "Nursing Student",
        date: "1 week ago",
        counter: "Ward 14, Counter 3",
        tip: "Ensure your institute fee receipt has the official GST or registration stamp of the ITI/college, otherwise the clerk asks for a bonafide letter.",
        helpfulCount: 17
      }
    ]
  }
];
