# Capital Wealth Secure Document Portal — Product Spec v1.1

**Author:** Josh Cohen, Director of Marketing / BJX
**Date:** 2026-05-15 (v1.0) · revised 2026-05-18 (v1.1, post-Rock review)
**Status:** Rock-reviewed YELLOW → P0 fixes applied; build-ready pending §11 sign-offs
**Replaces:** PreciseFP (Docupace) for client document collection

**Changelog v1.0 → v1.1:** Vercel egress strategy decided (NAT proxy); Vault_Invite token stored as SHA-256 only; RLS policy expressions specified; S3 Object Lock sign-off gate added; Reg S-P templates require securities-counsel redline; QI requires board resolution; AV pipeline split Lambda/Fargate by size; single-bucket scan-tag pattern replaces dual-bucket copy; Form ADV Part 2A + cyber insurance + WCAG + offboarding + MFA recovery + POA + OFAC + DEK rotation added; timeline corrected to 10-12 weeks pilot / 16 weeks GA / 20 weeks PreciseFP decom.

---

## 1. Why we're killing PreciseFP

| Pain | Today on PreciseFP | After in-house portal |
|---|---|---|
| **Client experience** | 3rd-party brand, generic "PreciseFP" UI, separate login | CW-branded `vault.capitalwealth.com`, single SSO with Federal Benefits Vault |
| **Salesforce integration** | Per-user OAuth via username/password; admin connection means PreciseFP runs with admin rights; writes break when `Contact.Title` field changes | Connected App + JWT bearer + scoped permset; least-privilege integration user; no human credential dependency |
| **Audit visibility** | "Audit trail" exists per their privacy page; no SIEM export; no FLS-level visibility | Append-only WORM log → S3 Object Lock + SF Event Monitoring + Datadog ingest |
| **Encryption disclosure** | "256-bit SSL" + "AES-256 implementation" — no TLS version, no KMS detail, no key rotation, no BYOK | Documented AES-256-GCM + AWS KMS CMK + per-tenant DEK + annual rotation + Shield Platform Encryption mirror in SF |
| **MFA** | Not advertised for end users | Mandatory TOTP/WebAuthn for advisors AND clients; SMS-only blocked |
| **Data residency** | "U.S. facilities" — provider unnamed | AWS `us-east-1` + `us-west-2` DR, GovCloud-eligible region pattern |
| **Pen test cadence** | "Regularly" (no firm/scope/date published) | Annual third-party (NCC/Bishop Fox tier) with attestation letter; continuous DAST/SAST in CI |
| **Cost** | Per-seat SaaS fee, escalates with reps | Vercel + Supabase + AWS S3/KMS line items, ~flat to 1000s of clients |
| **Federal-employee data** | Lives in a 3rd-party DB we can't pen-test ourselves | Lives in CW infra under our written InfoSec program |

**Strategic prize:** federal-employee NPI is the most sensitive data CW touches. Reg S-P 2024 amendments compliance is **mandatory June 3, 2026** — kicking that can with PreciseFP forces us to inherit *their* IR program. Owning the portal means we own the breach SLA, the customer-notification text, and the contractual 72-hour vendor-notice clauses (which Vercel/Supabase/AWS already meet; PreciseFP's terms don't make them apply to CW non-broker-dealers).

---

## 2. The encryption answer (the headline question)

**For data at rest:** AES-256-GCM via FIPS 140-3 validated module, customer-managed keys in AWS KMS (per-environment CMK, annual rotation), envelope encryption with per-tenant data-encryption keys.

**For data in transit:** TLS 1.3 only. TLS 1.2 fallback disabled. HSTS preload (`max-age=63072000; includeSubDomains; preload`). Modern AEAD cipher suites only. OCSP stapling. Target Qualys SSL Labs **A+**.

**For Salesforce-side fields:** Shield Platform Encryption on SSN, DOB, account numbers, beneficiary data, federal pension numbers (FERS/CSRS), TSP balances. Probabilistic by default; deterministic only on dedup keys (e.g., normalized SSN). Files & Attachments encryption enabled.

**For document blobs:** SSE-CMK on S3, separate CMK from DB key, lifecycle to S3 Object Lock (compliance mode) for 7-year retention. Pre-signed URLs ≤15 min TTL, single-use where possible, IP-bound for advisor downloads.

**For Salesforce↔Vercel auth:** OAuth 2.0 JWT Bearer Flow. Signing key in AWS KMS (never on disk). Annual cert rotation. No refresh tokens to leak.

**Key rotation policy (distinct from CMK rotation):**
- **CMK (KMS-backed root):** annual automatic rotation (AWS KMS managed; ARN stable, backing key rotates)
- **DEK (per-tenant data-encryption keys):** 90-day rotation cadence; re-encrypt on next write or scheduled re-wrap job
- **JWT signing cert:** annual; old version retained 30 days for in-flight token verification, then revoked
- **Postgres pgcrypto column keys:** fetched from KMS at app-tier per envelope-encryption pattern — **never** stored in DB/env as pgcrypto's docs suggest

**This bar exceeds PreciseFP's published posture and meets/beats the FINRA/SEC/Reg S-P 2024 floor.** AES-256 + TLS 1.3 is the *industry floor* in 2026 — not above it. Anything less is questionable on an SEC exam. CloudHSM (FIPS 140-3 L3) is deliberately *not* in scope — KMS CMK with locked key policy + CloudTrail is proportionate for a $100M RIA; CloudHSM becomes the right call if CW becomes a BD or crosses ~$1B AUM. Document this threat-model rationale in the ISP so an examiner sees the choice was deliberate.

---

## 3. Compliance floor (non-negotiable)

| Regulation | Trigger | What we must do |
|---|---|---|
| **SEC Reg S-P (Safeguards + 2024 IR amendments)** | All SEC-registered IAs storing customer NPI | Written ISP; **30-day customer notice** on confirmed unauthorized access; **72-hour vendor notice** clauses in every subprocessor MSA. **Compliance: June 3, 2026.** |
| **SEC Reg S-ID** | Continuing client relationships (= every CW client) | Board-approved Identity Theft Prevention Program; annual review |
| **FINRA Rule 4511 / SEA 17a-4(f)** | Insurance-side reps + future BD aspirations | 6-yr retention minimum, WORM-equivalent or audit-trail-preserving storage that prevents deletion/alteration |
| **GLBA Safeguards Rule (FTC)** | Insurance entity | Written InfoSec program; **Qualified Individual** (CISO-equivalent) on record; encryption at rest+transit; MFA mandatory; vendor oversight; FTC notice for breaches >500 consumers |
| **NY DFS 23 NYCRR 500** | If ANY NY client or NY-licensed producer | Annual CISO certification; mandatory MFA (no exceptions); annual pen-test; 72-hr DFS notice. **Confirm NY footprint before scope-out.** |
| **Utah Consumer Privacy Act** | CW's home state, ~$100M revenue likely triggers | Non-financial PII duty (employee/marketing data); GLBA-regulated NPI is data-level exempt |
| **CCPA/CPRA** | Any CA client | DSAR workflow for non-NPI; CPPA cybersecurity audits required starting 2026 |
| **NAIC Model Law #668** | Insurance writes in adopting states (OH, MI, AL, MS, SC, CT, +18 others) | Per-state licensed-entity ISP; 72-hr commissioner notice. **Utah has not adopted.** |

**Single biggest deadline: Reg S-P 2024 — June 3, 2026.** Build IR program + 30-day notice + 72-hr vendor clauses into v1, not v2.

---

## 4. Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         vault.capitalwealth.com                      │
│                  (Vercel · Next.js 16 · React 19)                   │
│                                                                      │
│  ┌────────────────────┐    ┌────────────────────────────────────┐  │
│  │ Client Portal       │    │ Advisor Console (gated, MFA+SSO)  │  │
│  │ • Magic link OR     │    │ • SAML/OIDC via Google Workspace  │  │
│  │   password+TOTP     │    │ • Mirrors what they see in SF      │  │
│  │ • Upload docs       │    │ • Triggers re-request workflows    │  │
│  │ • View own docs     │    │ • Audit log viewer                 │  │
│  │ • E-sign intakes    │    │                                    │  │
│  └─────────┬──────────┘    └──────────────┬─────────────────────┘  │
└────────────┼────────────────────────────────┼───────────────────────┘
             │                                │
             │ pre-signed URL (15-min TTL)    │ JWT (15-min)
             ▼                                ▼
┌──────────────────────┐         ┌──────────────────────────────┐
│ S3 (us-east-1)       │         │ Supabase (Postgres, RLS on)  │
│ • SINGLE bucket      │         │ • Users, sessions, audit log │
│ • Tag scan_status=   │         │ • Doc metadata (no blobs)    │
│   pending|clean|     │         │ • App-tier KMS DEK fetch,    │
│   quarantined        │         │   then pgcrypto column AES   │
│ • Lifecycle: quar.   │         │ • RLS via server-side join   │
│   → expire 30d       │         │   on user_households, NEVER  │
│ • Object Lock        │         │   from JWT claim             │
│   (compliance, 7yr)  │         │                              │
│   applied AFTER scan │         │                              │
│ • SSE-CMK (AWS KMS)  │         │                              │
└──────────┬───────────┘         └──────────────┬───────────────┘
           │                                    │
           │ S3 Event → router                  │
           ▼                                    │
┌──────────────────────┐                        │
│ AV Pipeline           │                        │
│ • <25MB: Lambda      │                        │
│   ClamAV (cold ~5s)  │                        │
│ • ≥25MB: Fargate task│                        │
│   via EventBridge    │                        │
│   (no 15-min ceiling)│                        │
│ • + OPSWAT hosted    │                        │
│   (2nd engine)       │                        │
│ • Magic-byte MIME    │                        │
│   validation         │                        │
│ • EXIF strip (img)   │                        │
│ • PDF re-render only │                        │
│   if engine flag     │                        │
│ • On clean: tag flip │                        │
│   → Object Lock      │                        │
│ • On hit: tag        │                        │
│   quarantined, alert │                        │
└──────────┬───────────┘                        │
           │ on clean: emit event               │
           ▼                                    │
┌──────────────────────────────────────────────────────────────────┐
│ Salesforce (system of record)                                    │
│  • Connected App: CW_Vault_Portal                                │
│  • OAuth JWT Bearer flow, key in AWS KMS                         │
│  • IP allowlist via dedicated AWS NAT Gateway EIPs (NOT Vercel  │
│    serverless egress, which is non-static) — see §6.2            │
│  • Integration user: portal-svc@capitalwealth.com.cw              │
│  • Permset: CW_Vault_Portal_Integration                           │
│       └─ R/W on Lead, Account, Contact, Meeting_1_Intake__c,     │
│          Meeting__c, ContentVersion (reference only)              │
│  • Shield Platform Encryption on SSN/DOB/acct#/FERS/TSP fields   │
│  • Field Audit Trail = 10yr; Event Monitoring → Datadog          │
│  • Stores doc *reference* only (S3 URI + SHA-256), not blob      │
└──────────────────────────────────────────────────────────────────┘
           ▲
           │ Lightning component reads via Apex Named Credential
           │
┌──────────────────────────────────────────────────────────────────┐
│ Advisor inside SF                                                │
│  • LWC `cwSecureDocumentPortal` on Account/Household              │
│  • Renders doc list from SF metadata; click = pre-signed URL     │
│    request → Vercel → S3 → 15-min download                       │
│  • Re-request a document = creates Vault_Request__c → email/SMS  │
│    with magic link → client portal                               │
└──────────────────────────────────────────────────────────────────┘
```

### 4.1 Stack confirmation

- **Hosting**: Vercel (existing `cw-federal-benefits` project, gullstack-projects scope)
- **Domain**: `vault.capitalwealth.com` (CNAME to Vercel; HSTS preload)
- **Frontend**: Next.js 16, React 19, Tailwind 4 (matches existing app)
- **Backend**: Next.js Route Handlers + Server Actions; **no separate API gateway** for v1
- **Database**: Supabase (Postgres). RLS policy resolves household membership via a server-side join against `public.user_households (user_id, household_id)` keyed off `auth.uid()` — **never** trust a `household_id` claim from the JWT (spoofable if signing is misconfigured). Sample policy:
  ```sql
  CREATE POLICY "client_read_own_household_docs" ON vault_documents
    FOR SELECT TO authenticated
    USING (
      household_id IN (
        SELECT household_id FROM user_households WHERE user_id = auth.uid()
      )
    );
  ```
  Same join pattern for INSERT/UPDATE. Pgcrypto column-level AES-256 on PII, with DEK fetched from KMS at the app tier (envelope encryption) — not stored in DB/env
- **Object storage**: AWS S3 (CMK-encrypted, Object Lock compliance mode for 7-yr retention) — *not* Supabase Storage (insufficient WORM controls)
- **Key management**: AWS KMS, customer-managed key per environment, annual rotation, separate CMK for DB vs S3 vs JWT signing
- **Salesforce SDK**: `jsforce` 3.x (already in package.json)
- **AV scan**: ClamAV in Lambda + OPSWAT MetaDefender Cloud (multi-engine, defensible against single-engine miss)
- **Observability**: Datadog (logs + metrics + APM); ship SF Event Monitoring + Vercel logs + S3 access logs into one pane
- **Auth (clients)**: Magic-link primary, password + TOTP fallback; WebAuthn passkey opt-in; **never SMS-only**
- **Auth (advisors)**: Google Workspace SAML SSO + WebAuthn; session ≤2 hr absolute, ≤15 min idle
- **Email**: Postmark or SendGrid for magic links (DMARC-aligned with `vault.capitalwealth.com`)
- **SMS**: Zoom Phone via existing `~/cw-zoom-sms/` bridge (Mike's `+18013485550` sender)

---

## 5. Core user stories

### 5.1 Client first-time invite
1. Advisor in SF clicks **"Invite to Vault"** on Account/Household
2. Salesforce Flow creates `Vault_Invite__c` with single-use token (24-hr TTL)
3. Vercel receives webhook (HMAC-signed); generates magic link → emails client
4. Client clicks → lands on `vault.capitalwealth.com/invite/<token>` → sets password + enrolls TOTP/passkey → lands on dashboard

### 5.2 Client uploads a document
1. Client clicks **"Upload"** → drag-drop a PDF
2. Browser requests pre-signed PUT URL from Vercel (server-side: validates user, generates URL with 15-min TTL, server-generated UUID filename, scoped to **quarantine bucket** only)
3. Direct browser→S3 upload (Vercel never sees the bytes — bandwidth + memory safe)
4. S3 event → Lambda AV pipeline → on clean: copy to clean bucket, delete from quarantine, write event
5. Webhook back to Vercel → updates Supabase doc record → SF Apex callback creates `ContentVersion` *reference* (S3 URI + SHA-256, no blob) on Account
6. Advisor sees new doc in their LWC inside SF

### 5.3 Advisor views a document inside SF
1. Advisor opens Household record → `cwSecureDocumentPortal` LWC loads
2. LWC calls Apex which calls Vercel (via Named Credential, JWT)
3. Vercel validates advisor JWT, generates pre-signed GET URL (15-min, IP-bound to advisor's session IP)
4. Browser fetches PDF; logged to audit table with advisor ID, doc ID, IP, UA, timestamp
5. PDFs render in-browser via PDF.js — no native viewer, no plugin dependency

### 5.4 Advisor re-requests a missing document
1. From LWC → "Request docs" → checklist of standard items (DL, SSN card, last paystub, TSP statement, FERS estimate, beneficiary forms…)
2. SF creates `Vault_Request__c` with line items
3. Vercel generates magic link → SMS via Zoom Phone bridge + email
4. Client logs in, sees checklist, uploads each item; status updates in SF in real-time

### 5.5 Client e-signs Meeting 1 intake
1. Reuses existing `Meeting_1_Intake__c` flow (already deployed at benefits.capitalwealth.com per `project_meeting1_intake_build.md`)
2. Now lives behind same auth wall as Vault — no separate login
3. Submitted intake auto-attaches a PDF render to Vault as a `ContentVersion` reference

---

## 6. Salesforce-side build

### 6.1 New objects

| Object | Purpose | Key fields |
|---|---|---|
| `Vault_Invite__c` | One-shot client invitation tokens | `Token_SHA256__c` (cleartext hex — **never store the raw token in SF**; raw token lives only in the magic-link URL and is hashed on receipt for compare), `Expires_At__c`, `Status__c`, `Account__c` |
| `Vault_Request__c` | Document re-request workflows | `Account__c`, `Status__c`, `Requested_By__c`, `Items__c` (long text JSON) |
| `Vault_Document__c` | Reference to S3 blob (don't store blob in SF) | `S3_URI__c`, `SHA256__c`, `MIME__c`, `Size_Bytes__c`, `Account__c`, `Uploaded_At__c`, `Scan_Status__c` (Pending/Clean/Quarantined), `Document_Type__c` picklist |
| `Vault_Audit_Event__c` | Mirror of S3/Vercel audit log into SF for advisor visibility | `Actor__c`, `Action__c`, `Document__c`, `IP__c`, `UA__c`, `At__c` |

**Shield encryption mode per field** (only if Shield is purchased; see §8 — v1 recommendation is to defer Shield and keep SSN/DOB/etc. in Supabase, not SF):
- **Deterministic** (allows exact-match SOQL filter, `WHERE`, dedup): `Token_SHA256__c`, normalized SSN, normalized account#
- **Probabilistic** (no SOQL filter): everything else — DOB, beneficiary names, free-text PII
- **Never both** on the same field. Picking the wrong mode silently breaks integration queries — Shield can't be flipped after data lands.

SF storage stays light — no PDF blobs stored in `ContentVersion`, only references.

### 6.2 Connected App: `CW_Vault_Portal`

- OAuth 2.0 **JWT Bearer Flow** (no client secret, no refresh tokens)
- Signing certificate generated in AWS KMS, public key uploaded to SF
- **IP allowlist via dedicated AWS NAT Gateway with Elastic IPs.** Vercel serverless functions egress from a rotating pool — IP allowlisting against Vercel's pool will silently break or be perpetually open. Pattern: Vercel Function → VPC connector → AWS PrivateLink/NAT in CW's AWS account → static EIP → SF Login IP Ranges (set at the integration user's **profile** level, not just the Connected App).
  - **Rejected alternative:** Vercel Secure Compute (~$2K+/mo). Adequate, but doubles up infra we already need in AWS for KMS/S3/Lambda. Picking AWS NAT keeps the security boundary in one cloud.
  - **Rejected alternative:** drop network-layer allowlisting and rely on JWT only. JWT is sufficient on paper but loses defense in depth; an examiner expecting a Connected App IP allowlist will flag its absence.
- Permitted users: `portal-svc@capitalwealth.com.cw` integration user only
- Refresh token rotation: enabled (defense in depth even though we don't use them)
- Session timeout: 2 hours absolute

### 6.3 Permission Set: `CW_Vault_Portal_Integration`

Least-privilege:
- R/W: `Vault_Invite__c`, `Vault_Request__c`, `Vault_Document__c`, `Vault_Audit_Event__c`
- R/W: `Account`, `Contact`, `Lead`, `Meeting_1_Intake__c`, `Meeting__c` (specific fields only — no full object)
- Read: `User` (for assignee lookup)
- **Denied**: System Administrator, Modify All Data, View All Data, all picklist administration, all setup access

### 6.4 LWC: `cwSecureDocumentPortal`

- Drops on Household FlexiPage (per `feedback_household_flexipage_no_roundtrip.md`: place via Lightning App Builder, NOT XML deploy)
- Renders: doc list, upload button (deep-link to portal), re-request button, audit log toggle
- Uses Apex `@AuraEnabled(cacheable=true)` with Named Credential `CW_Vault_Portal`
- Empty state: "No documents in Vault yet. Click Invite to send <client> a secure portal link."

---

## 7. Build phases

### Phase 0 — Compliance prerequisites (Weeks 1-2, parallel with build, must complete before any client data lands)
- [ ] **Designate Qualified Individual (CISO-equivalent) via board resolution.** Not "likely Josh" — named individual with documented authority, E&O carrier notified in writing. Candidates: Josh Cohen (with carrier notice) or fractional CISO ($3-5K/mo).
- [ ] Draft written ISP (NIST CSF 2.0 Tier 2 mapping)
- [ ] Draft Identity Theft Prevention Program (Reg S-ID)
- [ ] **Reg S-P 2024 Incident Response Program — redlined by securities counsel before any client data lands.** Includes: 30-day customer notice template (final wording counsel-approved), 72-hr vendor notice contractual addendum (signed by Vercel, Supabase, AWS, OPSWAT, Postmark, Datadog before they receive any data), breach decision tree, IR contact list. **June 3, 2026 deadline (~2.5 weeks from spec date) — drives this phase's urgency.**
- [ ] **Form ADV Part 2A update.** Material change to data-handling disclosure; privacy notice must be re-delivered to existing clients. File amendment + deliver within 120 days of FYE; immediately if treated as material interim change.
- [ ] Confirm NY footprint (does CW have NY clients or NY-licensed producers?) → if yes, NY DFS 23 NYCRR 500 overlay applies (annual CISO certification, mandatory pen-test, 72-hr DFS notice)
- [ ] Confirm OFAC screening responsibility — if Vault becomes new-client onramp, SDN screening at signup is required for insurance entity
- [ ] **Cyber insurance policy bound before go-live.** CW's E&O likely excludes cyber. Target: $1-3M aggregate (~$8-15K/yr for RIA this size). Get quotes early — underwriters increasingly require SOC 2 / pen-test evidence which we won't have at Phase 0; bind on architecture commitments and upgrade premium post-pen-test.
- [ ] **S3 Object Lock Compliance Mode written sign-off from Mike + outside counsel BEFORE bucket creation.** Compliance Mode is permanent — even AWS root cannot delete locked objects. A config typo on the 7-year retention period is unfixable. Counsel must confirm 7-yr is correct retention period (FINRA 4511 = 6yr; some state insurance regs = 10yr).
- [ ] Vendor security review: Vercel, Supabase, AWS, OPSWAT, Postmark, Datadog — collect SOC 2 Type II reports, sign DPAs, attach to ISP

### Phase 1 — Foundation (Weeks 3-4)
- [ ] Provision AWS account (separate from any personal/dev account); enable CloudTrail to S3 with Object Lock
- [ ] **Provision dedicated VPC + NAT Gateway with EIPs** for Vercel→SF egress (the static IP source for Connected App allowlist)
- [ ] Create KMS CMKs: `cw-vault-db`, `cw-vault-s3`, `cw-vault-jwt-sign` — key policies locked to single IAM role; deny `kms:Decrypt` from any other principal
- [ ] Create **single S3 bucket** `cw-vault-docs-prod` with: SSE-CMK, object tagging (`scan_status`), lifecycle rule (quarantined → expire 30d), Object Lock (compliance mode, 7-yr) applied **after** scan-clean tag flip — **only after Phase 0 sign-off lands**
- [ ] Provision Supabase project; enable RLS by default; install pgcrypto; create `user_households` table with server-side-only writes
- [ ] Set up Vercel project `cw-vault-portal` (sibling to `cw-federal-benefits`); attach `vault.capitalwealth.com`; configure VPC connector to AWS NAT
- [ ] Configure HSTS preload; submit to hstspreload.org
- [ ] Wire Datadog ingestion

### Phase 2 — Salesforce side (Weeks 4-5)
- [ ] Deploy 4 new custom objects via SFDX (read `cw-salesforce-metadata/docs/SCHEMA.md` first per `feedback_sf_build_process_failures.md`)
- [ ] Decision point: Shield Platform Encryption ON (~$30K/yr) OR defer per §8 (store PII only in Supabase, mirror only masked/derived fields to SF). **v1 recommendation: defer Shield.**
- [ ] If Shield ON: lock encryption mode per field per §6.1 table (deterministic vs. probabilistic — cannot be flipped after data lands)
- [ ] Create Connected App + integration user + permset; submit for SF Connected App approval (1-3 day SF-side queue)
- [ ] Generate JWT cert in KMS, upload public key to SF
- [ ] Configure integration user profile Login IP Ranges to AWS NAT EIPs
- [ ] Smoke-test JWT flow from AWS NAT egress (not local CLI — the NAT path is the production path)
- [ ] **Add `User.IsActive=FALSE` Flow → invalidate Vercel JWT key version + purge Supabase sessions for that advisor** (offboarding hook — see Brent-departure pattern)

### Phase 3 — Client portal (Weeks 5-7)
- [ ] Auth: magic-link primary + TOTP enrollment + passkey opt-in (no SMS-only)
- [ ] **Client MFA recovery flow:** lost-device path = client calls advisor → advisor initiates reset in LWC → both attest → 24-hr cooldown link → re-enroll. Documented runbook for support.
- [ ] Upload flow with pre-signed PUT URLs (server validates user, generates UUID filename, 15-min TTL, scoped to single bucket with `scan_status=pending` tag)
- [ ] **Upload rate limiting at issuance:** per-user counter in Supabase incremented when URL issued (not at S3); S3 bucket policy caps PUT size at 50MB; pre-signed policy carries `Content-Length` constraint; CloudFront + WAF in front of GETs
- [ ] AV pipeline: Lambda ClamAV (<25MB) + Fargate task (≥25MB) + OPSWAT MetaDefender Cloud (2nd engine, multi-engine defensible)
- [ ] PDF re-render only on engine flag (not blanket — preserves filled form fields)
- [ ] Doc dashboard, e-sign integration with Meeting_1_Intake
- [ ] Mobile responsive (existing app already is; reuse Tailwind config)
- [ ] **WCAG 2.1 AA acceptance criteria** — axe-core in CI, manual screen-reader pass before pilot (ADA Title III lawsuit surface)
- [ ] **POA / cognitive-decline workflow:** `Power_of_Attorney__c` linkage grants delegated Vault access; full audit trail of POA acts on principal's behalf

### Phase 4 — Advisor surface (Weeks 7-8)
- [ ] LWC `cwSecureDocumentPortal` deployed via Lightning App Builder (no XML round-trip per `feedback_no_dashboard_retrieve_redeploy.md`)
- [ ] FLS to ALL users (not just deployer) per `feedback_sf_build_process_failures.md`
- [ ] Re-request workflow with SMS via existing Zoom Phone bridge
- [ ] **Advisor download watermark:** PDFs served to advisors stamped with `<advisor-email>@<timestamp>@<client-id>` for forensic attribution on leaked docs

### Phase 5 — Audit & launch readiness (Weeks 8-10)
- [ ] Third-party pen test (NCC Group or Bishop Fox tier; ~$25-40K — do not go cheaper, false assurance is worse than no test on this attack surface). Scope: web app + API + SF integration + AWS infra.
- [ ] Tabletop IR exercise; document; counsel observes
- [ ] Quarterly DR restore drill: docs from Object Lock bucket → temp env → verify
- [ ] PreciseFP migration plan: export 2 years of historical docs (PreciseFP supports bulk export), ingest to Vault with `Migrated_From__c=PreciseFP` flag, 30-day client overlap window with both systems live

### Phase 6 — Pilot then GA (Weeks 10-16)
- [ ] Gate behind feature flag (CMT) per `feedback_test_before_customer_automation.md`
- [ ] Pilot: Mike's Households first (low risk, advisor present)
- [ ] After 2 weeks clean, broaden to Chad → all advisors
- [ ] Monitor: audit log volume, scan-quarantine rate, login failure rate, support-ticket types
- [ ] Decommission PreciseFP at week 20 (4 weeks after GA)

**Realistic timeline:** **10-12 weeks to pilot, 16 weeks to GA, 20 weeks to PreciseFP decommission.** Accounts for: Connected App SF approval queue (1-3d), AWS NAT + VPC connector provisioning (~1wk), OPSWAT contract (1-2wk procurement), Postmark domain warm-up (3-7d), securities-counsel redline turnaround on IR program, cyber-insurance underwriting, S3 Object Lock irreversibility sign-off.

---

## 8. Cost model (rough)

| Line | One-time | Monthly |
|---|---|---|
| Vercel Pro (existing) | — | $20/seat included |
| Supabase Pro | — | $25 + usage (~$50-100 at scale) |
| AWS S3 + KMS + Lambda + Fargate + NAT Gateway + EIPs | — | ~$80-150 (NAT + EIPs adds ~$40/mo to original estimate) |
| OPSWAT MetaDefender Cloud | — | ~$200 (per-scan model) |
| Postmark | — | ~$15 |
| Datadog | — | ~$200 (Pro tier 5 hosts) |
| Zoom Phone SMS (existing) | — | $0 marginal |
| SF Shield Platform Encryption (**v1 recommendation: defer**) | — | $25K-$75K/yr depending on bundle (Encryption-only vs +Event Monitoring +Field Audit Trail) — **get written SF quote** |
| **Cyber insurance** ($1-3M aggregate, RIA-sized) | — | ~$700-$1.2K/mo ($8-15K/yr) |
| Pen test (annual) | — | ~$2.5K/mo amortized ($25-40K/yr — do not go cheaper) |
| Fractional CISO (if not board-resolved Josh) | — | ~$3-5K/mo |
| **Run-rate total (Shield DEFERRED, Josh as QI)** | | **~$3.5K-5K/mo** |
| **Run-rate total (Shield ON, fractional CISO)** | | **~$9K-13K/mo** |
| PreciseFP cost today | | (replace this line with actual CW figure) |

**Shield decision:** v1 recommendation — **defer Shield**. Store full PII (SSN, DOB, FERS#, TSP balance) only in Supabase (pgcrypto column encryption with KMS-fetched DEK + RLS). Mirror only masked/derived fields to SF (last-4 SSN, DOB year, masked FERS). This (a) removes the $30K-75K/yr line item, (b) removes the probabilistic-encryption-vs-SOQL problem, (c) keeps SF storage cost down, (d) is defensible — Shield protects SF *at-rest* against Salesforce-admin insider threat; if PII isn't in SF, the threat doesn't apply. Revisit if SF becomes the system of record for unmasked PII (it shouldn't).

---

## 9. Open questions for review

1. ~~**Shield Platform Encryption — buy or defer?**~~ **DECIDED v1.1: defer.** Store PII in Supabase only; mirror masked/derived to SF. Revisit only if SF becomes unmasked-PII system of record.
2. **NY footprint?** Drives whether 23 NYCRR 500 applies. If yes, mandatory annual CISO certification + pen test + DFS notification path. **Confirm with Mike before Phase 0 close.**
3. **Client auth: magic-link primary or password primary?** **Recommendation: magic-link primary** (simpler/safer for low-frequency users; most CW clients log in <12x/yr), TOTP for high-frequency users.
4. **Document retention: 7-yr Object Lock compliance mode is irreversible.** Counsel must confirm 7yr (FINRA 4511 = 6yr; Reg S-ID no specific period; some state insurance regs = 10yr). Recommendation: 7yr unless multi-state insurance writes push higher. **Sign-off blocker for bucket creation.**
5. **PDF sanitization aggressiveness.** **Decision v1.1: re-render only on engine flag**, not blanket — preserves filled form fields the client just submitted.
6. **Advisor IP allowlisting.** Soft option: alert on new-IP advisor session, require step-up MFA. Hard option: VPN-only access (CW doesn't have VPN today). **Recommendation: soft option** — step-up MFA on new-IP; full VPN is a separate project.
7. **Migration of existing PreciseFP docs.** Volume estimate ~1,500-2,000 historical client docs. 30-day overlap window with both systems live mitigates risk.
8. **DSAR / right-to-be-forgotten reconciliation.** GLBA/FINRA 4511 retention overrides RTBF for NPI — document the legal-basis denial template before first DSAR lands. CCPA/UCPA process exists for non-NPI even though NPI is data-level exempt.
9. **PreciseFP egress plan if CW reverses course.** Define contractual data-portability format from CW's own portal now, or it never gets written.
10. **Browser support matrix:** Chromium 120+, Safari 17+, Firefox 121+. Reject IE/legacy explicitly.
11. **Branding source.** Pull hero imagery, advisor headshots, video testimonials from:
    - Sandler videos: `https://ae22.wistia.com/folders/c32kjph2kh/subfolders/p4blx60uyy`
    - Sandler photos: `https://aecreative.shootproof.com/gallery/capitalwealth/home`

---

## 10. What this spec deliberately does NOT do (yet)

- Real-time advisor-to-client chat (out of scope — Zoom + SMS handle this)
- Client-side e-signature beyond Meeting 1 intake (Phase 7+)
- Investment account aggregation (Pontera/Plaid integration is its own project)
- Quarterly statement auto-generation (already in `cw-federal-benefits/scripts/`)
- Mobile native app (responsive web is sufficient for v1)
- White-label resale to other advisors (this is for CW only)

---

## 11. Success metrics

- **Security posture:** SOC 2 Type II by month 12 of GA; A+ on SSL Labs; zero high/critical findings in annual pen test
- **Client adoption:** 80% of new Federal Benefits clients onboard via Vault (vs. PreciseFP) within 30 days of GA; 50% of existing Federal clients migrated within 90 days
- **Advisor time saved:** 10+ min per Meeting 1 intake (no PreciseFP context-switch)
- **Compliance:** Reg S-P 2024 IR program documented + tested before June 3, 2026 deadline
- **Cost:** Net cost-neutral or better vs. PreciseFP within 6 months of GA (amortizing build cost)

---

## Sources consulted in this spec

- PreciseFP security page, encryption page, privacy policy, ToS, GDPR page, Salesforce integration help docs
- Docupace security page, FINRA 17a-4 glossary
- SEC Reg S-P 2024 Final Rule + Small Entity Compliance Guide
- SEC Reg S-ID rules + 2022 Risk Alert
- FINRA Rule 4511 + SEA 17a-4 interpretations
- FTC Safeguards Rule + 2024 notification amendment
- NY DFS 23 NYCRR 500 Second Amendment
- NAIC Model Law #668
- NIST CSF 2.0 + Small Business Quick-Start Guide
- OWASP File Upload Cheat Sheet
- Salesforce JWT Bearer Flow, Named Credentials, Shield Encryption docs
- Existing CW infra: `cw-federal-benefits` repo, `~/cw-salesforce-metadata/docs/SCHEMA.md`, Zoom SMS bridge, Google Workspace tenant

---

## 11. Build-kickoff gates (signed before Week 1)

Hard gates. Build does not start until every line below has a name + date:

| Gate | Owner | Sign-off form |
|---|---|---|
| Board resolution: Qualified Individual designated | Mike Stevens | board minutes |
| 7-year Object Lock retention period | Mike + outside counsel | written email approval |
| Securities counsel redline of IR program + notification templates | Outside counsel | redlined PDF |
| Form ADV Part 2A amendment plan | Compliance officer (TBD) | filing-ready draft |
| Cyber insurance binder issued | Mike + broker | binder doc |
| NY footprint determination (DFS 500 in/out of scope) | Mike | written confirmation |
| Vercel→AWS NAT architecture funded ($40-100/mo addl) | Mike | budget approval |
| Shield decision (defer per v1.1 recommendation) | Mike | written confirmation |
| Vendor SOC 2 Type II reports collected | Builder | files in `cw-vault-portal/docs/vendor-soc2/` |
| DPAs signed: Vercel, Supabase, AWS, OPSWAT, Postmark, Datadog | Mike + each vendor | counter-signed PDFs |

**Status v1.1:** Rock-reviewed; P0 fixes applied; awaiting §11 sign-offs before build kickoff.
