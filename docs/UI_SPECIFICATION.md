# NagrikSetu: Consumer Platform UI Specification & Wireframes
**Architecture**: Responsive Civic Web Platform (Desktop) | **Engine**: Next.js 14 + Tailwind CSS + Lucide Icons
**Design Standard**: Impeccable Operate Mode, Civic-Foundry Tokens, Anti-AI-Trope Standard (Zero Emojis, Zero Jargon)

---

## 1. Product Platform Vision (Independent Citizen Preparation Toolkit)

NagrikSetu is an **independent civic tool for citizens** in Pune (and Indian Urban Local Bodies):
- It has **zero government affiliation** and **does not connect to internal government backends**.
- It does **not** issue official government case tracking IDs or track internal government processing.
- Its mission is to empower citizens and families to:
  1. **Discover** municipal corporation welfare schemes and direct financial grants they qualify for.
  2. **Get step-by-step guidance** from an interactive assistant on counter hours, prerequisites, and rules.
  3. **Check their documents** before visiting the ward counter (catching merged bank IFSC errors, name spelling mismatches, and masking Aadhaar numbers).
  4. **Access official application forms and links** with clear staple checklists ready for physical submission.
  5. **Read and share community tips** from fellow citizens about counter quirks, clerk requirements, and photocopy rules.

---

## 2. Core Site Navigation & Routes

The platform is structured into clear consumer routes:
- `/` - **Home**: Plain search bar (text and voice), category buttons linking to pre-filtered schemes, and active session resume.
- `/schemes` - **Schemes Directory**: Search and filter schemes by category (Education, Health Care, Livelihood) and income limit.
- `/schemes/[id]` - **Scheme Details & Tips**: Criteria, benefit, submission counter location, and community tips from other applicants underneath.
- `/sessions` - **Active Sessions**: List of in-progress applications. Beside each session: `[ Open in Assistant ]` and `[ Check Documents ]`.
- `/assistant` - **Assistant**: Split-view workstation (Conversational Assistant on Left, Session State Card on Right).
- `/audit` - **Document Check**: Clean, full-width document verification view for a specific session without chat clutter.
- `/profile` - **Citizen Profile**: Household demographics, annual income, ration card category, street-vendor status, and preferred hospital checklist.

---

## 3. Global Header & Authentication States

```
GUEST STATE (LOGGED OUT):
+--------------------------------------------------------------------------------------------------+
| NagrikSetu  |  Pune Municipal Schemes Guide                Ward 14: Kothrud  |  मराठी  |  [ Sign In ]|
+--------------------------------------------------------------------------------------------------+
| Home                  Schemes                  Sessions                      Profile             |
+--------------------------------------------------------------------------------------------------+

SIGNED-IN STATE:
+--------------------------------------------------------------------------------------------------+
| NagrikSetu  |  Pune Municipal Schemes Guide                Ward 14: Kothrud  |  मराठी  |  Ramesh [v] |
|                                                                                      | Profile   |
|                                                                                      | Sign Out  |
+--------------------------------------------------------------------------------------------------+
| Home                  Schemes                  Sessions (1)                  Profile             |
+--------------------------------------------------------------------------------------------------+
```

---

## 4. Complete Wireframe Specifications

### Screen 1: Home (`/`)

```
+--------------------------------------------------------------------------------------------------+
|                                                                                                  |
|                   Find municipal schemes and grants for your family in Pune                      |
|                   पुणे महानगरपालिकेच्या योजनांची माहिती व अर्ज सहाय्य                            |
|                                                                                                  |
|  +--------------------------------------------------------------------+ +---------------------+  |
|  | Tell us what you need (e.g. "Daughter scored 82% in 10th")         | | [Mic] Voice Search  |  |
|  +--------------------------------------------------------------------+ +---------------------+  |
|                                                                                                  |
|  [ Start Application ]                            [ Browse All Schemes ]                         |
|                                                                                                  |
|  ----------------------------------------------------------------------------------------------  |
|  CATEGORIES:                                                                                     |
|                                                                                                  |
|  +-----------------------------+ +-----------------------------+ +-----------------------------+ |
|  | Education Grants            | | Health & Hospital Care      | | Livelihood & Self-Employment     | |
|  | Direct financial grants for | | Hospitalization assistance  | | Loans for street vendors     | |
|  | Class 10 and 12 students.   | | at 50+ empaneled hospitals. | | and hawkers (SVANidhi).     | |
|  |                             | |                             | |                             | |
|  | [ View Education Schemes ]  | | [ View Health Schemes ]     | | [ View Livelihood Schemes ]    | |
|  +-----------------------------+ +-----------------------------+ +-----------------------------+ |
|   -> links to:                  -> links to:                    -> links to:                     |
|   /schemes?category=education   /schemes?category=healthcare    /schemes?category=livelihood    |
|                                                                                                  |
|  ACTIVE APPLICATION:                                                                             |
|  Pooja Patil - Maulana Azad Scholarship (2 documents left to check)                              |
|  [ Resume in Assistant ]                                                                         |
+--------------------------------------------------------------------------------------------------+
```
- **Intake Logic**:
  - Typing or speaking into the search bar navigates to `/assistant?query=...` with the first message pre-sent.
  - Clicking `[ Start Application ]` navigates to `/assistant` with a clean welcome prompt from the assistant.
  - Category buttons navigate to `/schemes?category=...` with the relevant filter pre-selected.

---

### Screen 2: Schemes Directory (`/schemes`)

```
+--------------------------------------------------------------------------------------------------+
| SCHEMES DIRECTORY (18 Available Schemes in Pune PMC)                                             |
| Explore schemes funded under municipal social development and health budget heads.               |
+--------------------------------------------------------------------------------------------------+
|                                                                                                  |
| SEARCH AND FILTERS:                                                                              |
| +---------------------------------------------------------------------------------------------+  |
| | Search by scheme name, keyword, or education level...                                       |  |
| +---------------------------------------------------------------------------------------------+  |
|                                                                                                  |
| CATEGORY:                                                                                        |
| [ All Schemes (18) ]  [ Education (8) ]  [ Health Care (6) ]  [ Livelihood (4) ]          |
|                                                                                                  |
| INCOME LIMIT:                                                                                    |
| [ Any Income v ]  [ Under Rs. 1.6 Lakh v ]  [ Under Rs. 2.5 Lakh v ]                             |
|                                                                                                  |
+--------------------------------------------------------------------------------------------------+
| SCHEME LISTINGS                                                                                  |
|                                                                                                  |
| +----------------------------------------------------------------------------------------------+ |
| | Education  |  PMC Social Development Department                          Closes: 31-Oct-2026 | |
| | Bharat Ratna Maulana Abul Kalam Azad Educational Assistance Scheme                           | |
| | भारतरत्न मौलाना अबुल कलाम आझाद शैक्षणिक अर्थसहाय्य योजना                                     | |
| |                                                                                              | |
| | Benefit: Rs. 15,000 one-time grant via direct bank transfer                                  | |
| | Key Rules: Minimum 80% in Class 10 (70% for reserved categories) | Family income under Rs. 2.5L| |
| | Submission: Kothrud Ward Office No. 14, Counter 3                                            | |
| |                                                                                              | |
| | [ View Scheme Details & Community Tips ]                [ Start Application in Assistant ]   | |
| +----------------------------------------------------------------------------------------------+ |
|                                                                                                  |
| +----------------------------------------------------------------------------------------------+ |
| | Education  |  PMC Social Development Department                          Closes: 31-Oct-2026 | |
| | Lokshahir Annabhau Sathe Educational Assistance Scheme                                       | |
| | लोकशाहीर अण्णाभाऊ साठे शैक्षणिक अर्थसहाय्य योजना                                             | |
| |                                                                                              | |
| | Benefit: Rs. 25,000 one-time grant for students entering degree college                      | |
| | Key Rules: Minimum 75% to 80% in Class 12 (HSC) | Family income under Rs. 2.5 Lakh           | |
| | Submission: Kothrud Ward Office No. 14, Counter 3                                            | |
| |                                                                                              | |
| | [ View Scheme Details & Community Tips ]                [ Start Application in Assistant ]   | |
| +----------------------------------------------------------------------------------------------+ |
|                                                                                                  |
| +----------------------------------------------------------------------------------------------+ |
| | Health Care  |  PMC Health Department                                     Open Round-the-Year| |
| | Shahari Garib Arogya Yojana (SGAY)                                                           | |
| | शहरी गरीब आरोग्य योजना                                                                       | |
| |                                                                                              | |
| | Benefit: Rs. 1,00,000 to Rs. 2,00,000 treatment assistance (50% concession at private hosps)| |
| | Key Rules: Yellow or Orange ration card | Family income under Rs. 1.6 Lakh | 3 years PMC res.| |
| | Submission: Ward 14 Health Department Desk                                                   | |
| |                                                                                              | |
| | [ View Scheme Details & Community Tips ]                [ Start Application in Assistant ]   | |
| +----------------------------------------------------------------------------------------------+ |
+--------------------------------------------------------------------------------------------------+
```

---

### Screen 3: Scheme Details & Community Tips (`/schemes/[id]`)

```
+--------------------------------------------------------------------------------------------------+
| Bharat Ratna Maulana Abul Kalam Azad Educational Assistance Scheme         [ Back to Schemes ]   |
| Pune Municipal Corporation - Social Development Department                                       |
+--------------------------------------------------------------------------------------------------+
| Financial Grant: Rs. 15,000 one-time direct bank transfer for Class 10 (SSC)                    |
| Application Deadline: October 31, 2026                                                           |
+------------------------------------------------------------------+-------------------------------+
| WHO QUALIFIES                                                    | WHERE TO SUBMIT               |
| - Minimum 80.00% in Class 10 SSC (70.00% for SC/ST/OBC)          | - Office: Kothrud Ward 14     |
| - Annual family income under Rs. 2,50,000                        |   Paud Road, Opp More Vidyalaya
| - Minimum 3 continuous years residence within PMC limits         | - Counter: Counter No. 3      |
| - Family has 2 children or fewer (born after May 2001)           | - Hours: Mon-Fri 10:30-15:30  |
+------------------------------------------------------------------+-------------------------------+
| [ Start Application in Assistant ]                                                               |
+--------------------------------------------------------------------------------------------------+
| TIPS FROM OTHER APPLICANTS (42 tips)                                         [ Share Your Tip ]  |
+--------------------------------------------------------------------------------------------------+
| Rahul Shinde - Visited 3 days ago                                    Kothrud Ward, Counter 3     |
| "Make sure to bring 2 physical passport photos attached with a paperclip. The clerk asked for    |
| them even though it is not listed on the circular. File was accepted in 10 minutes."             |
| [ Helpful (28) ]                                                                                 |
| ------------------------------------------------------------------------------------------------ |
| Sunita More - Visited 1 week ago                                     Kothrud Ward, Counter 3     |
| "If you have an old Syndicate Bank passbook, make sure the IFSC code is updated to Canara Bank   |
| or the money will not reach your account. The website updated it for us automatically."          |
| [ Helpful (45) ]                                                                                 |
+--------------------------------------------------------------------------------------------------+
```

---

### Screen 4: Active Sessions List (`/sessions`)

```
+--------------------------------------------------------------------------------------------------+
| ACTIVE SESSIONS                                                            [ + Start New Query ] |
+--------------------------------------------------------------------------------------------------+
|                                                                                                  |
| +----------------------------------------------------------------------------------------------+ |
| | Pooja Patil - Maulana Azad Scholarship (Rs. 15,000)                     Status: 2 Docs Left  | |
| | Counter: Kothrud Ward 14, Counter 3                                                          | |
| | Last activity: Class 10 marksheet verified. Passbook and Aadhaar pending.                    | |
| |                                                                                              | |
| | [ Open in Assistant ]                        [ Check Documents ]                             | |
| +----------------------------------------------------------------------------------------------+ |
|                                                                                                  |
| +----------------------------------------------------------------------------------------------+ |
| | Ramesh Patil - Shahari Garib Arogya Health Card                         Status: Ready to Go  | |
| | Counter: Kothrud Ward 14, Counter 1                                                          | |
| | Last activity: Ration card and income certificate checked.                                   | |
| |                                                                                              | |
| | [ Open in Assistant ]                        [ Check Documents ]                             | |
| +----------------------------------------------------------------------------------------------+ |
+--------------------------------------------------------------------------------------------------+
```

---

### Screen 5: Assistant Split Workstation (`/assistant?session=id`)

*In this view, the right panel remains clean. When the user uploads a document and clicks `[ Check ]`, the verification results and error advice are communicated naturally by the Assistant in the **Left Panel** chat!*

```
+--------------------------------------------------------------------------------------------------+
| Session: Pooja Patil - Maulana Azad Scholarship (Rs. 15,000)                   [ Save and Exit ] |
+------------------------------------------------------------------+-------------------------------+
| ASSISTANT                                                        | SESSION STATE                 |
+------------------------------------------------------------------+-------------------------------+
| [Assistant]                                                      | SCHEME:                       |
| "Hello Ramesh. Pooja qualifies for this scholarship with her     | Maulana Azad Scholarship      |
| 82.4% score.                                                     | Benefit: Rs. 15,000 DBT       |
|                                                                  |                               |
| Submission is at Kothrud Ward Office No. 14, Counter 3.          | SUBMISSION LOCATION:          |
| Hours are Monday to Friday, 10:30 AM to 3:30 PM.                 | Kothrud Ward 14, Counter 3    |
| Keep 2 physical passport photos with a paperclip ready.          | Hours: Mon-Fri 10:30-15:30    |
|                                                                  | ----------------------------- |
| Please upload Pooja's passbook and Aadhaar card on the right     | DOCUMENTS REQUIRED:           |
| so we can check for any errors before you go."                   | [x] 10th Marksheet (Verified) |
| [Listen in Marathi]                                              | [x] Income Cert (Verified)    |
|                                                                  | [ ] Bank Passbook             |
| ---------------------------------------------------------------- | [ ] Aadhaar Card              |
| [You]                                                            | ----------------------------- |
| [Clicked 'Check' on Bank Passbook upload]                        | UPLOAD DOCUMENTS:             |
| ---------------------------------------------------------------- |                               |
| [Assistant]                                                      | Bank Passbook:                |
| "I checked your bank passbook!                                   | [ Choose File ] [ Check ]     |
| • Account number ending in 4912 is verified.                     | File: passbook_kothrud.jpg    |
| • Your old Syndicate Bank IFSC was auto-updated to Canara Bank   |                               |
|   CNRB0005012 so the treasury payment will not bounce.          | Aadhaar Card:                 |
| • Name on passbook matches Pooja Ramesh Patil."                  | [ Choose File ] [ Check ]     |
|                                                                  | File: aadhaar_front.png       |
| ---------------------------------------------------------------- | ----------------------------- |
| [Assistant]                                                      | OFFICIAL FORM LINK:           |
| "Both documents are now checked! You can download the official   | [ Download Form 1184-B (PDF)] |
| municipal form below and take your papers to Counter 3."         |                               |
+------------------------------------------------------------------+ PAPERS TO STAPLE TOGETHER:    |
| +--------------------------------------------------------------+ | 1. Printed Form 1184-B        |
| | Ask a question or speak...                                   | | 2. Masked Aadhaar copy        |
| +--------------------------------------------------------------+ | 3. 10th Marksheet copy        |
| [ Speak Voice ]   [ "What are Counter 3 hours?" ]                | 4. College fee receipt        |
|                                                                  | 5. Income Certificate         |
|                                                                  | 6. Bank Passbook copy         |
+------------------------------------------------------------------+-------------------------------+
```

---

### Screen 6: Dedicated Document Checker (`/audit?session=id`)

*Direct, full-width screen without chat. Allows uploading passbook and Aadhaar, clicking `[ Check ]` beside the upload, and viewing instant verification results.*

```
+--------------------------------------------------------------------------------------------------+
| CHECK DOCUMENTS: Maulana Azad Scholarship (Pooja Patil)                  [ Back to Sessions ]    |
| Upload your documents and click check to catch any mistakes before visiting the ward counter.    |
+--------------------------------------------------------------------------------------------------+
|                                                                                                  |
| REQUIRED DOCUMENTS FOR THIS SCHEME:                                                              |
|                                                                                                  |
| 1. Class 10 Marksheet                                                                            |
|    Status: Verified (Score: 82.40% - Meets 80% requirement)                                      |
|                                                                                                  |
| 2. Tahsildar Income Certificate                                                                  |
|    Status: Verified (Annual Income: Rs. 1,40,000 - Under Rs. 2,50,000 limit)                     |
|                                                                                                  |
| 3. Student Bank Passbook                                                                         |
|    +------------------------------------------------------------------------------------------+  |
|    | File: passbook_kothrud.jpg                                       [ Choose File ] [ Check ]|  |
|    |                                                                                          |  |
|    | Status: Verified                                                                         |  |
|    | - Account: *******4912                                                                   |  |
|    | - IFSC: Old Syndicate Bank code updated to active Canara Bank code (CNRB0005012)         |  |
|    | - Name: Pooja Ramesh Patil (Matches Aadhaar)                                             |  |
|    +------------------------------------------------------------------------------------------+  |
|                                                                                                  |
| 4. Student Aadhaar Card                                                                          |
|    +------------------------------------------------------------------------------------------+  |
|    | File: aadhaar_front.png                                          [ Choose File ] [ Check ]|  |
|    |                                                                                          |  |
|    | Status: Verified                                                                         |  |
|    | - Aadhaar Number: XXXX-XXXX-4912                                                         |  |
|    | - Name: Pooja Ramesh Patil                                                               |  |
|    +------------------------------------------------------------------------------------------+  |
|                                                                                                  |
| [ Save & Return to Session ]                                                                     |
+--------------------------------------------------------------------------------------------------+
```

---

### Screen 7: Profile (`/profile`)

```
+--------------------------------------------------------------------------------------------------+
| CITIZEN PROFILE                                                                 Ward: Kothrud 14 |
| Save your household details to automatically check eligibility for municipal schemes.            |
+--------------------------------------------------------------------------------------------------+
|                                                                                                  |
| 1. HOUSEHOLD DETAILS                                                                             |
| Name: Ramesh Dnyaneshwar Patil  |  Mobile: +91 98220 41912  |  Ward: Ward 14 (Kothrud)           |
| Annual Income: Rs. 1,40,000     |  Domicile: 5 Years        |  Category: Open / General          |
| Ration Card: Orange (APL Low-Income)  |  Children: 2 (Third child born post-May 2001: No)        |
|                                                                                                  |
| 3. NEAREST EMPANELED HOSPITALS (Select hospitals your family uses for health assistance):        |
| [x] Poona Hospital & Research Centre (Sadashiv Peth)                                             |
| [x] Sahyadri Super Specialty Hospital (Deccan Gymkhana)                                          |
| [x] Kamla Nehru Municipal Hospital (Mangalwar Peth - Free Municipal Hospital)                    |
| [ ] KEM Hospital Pune (Rasta Peth)                                                               |
| [ ] Bharati Hospital (Dhankawadi)                                                                |
|                                                                                                  |
| [ Save Profile ]                                                                                 |
+--------------------------------------------------------------------------------------------------+
```

---

## 5. Technical Design Tokens & Aesthetics
- **Theme**: Civic-Foundry (Ashok Slate `#0F172A`, Bharat Saffron `#EA580C`, Civic Emerald `#059669`, Neutral Background `#F8FAFC`).
- **Typography**: `Inter` for all UI text, `JetBrains Mono` for tabular numerals (`font-mono tabular-nums`).
- **Icons**: Lucide icons (`Check`, `AlertCircle`, `Mic`, `Volume2`, `Download`, `User`, `Search`, `ArrowRight`).
- **Strict Banned Patterns**: Zero emojis, zero purple AI gradients, zero decorative floating bubbles.
