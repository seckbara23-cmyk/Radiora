# Radiora Medical
## Pilot User Guide

**Intelligent Radiology Reporting Management Platform**

---

| | |
|---|---|
| **Version** | 1.0 — Pilot Phase |
| **Date** | May 2026 |
| **Classification** | CONFIDENTIAL — Pilot Use Only |
| **Intended For** | Radiologists, Clinic Administrators, Medical Imaging Staff |

---

*Designed for clinics and medical imaging centres across Francophone Africa.*

---

> ⚠️ **Confidential Document.** This guide is intended exclusively for participants in the Radiora Medical pilot phase. Please do not distribute it outside your institution.

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [System Requirements](#2-system-requirements)
3. [Logging In](#3-logging-in)
4. [Dashboard Overview](#4-dashboard-overview)
5. [Patient Management](#5-patient-management)
6. [Study Workflow](#6-study-workflow)
7. [Reporting Workflow](#7-reporting-workflow)
8. [AI Features Overview](#8-ai-features-overview)
9. [External AI Results](#9-external-ai-results)
10. [Audit & Traceability](#10-audit--traceability)
11. [Security & Privacy](#11-security--privacy)
12. [Troubleshooting](#12-troubleshooting)
13. [Pilot Feedback](#13-pilot-feedback)
14. [Quick Start](#14-quick-start)
15. [Support & Contact](#15-support--contact)

---

## 1. Introduction

### What is Radiora Medical?

Radiora Medical is a digital radiology reporting management platform, designed specifically for clinics and medical imaging centres across Francophone Africa.

It enables your institution to:

- Centrally manage patient records and imaging studies
- Draft, structure and finalise radiology reports
- Use AI-assisted tools to improve efficiency and productivity
- Maintain complete traceability of all clinical actions
- Monitor performance indicators for your imaging department

### Purpose of the Pilot Phase

You are participating in the **pilot phase** of Radiora Medical. This phase is designed to:

1. Test the platform under real clinical conditions
2. Collect your feedback to improve the user experience
3. Identify priority features for your institution
4. Train your team before full deployment

> ℹ️ **Information:** During the pilot phase, all data entered is real but protected. The production environment will be separate from any testing environment if needed. Please verify the setup with your administrator.

### Important Notice on AI Features

> ⚠️ **IMPORTANT CLINICAL NOTICE**
>
> The artificial intelligence features integrated into Radiora Medical are **assistance tools** intended to improve clinician productivity.
>
> - All AI-generated suggestions **must always be reviewed, verified and validated** by a qualified healthcare professional before any report is finalised.
> - Radiora Medical **does not replace** medical judgement or the professional responsibility of the radiologist.
> - The clinician remains solely responsible for the content of every signed report.

---

## 2. System Requirements

### Recommended Browsers

| Browser | Minimum Version | Recommended |
|---|---|---|
| Google Chrome | 110+ | ✅ Recommended |
| Mozilla Firefox | 110+ | ✅ Recommended |
| Microsoft Edge | 110+ | ✅ Compatible |
| Safari | 16+ | ⚠️ Compatible with limitations |
| Internet Explorer | All versions | ❌ Not supported |

### Technical Requirements

| Element | Requirement |
|---|---|
| **Internet Connection** | Stable broadband (minimum 5 Mbps) |
| **Protocol** | HTTPS required — secure access only |
| **Microphone** | Required for voice dictation (built-in or USB) |
| **Screen** | Minimum resolution 1280 × 720 px |
| **Cookies** | Must be enabled in the browser |
| **JavaScript** | Must be enabled in the browser |

> 💡 **Tip:** For the best experience, use Google Chrome on a desktop or laptop computer. Mobile access is supported, but some features are optimised for larger screens.

> ⚠️ **Warning:** Never access the platform on an unsecured public Wi-Fi network. Use your institution's network or a secure mobile connection.

---

## 3. Logging In

### Accessing the Platform

Open your browser and navigate to the address provided by your administrator:

```
https://radiora.vercel.app
```

The platform will automatically redirect you to the login page.

### Login Steps

**Step 1.** Go to the login page (`/en/login`).

**Step 2.** Enter your **professional email address** in the "Email" field.

**Step 3.** Enter your **password** in the "Password" field.

**Step 4.** Check "Remember me" if you are on your own secured workstation.

**Step 5.** Click **"Sign in"**.

After a successful login, you will be automatically redirected to the dashboard.

### Switching Language

The platform is available in **French** and **English**. To switch:

1. In the top bar (topbar), click the **EN** or **FR** button.
2. The language changes immediately on the current page.

### Signing Out

To sign out securely:

1. Click the **"Sign out"** button in the top bar (upper right).
2. You will be redirected to the login page.

> ⚠️ **Security:** Always sign out before leaving your workstation, especially on a shared computer. Never leave a session unattended.

### Security Recommendations

- Use a password of at least **12 characters**, combining uppercase, lowercase, numbers and symbols.
- Never share your credentials with anyone.
- Change your password every **3 months**.
- If you suspect your credentials have been compromised, contact your administrator immediately.

---

## 4. Dashboard Overview

After logging in, the main dashboard gives you a global summary of your department's activity.

### Main Navigation

The left navigation bar (sidebar) provides access to the following sections:

| Section | Description |
|---|---|
| 🏠 **Dashboard** | Summary view: key statistics, recent studies, recent reports |
| 👤 **Patients** | Management of the complete patient directory |
| 🩻 **Studies** | List and tracking of all imaging studies |
| 📄 **Reports** | Access to all reports (drafts, finalised, amended) |
| 📋 **Templates** | Library of reusable report templates |
| 📊 **Analytics** | Performance indicators and department statistics |
| 🚨 **Critical Queue** | List of studies requiring urgent attention |
| 🔍 **Audit History** | Complete log of all actions performed |
| ⚙️ **Settings** | Account configuration and preferences |

### Key Indicators (Dashboard)

The dashboard displays four main indicators:

| Indicator | Description |
|---|---|
| **Active Patients** | Total number of patients registered in the system |
| **Pending Studies** | Studies received and awaiting interpretation |
| **Draft Reports** | Reports saved but not yet finalised |
| **Finalised Reports** | Reports definitively signed and archived |

> 💡 **Tip:** Check the dashboard at the start of each session to quickly identify urgent studies and reports pending finalisation.

---

## 5. Patient Management

### Accessing the Patient List

1. Click **"Patients"** in the left navigation bar.
2. The list shows all registered patients with their status (Active, Inactive, Deceased).

### Searching for a Patient

1. In the search field, type the patient's first name, last name or Medical Record Number (MRN).
2. Click **"Search"** or press Enter.
3. Use the status filters to refine results.

### Creating a New Patient

1. Click the **"+ New Patient"** button (top right of the patient list).
2. Complete the form:

| Field | Required | Description |
|---|---|---|
| First Name | ✅ Yes | Patient's first name |
| Last Name | ✅ Yes | Patient's family name |
| Date of Birth | ✅ Yes | Format: DD/MM/YYYY |
| Sex | ✅ Yes | Male / Female / Other |
| MRN | ✅ Yes | Unique patient identifier in your institution |
| Phone | No | Contact number |
| Status | ✅ Yes | Active / Inactive / Deceased |

3. Click **"Save"** to create the patient record.

> ℹ️ **Information:** The MRN must be unique. If a duplicate is detected, the system will notify you.

### Editing a Patient Record

1. Click the patient's name in the list to open their profile.
2. Click **"Edit"**.
3. Make your changes.
4. Click **"Save"**.

### Viewing a Patient Profile

The patient profile displays:
- Personal and administrative information
- Complete history of associated studies
- All reports produced for this patient

### Adding a Study to a Patient

1. Open the patient's profile.
2. Click **"New Study"**.
3. Fill in the study information (see next section).

---

## 6. Study Workflow

### Creating a Study

1. Go to the **"Studies"** section or open from a patient profile.
2. Click **"New Study"**.
3. Fill in the form:

| Field | Description |
|---|---|
| **Patient** | Select the associated patient |
| **Accession Number** | Study identifier (automatic or manual) |
| **Modality** | Imaging type: XR, CT, MRI, US, etc. |
| **Body Part** | Anatomical region under examination |
| **Study Date** | Date the study was performed |
| **Priority** | Routine / Urgent / STAT |
| **Clinical Notes** | Clinical indication and relevant information |

4. Click **"Create Study"**.

### Status Progression

Each study follows a defined status progression:

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│   PENDING    │ →  │  IN REVIEW   │ →  │   REPORTED   │ →  │  VALIDATED   │    │  CANCELLED   │
│              │    │              │    │              │    │              │    │              │
└──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘
```

| Status | Description |
|---|---|
| **Pending** | Study registered, awaiting interpretation |
| **In Review** | The radiologist has begun interpretation |
| **Reported** | The report has been drafted and saved |
| **Validated** | The report has been finalised and signed |
| **Cancelled** | Study cancelled (with documented justification) |

### SLA Indicators

Studies display a turnaround time indicator (SLA):

| Indicator | Meaning |
|---|---|
| 🟢 Green | Within agreed turnaround time |
| 🟡 Yellow | Approaching deadline |
| 🔴 Red | Deadline exceeded |

### Critical Study Flags

A study may be flagged as **critical** when findings require urgent communication to the referring clinician. These studies appear in the **Critical Queue** and are highlighted with a visual alert.

> ⚠️ **Warning:** Studies flagged as critical must be addressed with absolute priority. Check the Critical Queue at the beginning and end of every working session.

---

## 7. Reporting Workflow

### Creating a Report

A report is automatically created when a radiologist begins drafting on a study. You can also create one manually:

1. Open the relevant study.
2. Click **"Create Report"**.
3. The report editor opens.

### Complete Workflow

```
  Study received
        │
        ▼
  Open the editor
        │
        ▼
  Drafting (voice dictation / manual entry / AI structuring)
        │
        ▼
  ┌──────────────────┐
  │   SAVE DRAFT     │ ← Save regularly during drafting
  └──────────────────┘
        │
        ▼
  Review and verification
        │
        ▼
  ┌──────────────────┐
  │   FINALISE       │ ← Irreversible action — report is signed
  └──────────────────┘
        │
        ▼
  Distribution / Archiving
        │
        ▼ (if needed)
  ┌──────────────────┐
  │   AMEND          │ ← Creates a new version, history is preserved
  └──────────────────┘
```

### Saving a Draft

1. During drafting, click **"Save"** at any time.
2. The report is saved with the status **Draft**.
3. You can resume drafting at any later point.

> 💡 **Tip:** Save your work every 5 minutes. The platform does not auto-save continuously.

### Finalising a Report

> ⚠️ **WARNING: Irreversible action.** Once finalised, a report cannot be edited directly. It can only be **amended** (see below).

1. Read through the entire report carefully.
2. Verify that all clinical information is accurate and complete.
3. Click **"Finalise"**.
4. Confirm the action in the dialogue box.
5. The status changes to **Finalised**. The report is signed and timestamped.

### Amending a Report

If a correction is required after finalisation:

1. Open the finalised report.
2. Click **"Amend"**.
3. A new version of the report is created.
4. Make your corrections.
5. Finalise the amended version.

> ℹ️ **Information:** Amending creates a **new version** while preserving the complete version history. All previous versions remain accessible and auditable.

### Version History

Each report retains a complete history of all versions:

1. Open the report.
2. Click **"Version History"**.
3. You can view each previous version with its date, time and author.

---

## 8. AI Features Overview

Radiora Medical integrates several artificial intelligence tools to assist the radiologist in their daily work. These tools are **optional** and always under the clinician's control.

> ⚠️ **ESSENTIAL REMINDER:** Every suggestion generated by artificial intelligence must be **read, verified and validated** by a licensed healthcare professional. AI is an assistance tool — it does not replace medical expertise.

### AI Features Summary

| Feature | Description | Where to Find It |
|---|---|---|
| **Smart Structuring** | Proposes an organised structure for the report | Report editor |
| **Voice Dictation** | Converts speech to text in real time | Report editor |
| **Patient Explanation** | Generates a simplified version of the report for the patient | Report editor |
| **Translation** | Translates the report (FR ↔ EN) | Report editor |
| **External AI Findings** | Imports and integrates external AI analysis results | Study page |

### 8.1 Smart Structuring

Smart Structuring proposes an organised template for your report, based on the imaging modality and anatomical region.

**How to use it:**
1. In the report editor, click **"Smart Structuring"**.
2. The tool generates a structure with standard sections (Indication, Technique, Findings, Conclusion).
3. Complete each section with your interpretation.
4. Freely modify the proposed structure as needed.

### 8.2 Voice Dictation

Voice dictation allows you to draft your report by speaking, with real-time conversion to text.

**Prerequisite:** A functioning microphone with permission granted in the browser.

**How to use it:**
1. In the editor, click the **microphone** icon (🎤).
2. Grant microphone access if prompted by the browser.
3. Speak clearly at a normal pace.
4. Text appears in real time in the editor.
5. Click the icon again to stop recording.
6. Always review and correct the transcribed text before saving.

> 💡 **Tip:** Dictate in a quiet environment. Always proofread the transcription — errors in medical terminology can occur.

### 8.3 Patient Explanation

This feature automatically generates a simplified version of the report, adapted for a non-medical patient to understand.

**How to use it:**
1. After drafting your report, click **"Patient Explanation"**.
2. The tool generates a plain-language text.
3. Review and adjust the content as needed.
4. This explanation can be printed or shared with the patient.

> ⚠️ **Warning:** Always verify that the patient explanation contains no inaccurate information or content that could unnecessarily distress the patient before sharing it.

### 8.4 Translation

The translation feature enables switching the report between French and English.

**How to use it:**
1. In the report editor, click **"Translation"**.
2. Select the target language.
3. The tool generates an automatic translation.
4. Review the translation carefully — specific medical terms may require manual correction.

### 8.5 External AI Findings

See the next section (Section 9).

---

## 9. External AI Results

Some institutions use external AI software (nodule detection, automatic triage, etc.). Radiora Medical allows you to import these results and integrate them into the report.

> ⚠️ **IMPORTANT:** Results generated by external AI do not constitute a diagnosis. They must be reviewed and validated by the radiologist before any integration into the report.

### Importing External AI Results

1. Open the relevant study.
2. Go to the **"External AI"** tab.
3. Enter or paste the external AI results into the provided field.
4. Click **"Import"**.

### Reviewing the Results

Imported results are displayed as individual finding cards. For each finding:

| Action | Description |
|---|---|
| ✅ **Accept** | The finding is judged correct and relevant by the radiologist |
| ❌ **Reject** | The finding is incorrect or not relevant |

### Applying Accepted Findings to the Report

1. After accepting the relevant findings, click **"Apply to Report"**.
2. Accepted findings are automatically inserted into the report draft.
3. Review and integrate these elements into your final report text.

> 💡 **Tip:** Never accept a finding without verifying it against the actual images. AI can produce false positives or incorrect interpretations.

---

## 10. Audit & Traceability

### Everything Is Recorded

Radiora Medical automatically logs **all actions** performed on the platform:

- Sign-ins and sign-outs
- Patient record creations and edits
- Study creations and status changes
- Report drafting, saving, finalisation and amendments
- Use of AI features
- External AI result imports
- Administrative actions

### Accessing the Audit Log

1. Click **"Audit History"** in the left navigation.
2. The log displays all actions with:
   - Precise date and time
   - User who performed the action
   - Type of action
   - Affected resource

> ℹ️ **Information:** Access to the audit log is restricted to clinic administrators and super-administrators. Radiologists can view their own action history.

### Report Version History

Every version of a report is retained indefinitely:

- Initial version (draft)
- Each intermediate save
- Finalised version
- Amended versions

This traceability guarantees **medical accountability** and **regulatory compliance**.

---

## 11. Security & Privacy

### Multi-Tenant Architecture

Radiora Medical is a **multi-tenant** platform:

- Each clinic has its own **completely isolated** data space.
- Data from one institution is **never accessible** to another.
- Clinic administrators can only see data from their own institution.

### Roles and Permissions

| Role | Access Level |
|---|---|
| **Super Administrator** | Full access to all institutions (Radiora team only) |
| **Clinic Administrator** | Full management of their own institution |
| **Radiologist** | Study and report management within their institution |
| **Technician** | Study management, limited report access |
| **Referring Physician** | View-only access to reports for their patients |

### Security Recommendations

| Practice | Description |
|---|---|
| **Strong password** | Minimum 12 characters, combining letters, numbers and symbols |
| **No sharing** | Never share your credentials with anyone |
| **Always sign out** | Sign out before leaving your workstation |
| **Secure network** | Use only your institution's network or a secured connection |
| **Lock screen** | Lock your screen when briefly leaving your workstation |

### Patient Data Privacy

All patient data is:
- Encrypted in transit (HTTPS/TLS)
- Encrypted at rest in the database
- Accessible only to authorised staff of the relevant institution
- Subject to applicable medical confidentiality obligations

> ⚠️ **Legal Reminder:** Patient health data is sensitive information protected by law. Unauthorised access constitutes a serious professional misconduct. Radiora Medical logs all data access.

---

## 12. Troubleshooting

### Issue: Microphone Not Working

| Possible Cause | Solution |
|---|---|
| Browser permission denied | Click the lock icon in the address bar → Allow microphone |
| Microphone not detected | Check physical connection, restart the browser |
| Microphone in use by another app | Close all other applications using the microphone |
| Incompatible browser | Switch to Google Chrome |

**Verification steps:**
1. Test your microphone in another tool (e.g. system audio recorder).
2. In Chrome: Menu → Settings → Privacy → Microphone → Allow the site.
3. Reload the page and try again.

---

### Issue: Unable to Log In

| Possible Cause | Solution |
|---|---|
| Incorrect credentials | Check your email address and password |
| Account deactivated | Contact your clinic administrator |
| Forgotten password | Click "Forgot password" on the login page |
| Incompatible browser | Use an up-to-date version of Chrome or Firefox |

---

### Issue: Session Expired

**Symptom:** You are redirected to the login page without having clicked "Sign out".

**Cause:** Sessions expire after a period of inactivity for security reasons.

**Solution:**
1. Log in again with your credentials.
2. Your saved data is intact.

> 💡 **Tip:** Save your work regularly to prevent any loss due to session expiry.

---

### Issue: Page Not Loading / 404 Error

| Possible Cause | Solution |
|---|---|
| Unstable internet connection | Check your connection, refresh the page (F5) |
| Incorrect URL | Return to the home page and navigate from the menu |
| Temporary server error | Wait 2 minutes and try again |

---

### Issue: Unsupported Browser

**Symptom:** Page displays incorrectly or certain features do not respond.

**Solution:** Download and install **Google Chrome** (latest version) from the official website.

---

### Issue: Patient Record Not Found

| Possible Cause | Solution |
|---|---|
| Incorrect search term | Check the spelling of the name or MRN |
| Patient registered at another institution | Data is isolated per institution |
| Patient not yet registered | Create a new patient record |

---

## 13. Pilot Feedback

Your active participation in the pilot phase is **invaluable and essential** for improving Radiora Medical.

### What We Ask You to Report

| Type of Feedback | Examples |
|---|---|
| **Bugs** | Feature not responding, error displayed, incorrect data |
| **User Experience (UX)** | Hard-to-find step, misplaced button, unclear interface |
| **Workflow Issues** | Missing steps, illogical order, too many clicks for a simple action |
| **Missing Features** | An identified need not covered by the current platform |
| **Suggestions** | Any improvement idea, however minor |
| **Positive Feedback** | What works well — we want to keep it! |

### How to Report an Issue

1. Note down the action you were performing.
2. Note the exact error message (if any).
3. If possible, take a screenshot.
4. Send this information to the Radiora team via the contacts in Section 15.

> ℹ️ **Information:** No feedback is too small or insignificant. The best improvements often come from day-to-day observations.

---

## 14. Quick Start

A condensed guide to start using Radiora Medical immediately.

### First Session — Checklist

- [ ] Access the platform with your credentials
- [ ] Verify your name and role in the top right corner
- [ ] Explore the dashboard and key statistics
- [ ] Create a first test patient (if authorised)
- [ ] Create a first test study
- [ ] Open the report editor
- [ ] Test voice dictation
- [ ] Save a draft report
- [ ] Sign out correctly

### Typical Daily Workflow (Radiologist)

```
Sign in
    │
    ▼
Dashboard
— Check urgent studies (Critical Queue)
— Check pending drafts
    │
    ▼
Critical Queue (if applicable)
— Handle with absolute priority
    │
    ▼
Pending Studies
— Open the first study
— Draft the report (dictation or manual entry)
— Use AI structuring if helpful
— Save as draft
— Review and finalise
    │
    ▼
Repeat for each study
    │
    ▼
Secure sign-out
```

### Useful Quick Actions

| Action | How to Do It |
|---|---|
| Save a draft | "Save" button in the report editor |
| Switch language | FR/EN button in the top bar |
| Search for a patient | Search bar on the Patients page |
| View urgent studies | "Critical Queue" section in the menu |
| Sign out | "Sign out" button in the top right |

---

## 15. Support & Contact

### Pilot Support Contact

| Channel | Details |
|---|---|
| **Support Email** | support@radiora.medical *(to be confirmed)* |
| **WhatsApp** | *(number to be communicated by the team)* |
| **Pilot Contact** | *(name and contact of your Radiora representative)* |

### Support Hours

| Period | Availability |
|---|---|
| **Working days** | Monday — Friday, 8:00 AM — 6:00 PM (GMT) |
| **Technical emergencies** | Via WhatsApp only |
| **Outside hours** | Send an email — response next working day |

### Before Contacting Support

To speed up resolution of your issue, please prepare the following:

1. Your name and institution
2. The feature concerned
3. The steps leading up to the issue
4. An error message or screenshot (if available)
5. The browser and version you are using

---

## Appendix — Glossary

| Term | Definition |
|---|---|
| **Draft** | A report that has been saved but not yet finalised |
| **Finalised** | A report definitively signed — cannot be edited directly |
| **Amended** | A new version created after finalisation to correct the report |
| **MRN** | Medical Record Number — the patient's unique identifier |
| **Modality** | Type of medical imaging (XR, CT, MRI, US, PET-CT…) |
| **SLA** | Service Level Agreement — agreed turnaround time for report delivery |
| **Critical Queue** | List of studies requiring an urgent response |
| **Audit** | A log tracking all actions performed on the platform |
| **Multi-tenant** | Architecture where each institution's data is isolated from others |
| **AI** | Artificial Intelligence — an assistance tool, never autonomous decision-making |
| **STAT** | Highest priority — study to be handled immediately |

---

*Radiora Medical — Intelligent Radiology Reporting Management Platform*
*Designed for clinics and medical imaging centres across Francophone Africa.*

*Version 1.0 — Pilot Phase — May 2026*
*Confidential Document — Pilot Use Only*

---
