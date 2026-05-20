# NY Footprint Determination — 23 NYCRR 500 applicability

**Date queried:** 2026-05-18
**Query source:** Salesforce cw org (`jcohen@capitalwealth.com`)
**Determination owner:** Mike Stevens (final call)
**Stakes:** If YES → CW must adopt 23 NYCRR 500 Second Amendment controls before Vault go-live (annual CISO certification, mandatory pen test, mandatory MFA-no-exceptions, 72-hr DFS incident notice). If NO → SEC Reg S-P + GLBA Safeguards is the federal floor.

---

## Hard data (SOQL run 2026-05-18)

### Clients (Account.PersonMailingState OR Account.BillingState = NY)
**11 NY Person Accounts on file.** Five created 2024-2025 (active), six legacy 2015-2018.

| Name | Created | Stage hint |
|---|---|---|
| Shakiru Bolaji | 2025-03-12 | Recent — likely active |
| Sophie Pradere | 2025-03-06 | Recent — likely active |
| Swathi Utukuri | 2025-02-05 | Recent — likely active |
| Wilson Arroyave | 2025-01-21 | Recent — likely active |
| Michael Clair | 2024-07-03 | Recent — likely active |
| Walt Hicks | 2024-07-01 | Recent — likely active |
| Osvaldo Rivera | 2018-10-24 | Legacy |
| Neline Rivera | 2018-08-06 | Legacy |
| Cari Bailey | 2018-03-19 | Legacy |
| Edward Wolfe | 2018-03-16 | Legacy |
| Judith Todaro | 2015-07-01 | Legacy |

### Prospects (Lead.State = NY)
**17 NY Leads** (15 'NY' + 2 'New York').

### CW advisors with NY residence (User.State = NY)
**0** — no CW staff lives in NY per SF User records.

---

## 23 NYCRR 500 applicability test

The rule applies to "Covered Entities" — any person operating under or required to operate under a license, registration, charter, certificate, permit, accreditation, or similar authorization under NY Banking, Insurance, or Financial Services Law.

The test is **licensure**, not client residency or staff residency. Client/lead NY presence (above) is **strong circumstantial evidence** of licensure — you don't typically write 11 NY clients without a NY producer license — but the authoritative answer is held in the licensing records of CW's insurance arm.

### Three questions Mike must answer (yes/no):

1. **Is Capital Wealth (or any affiliated insurance entity) currently licensed by the NY Dept. of Financial Services as a producer, broker, agent, or other regulated person?**
2. **Has CW written any NY-resident insurance business in the past 3 years** (annuities, life, etc.) that required NY licensure?
3. **Are any of CW's current producers individually licensed in NY** (even if CW the entity isn't)?

**If ANY answer is YES → 23 NYCRR 500 applies in full.**

### Most conservative reading

Given 11 NY Accounts (5 recent) + 17 NY Leads, assume **YES** until Mike confirms otherwise in writing. Cost of false-NO (DFS exam finding, civil penalty) >> cost of false-YES (~$15K/yr of additional controls we'd want anyway).

---

## If applicable — added scope for the Vault build

| Control | DFS 500 requirement | Vault impact |
|---|---|---|
| §500.4(b) — Board CISO report | Annual written report to board on cyber program | Add to ISP §6 |
| §500.5 — Pen test + vuln scan | Annual pen test + semi-annual vulnerability scan | Already in Phase 5; add semi-annual scan |
| §500.7 — MFA | Mandatory MFA for ALL remote/privileged access, no exceptions absent CISO-approved written compensating control | Already in spec; document exception path = "none" |
| §500.12 — Encryption in transit | All NPI in transit over external networks encrypted | Already TLS 1.3 |
| §500.15 — Encryption at rest | All NPI at rest encrypted, where feasible | Already AES-256-GCM + KMS |
| §500.16 — Incident response | Written IRP — overlaps Reg S-P 2024 IRP | Single doc satisfies both |
| §500.17(a) — DFS notice | 72-hr notice to DFS Superintendent on qualifying cyber event | Add to IRP contact list |
| §500.17(b) — Annual Cert of Material Compliance | Filed annually by April 15; signed by **highest-ranking executive AND CISO** | Mike + QI sign |
| §500.4(c) — CISO independence | CISO has sufficient authority/resources; reports to board | Document in ISP |

---

## Decision (to be filled in by Mike)

- [ ] **YES** — CW is a Covered Entity. Adopt full 23 NYCRR 500. Annual cert due April 15 each year, first cert in 2027.
- [ ] **NO** — CW is not a Covered Entity. Document the basis (e.g., "CW Insurance LLC has never been NY-licensed; the 11 NY clients are advisory-only, no insurance products written"). Re-test annually as CW grows.

**Signed:** _____________________ (Mike Stevens) **Date:** __________

---

**Action queued for Mike:** included in the consolidated sign-off email at `../11-mike-sign-off/MIKE_VAULT_SIGN_OFFS.md`.
