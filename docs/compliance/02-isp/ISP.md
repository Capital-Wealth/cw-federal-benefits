# Capital Wealth — Written Information Security Program (ISP)

**Version:** 1.0 DRAFT (counsel review required before adoption)
**Adopted:** [DATE]
**Owner:** Qualified Individual (per Board Resolution at `../01-board-resolution/`)
**Reviewed annually**, next review: [DATE + 1 year]
**Authority:** GLBA Safeguards Rule (16 C.F.R. §314); SEC Reg S-P (17 C.F.R. §248.30); SEC Reg S-ID (17 C.F.R. §248.201); FINRA Rule 4511; NIST CSF 2.0; [23 NYCRR §500 if applicable per `../08-ny-footprint/`]

---

## 1. Purpose and Scope

This Information Security Program (the "Program") governs the administrative, technical, and physical safeguards Capital Wealth ("CW") implements to protect the confidentiality, integrity, and availability of customer Nonpublic Personal Information ("NPI") and other information assets.

The Program applies to all CW personnel, contractors, and service providers; to all CW-owned or -controlled information systems including Salesforce, Google Workspace, Vercel, Supabase, AWS, OPSWAT, Postmark, Datadog, Zoom, and Asana; and to all NPI in any form (electronic, paper, oral).

---

## 2. Risk Assessment

CW conducts a written risk assessment at least annually and upon any material change in operations. The current assessment identifies the following primary risks:

| Risk | Likelihood | Impact | Primary controls |
|---|---|---|---|
| Unauthorized access to client NPI via phishing of advisor credentials | Medium | High | MFA mandatory; SSO via Google Workspace; user training §7 |
| Compromise of Vault portal client account (credential stuffing) | Medium | Medium | Magic-link auth, TOTP/passkey enrollment, breached-password check, rate limiting |
| Insider misuse by CW staff with legitimate SF access | Low | High | Least-privilege permsets, Field Audit Trail, Event Monitoring, anomaly alerts |
| Third-party (vendor) breach with cascading NPI exposure | Medium | High | Vendor SOC 2 collection §6, 72-hr vendor notice contractual addendum §8 |
| Malware via client document upload | Medium | Medium | Dual-engine AV (ClamAV + OPSWAT), magic-byte MIME validation, quarantine pattern |
| Lost/stolen client MFA device → social engineering reset | Medium | Medium | Advisor-initiated reset with two-party attestation + 24-hr cooldown |
| Data loss / ransomware on CW infrastructure | Low | High | S3 Object Lock compliance mode (immutable), cross-region replication, quarterly restore drill |
| Regulator examination finding | Medium | Medium | This Program, annual board report, documented testing |
| Improper disposal of paper records / decommissioned hardware | Low | Medium | NAID-certified shredding vendor; certified-wipe for hardware |

Reassessed: [DATE]. Material changes since prior assessment: [N/A — first formal assessment under this Program].

---

## 3. Designation of Qualified Individual

Per Board Resolution dated [DATE], [_NAME_] is the designated Qualified Individual responsible for overseeing, implementing, and enforcing this Program. The Qualified Individual reports in writing to the Board not less than annually. Resolution at `../01-board-resolution/`.

---

## 4. Administrative Safeguards

### 4.1 Access controls
- Role-based access control (RBAC) in every system; least-privilege default.
- Salesforce: permsets only — profiles set to minimum standard user; FLS on all custom NPI fields.
- Google Workspace: org-unit-based controls; admin access limited to designated personnel.
- Vault portal: separate advisor and client surfaces; advisor surface gated by Google SSO + WebAuthn; client surface gated by magic-link + TOTP/passkey.
- Onboarding: access provisioned on Day 1 by Operations Manager per role-template checklist.
- **Offboarding: access revoked within 4 hours** of separation per checklist at `../offboarding-checklist.md`. Includes Salesforce User deactivation (triggers Flow to invalidate Vercel JWT key version and purge Supabase sessions per Vault spec §7 Phase 2), Google Workspace suspend, MFA token reset, hardware return.

### 4.2 Personnel training
- All new personnel complete cyber awareness training within 7 days of start; documented in HR file.
- Annual refresher training for all personnel; phishing simulation quarterly.
- Role-specific training: developers (secure coding, OWASP Top 10), advisors (handling of NPI, social engineering), administrators (least privilege, audit log review).
- Training records retained per §10.

### 4.3 Vendor management
- All vendors handling NPI are reviewed before engagement; reviewed annually thereafter.
- Required documentation: SOC 2 Type II report (or equivalent), DPA, 72-hour incident notification clause (see `../06-vendor-dpas/`).
- Current vendor inventory at `../06-vendor-dpas/VENDOR_INVENTORY.md`.

### 4.4 Change management
- Production deployments to Vault portal go through Vercel CI with required reviewer.
- Salesforce metadata changes follow the SCHEMA.md governance pattern at `cw-salesforce-metadata/docs/SCHEMA.md` (pre-flight read required; per CW feedback memory).
- Material security changes require Qualified Individual sign-off.

### 4.5 Discipline
- Violations of this Program are subject to discipline up to and including termination, documented in HR file.

---

## 5. Technical Safeguards

### 5.1 Encryption
- **At rest:** AES-256-GCM via AWS KMS customer-managed keys for Vault data (S3 + Postgres); FIPS 140-3 validated module. Per-tenant data-encryption keys rotated every 90 days; CMKs rotated annually.
- **In transit:** TLS 1.3 only on all external endpoints; TLS 1.2 fallback disabled; HSTS preload submitted. Internal service-to-service: TLS 1.3 + mutual auth where applicable.
- **Salesforce-side:** Per Vault spec v1.1 §8, full PII (SSN, DOB, FERS#, TSP balance) stored only in Supabase; only masked/derived fields mirrored to Salesforce. Shield Platform Encryption deferred. Revisit if SF becomes unmasked-PII system of record.

### 5.2 Authentication
- All advisor and administrator accounts: MFA mandatory (TOTP or WebAuthn); SMS-only is prohibited.
- Client portal accounts: magic-link primary; TOTP/WebAuthn enrollment required for second visit.
- Password policy aligned to NIST SP 800-63B: minimum 12 characters, breached-password check via Have I Been Pwned k-anonymity API, no forced periodic rotation.
- Session timeout: 15 minutes idle, 2 hours absolute for advisors; 30 minutes idle, 12 hours absolute for clients.

### 5.3 Network controls
- Vault portal egress to Salesforce routed through dedicated AWS NAT Gateway with Elastic IPs; SF Connected App IP allowlist set to those EIPs.
- Vault portal protected by Cloudflare WAF + Vercel Firewall; rate limits per user and per IP.
- AWS resources in dedicated VPC; security groups restrict ingress to required ports only.

### 5.4 Logging and monitoring
- All authentication events, NPI access events, document upload/download events, and administrative actions are logged.
- Logs are written to append-only storage (S3 Object Lock + Datadog with immutable archive).
- Salesforce Event Monitoring + Field Audit Trail (10-year retention) shipped to Datadog.
- Anomaly alerts: failed-login bursts, large-volume downloads, off-hours admin actions, new-IP advisor sessions.

### 5.5 Vulnerability management
- Annual third-party penetration test (web app + API + SF integration + AWS infra).
- Semi-annual vulnerability scan [annual at minimum; semi-annual if 23 NYCRR 500 applies].
- Continuous DAST and SAST in CI/CD pipeline.
- Remediation SLAs: critical 7 days, high 30 days, medium 90 days, low next review cycle.

---

## 6. Physical Safeguards

- CW office: badge/key access during business hours; alarm armed after hours; visitor log maintained at reception.
- Paper records containing NPI: stored in locked cabinets; cleared from desks at end of day; shredded via NAID AAA-certified vendor.
- Decommissioned hardware (laptops, drives): wiped to NIST SP 800-88 standard; certificate of destruction retained for 6 years.
- Mobile devices accessing CW NPI: managed via Google Workspace Endpoint Management; full-disk encryption required; lost-device remote wipe enabled.

---

## 7. Service Provider Oversight

CW maintains a written inventory of service providers handling NPI at `../06-vendor-dpas/VENDOR_INVENTORY.md`. For each:

- SOC 2 Type II report (or comparable independent attestation) is collected at engagement and refreshed annually.
- A Data Processing Agreement is executed.
- The contract requires the service provider to notify CW within 72 hours of becoming aware of any unauthorized access to or use of CW data, per the addendum at `../06-vendor-dpas/72_HOUR_NOTIFICATION_ADDENDUM.md`.
- Material changes in the service provider's security posture, ownership, or sub-processor list trigger re-review.

---

## 8. Incident Response

Cybersecurity incidents are handled per the written Incident Response Program at `../03-ir-program/IR_PROGRAM.md`. Key obligations:

- Internal incident declaration within 24 hours of discovery.
- Assessment of scope and customer impact per IRP §3.
- **Customer notification within 30 days** of determining unauthorized access to sensitive customer information has occurred or is reasonably likely (SEC Reg S-P, effective June 3, 2026). Notification content per IRP §5.
- 72-hour notice to NY DFS Superintendent for qualifying cybersecurity events [if 23 NYCRR §500.17(a) applies].
- 30-day notice to FTC for breaches affecting 500 or more consumers.
- Service provider 72-hour notification obligation per §7.

---

## 9. Disposal and Retention

- NPI is retained for the longer of: (a) the period required by SEC IA Act Rule 204-2 (5 years, first 2 easily accessible); (b) FINRA Rule 4511 (6 years) for insurance/securities-licensed activities; (c) the period required by applicable state insurance law (up to 10 years in some states); (d) any litigation hold.
- Vault portal documents are retained 7 years via S3 Object Lock compliance mode (immutable). This setting is permanent and cannot be reduced.
- Disposal of NPI follows SEC Reg S-P Disposal Rule: paper records shredded via NAID AAA vendor; electronic records wiped to NIST SP 800-88; certificate retained.

---

## 10. Records Retention for this Program

The following Program records are retained for 6 years:
- This ISP and all prior versions.
- Risk assessments.
- Vendor reviews and DPAs.
- Training records.
- Incident reports and post-incident reviews.
- Penetration test reports and vulnerability scans.
- Annual board reports from the Qualified Individual.
- Disposal certificates.

---

## 11. Annual Board Reporting

Not less than annually, the Qualified Individual delivers a written report to the Board covering:

(a) The overall status of the Program and material changes since the prior report.
(b) Material risks identified and the status of remediation.
(c) Material cybersecurity events and the response.
(d) Testing results (pen tests, scans, tabletop exercises).
(e) Recommended changes to the Program.

[If 23 NYCRR §500 applies, the Qualified Individual additionally executes the Annual Certification of Material Compliance, filed by April 15 each year, signed jointly with the CEO.]

---

## 12. Review and Approval

This Program is reviewed at least annually by the Qualified Individual and the Board; reviewed upon material change in operations, regulation, or risk landscape; and approved by the Board.

____________________________________
[_NAME_], Qualified Individual
Date: __________

____________________________________
Mike Stevens, CEO
Date: __________

---

## Appendix A — Mapping to regulatory requirements

| Section | GLBA Safeguards | Reg S-P | Reg S-ID | FINRA 4511 | NIST CSF 2.0 | 23 NYCRR 500 |
|---|---|---|---|---|---|---|
| §2 Risk Assessment | §314.4(b) | §248.30(a) | §248.201(d)(1) | — | ID.RA | §500.9 |
| §3 QI Designation | §314.4(a) | — | — | — | GV.RR | §500.4 |
| §4 Administrative | §314.4(c)(1)-(7) | §248.30(a) | §248.201(e) | — | PR.AA | §500.7, §500.10 |
| §5 Technical | §314.4(c)(8) | §248.30(a) | — | — | PR.DS, PR.PT | §500.12, §500.14, §500.15 |
| §6 Physical | §314.4(c)(1) | §248.30(a) | — | — | PR.AC | §500.3 |
| §7 Vendor oversight | §314.4(f) | §248.30(a) | — | — | ID.SC | §500.11 |
| §8 Incident response | §314.4(h) | §248.30(a)(3)-(5) | §248.201(d)(2)(iii) | — | RS, RC | §500.16, §500.17 |
| §9 Disposal/Retention | §314.4(c)(6) | §248.30(b) | — | Rule 4511 / 17a-4 | PR.DS-3 | §500.13 |
| §10 Recordkeeping | §314.4(i) | — | — | Rule 4511 | GV.OC | §500.6 |
| §11 Board Reporting | §314.4(i) | — | §248.201(e)(3) | — | GV.RR | §500.4(d) |
