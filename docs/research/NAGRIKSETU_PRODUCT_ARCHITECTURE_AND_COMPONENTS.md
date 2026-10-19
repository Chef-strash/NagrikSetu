# NagrikSetu Product Architecture & End-to-End System Design

This document details the 5 core components of **NagrikSetu**, their closed-loop interactions, and key architectural additions to ensure an airtight, audit-compliant municipal welfare delivery system.

---

## The 5 Core Product Components

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       NAGRIKSETU CLOSED-LOOP ARCHITECTURE                     │
└─────────────────────────────────────────────────────────────────────────────┘

 [Municipal Portals & Gazette PDFs]
                 │
                 ▼
  ┌──────────────────────────────┐
  │ COMPONENT 1: BACKEND INGEST  │ ◄── Automated Scrapers & Gazette Monitors
  │ Live Municipal Scheme Base   │     (Tracks 4,400+ ULBs, arbitrary windows)
  └──────────────┬───────────────┘
                 │ Updates Live Schemas
                 ▼
  ┌──────────────────────────────┐       ┌────────────────────────────────┐
  │ COMPONENT 5: IDENTITY VAULT  │ ────► │ PROACTIVE SENTINEL ALERTS      │
  │ Mini-KYC & Household Profile │       │ (Push alerts 30 days before    │
  └──────────────┬───────────────┘       │  arbitrary window closes)      │
                 │ Instant Eligibility   └────────────────────────────────┘
                 ▼
  ┌──────────────────────────────┐
  │ COMPONENT 3: VERNACULAR AI   │ ◄── Bidirectional Audio & Text
  │ WhatsApp / Web Speech Engine │     (Marathi, Hindi, Tamil, Kannada, etc.)
  └──────────────┬───────────────┘     Natural Language Intent Decomposition
                 │
                 ▼
  ┌──────────────────────────────┐
  │ COMPONENT 4: INTERACTIVE     │ ◄── Assisted Pre-Filing & Document OCR
  │ ADVISORY & DOSSIER ENGINE    │     Cross-Document Pre-Audit & Counter Map
  └──────────────┬───────────────┘
                 │                              ▲
                 │ Injects Warnings             │ Feeds Real-World Pitfalls
                 ▼                              │ & Delays into Advisory
  ┌─────────────────────────────────────────────┴────────────────┐
  │ COMPONENT 2: CROWDSOURCED PEER INTELLIGENCE & REVIEW LOOP    │
  │ Community Pitfall Tracking, Counter Delays, Clerk Quirks     │
  └──────────────────────────────────────────────────────────────┘
```

---

### Component 1: Municipal Scheme Ingestion & Live Maintenance Engine (Back-End)
* **What it does:** Continuously monitors, scrapes, and parses fragmented municipal websites, departmental circulars, and unindexed scanned regional PDFs across Urban Local Bodies (e.g., `dbt.pmc.gov.in`, `bbmp.gov.in`, `mcgm.gov.in`).
* **The Intelligence Layer:** Converts unstructured Marathi/Hindi/English bureaucratic circulars into deterministic JSON/Zod schemas containing:
  - Exact eligibility criteria (income ceilings, age limits, academic cutoffs, caste categories).
  - Valid document alternatives (e.g., Orange Ration Card accepted in lieu of Tehsildar income slip).
  - Real-time application windows (opening dates, cutoffs, budgetary disbursement caps).
* **The Problem It Solves:** Solves the **Discovery & Indexing Blackout** where municipal schemes are omitted from national portals like `myScheme.gov.in` and buried in obscure civic sub-domains.

---

### Component 2: Crowdsourced Peer Intelligence & Pitfall Review Loop
* **What it does:** A community feedback network allowing citizens, grassroots volunteers, and applicants to log real-world counter experiences.
* **Captured Intelligence:**
  - **Unwritten Clerk Demands:** e.g., *"Counter 3 at Kothrud Ward Office insists on an original school leaving certificate, not just 10th marksheet."*
  - **Real Operational Delays:** e.g., *"Tehsildar income certificate is taking 24 days right now due to election duty, not 7 days."*
  - **Common Filing Pitfalls:** e.g., *"Bank passbooks without an IFSC stamp on Page 1 are being rejected by audit clerks."*
* **The Closed-Loop Feedback:** This crowd intelligence is **not** a dead review board. It directly feeds into **Component 4**. When a new citizen asks about a scheme, the advisory engine automatically injects these real-world tips and warnings before they step foot in the ward office.

---

### Component 3: Bidirectional Multilingual Audio & Text Understanding Engine
* **What it does:** End-to-end voice and text intake in regional languages (Marathi, Hindi, Kannada, Tamil, Gujarati, etc.) over accessible channels like WhatsApp and Web.
* **Intent Decomposition:**
  - Low-literacy citizens do not know scheme names or government department taxonomies.
  - They speak or text their life situation naturally:
    - *"Beti ne 10th pass kiya 82% se, aage college ke liye paise chahiye."*
    - *"Abba hospital mein admitted hain heart attack ke liye, bill 1.5 lakh hai."*
  - The engine extracts implicit attributes: Life Event (medical emergency, board exam), Demographics (student, female, senior), Financial Need (reimbursement, cash grant), and Locality (Pune, Ward 14).
* **Bidirectional Speech:** Responds in natural spoken regional audio so illiterate or semi-literate users never have to read dense text.

---

### Component 4: Interactive Entitlement Advisory & Assisted Pre-Filing Engine
* **What it does:** An interactive dialogue agent guiding the citizen step-by-step from discovery to a physical/digital filing packet.
* **Interactive Disambiguation:**
  - Asks clarifying questions in simple language: *"Do you have an Orange Ration Card or a yellow card?"*
  - Validates missing prerequisites before the citizen wastes a trip.
* **Clear Action Roadmap:**
  - Specifies the exact physical destination: *"Go to Pune Municipal Corporation Health Department, Shivajinagar, Counter 2."*
  - Names the exact physical form name and counter timings.
* **Assisted Form-Filling & Document Pre-Audit:**
  - Citizen snaps photos of documents (Aadhaar, Marksheet, Passbook, Hospital Slip).
  - OCR extracts names, dates, and account numbers, running deterministic regex checks to catch single-letter typos or unseeded bank accounts before submission.
  - Generates the pre-filled official municipal application form ready for signature.
* **Integration with Component 2:** The pre-submission screen displays live peer warnings: *"Note: Recent applicants report Counter 2 requires 2 passport photos attached to Page 2."*

---

### Component 5: Citizen Identity Vault (Mini-KYC) & Proactive Window Sentinel
* **What it does:** A lightweight, encrypted household profile and notification sentinel.
* **Stored Attributes (Mini-KYC):**
  - Household income slab, ration card category (Yellow/Orange/White), caste category, ward/pincode, family members (school-going children, elders, pregnant women).
* **Instant Filtering:** When a citizen asks any query, the system immediately pre-filters schemes against their profile without re-asking basic biographical questions.
* **Proactive Window Sentinel:**
  - When Component 1 detects that a municipal portal has opened an unannounced 30-day window (e.g., Maulana Azad DBT opened on Aug 15), the Sentinel immediately triggers proactive WhatsApp voice/text alerts to all matched household profiles:
  - *"Alert: Pune PMC has opened the ₹15,000 scholarship window for Neha. You have 28 days left. Tap here to submit."*

---

## Are We Missing Anything? Critical Extensions to Make It Complete

To make the architecture 100% comprehensive and defendable to hackathon judges, consider these 4 high-value additions:

### 1. The Post-Submission Tracking & Grievance Escalation Loop
* **The Gap:** What happens after the citizen submits at Counter 3?
* **The Solution:** Under state citizen service laws (e.g., *Maharashtra Right to Public Services Act / RTS Act*), municipal departments have legally binding time-limits (e.g., 30 days for scholarship disbursal, 7 days for hospital authorization).
* **NagrikSetu Feature:** The user logs their application token date. If the municipal desk stalls past the statutory RTS deadline, NagrikSetu automatically generates a 1-click Right to Service appeal letter addressed to the Ward Officer.

### 2. Community Intermediary / Multi-Profile Mode ("Samaj Sevak / Anganwadi" Mode)
* **The Gap:** Many vulnerable individuals (elderly widows, completely illiterate slum dwellers) do not own smartphones.
* **The Solution:** Allow a single local volunteer, Anganwadi worker, or Common Service Center (CSC) operator to manage multiple household profiles from one WhatsApp number, multiplying ground reach 10x.

### 3. Graceful Offline & Low-Bandwidth Operation
* **The Gap:** Slum settlements frequently experience patchy 4G/2G mobile data.
* **The Solution:** Client-side image compression (compressing a 5MB phone photo to a 150KB readable OCR snippet) and offline audio recording so messages queue and upload automatically when signal recovers.

### 4. Deterministic Rule Engine vs. LLM Hallucination Guardrail
* **The Gap:** LLMs can hallucinate eligibility criteria or invent imaginary scheme amounts.
* **The Solution:** The LLM handles **conversational vernacular understanding and speech parsing**, but the actual eligibility matching is evaluated by **deterministic code / Zod schema rules** against the verified municipal database. This guarantees zero policy hallucinations.

---

## Summary Matrix: How the Components Connect

| Component | Upstream Dependency | Downstream Output | Core User Value |
| :--- | :--- | :--- | :--- |
| **1. Backend Ingest** | Municipal Web Portals / Gazette PDFs | Structured Scheme Schemas | Eliminates portal information blackout |
| **2. Review Loop** | Citizen & Volunteer Counter Experiences | Real-world tips injected into Advisory | Eliminates hidden clerk traps & surprise delays |
| **3. Vernacular AI** | Citizen WhatsApp Voice / Text | Decomposed Intent & Attributes | Eliminates digital literacy & language barriers |
| **4. Advisory & Pre-Filing** | Scheme DB + Review Intelligence + User Photos | Pre-Audited Dossier + Counter Roadmap | Eliminates clerical typo rejections & wasted trips |
| **5. Identity Vault & Sentinel** | User Mini-KYC + Ingest Window Triggers | Proactive Alerts 30 Days Ahead | Eliminates missed arbitrary window deadlines |
