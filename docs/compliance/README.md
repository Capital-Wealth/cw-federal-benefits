# Vault Portal — Compliance Workspace

**Created:** 2026-05-18
**Owner:** Josh Cohen (until QI designated)
**Purpose:** Pre-stage every artifact required for the Vault portal build to be defensible under SEC Reg S-P (2024 amendments, effective June 3, 2026), GLBA Safeguards Rule, FINRA Rule 4511, Reg S-ID, and 23 NYCRR 500 (pending NY footprint determination).

**Sister doc:** `../SECURE_PORTAL_SPEC.md` (v1.1 — the product spec this compliance work supports).

---

## Status — at a glance

| Gate | Document | Status | Blocker |
|---|---|---|---|
| Qualified Individual | `01-board-resolution/BOARD_RESOLUTION_QI_DESIGNATION.md` | Drafted | Mike picks candidate + adopts via written consent |
| Written ISP | `02-isp/ISP.md` | Drafted | QI signature after #1 |
| Reg S-P IR Program | `03-ir-program/IR_PROGRAM.md` + customer letter template | Drafted | Securities counsel redline (~$3K-$5K, 5-10 days) |
| Reg S-ID ITPP | `04-itpp/ITPP.md` | Drafted | Board adoption |
| Form ADV Part 2A | `05-form-adv/FORM_ADV_2A_AMENDMENT.md` | Drafted | CCO + counsel review, then IARD filing |
| Vendor 72-hr addendum | `06-vendor-dpas/72_HOUR_NOTIFICATION_ADDENDUM.md` + inventory | Drafted | Mike signs; routed to 10 vendors |
| SOC 2 collection | `07-soc2/SOC2_COLLECTION.md` | Checklist drafted | Pull reports (1-2 days for self-serve, up to 3 weeks for OPSWAT) |
| NY footprint | `08-ny-footprint/NY_FOOTPRINT_DETERMINATION.md` | **Data pulled: 11 NY Accounts + 17 NY Leads** | Mike answers 3 yes/no questions |
| Cyber insurance | `09-cyber-insurance/CYBER_INSURANCE_RFP.md` | RFP + pre-filled application drafted | Mike picks broker; 3-6 wk underwriting |
| S3 Object Lock 7yr | `10-object-lock/OBJECT_LOCK_SIGN_OFF.md` | Drafted | Mike + counsel signatures (permanent decision) |
| Mike consolidated ask | `11-mike-sign-off/MIKE_VAULT_SIGN_OFFS.md` | **Email drafted + queued in jcohen Gmail (draft id `r1220460608206972833`)** | Josh reviews + sends |

---

## Critical-path deadline

**SEC Reg S-P 2024 compliance: June 3, 2026** — ~16 days from this workspace's creation. The IR Program (gate #3) must be counsel-redlined and adopted before that date independent of whether the Vault portal is live yet. Even running PreciseFP, CW is a covered RIA and owes the Reg S-P obligations.

---

## How to drive this to "in reality hardened"

1. **Josh:** Review the Mike email draft (`11-mike-sign-off/`). Adjust voice/timing. Send Monday morning.
2. **Mike:** 30-min review Friday closes 4 of 5 gates. #2 (counsel) needs one phone call to engage; the rest are sign-offs against pre-staged drafts.
3. **Counsel:** Redlines the IR Program + customer notification letter + Form ADV amendment. 5-10 business days.
4. **Vendor outreach:** Send 72-hr addendum to the 6 vendors whose standard DPAs are softer. 5-15 business days per vendor.
5. **Broker:** Bind cyber coverage. 3-6 weeks underwriting.
6. **Builder (post-sign-off):** Create AWS account, KMS keys, S3 bucket (Object Lock applied after sign-off lands), Supabase, Vercel — per `../SECURE_PORTAL_SPEC.md` v1.1 Phase 1.

When every row in the §11 table of `SECURE_PORTAL_SPEC.md` has a name + date, CW is hardened in reality.

---

## File map

```
compliance/
├── README.md                                       ← you are here
├── 01-board-resolution/
│   └── BOARD_RESOLUTION_QI_DESIGNATION.md          QI designation language + candidate slate
├── 02-isp/
│   └── ISP.md                                      Written Information Security Program
├── 03-ir-program/
│   ├── IR_PROGRAM.md                               Reg S-P 2024 Incident Response Program
│   └── templates/
│       └── CUSTOMER_NOTIFICATION_LETTER.md         30-day customer notice template (counsel redlines)
├── 04-itpp/
│   └── ITPP.md                                     Reg S-ID Identity Theft Prevention Program
├── 05-form-adv/
│   └── FORM_ADV_2A_AMENDMENT.md                    Privacy notice amendment language for IARD filing
├── 06-vendor-dpas/
│   ├── 72_HOUR_NOTIFICATION_ADDENDUM.md            Contractual addendum for Reg S-P §248.30(a)(5)(ii)
│   └── VENDOR_INVENTORY.md                         10-vendor inventory + DPA + SOC 2 status
├── 07-soc2/
│   └── SOC2_COLLECTION.md                          Per-vendor collection runbook + status
├── 08-ny-footprint/
│   └── NY_FOOTPRINT_DETERMINATION.md               11 NY Accts + 17 NY Leads (SOQL); 3 yes/no for Mike
├── 09-cyber-insurance/
│   └── CYBER_INSURANCE_RFP.md                      Broker shortlist + pre-filled underwriting answers
├── 10-object-lock/
│   └── OBJECT_LOCK_SIGN_OFF.md                     Permanent 7-yr retention sign-off (Mike + counsel)
└── 11-mike-sign-off/
    └── MIKE_VAULT_SIGN_OFFS.md                     Three-Kings-audited consolidated ask (queued in Gmail)
```

---

## Definition of "hardened in reality"

A CW client could ask, "Is my SSN safer with CW than it was with PreciseFP?" and the honest answer would be **yes** — because:

- A board-resolved Qualified Individual is accountable in writing.
- A securities-counsel-reviewed IR Program governs the 30-day customer notice.
- Document blobs are AES-256-GCM at rest with CW-controlled keys CW alone can rotate.
- A 72-hour vendor notification clause is in every subprocessor MSA.
- Cyber insurance is bound.
- The system has been pen-tested by a tier-1 firm before client data lands.
- NY clients are covered by 23 NYCRR 500 if applicable, or knowingly out of scope.

Today, none of those statements is true. After the work in this directory is signed, every one is.
