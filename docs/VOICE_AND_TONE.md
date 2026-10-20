# NagrikSetu: Voice, Tone & Vernacular Architecture
**Mission**: Dignified Civic Entitlement, Absolute Statutory Clarity, Zero Bureaucratic Obfuscation

---

## 1. Core Voice Principles

NagrikSetu speaks like a **compassionate, incorruptible municipal legal advocate standing directly next to the citizen at the counter**.

| Never Speak Like This (Tech / Bureaucratic Jargon) | Always Speak Like This (NagrikSetu Civic Voice) | Why |
| :--- | :--- | :--- |
| *"Our AI model has analyzed your multi-modal profile."* | *"We verified your documents against the official Pune Municipal Corporation rules."* | Citizens trust laws and municipal resolutions, not blackbox AI models. |
| *"You seem to be eligible for potential welfare assistance."* | *"You qualify for ₹15,000 under PMC Resolution No. 1184-B. Here is your completed application."* | Eliminates anxiety. Gives binding statutory certainty. |
| *"Error 422: Invalid IFSC identifier in schema validation."* | *"Your passbook has an old Syndicate Bank code. Because of the bank merger, we updated it to Canara Bank so your grant money doesn't bounce."* | Explains the real-world consequence and provides the fix. |
| *"Please visit our knowledge base for submission guidelines."* | *"Take this printed paper directly to Kothrud Ward Office 14, Counter 3 before 3:00 PM."* | Actionable, physical physical-world instructions. |

---

## 2. Vernacular Localization Standards (Marathi, Hindi, English)

Because the hackathon demonstration anchors on **Pune Municipal Corporation (PMC)** and **Brihanmumbai Municipal Corporation (BMC)**, the Marathi and Hindi strings must be culturally authentic, dignified, and linguistically precise:

### A. The Maulana Azad Scheme Intake Prompt
* **Vernacular Audio Query (Marathi)**:  
  *Audio*: *"माझ्या मुलीला दहावीत ८२% मिळाले आहेत, पुढच्या शिक्षणासाठी महापालिकेकडून काही मदत मिळेल का?"*  
  *Transcribed Text*: "Beti 10th pass 82%, higher education grant available?"
* **NagrikSetu Response (Marathi)**:  
  *"अभिनंदन! तुमच्या मुलीला पुणे महानगरपालिकेकडून 'मौलाना अबुल कलाम आझाद योजने' अंतर्गत ₹१५,००० चे शैक्षणिक अनुदान मंजूर होऊ शकते. आम्ही तुमचा अर्ज तयार केला आहे."*

### B. The PII Masking Transparency Banner
* **English**: *"Statutory Privacy Guarantee: Your original Aadhaar card was scanned in temporary memory and wiped immediately. Only the masked number (XXXX-XXXX-8921) is kept for the official municipal form."*
* **Hindi**: *"कानूनी सुरक्षा गारंटी: आपका मूल आधार कार्ड केवल अस्थायी मेमोरी (RAM) में जांचा गया और तुरंत मिटा दिया गया। सरकारी फॉर्म के लिए केवल सुरक्षित नंबर (XXXX-XXXX-8921) इस्तेमाल हुआ है।"*

### C. The Crowdsourced Counter-Truth Alert
* **English**: *"Ward Desk Alert: 3 applicants today reported that Counter 3 clerk is asking for 2 physical passport-size photos and parental domicile proof. Please carry these to avoid a second trip."*
* **Marathi**: *"कार्यालय सूचना: आज अर्ज केलेल्या नागरिकांनी कळवले आहे की, काउंटर ३ वरील अधिकारी २ पासपोर्ट फोटो आणि पालकांचा रहिवासी दाखला मागत आहेत. सोबत घेऊन जा."*

---

## 3. UI Copywriting Matrix (Component Tokens)

```json
{
  "cta_record_audio": {
    "en": "Tap & Speak your requirement",
    "mr": "माईक दाबा आणि बोला",
    "hi": "माइक दबाएं और अपनी बात कहें"
  },
  "cta_upload_camera": {
    "en": "Snap photo of Aadhaar & Passbook",
    "mr": "आधार कार्ड आणि पासबुकचा फोटो काढा",
    "hi": "आधार कार्ड और पासबुक का फोटो लें"
  },
  "badge_in_memory_verified": {
    "en": "Scanned in Transient RAM • 0 Bytes on Disk",
    "mr": "सुरक्षित इन-रॅम तपासणी • डेटा सेव्ह नाही",
    "hi": "सुरक्षित इन-रैम जांच • कोई डेटा सेव नहीं"
  },
  "status_eligible": {
    "en": "Statutory Entitlement Approved: ₹15,000",
    "mr": "शासकीय पात्रता मंजूर: ₹१५,०००",
    "hi": "सरकारी पात्रता स्वीकृत: ₹१५,०००"
  },
  "cta_download_docket": {
    "en": "Download Official Ward Submission Pack (PDF)",
    "mr": "अधिकृत अर्ज आणि कागदपत्रे डाउनलोड करा (PDF)",
    "hi": "आधिकारिक आवेदन और कागजात डाउनलोड करें (PDF)"
  }
}
```
