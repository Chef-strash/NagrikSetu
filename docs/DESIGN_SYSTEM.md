# NagrikSetu Design System: Civic-Industrial & Vernacular Accessibility
**Codename**: `Civic-Foundry` | **Version**: 1.0 (Hackathon Edition) | **Team**: Whitebox

---

## 1. Core Philosophy: The Anti-AI-Trope Manifesto

NagrikSetu is **not** a chatbot wrapper, a toy AI startup, or a generic SaaS dashboard. It is a **deterministic municipal welfare infrastructure console**.

### 🚫 The "Banned AI Tropes" (Strictly Forbidden in Code & Design)
| Banned AI Trope | Why It Fails | NagrikSetu Statutory Replacement |
| :--- | :--- | :--- |
| **Purple/Violet AI Gradients** (`from-purple-500 to-indigo-600`) | Screams "unreliable LLM hallucination wrapper". | **Civic Navy & Bharat Tiranga Palette** (Deep Ashok Slate `#0F172A`, Statutory Saffron `#EA580C`, Civic Emerald `#059669`). |
| **Sparkle Icons (`✨`, Lucide `Sparkles`)** | Suggests "magic" rather than legally binding government entitlement. | **Statutory Icons** (`Scale`, `ShieldCheck`, `Building2`, `Stamp`, `FileCheck2`, `Landmark`). |
| **Floating Corner Chatbot Bubble** | Informal slum dwellers cannot type English prompts into tiny popups. | **Full-Screen WhatsApp/PWA Interface** with prominent vernacular audio intake & large camera upload targets. |
| **Vague AI Marketing Copy** ("Supercharge with AI") | Disqualifies platform in government & CAG audit contexts. | **Statutory Precision Copy** ("Statutory Criteria Verified under PMC Resolution No. 1184-B", "First 8 Digits Masked in Volatile RAM"). |
| **Unanchored Decisions** ("You might be eligible!") | Citizens waste ₹500 in daily wages on "might be". | **Binary Determinism** (`ELIGIBLE: ₹15,000 APPROVED` or `DISQUALIFIED: Annual Income ₹1.4L exceeds ₹1.2L statutory ceiling`). |

---

## 2. Color Palette & Token Architecture

The palette reflects the solemnity of municipal governance, the warmth of citizen empowerment, and high-visibility status indicators:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ NAGRIKSETU DESIGN TOKENS (TAILWIND MAPPINGS)                                             │
├─────────────────────┬──────────────┬───────────────────────────────────────────────────┤
│ Token Name          │ Hex Value    │ Semantic Usage                                    │
├─────────────────────┼──────────────┼───────────────────────────────────────────────────┤
│ `civic-navy-950`    │ `#0B1120`    │ Primary background for telemetry & system headers │
│ `civic-navy-900`    │ `#0F172A`    │ Containers, dark headers, authority banners       │
│ `civic-slate-800`   │ `#1E293B`    │ Borders, card dividers, subtle container strokes  │
│ `bharat-saffron-600`│ `#EA580C`    │ Intent extraction, action items, camera triggers  │
│ `bharat-amber-500`  │ `#D97706`    │ Pre-filled PDF docket badges, warnings            │
│ `statutory-blue-600`│ `#0284C7`    │ Strict Zod schema evaluation, state gazette links │
│ `civic-emerald-600` │ `#059669`    │ Verified eligibility, passed pre-audits, grants   │
│ `friction-red-600`  │ `#DC2626`    │ Peer review counter warnings, unofficial clerk fees│
│ `canvas-cream-50`   │ `#F8FAFC`    │ Citizen mobile viewport background                │
│ `paper-white`       │ `#FFFFFF`    │ Official PDF preview, citizen response cards      │
└─────────────────────┴──────────────┴───────────────────────────────────────────────────┘
```

### Color Semantics in Practice
- **Green (`#059669`)**: Means guaranteed statutory money or verified criteria. Never used decorationally.
- **Red (`#DC2626`)**: Exclusively reserved for **Crowdsourced Counter Truth** (e.g. *"Clerk demands extra physical stamp"*) and **Statutory Disqualification**.
- **Amber/Saffron (`#EA580C`)**: Reserved for **In-RAM Processing** notices and **T-30 Day Window Expiry** warnings.

---

## 3. Typography & Information Density

- **Primary Sans**: `Inter`, `-apple-system`, `system-ui` (Maximum legibility at small sizes).
- **Tabular/Data Monospace**: `JetBrains Mono`, `Fira Code`, or `ui-monospace`.
  - **Always** format Aadhaar numbers, IFSC codes, Application Docket numbers, and monetary figures in tabular monospace (`font-mono tracking-wider font-semibold`).
- **Devanagari Bilingual Anchoring**:
  - Key headers, scheme names, and ward locations **must** include bilingual Devanagari subtitles:
    - *Pune Municipal Corporation* $\rightarrow$ **पुणे महानगरपालिका**
    - *Maulana Azad Education Scheme* $\rightarrow$ **मौलाना आझाद शैक्षणिक योजना**
    - *Kothrud Ward Office No. 14* $\rightarrow$ **कोथरूड क्षेत्रीय कार्यालय क्र. १४**

---

## 4. Visual Anatomy of the NagrikSetu Production Platform

The platform is a full-screen, responsive enterprise civic web application:

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ NAGRIKSETU MUNICIPAL PLATFORM                                                                            │
├────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ • Top Authority Header: Active ULB (Pune PMC) | Portal Monitor: 4,412 Active | RAM Buffer: OK          │
│ • Navigation Bar: [Scheme Discovery] [Document Pre-Audit] [Application Docket] [Peer Intel] [Fleet]    │
├────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ WORKSPACE CANVAS:                                                                                      │
│ • Scheme Discovery: Vernacular audio search (Sarvam AI), intent tags, statutory eligibility breakdown  │
│ • Document Pre-Audit: In-RAM OCR dropzone, live Aadhaar masking (XXXX-XXXX-1234), merged IFSC resolver │
│ • Application Docket: Official PMC/BMC pre-filled form preview, ward counter routing, PDF download     │
│ • Peer Intel Feed: Crowdsourced counter truth, unwritten clerk demands, dynamic warning tickers        │
│ • Ingestion Fleet: 4,400+ ULB crawler health, Playwright logs, Cline autonomous self-healing telemetry │
└────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Micro-Interactions & Proof Indicators

Judges look for **tangible proof** that the system is doing real computation, not mocking output:

1. **The Instant Document Verification Badge**:
   - Every time an Aadhaar or passbook photo is processed, a status badge confirms:
     `🟢 OCR VERIFIED | AADHAAR MASKED | IFSC VALIDATED`
2. **The Zod Rule Execution Stream**:
   - Don't just show "Eligible". Render the statutory criteria as an interactive checklist:
     - `[✓] Domicile >= 3 Yrs (PMC limits) — PASS (Res. 1184-B)`
     - `[✓] 10th Standard Marks >= 80% — PASS (Actual: 82.4%)`
     - `[✓] Annual Household Income <= ₹1,20,000 — PASS (Actual: ₹96,000)`
     - `[★] BENEFIT AWARDED: ₹15,000 Direct Bank Transfer`
3. **The Merged Bank IFSC Auto-Resolution**:
   - When an old passbook is uploaded with an obsolete IFSC (e.g. `SYNB0005012` from Syndicate Bank), the UI highlights:
     `⚠️ OBSOLETE IFSC DETECTED: Syndicate Bank merged into Canara Bank`
     `✅ AUTO-RESOLVED TO NPCI ACTIVE IFSC: CNRB0005012 (Kothrud Branch)`
4. **The Crowdsourced Counter-Truth Alert Banner**:
   - Styled with a high-contrast danger border (`border-l-4 border-red-600 bg-red-50 text-red-900`):
     `🚨 WARD DESK ADVISORY (Reported 2 hrs ago by Samaj Sevak):`
     `Desk No. 3 clerk is asking for 2 physical passport photos + ₹50 stamp paper not listed on the official portal. Bring them with you!`
