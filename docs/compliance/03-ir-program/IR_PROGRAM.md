# Capital Wealth — Incident Response Program (IRP)

**Version:** 1.0 DRAFT (securities counsel redline required before adoption — see §10)
**Adopted:** [DATE]
**Owner:** Qualified Individual (per `../01-board-resolution/`)
**Authority:** SEC Reg S-P 17 C.F.R. §248.30(a)(3)-(5), as amended May 16, 2024 (compliance required June 3, 2026); FTC Safeguards Rule 16 C.F.R. §314.4(h); [23 NYCRR §500.16 and §500.17 if applicable]; FINRA Rule 4530 incident reporting
**Reviewed:** annually; after any reportable incident; after any material regulatory change

---

## 1. Purpose

This Incident Response Program ("IRP") establishes Capital Wealth's procedures for responding to suspected or confirmed unauthorized access to, use of, or disclosure of customer information, and to other cybersecurity incidents affecting CW's information systems.

---

## 2. Scope and Definitions

**Customer information** — Nonpublic Personal Information of a CW customer or consumer, in any form, in CW's possession or in the possession of a CW service provider.

**Sensitive customer information** — As defined at 17 C.F.R. §248.30(d)(11): any (i) Social Security number, taxpayer ID, biometric, driver's license, passport, alien registration, military ID, or other government ID; (ii) financial account number, credit/debit card number; (iii) any of the above in combination with any required security code, access code, PIN, or password; (iv) any unique electronic ID or routing code in combination with any required security code; (v) other information that would be sufficient to permit access to a customer's account or to commit identity theft.

**Cybersecurity event** — Any act or attempt, successful or unsuccessful, to gain unauthorized access to, disrupt, or misuse an information system or information stored on such system.

**Notification incident (FTC)** — Unauthorized acquisition of unencrypted customer information involving 500 or more consumers.

---

## 3. Phase 1 — Detection and Declaration (Hour 0 to Hour 24)

### 3.1 Sources of detection
- Datadog anomaly alerts (failed-login bursts, large-volume downloads, off-hours admin actions).
- Vault portal audit log review.
- Salesforce Event Monitoring alerts.
- Service provider 72-hour notification (per `../06-vendor-dpas/72_HOUR_NOTIFICATION_ADDENDUM.md`).
- Reports from CW personnel, customers, or third parties.
- Law enforcement notification.

### 3.2 Initial triage (any CW personnel discovering)
Report immediately to the Qualified Individual via the dedicated channel: `qi-alert@capitalwealth.com` (monitored), SMS to QI cell, or escalation through Operations Manager. Do not investigate independently; do not modify or delete evidence.

### 3.3 QI declares an Incident
Within 24 hours of becoming aware, the QI either:
- (a) Declares an Incident and opens an Incident Record (template at `./templates/INCIDENT_RECORD.md`); or
- (b) Documents in writing why the report does not meet the Incident threshold.

### 3.4 Initial Incident Record fields
- Date/time discovered; date/time declared
- Reporter
- Affected system(s) and data type(s)
- Estimated population affected (count of customers / records)
- Preliminary classification (see §3.5)
- Containment actions initiated

### 3.5 Incident classification
| Tier | Definition | Examples |
|---|---|---|
| **T1 — Critical** | Confirmed unauthorized access to sensitive customer information; ransomware affecting production; service provider breach with confirmed CW data exposure | SSN/account-number exfiltration; Vault compromise; Salesforce data export by unauthorized actor |
| **T2 — High** | Suspected (not confirmed) unauthorized access; significant control failure with potential exposure; insider misuse without confirmed exfiltration | Successful credential phish followed by uncertain access; pen-test critical finding |
| **T3 — Moderate** | Failed attack with no apparent access; minor control failure; near-miss | Blocked credential-stuffing wave; misconfigured S3 bucket caught before exposure |
| **T4 — Low** | Informational | Single failed-MFA event; security tool alert with no follow-on activity |

---

## 4. Phase 2 — Assess, Contain, Control (Hour 24 to Day 7)

### 4.1 Assess scope
The QI (with external IR counsel/forensics as warranted for T1) determines:
- Which systems, accounts, and data were accessed.
- Whether sensitive customer information was accessed or is reasonably likely to have been accessed.
- The specific customers/records affected.
- Whether the unauthorized access has been contained.
- Whether the unauthorized access is reasonably likely to result in substantial harm or inconvenience to any customer.

### 4.2 Contain
Actions may include: revoking compromised credentials, isolating affected systems, blocking malicious IPs, invalidating JWT signing key versions, deactivating SF integration users, taking impacted Vault portal sessions offline.

### 4.3 Control
Eliminate the cause: patch vulnerability, remediate misconfiguration, terminate insider access, complete forensic imaging before any rebuild.

### 4.4 Documented determination
The QI documents a written determination on the question: **"Has sensitive customer information been, or is it reasonably likely to have been, accessed or used without authorization?"**

This determination drives the Reg S-P customer notification clock (§5).

---

## 5. Phase 3 — Notify

### 5.1 Customer notification (SEC Reg S-P — effective June 3, 2026)

**Trigger:** QI determination per §4.4 that sensitive customer information was, or is reasonably likely to have been, accessed or used without authorization, AND CW does not determine that use of the information has not occurred and is not reasonably likely to occur.

**Deadline:** As soon as practicable, but **not later than 30 days** after CW becomes aware of the incident.

**Method:** Written notice transmitted by a means designed to ensure actual notice — first-class mail to the address on file, or electronic delivery if the customer has affirmatively consented to receive electronic notices.

**Content (required by §248.30(a)(4)(ii)):**
1. Description in general terms of the incident.
2. Type of sensitive customer information that was (or is reasonably likely to have been) accessed/used without authorization.
3. The date or estimated date the incident occurred and the duration.
4. Contact information sufficient to permit the customer to contact CW (toll-free number, mailing address, email).
5. Recommendation that the customer review account statements and immediately report any suspicious activity.
6. Explanation of what CW has done to protect the customer's information from further unauthorized access.
7. Information on how the customer can contact the consumer reporting agencies (Equifax, Experian, TransUnion) to obtain a free credit report and place fraud alerts or security freezes.
8. Information on contacting the Federal Trade Commission (and state attorneys general where applicable) regarding identity theft prevention.

**Customer notification template:** at `./templates/CUSTOMER_NOTIFICATION_LETTER.md` (counsel-redlined wording).

### 5.2 NY DFS Superintendent (if 23 NYCRR §500.17(a) applies)
**Deadline:** Not later than **72 hours** from the determination that a qualifying cybersecurity event has occurred. Filed via DFS portal.

### 5.3 FTC (Safeguards Rule notification)
**Trigger:** Unauthorized acquisition of unencrypted customer information involving 500 or more consumers.
**Deadline:** As soon as possible, but not later than **30 days** after discovery.
**Method:** Electronic notice via FTC's online form.

### 5.4 State attorneys general
Per applicable state breach-notification statutes; counsel determines per-state obligations based on residency of affected customers. Statutory clocks vary by state (typically 30-60 days).

### 5.5 Law enforcement
QI considers whether to notify federal law enforcement (FBI Internet Crime Complaint Center, Secret Service) — required in some incident types; otherwise discretionary based on counsel guidance.

### 5.6 Service providers
If the incident originated with a CW service provider, CW documents the provider's notification (or failure to notify) per the 72-hour addendum and evaluates contractual remedies and continued use.

### 5.7 Internal communications
- Mike Stevens (CEO) within 1 hour of declaration for T1; within 4 hours for T2.
- Board within 24 hours for T1; at next scheduled meeting for T2.
- All CW personnel: communication coordinated by QI; do not discuss with external parties without QI clearance.

---

## 6. Phase 4 — Recover

- Restore affected systems from known-good backups; verify integrity before reconnecting.
- For Vault portal data: documents in S3 Object Lock are immutable — recovery is read-only from the locked bucket; recreate metadata in Supabase if compromised.
- Reissue credentials and MFA tokens for affected accounts.
- Validate that controls that failed have been remediated; do not return to service if root cause is not fixed.

---

## 7. Phase 5 — Post-Incident Review

Within 30 days of incident closure:
- Written post-incident review by the QI.
- Root cause analysis.
- Control changes recommended (technical, administrative, training).
- Update to ISP §2 risk assessment if the incident exposed a previously unidentified risk.
- Update to this IRP if the incident exposed a procedural gap.
- Report to Board.

---

## 8. Testing and Tabletop Exercises

- The QI conducts a tabletop exercise of this IRP at least annually.
- Tabletop scenarios rotate across: ransomware affecting Vault portal; insider data exfiltration; service-provider breach (Vercel, Supabase, AWS, Salesforce); customer credential compromise; lost laptop with cached NPI.
- Outside counsel participates in at least one tabletop annually.
- Findings documented and incorporated into the next ISP review.

---

## 9. Recordkeeping

The following records are retained for 6 years:
- This IRP and prior versions.
- Incident Records (all tiers).
- Customer notification copies (with proof of delivery).
- Regulator notifications.
- Forensic reports.
- Post-incident reviews.
- Tabletop exercise records.

---

## 10. Counsel review checklist (REQUIRED before this IRP is final)

Securities counsel must review and approve:

- [ ] §3.5 incident classification tiers — does this align with Reg S-P's "reasonably likely" standard?
- [ ] §4.4 determination wording — exact wording counsel approves for the §4 determination?
- [ ] §5.1 customer notification template (`./templates/CUSTOMER_NOTIFICATION_LETTER.md`) — full redline.
- [ ] §5.1 customer notification trigger — counsel's view on what constitutes "sufficient information to identify the affected individuals," which delays the 30-day clock until that information is obtainable.
- [ ] §5.1 delayed-notification scenarios — when does the U.S. Attorney General delay provision apply?
- [ ] §5.4 state AG notification matrix — counsel produces per-state grid.
- [ ] §5.5 law enforcement — counsel's view on disclosure timing relative to law-enforcement requests.
- [ ] §7 post-incident review — privilege considerations (attorney-client / work product) for the review and forensic reports.
- [ ] §8 tabletop exercises — privilege protection for tabletop notes.

**Counsel of record:** [TBD — recommend RIA-specialized firm. Options: Eversheds Sutherland (large), Hardin Compliance Consulting + counsel of record, Stark & Stark RIA practice, Foreside.]

**Estimated turnaround:** 5-10 business days for first redline; 3-5 business days for revisions.

---

## 11. Approval

____________________________________
[_NAME_], Qualified Individual
Date: __________

____________________________________
Mike Stevens, CEO
Date: __________

____________________________________
[Counsel of record], approved as to form
Date: __________
