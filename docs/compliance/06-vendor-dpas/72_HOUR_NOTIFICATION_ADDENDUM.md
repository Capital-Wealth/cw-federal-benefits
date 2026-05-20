# Service Provider Addendum — 72-Hour Cybersecurity Incident Notification

**Purpose:** Required by SEC Reg S-P §248.30(a)(5)(ii), as amended May 16, 2024, effective June 3, 2026. The covered institution (Capital Wealth) must require by contract that its service providers notify CW within 72 hours of becoming aware of unauthorized access to or use of customer information.

**Form:** Addendum to existing Master Services Agreement, Data Processing Agreement, or Order Form. Where the vendor's standard DPA already includes a notification commitment with a shorter or equal SLA, that language controls and this addendum is unnecessary. Where the existing commitment is longer than 72 hours or absent, this addendum is required.

**Counter-party:** [Vendor legal name]
**Effective date:** [DATE]
**Reference:** [Master agreement title, date, parties]

---

## ADDENDUM

This Cybersecurity Incident Notification Addendum (the "Addendum") is entered into between **Capital Wealth** ("CW") and **[Vendor]** ("Provider") and supplements the [Master Services Agreement / Data Processing Agreement / Order Form] dated [DATE] (the "Agreement"). In the event of conflict between this Addendum and the Agreement, this Addendum controls with respect to its subject matter.

### 1. Definitions

**"CW Data"** means any data, in any form, that CW transmits to Provider, that Provider collects on behalf of CW, or that Provider stores, processes, or transmits in connection with services provided to CW under the Agreement, including without limitation any nonpublic personal information of CW's customers or consumers.

**"Cybersecurity Incident"** means any unauthorized access to, acquisition of, use of, modification of, or disclosure of CW Data, whether attempted or successful, and whether or not such incident has caused or is reasonably likely to cause harm.

### 2. Notification Obligation

Provider shall notify CW in writing of any Cybersecurity Incident affecting CW Data **as soon as practicable, but not later than seventy-two (72) hours** from the time Provider becomes aware of the Cybersecurity Incident.

### 3. Method of Notification

Notification shall be delivered to CW by email to **qi-alert@capitalwealth.com** (or such other address as CW designates in writing from time to time), and shall be followed by telephone notice to the Qualified Individual's number provided to Provider in connection with this Addendum.

### 4. Content of Notification

Each notification shall include, to the extent then known by Provider:
(a) the date and time the Cybersecurity Incident was discovered;
(b) the date and time the Cybersecurity Incident occurred and its duration, if known;
(c) the type(s) of CW Data involved or reasonably likely to have been involved;
(d) the estimated number of CW customers or records affected;
(e) a description of the Cybersecurity Incident, including, to the extent known, the cause and the systems or accounts affected;
(f) a description of Provider's response, including containment and remediation actions taken and planned;
(g) the name and contact information of Provider's incident-response point of contact; and
(h) any other information reasonably requested by CW.

Provider shall supplement the initial notification promptly as additional information becomes available, and shall continue to update CW until the Cybersecurity Incident is fully contained, remediated, and closed.

### 5. Cooperation

Provider shall cooperate in good faith with CW in CW's investigation, containment, remediation, and notification activities, including providing CW with reasonable access to forensic information, logs, and personnel; shall preserve evidence consistent with industry practice; and shall not make any public statement or notification to affected individuals regarding the Cybersecurity Incident without CW's prior written consent, except as required by applicable law (in which case Provider shall give CW prior notice and an opportunity to comment).

### 6. No Limit on Other Obligations

The obligations of this Addendum are in addition to, and do not limit, any other obligation Provider has to CW under the Agreement, the Data Processing Agreement, or applicable law, including without limitation any earlier-deadline notification obligation imposed by applicable data-breach law.

### 7. Survival

This Addendum survives termination of the Agreement for so long as Provider holds or has access to CW Data, and for any period during which Provider's continuing notification obligations apply by law.

### 8. Governing Law

This Addendum is governed by [Utah / vendor's standard choice, per existing Agreement].

---

**IN WITNESS WHEREOF**, the parties have executed this Addendum as of the Effective Date.

**Capital Wealth**

By: ________________________________
Name: Mike Stevens
Title: CEO
Date: __________

**[Vendor]**

By: ________________________________
Name: __________
Title: __________
Date: __________

---

## Vendor list — addendum routing

| Vendor | Service | Existing DPA notice SLA | Action |
|---|---|---|---|
| Vercel Inc. | Hosting | Vercel DPA Annex 2 §3 — "without undue delay" (no fixed hours) | **Send addendum** |
| Supabase Inc. | Database | Supabase DPA §8 — "without undue delay and where feasible, no later than 72 hours" | Existing satisfies — file copy in `./signed/` |
| Amazon Web Services Inc. | Storage / KMS / Lambda / Fargate | AWS GDPR DPA §6 — "without undue delay" | **Send addendum** — AWS DPA is non-specific; CW may need to enter Enterprise Agreement for binding 72-hr SLA |
| OPSWAT Inc. | File scanning | TBD (request from sales) | **Send addendum** with engagement |
| Wildbit LLC (Postmark) | Email | Postmark DPA — review | Send addendum if existing terms are softer |
| Datadog Inc. | Logging/monitoring | Datadog DPA §7 — "without undue delay and in any event within 48 hours" | Existing satisfies — file copy in `./signed/` |
| Salesforce.com Inc. | CRM | SF DPA §6 — "without undue delay" | **Send addendum** — Salesforce DPA is non-specific |
| Google Workspace (Google LLC) | Email + collaboration | Google Cloud DPA §7 — "without undue delay" (a 48-hr commitment available in some enterprise terms) | **Send addendum** OR negotiate via enterprise channel |
| Zoom Video Communications | Voice/SMS/video | Zoom DPA — review | Send addendum if existing terms are softer |

**Strategy:** Push the addendum to vendors whose standard terms are softer than 72 hours; file existing terms for vendors that already meet or exceed. Vendors who refuse the addendum are documented in vendor-management records with risk-acceptance rationale signed by QI; for material refusals on critical vendors, escalate to seek alternative providers.

**Estimated cycle time per vendor:** 5-15 business days from send to counter-signature; expedite via Mike or counsel where vendor-legal is slow.
