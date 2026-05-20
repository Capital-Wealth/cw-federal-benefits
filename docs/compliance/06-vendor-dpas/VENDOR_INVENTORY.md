# Vault Portal — Vendor (Service Provider) Inventory

**Owner:** Qualified Individual
**Reviewed:** at engagement; annually thereafter; upon material change
**Authority:** GLBA Safeguards §314.4(f); Reg S-P §248.30(a)(5)

For each vendor: (a) the role, (b) the data they touch, (c) SOC 2 / equivalent attestation status, (d) DPA + 72-hr notification status, (e) subprocessors of interest, (f) annual review date.

---

## Critical-path vendors (handle CW NPI directly)

### 1. Vercel Inc.
- **Role:** Application hosting (Next.js Vault portal)
- **Data:** Application metadata, session tokens, audit log events; CW NPI traverses Vercel functions but is not persisted at rest in Vercel storage
- **SOC 2 Type II:** Yes — request from `https://vercel.com/security` / Trust Center
- **DPA:** Vercel standard DPA — request signed copy
- **72-hr addendum:** **Required** (standard DPA is "without undue delay")
- **Subprocessors of interest:** AWS, Google Cloud (per Vercel's published list)
- **Annual review:** [DATE+1Y]

### 2. Supabase Inc.
- **Role:** PostgreSQL database (Vault metadata, user accounts, audit log)
- **Data:** Application data including NPI (encrypted at column level via pgcrypto + KMS-fetched DEK)
- **SOC 2 Type II:** Yes — request from `https://supabase.com/security`
- **DPA:** Supabase standard DPA — already includes 72-hour commitment
- **72-hr addendum:** Existing DPA satisfies; file copy in `./signed/`
- **Subprocessors of interest:** AWS, Fly.io (per Supabase published list)
- **Annual review:** [DATE+1Y]

### 3. Amazon Web Services Inc.
- **Role:** S3 (document blob storage), KMS (encryption keys), Lambda + Fargate (AV scan), NAT Gateway (SF egress), CloudTrail (audit)
- **Data:** All Vault document blobs; encryption keys; system logs
- **SOC 2 Type II:** Yes — AWS Artifact (publicly accessible to customers)
- **DPA:** AWS GDPR DPA — standard, non-specific notification SLA
- **72-hr addendum:** **Required** OR negotiate via Enterprise Agreement
- **Subprocessors of interest:** AWS-internal only
- **Annual review:** [DATE+1Y]

### 4. OPSWAT Inc.
- **Role:** MetaDefender Cloud — second-engine multi-engine malware scanning of uploaded documents
- **Data:** Uploaded document content during scan; result metadata only retained per service config
- **SOC 2 Type II:** Yes — request from sales
- **DPA:** Request from sales with engagement
- **72-hr addendum:** **Required** with engagement
- **Subprocessors of interest:** TBD
- **Annual review:** [DATE+1Y]

### 5. Salesforce.com Inc.
- **Role:** CRM and records system; advisor surface for Vault; Connected App OAuth target
- **Data:** Customer master records (Lead/Account/Contact), Vault metadata mirrors (S3 URIs, audit events), advisor activity
- **SOC 2 Type II:** Yes — via Salesforce Trust + Compliance portal (in-product)
- **DPA:** Salesforce standard MSA + DPA
- **72-hr addendum:** **Required** — SF DPA is non-specific on hours
- **Subprocessors of interest:** Salesforce Hyperforce (AWS-hosted)
- **Annual review:** [DATE+1Y]

### 6. Wildbit LLC (Postmark)
- **Role:** Transactional email (magic-link, alerts, account notices)
- **Data:** Recipient email, magic-link tokens (in URL, single-use), notification content
- **SOC 2 Type II:** Yes — `https://postmarkapp.com/security`
- **DPA:** Postmark DPA — review
- **72-hr addendum:** Send if existing DPA is softer than 72 hours
- **Subprocessors of interest:** AWS (per Postmark published list)
- **Annual review:** [DATE+1Y]

### 7. Datadog Inc.
- **Role:** Logs, metrics, APM, anomaly alerts
- **Data:** System logs (may contain NPI; configure sensitive-data scrubbing rules)
- **SOC 2 Type II:** Yes — Datadog Trust Center
- **DPA:** Datadog DPA includes 48-hour notification — satisfies
- **72-hr addendum:** Not required; file existing DPA
- **Subprocessors of interest:** AWS (per Datadog published list)
- **Annual review:** [DATE+1Y]

---

## Supporting vendors (do not handle CW NPI but adjacent)

### 8. Google LLC (Google Workspace)
- **Role:** CW email + identity (advisor SSO source)
- **Data:** Email content (may contain NPI if CW personnel email NPI), SSO assertions
- **SOC 2 Type II:** Yes — `https://cloud.google.com/security/compliance`
- **DPA:** Google Cloud DPA — standard
- **72-hr addendum:** Send if existing DPA softer than 72 hours

### 9. Zoom Video Communications
- **Role:** Voice + SMS + video; existing CW Zoom Phone SMS bridge sends Vault magic-link SMS
- **Data:** Phone numbers, SMS content (may contain magic-link URL)
- **SOC 2 Type II:** Yes — Zoom Trust Center
- **DPA:** Zoom DPA — review
- **72-hr addendum:** Send if existing DPA softer

### 10. Cloudflare Inc.
- **Role:** DNS, WAF, CDN in front of `vault.capitalwealth.com`
- **Data:** TLS termination metadata, request logs
- **SOC 2 Type II:** Yes — Cloudflare Trust Hub
- **DPA:** Cloudflare DPA — review
- **72-hr addendum:** Send if existing DPA softer

---

## Collection checklist (immediate action)

- [ ] Vercel — pull SOC 2 from Trust Center → save to `./signed/vercel/`
- [ ] Supabase — pull SOC 2 + DPA → save
- [ ] AWS — log into AWS Artifact, accept SOC 2 NDA, download → save
- [ ] OPSWAT — email sales for SOC 2 + DPA + addendum acceptance
- [ ] Salesforce — pull SOC 2 from Trust + Compliance → save
- [ ] Postmark — pull SOC 2 → save; review DPA
- [ ] Datadog — pull SOC 2 from Trust Center → save; existing DPA file
- [ ] Google Workspace — pull SOC 2; check enterprise DPA
- [ ] Zoom — pull SOC 2; review DPA
- [ ] Cloudflare — pull SOC 2; review DPA

**Estimated turnaround:** 1-2 days for vendors with self-serve trust centers; 1-3 weeks for vendors requiring sales-mediated NDA + delivery (OPSWAT primarily).

---

## Vendors NOT used (intentional exclusions)

- **PreciseFP / Docupace** — being replaced; data migrated then access revoked
- **Calendly** — superseded by Zoom Scheduler per existing CW stack
- **Slack** — CW does not use Slack (per CW preferences memory)
- **Mailchimp / general email marketing tools** — not in Vault scope; marketing email is separate from Vault transactional
