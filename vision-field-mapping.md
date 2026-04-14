# GullStack Report Builder — Salesforce Field Mapping (ACTUAL)

## Credentials You Need

| Item | Value |
|------|-------|
| **SF Org URL** | `https://capitalwealth.my.salesforce.com` |
| **Object Name** | `Federal_Benefits_Intake__c` |
| **Consumer Key** | *(Pending — Connected App creation blocked by SF org setting, being resolved)* |
| **Consumer Secret** | *(Same)* |

## Object Info
- **API Name:** `Federal_Benefits_Intake__c`
- **Auto-Number Name:** `FBI-XXXX`
- **Record ID Prefix:** `a2v`
- **Total Custom Fields:** 156
- **Related to Lead via:** `Lead__c` (lookup)
- **Related to Contact via:** `Contact__c` (lookup)
- **Assigned Advisor via:** `Advisor__c` (lookup to User)

## Status Flow
`Draft` → `Link Sent` → `Docs Uploaded` → `AI Parsed` → `Advisor Review` → `Complete`

Status field: `Status__c` (picklist)

---

## COMPLETE FIELD MAPPING

### Your Field → Our SF API Name

#### REQUIRED FIELDS

| Your Field | SF API Name | Type | Notes |
|-----------|-------------|------|-------|
| `fullName` | N/A — on Contact/Lead record | — | Query `Contact__c` → `Contact.Name` or `Lead__c` → `Lead.Name` |
| `dateOfBirth` | `Date_of_Birth__c` | Date | **NEW** — just added |
| `serviceComputationDate` | `Service_Computation_Date__c` | Date | |
| `retirementSystem` | `Retirement_System__c` | Picklist | Values: `CSRS`, `FERS`, `xFERS` (your FERS_TRANSFER = our `xFERS`) |
| `employeeType` | `Employee_Type__c` + `Employee_Category__c` | Picklist | Type: `Regular`/`Other`. Category: `None`/`Firefighter`/`Law Enforcement`/`Air Traffic Controller` |
| `currentAnnualSalary` | `Current_Annual_Salary__c` | Currency | |
| `plannedRetirementDate` | `Desired_Retirement_Date__c` | Date | |
| `creditableServiceYears` | *(calculated)* | — | Calculate from `Service_Computation_Date__c` to `Desired_Retirement_Date__c` |
| `creditableServiceMonths` | *(calculated)* | — | Same |
| `sickLeaveHours` | `Sick_Leave_Hours_To_Date__c` | Number | |
| `annualSalaryIncreaseRate` | `Expected_Salary_Increase__c` | Percent | Stored as whole number (e.g., 2.5 = 2.5%) |

#### TSP (Thrift Savings Plan)

| Your Field | SF API Name | Type |
|-----------|-------------|------|
| `tspTraditionalG` | `TSP_Trad_G_Balance__c` | Currency |
| `tspTraditionalF` | `TSP_Trad_F_Balance__c` | Currency |
| `tspTraditionalC` | `TSP_Trad_C_Balance__c` | Currency |
| `tspTraditionalS` | `TSP_Trad_S_Balance__c` | Currency |
| `tspTraditionalI` | `TSP_Trad_I_Balance__c` | Currency |
| `tspTraditionalL` | `TSP_Trad_L_Balance__c` | Currency |
| `tspRothG` | `TSP_Roth_G_Balance__c` | Currency |
| `tspRothF` | `TSP_Roth_F_Balance__c` | Currency |
| `tspRothC` | `TSP_Roth_C_Balance__c` | Currency |
| `tspRothS` | `TSP_Roth_S_Balance__c` | Currency |
| `tspRothI` | `TSP_Roth_I_Balance__c` | Currency |
| `tspRothL` | `TSP_Roth_L_Balance__c` | Currency |
| `tspAnnualContribution` | `TSP_Trad_Biweekly_Dollar__c` | Currency | **NOTE: biweekly, not annual. Multiply by 26.** |
| `tspRothContribution` | `TSP_Roth_Biweekly_Dollar__c` | Currency | **NOTE: biweekly, not annual. Multiply by 26.** |
| `tspCatchUp` | `TSP_Trad_Catchup__c` + `TSP_Roth_Catchup__c` | Currency | Split between Traditional and Roth |
| `tspExpectedReturn` | Per-fund: `TSP_Return_G__c`, `TSP_Return_F__c`, `TSP_Return_C__c`, `TSP_Return_S__c`, `TSP_Return_I__c` | Percent | Per-fund returns, not a single aggregate |
| `tspWithdrawalAge` | `TSP_Withdrawal_Age_Years__c` + `TSP_Withdrawal_Age_Months__c` | Number | Years + months |
| `tspWithdrawalMethod` | `TSP_Withdrawal_Type__c` | Picklist | Values: `Lump Sum`, `Monthly Amount`, `Annuity` |
| `tspMonthlyWithdrawal` | `TSP_Monthly_Dollar_Amount__c` | Currency | |

**Also available:**
- `TSP_Trad_Biweekly_Pct__c` / `TSP_Roth_Biweekly_Pct__c` — contribution as % of salary
- `TSP_Trad_Alloc_G__c` through `TSP_Trad_Alloc_I__c` — allocation percentages per fund (Traditional)
- `TSP_Roth_Alloc_G__c` through `TSP_Roth_Alloc_I__c` — allocation percentages per fund (Roth)
- `TSP_Trad_L_Fund__c` / `TSP_Roth_L_Fund__c` — L Fund name (e.g., `L2035`)
- `TSP_Monthly_Method__c` — `Specific Dollar Amount` or `Life Expectancy`
- `TSP_Joint_Annuitant__c` / `TSP_Joint_Annuitant_Age__c` — joint annuity
- `TSP_Annuity_Interest_Rate__c` — annuity rate
- `Other_TSP_Rollover__c` — outside TSP rollover amount

#### FEGLI (Life Insurance)

| Your Field | SF API Name | Type | Notes |
|-----------|-------------|------|-------|
| `fegliBasic` | `FEGLI_Basic__c` | Checkbox | |
| `fegliOptionA` | `FEGLI_Option_A__c` | Checkbox | |
| `fegliOptionB` | `FEGLI_Option_B__c` | Checkbox | |
| `fegliOptionBMultiple` | `FEGLI_Option_B_Multiplier__c` | Picklist | Values: `1x`, `2x`, `3x`, `4x`, `5x` |
| `fegliOptionC` | `FEGLI_Option_C__c` | Checkbox | |
| `fegliOptionCMultiple` | `FEGLI_Option_C_Multiplier__c` | Picklist | Values: `1x`, `2x`, `3x`, `4x`, `5x` |
| `fegliPostRetirement` | `FEGLI_Basic_Reduce_65__c` | Picklist | Values: `No Reduction`, `50% Reduction`, `75% Reduction` |

**Also available:**
- `FEGLI_Option_C_Spouse__c` / `FEGLI_Option_C_Children__c` — who's covered
- `FEGLI_Option_B_Reduce_65__c` / `FEGLI_Option_C_Reduce_65__c` — post-65 reduction elections
- `FEGLI_Biweekly_Premium__c` — current biweekly FEGLI premium

#### FEHB (Health Benefits)

| Your Field | SF API Name | Type |
|-----------|-------------|------|
| `fehbPlanName` | `FEHB_Plan_Name__c` | Text | **NEW** |
| `fehbEnrollment` | `FEHB_Enrollment_Type__c` | Picklist | Values: `Self Only`, `Self Plus One`, `Self and Family` **NEW** |
| `fehbBiweeklyPremium` | `FEHB_Biweekly_Premium__c` | Currency | |
| `fehbIncreaseRate` | `FEHB_Annual_Increase__c` | Percent | |

#### Social Security

| Your Field | SF API Name | Type | Notes |
|-----------|-------------|------|-------|
| `ssBenefitAge62` | `SS_FERS_Monthly_Benefit__c` | Currency | For FERS employees |
| `ssBenefitFRA` | *(not stored)* | — | Calculate from age-62 estimate |
| `ssStartAge` | `SS_FERS_Start_Age__c` | Number | |

**For CSRS Offset:**
- `SS_CSRS_Monthly_Benefit__c` / `SS_CSRS_Start_Age__c`
- `SS_FERS_COLA__c` / `SS_CSRS_COLA__c` — COLA rates

#### Military Service

| Your Field | SF API Name | Type |
|-----------|-------------|------|
| `hasMilitaryService` | `Has_DD214__c` | Checkbox |
| `militaryBranch` | `Military_Branch__c` | Picklist | **NEW** — Values: Army, Navy, Air Force, Marines, Coast Guard, Space Force |
| `militaryStartDate` | `Military_Service_From__c` | Date |
| `militaryEndDate` | `Military_Service_To__c` | Date |
| `militaryDepositPaid` | `Military_Deposit_Paid__c` | Checkbox | **NEW** |
| `militaryDepositOwed` | `Deposit_Amount_Owed__c` | Currency | Shared field — also used for civilian deposits |

#### Survivor Benefits

| Your Field | SF API Name | Type | Notes |
|-----------|-------------|------|-------|
| `survivorElection` | `Survivor_Benefit_FERS__c` | Picklist | Values: `0%`, `25%`, `50%` (FERS) |
| *(CSRS survivor)* | `Survivor_Benefit_CSRS__c` | Percent | CSRS uses free-form percentage |
| `spouseDOB` | `Spouse_DOB__c` | Date | |
| `maritalStatus` | `Marital_Status__c` | Picklist | **NEW** — Values: Single, Married, Divorced, Widowed |

#### Tax Fields

| Your Field | SF API Name | Type |
|-----------|-------------|------|
| `filingStatus` | `Filing_Status__c` | Picklist | **NEW** — Single, MFJ, MFS, HoH |
| `federalTaxRate` | `Federal_Tax_Rate__c` | Percent | **NEW** |
| `stateOfResidence` | `State_of_Residence__c` | Text | **NEW** |
| `stateTaxRate` | `State_Tax_Rate__c` | Percent | **NEW** |

#### Deposit / Redeposit

| Your Field | SF API Name | Type |
|-----------|-------------|------|
| `hasNonDeductionService` | `Has_Periods_No_Contributions__c` | Checkbox |
| `depositOwed` | `Deposit_Amount_Owed__c` | Currency |
| `hasRefundedService` | `Left_Service_Took_Funds__c` | Checkbox |
| `reDepositOwed` | `Redeposit_Amount_Owed__c` | Currency |

**Also available:**
- `Deposit_Period_From__c` / `Deposit_Period_To__c` — deposit service period
- `Deposit_Paid_Date__c` — when deposit was paid
- `Redeposit_Period_From__c` / `Redeposit_Period_To__c` — redeposit service period
- `Will_Redeposit__c` — plans to redeposit
- `Withdrawal_Received_Date__c` — when refund was received

#### Other Income / Expenses

| Your Field | SF API Name | Type |
|-----------|-------------|------|
| `otherPensions` | `Other_Pensions__c` | Currency | **NEW** |
| `spouseIncome` | `Spouse_Income__c` | Currency | |
| `rentalIncome` | `Rental_Property_Income__c` | Currency | |
| `investmentIncome` | `Investment_Income__c` | Currency | **NEW** |
| `monthlyHousing` | `Expense_Mortgage_Rent__c` | Currency | |

**Also available:**
- `Spouse_Retirement_Savings__c` / `Spouse_Social_Security__c`
- `Retirement_Job_Income__c` — post-retirement employment income
- `Expense_Auto__c` / `Expense_Credit__c` / `Expense_Other__c`
- `Living_Expenses_Total__c`
- `Tax_Increase_In_Retirement__c`

#### FERS Transfer (xFERS)

| Your Field | SF API Name | Type | Notes |
|-----------|-------------|------|-------|
| `csrsServiceYears` | *(calculated)* | — | Calculate from `Service_Computation_Date__c` to `Transfer_Date__c` |
| `fersServiceYears` | *(calculated)* | — | Calculate from `Transfer_Date__c` to `Desired_Retirement_Date__c` |
| *(transfer date)* | `Transfer_Date__c` | Date | Date employee transferred from CSRS to FERS |

#### Metadata / AI Parsing

| SF API Name | Type | Description |
|-------------|------|-------------|
| `AI_Parse_Confidence__c` | Percent | Confidence score from AI document extraction |
| `AI_Parsed_Date__c` | DateTime | When AI parsed the documents |
| `Advisor_Reviewed_Date__c` | DateTime | When advisor reviewed the parsed data |
| `Fields_Needing_Review__c` | Long Text | List of fields flagged for human review |
| `FedRetire_Report_Generated__c` | Checkbox | Has the report been generated |
| `FedRetire_Report_Date__c` | DateTime | When the report was generated |
| `Document_Upload_URL__c` | URL | Client-facing upload portal link |
| `Supabase_Folder_ID__c` | Text | Document storage folder reference |
| `Intake_Date__c` | Date | When intake was initiated |

---

## AI Document Upload — Already Built

We built the document upload + AI extraction pipeline. Here's how it works:

1. Advisor creates intake → `POST /api/intake` → creates `Federal_Benefits_Intake__c` record + generates secure portal URL
2. Federal employee opens portal URL → uploads LES, SF-50, TSP Statement, DD-214, SS Statement
3. Documents stored in encrypted Supabase bucket
4. Claude AI automatically reads each document and extracts fields
5. Extracted data writes directly to the SF record fields listed above
6. Status moves to `AI Parsed`, confidence scores recorded

**Your report builder can trigger on Status__c = 'AI Parsed' or 'Complete'.**

### Suggested Integration Flow
```
1. Your API watches for Status__c = 'Complete' (or 'AI Parsed' if advisor review not needed)
2. POST /api/salesforce/generate { "recordId": "a2vXXXXXXXXXXXXX" }
3. Your API reads Federal_Benefits_Intake__c using the field map above
4. Runs 15 calculation modules
5. Generates 50-page PDF
6. Updates FedRetire_Report_Generated__c = true, FedRetire_Report_Date__c = now()
```

## Existing Flows / Triggers
- No existing Flows on `Federal_Benefits_Intake__c` yet
- No Apex triggers
- Clean object — you can add a Platform Event or Flow trigger on Status change if needed

## Notes for Your Mapper
- **TSP contributions are biweekly, not annual** — multiply `TSP_Trad_Biweekly_Dollar__c` × 26 for annual
- **Employee type is split into two fields** — `Employee_Type__c` (Regular/Other) + `Employee_Category__c` (None/FF/LEO/ATC)
- **xFERS = FERS Transfer** — picklist value is `xFERS`, not `FERS_TRANSFER`
- **Creditable service isn't stored** — calculate from SCD to retirement date, don't look for a field
- **12 fields marked NEW** were just deployed today specifically for your mapper
