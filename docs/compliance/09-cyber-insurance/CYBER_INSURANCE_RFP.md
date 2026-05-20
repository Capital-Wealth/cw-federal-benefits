# Cyber Insurance — RFP & Application Pack

**Owner:** Mike Stevens + broker
**Target:** Bound coverage before Vault go-live (Phase 6, target week 10-12)
**Estimated underwriting:** 3-6 weeks from broker engagement to binder
**Coverage target:** $1-3M aggregate; $1K-5K retention
**Estimated annual premium:** $8K-$15K for RIA at CW's size and posture

---

## Why now (not after launch)

- CW's E&O policy almost certainly excludes cyber events; confirm with current E&O carrier.
- Reg S-P 2024 effective date (June 3, 2026) — having cyber coverage in place is a positive signal to examiners and to plaintiffs in the event of a breach.
- Underwriters increasingly require evidence of controls (MFA, encryption, IR plan, vendor management) — most of which CW will have via the Vault build. Bind on architecture commitments now; refresh premium downward after pen-test if material favorable change.

---

## Coverage components to require

1. **First-party**
   - Breach response: forensics, legal, notification, credit monitoring (typically baked into sublimits)
   - Business interruption (Vault portal downtime)
   - Cyber extortion / ransomware (with sublimit; clarify ransom-payment authorization process)
   - Data restoration costs
2. **Third-party (liability)**
   - Privacy liability (claims from affected individuals)
   - Network security liability (claims from third parties whose systems CW's incident touched)
   - Regulatory defense + fines (where insurable; SEC fines are typically not insurable; state AG fines may be)
3. **Additional**
   - Social engineering / fraudulent transfer (often a separate sublimit)
   - Bricking coverage (hardware unusable after incident)
   - Reputational harm

---

## Broker shortlist

| Broker | Why |
|---|---|
| **Marsh** | Largest US broker; strong RIA cyber practice |
| **Aon** | Strong RIA practice; competitive on small-to-mid market |
| **HUB International** | Mid-market focus; often competitive on premium |
| **NFP** | Strong RIA/wealth practice |
| **Local Utah broker familiar with RIAs** | Tax-deductible relationship; local service |

**Recommendation:** Get quotes from 2-3 brokers. Provide identical application data so quotes are comparable.

---

## Underwriter application — pre-filled answers

The underwriting application typically asks 50-100 questions. Most CW answers should be:

| Question category | Vault-related answer |
|---|---|
| MFA on all admin accounts | **Yes** — Google SSO + WebAuthn |
| MFA on all user accounts | **Yes** — TOTP/WebAuthn for advisors and clients (post-Vault) |
| Endpoint EDR/AV on all employee devices | Confirm current state |
| Encryption at rest for sensitive data | **Yes** — AES-256-GCM + AWS KMS CMK |
| Encryption in transit | **Yes** — TLS 1.3 |
| Backup strategy | **Yes** — encrypted, cross-region, S3 Object Lock 7yr, quarterly restore drill |
| Written incident response plan | **Yes** — IR Program at `../03-ir-program/IR_PROGRAM.md` (counsel-redlined) |
| Tabletop exercise frequency | **Annual** |
| Penetration testing frequency | **Annual** (start with go-live) |
| Vulnerability scanning frequency | **Semi-annual** (annual if NY DFS 500 doesn't apply) |
| Security awareness training | **Annual + quarterly phishing simulation** |
| Vendor security review program | **Yes** — see ISP §7, Vendor Inventory at `../06-vendor-dpas/VENDOR_INVENTORY.md` |
| Designated CISO / Qualified Individual | **Yes** — Board-resolved per `../01-board-resolution/` |
| Customer-facing portal hosted internally or third-party | **In-house Vault portal (vault.capitalwealth.com)** on Vercel; document collection blob on AWS S3 with Object Lock |
| Storage of payment card data | **No** — CW does not store PCI data |
| Storage of PHI (HIPAA) | **No** — CW is not a HIPAA-covered entity |
| Records of prior cyber incidents | Confirm history with Mike — list with dates if any |
| Estimated count of records containing NPI | ~[N] customer records + ~[N] prospect records — pull current SF counts |
| Annual revenue | $100M |
| Number of employees | ~9 advisors + admins |
| States in which we operate | Utah HQ; clients in NY, [list states] |
| Cyber-related regulatory exam history | Confirm with Mike |

**Action:** Mike + QI fill in the [bracketed] answers; pull SF record counts via SOQL when application is in hand.

---

## What underwriters often subtract premium for

- Independent penetration test report (within 12 months)
- SOC 2 Type II of own infrastructure (CW won't have this at Phase 0; targeted within 12 months of GA)
- Documented incident-response plan reviewed by external counsel
- 72-hour vendor notification clauses in MSAs

Vault's architecture is designed to check every one of these boxes. **Highlight in the broker submission.**

---

## What underwriters often add premium for or refuse to cover

- No MFA on email — N/A, CW has SSO with MFA
- Unsegmented network with all systems sharing one credential plane — N/A
- Open RDP / SMB to the internet — N/A
- No backup or untested backup — N/A
- Prior ransomware incident in last 3 years — confirm with Mike
- Active litigation related to data handling — confirm with Mike

---

## Timeline

| Week | Action |
|---|---|
| 0 | Mike selects broker(s); QI provides application pack |
| 1 | Brokers submit to 2-3 carriers |
| 3-5 | Carrier underwriting questions answered |
| 5-6 | Quotes received; review with broker |
| 6 | Bind coverage; binder issued |
| 6 | Notify all subprocessors that CW has cyber coverage (relevant to some DPA terms) |

---

## After Vault GA

Re-rate after:
- First successful pen test
- SOC 2 Type II of CW infrastructure (12-18 months after GA)
- Annual policy renewal

Expect downward premium pressure with each clean year.
