# SOC 2 Type II — Collection Status

**Owner:** Builder + QI
**Standard:** GLBA Safeguards §314.4(f) and Reg S-P §248.30(a)(5) require vendor oversight including assessment of vendors' safeguards. SOC 2 Type II is the industry-standard attestation.

For each critical-path Vault vendor: where to obtain the report, current status, expiration, follow-up date.

---

## Status

| Vendor | Public trust page | Self-serve report download? | NDA required? | Status | Next refresh |
|---|---|---|---|---|---|
| **Vercel** | vercel.com/security | Yes (with login) | No (Type II under NDA via Trust Center) | TODO — pull | [+1Y from issue] |
| **Supabase** | supabase.com/security | Yes (with login) | No | TODO — pull | [+1Y] |
| **AWS** | aws.amazon.com/compliance | Yes (AWS Artifact) | Yes (click-through NDA) | TODO — pull via Artifact | [+1Y] |
| **OPSWAT** | opswat.com/compliance | No | Yes | TODO — request via sales | [+1Y] |
| **Salesforce** | trust.salesforce.com / Compliance | Yes (with org login) | No | TODO — pull | [+1Y] |
| **Postmark (Wildbit)** | postmarkapp.com/security | Yes | No | TODO — pull | [+1Y] |
| **Datadog** | datadoghq.com/security | Yes (Trust Center) | No | TODO — pull | [+1Y] |
| **Google Workspace** | cloud.google.com/security/compliance | Yes (Trust Hub) | No | TODO — pull | [+1Y] |
| **Zoom** | zoom.us/trust | Yes | No | TODO — pull | [+1Y] |
| **Cloudflare** | cloudflare.com/trust-hub | Yes | No | TODO — pull | [+1Y] |

---

## Collection runbook

For each vendor:

1. Download the most recent SOC 2 Type II report.
2. File at `./signed/<vendor>/SOC2_TYPEII_<date>.pdf`.
3. Note expiration date in a row of the table above.
4. Read the report:
   - Confirm scope includes the service Capital Wealth uses.
   - Note auditor identity (CPA firm).
   - Read management response to exceptions; flag any open exceptions or qualifications.
   - Confirm Trust Services Criteria coverage: at minimum Security; preferably Security + Confidentiality + Availability.
   - Confirm period covered (typically 12 months trailing).
5. If exceptions are material to CW's use case, flag to QI for risk-acceptance or remediation conversation with vendor.
6. Set calendar reminder 60 days before report expiration to re-collect.

---

## Audit-trail file

`./signed/COLLECTION_LOG.md` — append-only log: date collected, by whom, vendor, report period, file path, exceptions noted, QI review date. Six-year retention per ISP §10.

---

## Bridge / gap reports

Vendors typically issue Type II reports covering the prior 12 months. There is often a gap of 1-3 months between the report period end and the next report. Vendors provide a **bridge letter** during this gap confirming continued compliance. Request bridge letters from vendors during gap periods; file in `./signed/<vendor>/`.

---

## What "no SOC 2" disqualifies

Any vendor handling NPI without SOC 2 Type II (or comparable ISO 27001 + relevant scope) is presumptively disqualified for Vault. Exceptions require:
- Written risk-acceptance from QI;
- Compensating controls documented in ISP §7;
- Annual reassessment;
- Escalation to alternative vendor when feasible.

No current Vault vendor is in this category. Documenting this so it's enforceable going forward.
