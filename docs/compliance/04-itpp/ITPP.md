# Capital Wealth — Identity Theft Prevention Program (ITPP)

**Version:** 1.0 DRAFT (Board adoption required; annual update thereafter)
**Adopted:** [DATE]
**Owner:** Qualified Individual (per `../01-board-resolution/`)
**Authority:** SEC Regulation S-ID, 17 C.F.R. §248.201 (Identity Theft Red Flags Rules)
**Reviewed:** annually, and upon material change in CW's risk profile

---

## 1. Purpose

This Identity Theft Prevention Program ("ITPP") is adopted by the Board of Directors of Capital Wealth to detect, prevent, and mitigate identity theft in connection with the opening of "covered accounts" or any existing covered account, as required by Regulation S-ID.

---

## 2. Covered Accounts

A "covered account" under §248.201(b)(3) is (a) an account that CW offers or maintains primarily for personal/family/household purposes that involves multiple payments or transactions; or (b) any other account for which there is a reasonably foreseeable risk of identity theft.

**CW's covered accounts include:**
- Advisory client relationships (continuous, multiple transactions/communications).
- Vault portal client accounts (electronic access to account information and document exchange).
- Annuity and life insurance contracts written through CW's insurance entity, where CW maintains the policyholder relationship.

---

## 3. Identification of Red Flags

CW has identified Red Flags relevant to its covered accounts, drawn from the five categories in Appendix A of Reg S-ID:

### 3.1 Alerts, notifications, or warnings from a consumer reporting agency
- Fraud or active duty alert on a consumer report obtained during onboarding.
- Notice of credit freeze.
- Address discrepancy notice.
- Material inconsistency between consumer report and customer-provided information.

### 3.2 Suspicious documents
- Identification document that appears altered or forged.
- Photo or physical description on ID not matching the person presenting it (in-person or video).
- Information on ID inconsistent with information provided by the customer.
- Application looks forged or altered.

### 3.3 Suspicious personal identifying information
- Identifying information inconsistent with external sources (CW uses [TBD: vendor for ID verification — Alloy, Persona, or Plaid IDV]).
- SSN listed as belonging to a different person, or appearing on the SSA Death Master File.
- Address that is a mail drop, prison, or invalid.
- Phone number associated with a known fraudulent account or with answering service / pager.
- Customer fails to provide all required information on application; provides inconsistent information across CW systems.

### 3.4 Unusual use of, or suspicious activity related to, a covered account
- Material change in patterns of use of the Vault portal (e.g., login from a country never associated with the customer; bulk download of historical documents shortly after a credential reset).
- Material change in patterns of use of an annuity/insurance contract (e.g., sudden change in beneficiary followed by withdrawal request).
- Notification from a customer that they are not receiving expected paper or electronic statements.
- Customer notifies CW of unauthorized charges or transactions on a covered account.
- Mail returned undeliverable despite continued transaction activity.
- Notification from law enforcement that an identity is suspected of being used fraudulently.

### 3.5 Notice from customers, victims of identity theft, law enforcement, or other persons
- Notice from a customer that they are a victim of identity theft.
- Notice from law enforcement of an identity-theft investigation involving CW or its customers.
- Notice from a third party (e.g., credit reporting agency, IRS) of suspicious activity.

---

## 4. Detection of Red Flags

CW personnel detect Red Flags through the following procedures:

| Lifecycle stage | Detection method |
|---|---|
| Onboarding / opening a covered account | ID verification at meeting (in-person or via Zoom video for federal-benefits clients); consumer report check via [vendor TBD]; cross-check of customer-provided information against external sources |
| Vault portal account creation | Magic-link delivery to the email address on file (validates email control); TOTP/passkey enrollment; geographic-anomaly flag on first login |
| Authentication | MFA mandatory; failed-login monitoring; new-IP / new-device alerts on advisor accounts |
| Transaction monitoring | Beneficiary change alerts; large/unusual withdrawal alerts; pattern-change alerts in Salesforce |
| Communications | All inbound NPI-touching requests verified by callback to phone of record before action |
| Returned mail | Operations Manager logs returned mail; flag if returned with active account activity elsewhere |

---

## 5. Response to Red Flags

When a Red Flag is detected, CW personnel respond as follows:

| Severity | Response |
|---|---|
| **Possible / unconfirmed** | Document in customer record; verify identity through callback to phone-on-file or independent channel; do not act on the suspicious request until verified |
| **Confirmed Red Flag** | Suspend pending transactions; freeze Vault portal account; notify the Qualified Individual; document; contact customer through verified channel |
| **Confirmed identity theft** | Activate IRP (`../03-ir-program/`) — treat as a cybersecurity incident with potential customer notification obligations under Reg S-P; cooperate with law enforcement; consider notifying credit reporting agencies and the customer's other financial institutions; document |

Specific response actions may include: contacting the customer through an independent verified channel; not opening a new covered account; not honoring a request; closing or restricting the covered account; reissuing credentials; notifying law enforcement; notifying the affected customer; coordinating with the customer's other financial institutions; refraining from collection efforts on a fraudulently opened account.

---

## 6. Periodic Updates

The QI updates this ITPP at least annually and upon material change to:
- CW's covered accounts;
- methods used to open or access covered accounts;
- methods used to detect, prevent, and mitigate identity theft;
- types of accounts CW offers or maintains; and
- CW's business arrangements (e.g., new service providers handling Red-Flag-relevant data).

Update includes review of: experience with identity theft; changes in identity-theft methods; changes in detection/prevention/mitigation methods; changes in CW's business; and changes in service provider arrangements.

---

## 7. Service Provider Oversight

CW's service providers that perform activity in connection with covered accounts (Vault portal hosting, ID verification vendor, Salesforce-side automation, email/SMS delivery) are required by contract to have policies and procedures to detect, prevent, and mitigate identity theft, and to report Red Flags to CW.

---

## 8. Administration

### 8.1 Approval
This Program was approved by the Board of Directors on [DATE].

### 8.2 Ongoing oversight
The Qualified Individual is responsible for the development, implementation, and administration of this Program. The QI:
- Approves material changes to the Program;
- Reviews reports prepared by staff regarding compliance and incidents;
- Provides annual written reports to the Board covering: effectiveness of the Program, service-provider arrangements, significant incidents and management response, and recommendations for material changes.

### 8.3 Staff training
CW personnel involved in opening or maintaining covered accounts receive training on this Program at engagement and annually thereafter. Training records retained per ISP §10.

---

## 9. Recordkeeping

Per ISP §10, the following ITPP records are retained 6 years:
- This Program and all prior versions.
- Annual QI reports to the Board.
- Documented Red Flag detections and responses.
- Training records.
- Service-provider attestations.

---

## 10. Approval

____________________________________
[_NAME_], Qualified Individual
Date: __________

____________________________________
Mike Stevens, CEO and Director
Date: __________

____________________________________
[Additional Director, if any]
Date: __________
