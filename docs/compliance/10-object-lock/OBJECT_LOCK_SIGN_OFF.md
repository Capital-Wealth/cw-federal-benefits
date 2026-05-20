# S3 Object Lock — Retention Period Sign-Off

**Status:** REQUIRED before Phase 1 bucket creation
**Decision required by:** Mike Stevens + outside counsel
**Reversibility:** **NONE.** Once `cw-vault-docs-prod` is created with Object Lock in Compliance Mode, the retention period cannot be reduced — not by CW, not by AWS Support, not by the AWS root account. A typo on this number is a 7-year (or longer) operational liability.

---

## What we're locking

S3 bucket `cw-vault-docs-prod` will be created with:
- **Object Lock enabled** at bucket creation (not retroactively — must be enabled at creation)
- **Default retention mode:** Compliance (vs. Governance — Governance can be overridden by privileged roles; Compliance cannot)
- **Default retention period:** **7 years** (proposed)

Every object written to the bucket inherits the retention configuration. Objects can be added or read normally, but cannot be deleted, overwritten, or have their retention period reduced until the period expires.

---

## Why 7 years (the proposed default)

| Authority | Minimum retention | Comment |
|---|---|---|
| SEC IA Act Rule 204-2 | 5 years (first 2 easily accessible) | Federal floor for SEC-registered IAs |
| FINRA Rule 4511 / SEA 17a-4 | 6 years | Applies to insurance/securities-licensed activities |
| State insurance regs (varies) | 3-10 years | Varies by state; some go to 10 years |
| IRS records (cross-reference) | 7 years (general) | Statute of limitations for many tax matters |
| Common litigation hold practice | 6-7 years | Aligns with SOL on many civil claims |

**7 years exceeds the SEC + FINRA floors and accommodates most state insurance regs.** A small number of state regs reach 10 years; counsel must confirm whether any state CW writes in requires longer.

---

## Why Compliance Mode (vs. Governance)

| Mode | Override possible? | Use case |
|---|---|---|
| Governance | Yes — IAM permission `s3:BypassGovernanceRetention` | Operational mistakes recoverable; less defensible against examiners |
| **Compliance** | **No — period must elapse** | **Records-retention defensible against any insider misuse, including root user.** Required-equivalent of WORM per FINRA 17a-4(f) |

Compliance Mode is the correct choice for Vault. The cost of irreversibility (config typo) is mitigated by this written sign-off; the benefit (regulatory defensibility) is the reason Vault is being built in-house.

---

## What can go wrong, and what we do about it

| Risk | Mitigation |
|---|---|
| Typo on retention period (e.g., 70 years instead of 7) | This sign-off + dual confirmation at terraform/CLI execution; recorded apply log |
| Sensitive object lands in this bucket erroneously and cannot be removed for 7 years | Pre-upload gating (only documents through Vault portal pipeline; no manual writes); AV pipeline upstream; legal-hold-friendly metadata tagging |
| Cost growth from retained objects (storage + KMS) | Forecast in §8 of spec; line-item annually |
| Regulatory change reduces required retention | Future objects: configure new bucket with shorter retention; existing objects remain locked for the period they were created under (acceptable — never under-retain) |
| Regulatory change increases required retention | Extend retention per-object before expiration via PUT Object Retention API (allowed — retention can be extended, not reduced) |

---

## What I (Josh) recommend

1. **Set retention to 7 years** in Compliance Mode.
2. Apply via Terraform with two-person review on the PR (require approval from QI as second reviewer).
3. After creation, write a single test object with retention header; verify deletion attempt is rejected; document.
4. Configure quarantine objects to a separate prefix (`quarantine/`) without Object Lock; lifecycle rule expires them at 30 days. Object Lock applies only to `clean/` prefix.
5. Counsel confirms 7 years is correct for all states CW writes insurance in.

---

## Sign-off

**I have read the above. I understand the retention period is permanent for objects written under it. I approve the proposed configuration:**

- [ ] Bucket name: `cw-vault-docs-prod`
- [ ] Object Lock enabled at creation
- [ ] Default retention mode: Compliance
- [ ] Default retention period: ____ years (write in; recommended 7)

____________________________________
Mike Stevens, CEO
Date: __________

**Counsel confirmation that the retention period above is consistent with all retention obligations CW is subject to in all states CW currently operates:**

____________________________________
[Counsel of record]
Date: __________

____________________________________
[_NAME_], Qualified Individual (counter-signer)
Date: __________

---

**File the signed copy in `./signed/OBJECT_LOCK_SIGN_OFF_SIGNED.pdf` before Phase 1 begins. No exceptions.**
