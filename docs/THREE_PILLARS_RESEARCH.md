> **Historical research (pre-2026-10-04).** Some claims here were not confirmed against PMC sources (e.g. the peri-urban 7/12 scheme, 3-year domicile, resolution numbers). Current truth: `docs/PMC_SOURCE_VERIFICATION_2026-10-04.md` and `docs/SCHEME_DATA_SPEC.md`.

# NagrikSetu: The 3-Pillar Welfare Architecture
## Empirical Ground-Truth Research across Healthcare, Education, and Agriculture & Peri-Urban Livelihoods

**Author**: Team Whitebox Architecture Group  
**Target Geography**: Pune Municipal Corporation (PMC), Maharashtra ULBs, and Peri-Urban Fringe Expansion Zones  
**Scope**: Statutory criteria, financial allocations, ground-level delivery fractures, and deterministic verification rules across the 3 core pillars.

---

## Executive Overview: The 3-Pillar Taxonomy

To solve municipal and peri-urban welfare delivery at scale, NagrikSetu structures all citizen entitlements into **Three Statutory Pillars**:

```
                              ┌──────────────────────────────────────────────┐
                              │            NAGRIKSETU 3-PILLAR MATRIX          │
                              └──────────────────────┬───────────────────────┘
                                                     │
         ┌───────────────────────────────────────────┼───────────────────────────────────────────┐
         │                                           │                                           │
         ▼                                           ▼                                           ▼
┌─────────────────────────────────┐ ┌─────────────────────────────────┐ ┌─────────────────────────────────┐
│     PILLAR 1: HEALTHCARE        │ │      PILLAR 2: EDUCATION        │ │ PILLAR 3: AGRICULTURE & PERI-   │
│   (आरोग्य व वैद्यकीय सहाय्य)    │ │   (शिक्षण व शैक्षणिक सहाय्य)    │ │      URBAN LIVELIHOODS          │
│                                 │ │                                 │ │   (कृषी व उपजीविका सहाय्य)      │
├─────────────────────────────────┤ ├─────────────────────────────────┤ ├─────────────────────────────────┤
│ • PMC Shahari Garib Arogya      │ │ • PMC Maulana Azad (₹15,000)    │ │ • PM-KISAN (₹6,000)             │
│   Yojana (₹1L–₹5L Cover)        │ │ • PMC Annabhau Sathe (₹25,000)  │ │ • Namo Shetkari (₹6,000)        │
│ • BMC Aapli Chikitsa Diagnostics│ │ • Savitribai Phule Girls Grant  │ │ • MahaDBT Krishi (Drip/Tractor) │
│ • MJPJAY / PM-JAY (₹5L Cashless)│ │ • Divyang Education Stipend     │ │ • PM-KUSUM Solar Agri Pumps     │
│ • Dialysis & Oncology DBT       │ │ • PMPML Student Transit Passes  │ │ • PM SVANidhi Street Vendors    │
│ • Janani Suraksha Maternity     │ │ • MahaDBT Post-Matric Freeships │ │ • Animal Husbandry Dairy Grants │
└─────────────────────────────────┘ └─────────────────────────────────┘ └─────────────────────────────────┘
```

---

# PILLAR 1: HEALTHCARE (आरोग्य व वैद्यकीय सहाय्य)

Healthcare emergencies are the leading driver of catastrophic out-of-pocket expenditure (OOPE), pushing vulnerable urban families below the poverty line.

### 1.1 Flagship Municipal Scheme: PMC Shahari Garib Arogya Yojana (SGAY)
*(Renamed Late Ajit Pawar Shahari Garib Vaidyakiya Sahayya Yojana in the 2026–27 PMC Budget)*
- **Statutory Authority**: PMC Health Department (*Arogya Vibhag*), Resolution No. GB/2010/CR-42.
- **Dedicated Sub-Portal**: `sgy.pmc.gov.in`.
- **Annual Budget Allocation**: **₹150 Crore** in FY2026–27 (Over ₹362 Crore disbursed across preceding fiscal periods).
- **Core Financial Benefits**:
  - **PMC Civic Hospitals**: **100% free treatment, diagnostics, and medications** across all municipal hospitals (e.g., Kamla Nehru Hospital, Naidu Infectious Diseases Hospital, Sonawane Maternity Hospital).
  - **Empaneled Private Hospitals**: **50% direct concession** on CGHS-approved rates at premier private tertiary hospitals in Pune (e.g., Poona Hospital, Jehangir Hospital, KEM Hospital Pune, Sahyadri Super Specialty, Bharati Hospital, Deenanath Mangeshkar Hospital).
  - **General Inpatient Cap**: Up to **₹1,00,000** per family per financial year.
  - **Critical Illness Cap**: Enhanced up to **₹2,00,000 to ₹5,00,000** for critical care, specifically **Oncology (Chemotherapy/Radiation)**, **Nephrology (Dialysis)**, and **Cardiology (Bypass/Angioplasty)**.
- **Statutory Eligibility Criteria**:
  - **Income Ceiling**: Annual household income must not exceed **₹1,60,000** (raised from ₹1,00,000; validated via Tahsildar Income Certificate).
  - **Ration Card Category**: Holder of **Yellow (BPL)** or **Orange (APL low-income)** Ration Card, or certified slum resident with PMC Slum Department tax receipt.
  - **Domicile**: Minimum **3 continuous years (36 months)** within Pune Municipal Corporation limits.
  - **Membership Fee**: **₹200/year** (₹100 one-time registration fee + ₹100 annual subscription).
  - **Validity & Renewal**: Valid for exactly one fiscal year (April 1 to March 31). Mandatory annual renewal.

### 1.2 Municipal Diagnostic Networks: BMC Aapli Chikitsa (Mumbai)
- **Coverage**: Network of 100+ municipal health posts, urban dispensaries, maternity homes, and peripheral hospitals.
- **Diagnostic Menu**: **83 laboratory tests** (66 basic hematology/biochemistry tests + 17 advanced pathology tests) provided free or at nominal rates (₹50–₹100).
- **Digital Report Delivery**: Automated diagnostic report dispatch directly to patient smartphones via **WhatsApp webhook integration**.

### 1.3 State/National Alignment: MJPJAY & Ayushman Bharat (PM-JAY)
- **Universal Cashless Cover**: **₹5,00,000** annual family health cover under the integrated Mahatma Jyotirao Phule Jan Arogya Yojana (MJPJAY) and Ayushman Bharat PM-JAY.
- **Why Municipal Schemes (SGAY) Remain Life-or-Death Essential**:
  1. **Zero Outpatient (OPD) Coverage in PM-JAY**: Ayushman Bharat and MJPJAY are strictly inpatient hospitalisation (IPD) schemes. They do not cover routine OPD consultations, regular dialysis transport, day-care chemotherapy injections, or outpatient chronic drugs.
  2. **The Empanelment Gap**: Many private city hospitals frequently decline PM-JAY patients citing low government package rates, but actively accept municipal SGAY credit letters because PMC reimburses on 50% CGHS billing rates.
  3. **The Pre-Authorization Delay**: PM-JAY pre-authorizations often take 12–36 hours. SGAY provides immediate emergency admission clearance upon presenting a valid PMC municipal card.

---

# PILLAR 2: EDUCATION (शिक्षण व शैक्षणिक सहाय्य)

Education DBT schemes address the alarming dropout cliff between Class 10 (SSC) and higher secondary/undergraduate education in urban informal settlements.

### 2.1 Flagship Municipal Schemes: PMC Maulana Azad & Annabhau Sathe
- **Scheme 1: Bharat Ratna Maulana Abul Kalam Azad Scheme**:
  - **Benefit**: **₹15,000 one-time DBT** for Class 10 (SSC) graduates continuing into Class 11, polytechnic, or diploma courses.
  - **Academic Cutoffs**:
    - Open (General) Category: Minimum **80.00%**.
    - Backward Classes (SC / ST / OBC / VJNT): Minimum **70.00%**.
    - PMC Municipal Schools / Night Schools: Minimum **70.00%**.
    - Children of Safai Karamcharis / Waste-Pickers: Minimum **65.00%**.
    - Divyang Students ($\ge 40\%$ disability): Minimum **45.00%**.
- **Scheme 2: Lokshahir Annabhau Sathe Scheme**:
  - **Benefit**: **₹25,000 one-time DBT** for Class 12 (HSC) graduates enrolled in accredited undergraduate degrees (B.E., B.Tech, MBBS, B.Com, B.Sc, B.A., BCA).
  - **Academic Cutoff**: Minimum **75.00% to 80.00%**.
- **Common Criteria**:
  - Income Ceiling: Family income $< ₹2,50,000$/year.
  - Domicile: 36 months continuous residence in PMC limits.
- **Ancillary Education Programs**:
  - *Savitribai Phule Scheme*: ₹10,000–₹20,000 technical/vocational course fee reimbursement for girl students.
  - *Divyang Educational Stipend*: ₹12,000 annual scholarship + free assistive mobility aids.
  - *PMPML / BEST Student Bus Pass Concession*: 100% free or 75% subsidized municipal transit passes for school and college students.

### 2.2 The Silent Administrative Disqualifiers in Education
1. **The Maharashtra Small-Family Norm**: Mandatory disqualification if the applicant is the **3rd child born after May 1, 2001** (*Maharashtra Civil Services Declaration of Small Family Rules*).
2. **The 36-Month Domicile Deadlock**: Informal slum dwellers and tenant families lacking registered 3-year rent agreements are routinely rejected by ward clerks.
3. **Single-Character Name Typo**: Even a single-letter variance between Aadhaar, Bank Passbook, and School Leaving Certificate (e.g., "Pooja" vs "Puja", or missing middle name) triggers portal rejection.

---

# PILLAR 3: AGRICULTURE & PERI-URBAN / FRINGE VILLAGE LIVELIHOODS (कृषी व उपजीविका)

This pillar solves the single most neglected socio-legal crisis in modern Indian urbanization: **The Peri-Urban Jurisdictional Black Hole**.

### 3.1 The Structural Phenomenon: The 23 Merged Villages of Pune
In 2021, the Urban Development Department (UDD), Government of Maharashtra, issued a statutory notification merging **23 peripheral agricultural villages** into the Pune Municipal Corporation (PMC):
- **Merged Localities**: Wagholi, Manjari, Bavdhan Budruk, Dhayari, Uruli Devachi, Phursungi, Holkarwadi, Autade-Handewadi, Wadachiwadi, Shewalewadi, Nandoshi, Mangdewadi, Bhilarewadi, Gujar-Nimbalkarwadi, Jambhulwadi, Kolewadi, Kirkatwadi, Pisoli, Kondhwe-Dhawade, Kopre, Nanded, Sutarwadi, Shivane.
- **Impact**: PMC's geographic jurisdiction expanded by **485+ sq km** (totaling over 516 sq km), transforming PMC into Maharashtra’s largest municipal corporation.
- **The Human Reality**: Hundreds of thousands of residents are active farmers, smallholders, vegetable growers, and dairymen supplying Pune's APMC Market Yard (Gultekdi).

### 3.2 The Core Agricultural Schemes Available to Peri-Urban Landholders
1. **Pradhan Mantri Kisan Samman Nidhi (PM-KISAN)**:
   - Direct income support of **₹6,000 per year** in 3 equal four-monthly tranches of ₹2,000 directly via Aadhaar-linked DBT.
   - Statutory Requirement: Cultivable landholding verified via **Record of Rights (7/12 extract / *Saat-Baara*)** and **8-A Khata register**.
2. **Maharashtra Namo Shetkari Mahasanman Nidhi**:
   - Matching state DBT providing an **additional ₹6,000 per year**, bringing the total annual direct financial support to **₹12,000/year** for qualifying farmers.
3. **MahaDBT Krishi Subsidies (Department of Agriculture, Maharashtra)**:
   - *Micro-Irrigation (PMKSY)*: 75%–80% subsidy for Drip and Sprinkler irrigation systems for small/marginal farmers ($< 2$ hectares).
   - *Farm Mechanization (SMAM)*: Subsidies on tractors, rotavators, power tillers, and threshers.
   - *PM-KUSUM (Component B)*: 90% capital subsidy on off-grid solar agricultural water pump sets.
4. **Animal Husbandry & Dairy Grants (*Pashusamvardhan Vibhag*)**:
   - Subsidies for milch cows, buffaloes, and goat rearing units for smallholder farmers and traditional pastoralist communities.
5. **PM SVANidhi (Urban Micro-Credit for Peri-Urban Farm Produce Sellers)**:
   - Collateral-free working capital micro-loans for peri-urban farmers who sell fresh produce, vegetables, and flowers in city weekly markets (*Athawadi Bajar*) and roadside haats:
     - 1st Tranche: ₹10,000 (12-month tenure).
     - 2nd Tranche: ₹20,000 (18-month tenure upon timely repayment).
     - 3rd Tranche: ₹50,000 (36-month tenure).
     - 7% interest subsidy credited directly to bank account.

### 3.3 The "Jurisdictional No-Man's-Land" (The Administrative Black Hole)

```
                            [Agricultural Village Merged into Municipal Corporation]
                                                       │
                                                       ▼
                                    [Gram Panchayat Formally Dissolved]
                                                       │
                     ┌─────────────────────────────────┴─────────────────────────────────┐
                     │                                                                   │
                     ▼                                                                   ▼
       [Krishi Vibhag Denial]                                            [Municipal Corporation Denial]
  Taluka Agriculture Office (Haveli):                               PMC Zonal Ward Office (e.g. Nagar Road):
"Your village is now inside PMC limits.                           "We are an urban municipal authority.
You are in a city corporation, not a rural village.               We do not process 7/12 agricultural subsidies,
Go to your Municipal Corporation Ward Office!"                     tractors, drip irrigation, or seed grants.
                                                                  Go to the Agriculture Department!"
                     │                                                                   │
                     └─────────────────────────────────┬─────────────────────────────────┘
                                                       │
                                                       ▼
                                    [THE PERI-URBAN WELFARE DISASTER]
                                • Slapped with Municipal Property Taxes on farmhouses & barns
                                • Denied rural Zilla Parishad agricultural benefits
                                • Unaware of entitlement to both urban & non-NA agricultural schemes
```

### The Legal Ground Truth that Resolves the Crisis:
- **Statutory Precedent**: Land within municipal corporation limits remains legally **Agricultural Land** as long as it has **NOT been converted for Non-Agricultural (NA) use under Section 42 of the Maharashtra Land Revenue Code (MLRC) 1966**.
- **Entitlement Rule**: If a citizen holds an active **7/12 extract (*Saat-Baara*)** showing agricultural classification:
  1. They **remain 100% legally eligible** for PM-KISAN, Namo Shetkari, MahaDBT Krishi, and PM-KUSUM.
  2. Because they now live within PMC municipal boundaries, they **simultaneously qualify** for PMC municipal welfare:
     - **Healthcare**: PMC Shahari Garib Arogya Card (SGAY) for medical emergencies.
     - **Education**: PMC Maulana Azad and Annabhau Sathe scholarships for their children.
     - **Livelihood**: PM SVANidhi working capital loans for selling farm produce in urban wards.

---

## 4. NagrikSetu Deterministic Zod Schema Mapping

To handle all 3 pillars in the NagrikSetu Engine, we define the unified schema taxonomy:

```typescript
import { z } from "zod";

export const SchemePillarEnum = z.enum([
  "HEALTHCARE",
  "EDUCATION",
  "AGRICULTURE_LIVELIHOOD"
]);

export const UniversalApplicantSchema = z.object({
  // Common Demographics
  applicant_id: z.string().uuid(),
  full_name: z.string().min(2),
  masked_aadhaar: z.string().regex(/^XXXX-XXXX-[0-9]{4}$/),
  annual_family_income: z.number().nonnegative(),
  domicile_years_in_ulb: z.number().min(0),
  caste_category: z.enum(["OPEN", "OBC", "SC", "ST", "VJNT", "EWS"]),
  ration_card_type: z.enum(["YELLOW_BPL", "ORANGE_APL", "WHITE", "NONE"]),
  number_of_children: z.number().int().min(0),
  third_child_born_post_may_2001: z.boolean(),

  // Healthcare Specific
  requires_critical_care: z.boolean().default(false),
  disease_category: z.enum(["GENERAL", "DIALYSIS", "ONCOLOGY", "CARDIOLOGY"]).optional(),
  has_sgay_membership: z.boolean().default(false),

  // Education Specific
  ssc_percentage: z.number().min(0).max(100).optional(),
  hsc_percentage: z.number().min(0).max(100).optional(),
  is_pmc_school_student: z.boolean().default(false),
  is_safai_karamchari_child: z.boolean().default(false),
  disability_percentage: z.number().min(0).max(100).default(0),

  // Agriculture & Peri-Urban Specific
  owns_agricultural_land: z.boolean().default(false),
  has_active_7_12_extract: z.boolean().default(false),
  is_land_non_agricultural_converted: z.boolean().default(false),
  landholding_hectares: z.number().nonnegative().default(0),
  is_street_vendor_or_hawker: z.boolean().default(false)
});
```

---

## 5. Summary Impact Matrix

| Parameter | Pillar 1: Healthcare | Pillar 2: Education | Pillar 3: Agriculture & Peri-Urban |
| :--- | :--- | :--- | :--- |
| **Primary Municipal Scheme** | Shahari Garib Arogya (SGAY) | Maulana Azad & Annabhau Sathe | Peri-Urban 7/12 & PM SVANidhi |
| **Primary Benefit** | ₹1L–₹5L hospital cover (50%–100%) | ₹15,000–₹25,000 one-time DBT | ₹12,000/yr DBT + ₹50k loan + 80% subsidy |
| **Core Target Group** | Low-income patients, Dialysis/Cancer | SSC/HSC students in municipal limits | Peri-urban farmers & farm produce hawkers |
| **Silent Disqualifier** | Expired annual card, no 3-yr domicile | 3rd child post-2001, single typo | Dismissed by Krishi Vibhag as "city dwellers" |
| **NagrikSetu Intervention** | Pre-authorizes & verifies empanelment | Matches criteria & pre-audits typos | **Proves 7/12 non-NA status & bridges both ULB and Krishi schemes** |

This 3-pillar taxonomy gives NagrikSetu complete, end-to-end coverage across urban and peri-urban municipal India.
