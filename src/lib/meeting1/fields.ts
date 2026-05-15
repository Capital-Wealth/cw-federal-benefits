/**
 * Meeting 1 Intake — field + section config for the builder form.
 *
 * API names match the Salesforce `Meeting_1_Intake__c` object 1:1 so the
 * payload posts straight through `Meeting1IntakeService` Apex with no mapping.
 * Coaching text is the Three Kings rep script (Voss / Belfort / StoryBrand),
 * shown on screen so anyone running a discovery visit can follow it.
 */

export type FieldType =
  | "text"
  | "longtext"
  | "number"
  | "currency"
  | "percent"
  | "date"
  | "checkbox"
  | "picklist";

export interface FieldDef {
  api: string;
  label: string;
  type: FieldType;
  options?: string[];
  help?: string;
}

export interface SectionDef {
  id: string;
  title: string;
  /** Three Kings rep coaching — rendered as guidance above the fields. */
  coaching: string[];
  fields: FieldDef[];
}

const YESNO_UNSURE = ["Yes", "No", "Unsure"];

export const SECTIONS: SectionDef[] = [
  {
    id: "opener",
    title: "The Opener",
    coaching: [
      "VOSS — open with empathy. Say: “Before we get into anything — you've probably talked to people who jump straight into a pitch. We're not doing that today. What would make this a good visit for you?”",
      "Then stop talking. Let them answer fully, mirror the last few words they stress, and check the concern boxes from what they actually said — don't read the list like a survey.",
      "Frame the balance question no-oriented: “Would it be unreasonable to get a ballpark of what you've saved, so the advisor can prepare?”",
    ],
    fields: [
      { api: "Good_Visit_Definition__c", label: "What would make this a good visit?", type: "longtext" },
      { api: "Concern_Retirement_Income__c", label: "Concern: Retirement Income", type: "checkbox" },
      { api: "Concern_Optimizing_Social_Security__c", label: "Concern: Optimizing Social Security", type: "checkbox" },
      { api: "Concern_Reducing_Retirement_Taxes__c", label: "Concern: Reducing Retirement Taxes", type: "checkbox" },
      { api: "Concern_Long_Term_Care__c", label: "Concern: Long Term Care Planning", type: "checkbox" },
      { api: "Concern_Legacy_Planning__c", label: "Concern: Legacy Planning", type: "checkbox" },
      { api: "Concern_Market_Volatility__c", label: "Concern: Managing Market Volatility", type: "checkbox" },
      {
        api: "Approximate_Account_Balance__c",
        label: "Approximate Account Balances",
        type: "picklist",
        options: [
          "$200,000 - $499,999",
          "$500,000 - $999,999",
          "$1,000,000 - $1,999,999",
          "$2,000,000 - $4,999,999",
          "$5,000,000 - $9,999,999",
          "$10,000,000+",
        ],
      },
    ],
  },
  {
    id: "advisor",
    title: "Current Advisor",
    coaching: [
      "Don't attack what they already have. If they have an advisor, label it and wait: “It sounds like what you have is working well enough...” — then go quiet.",
      "What you're listening for: is anyone's ONLY job to fight for their money, and are they a fiduciary? Most people don't know — that's not a knock on them, it's why Meeting 2 exists.",
    ],
    fields: [
      { api: "Has_Financial_Advisor__c", label: "Has a financial advisor", type: "checkbox" },
      { api: "Current_Advisor_Focus__c", label: "Current advisor focus", type: "picklist", options: ["Accumulation/Growth", "Retirement Income Planning"] },
      { api: "Current_Advisor_Is_Fiduciary__c", label: "Is the current advisor a fiduciary?", type: "picklist", options: YESNO_UNSURE },
    ],
  },
  {
    id: "background",
    title: "Background",
    coaching: [
      "Easy, factual, build rhythm — names, ages, work. This part settles them in.",
      "Get BOTH spouses on the record. The advisor needs both people in Meeting 2. If only one is on the call: “Would it be important for your spouse to understand this too?”",
    ],
    fields: [
      { api: "State__c", label: "State", type: "text" },
      { api: "Prospect_1_Name__c", label: "Prospect 1 - Name", type: "text" },
      { api: "Prospect_1_Age__c", label: "Prospect 1 - Age", type: "number" },
      { api: "Prospect_1_DOB__c", label: "Prospect 1 - DOB", type: "date" },
      { api: "Prospect_1_Retired__c", label: "Prospect 1 - Retired", type: "checkbox" },
      { api: "Prospect_1_Projected_Retirement_Date__c", label: "Prospect 1 - Projected retirement date", type: "text", help: "Free text is fine, e.g. “Spring 2028”." },
      { api: "Prospect_1_Occupation__c", label: "Prospect 1 - Occupation / Company", type: "text" },
      { api: "Prospect_2_Name__c", label: "Prospect 2 - Name", type: "text" },
      { api: "Prospect_2_Age__c", label: "Prospect 2 - Age", type: "number" },
      { api: "Prospect_2_DOB__c", label: "Prospect 2 - DOB", type: "date" },
      { api: "Prospect_2_Retired__c", label: "Prospect 2 - Retired", type: "checkbox" },
      { api: "Prospect_2_Projected_Retirement_Date__c", label: "Prospect 2 - Projected retirement date", type: "text" },
      { api: "Prospect_2_Occupation__c", label: "Prospect 2 - Occupation / Company", type: "text" },
      { api: "Marital_Status__c", label: "Marital status", type: "picklist", options: ["Married", "Divorced", "Single", "Widowed"] },
    ],
  },
  {
    id: "plans",
    title: "Plans In Place",
    coaching: [
      "This is a diagnostic, not a quiz. Every “No” is a gap the Retirement Money Map fills — the advisor walks into Meeting 2 already knowing where to help.",
      "Never make them feel behind: “Most people we meet haven't put these in place yet — that's exactly what Meeting 2 is for.”",
    ],
    fields: [
      { api: "Has_Tax_Strategy__c", label: "Has a tax strategy", type: "checkbox" },
      { api: "Has_Income_Replacement_Plan__c", label: "Has an income replacement plan", type: "checkbox" },
      { api: "Has_Spousal_Continuation_Plan__c", label: "Has a spousal continuation plan", type: "checkbox" },
      { api: "Has_Health_Care_Strategy__c", label: "Has a health care strategy", type: "checkbox" },
      { api: "Has_Inflation_Plan__c", label: "Has an inflation plan", type: "checkbox" },
      { api: "Has_Protection_Plan__c", label: "Has a protection plan", type: "checkbox" },
    ],
  },
  {
    id: "income",
    title: "Income",
    coaching: [
      "Income is where the fear lives — “will the money last?” Stay matter-of-fact, friend-to-friend.",
      "Get the Social Security and pension numbers — the advisor can't build the Money Map without them. Frame it: “These numbers are how the advisor shows you the exact day you can retire — not when you hope to, but when the math says you can.”",
    ],
    fields: [
      { api: "P1_Taking_Social_Security__c", label: "P1 - Taking Social Security", type: "checkbox" },
      { api: "P1_SS_At_FRA__c", label: "P1 - Social Security at FRA", type: "currency" },
      { api: "P1_Has_Pension__c", label: "P1 - Has pension", type: "checkbox" },
      { api: "P1_Pension_1_Amount__c", label: "P1 - Pension 1 amount", type: "currency" },
      { api: "P1_Pension_1_Survivor_Pct__c", label: "P1 - Pension 1 survivor %", type: "percent" },
      { api: "P1_Pension_2_Amount__c", label: "P1 - Pension 2 amount", type: "currency" },
      { api: "P1_Pension_2_Survivor_Pct__c", label: "P1 - Pension 2 survivor %", type: "percent" },
      { api: "P2_Taking_Social_Security__c", label: "P2 - Taking Social Security", type: "checkbox" },
      { api: "P2_SS_At_FRA__c", label: "P2 - Social Security at FRA", type: "currency" },
      { api: "P2_Has_Pension__c", label: "P2 - Has pension", type: "checkbox" },
      { api: "P2_Pension_1_Amount__c", label: "P2 - Pension 1 amount", type: "currency" },
      { api: "P2_Pension_1_Survivor_Pct__c", label: "P2 - Pension 1 survivor %", type: "percent" },
      { api: "P2_Pension_2_Amount__c", label: "P2 - Pension 2 amount", type: "currency" },
      { api: "P2_Pension_2_Survivor_Pct__c", label: "P2 - Pension 2 survivor %", type: "percent" },
      { api: "Other_Income__c", label: "Other income (rental, etc.)", type: "text" },
      { api: "Gross_Monthly_Income__c", label: "Gross monthly income", type: "currency" },
      { api: "Monthly_Expenses_After_Tax__c", label: "Monthly expenses after tax", type: "currency" },
      { api: "Desired_Retirement_Income__c", label: "Desired monthly income in retirement", type: "currency" },
      { api: "Health_Insurance_Planning_Notes__c", label: "Health insurance planning for retirement", type: "longtext" },
      { api: "Income_Notes__c", label: "Notes for income", type: "longtext" },
    ],
  },
  {
    id: "investments",
    title: "Investments",
    coaching: [
      "You're inventorying, not judging. If they ask “is that good?” — “That's exactly what the advisor reviews with you in Meeting 2.”",
      "Capture the annual fee % if they know it. Most people have no idea what they're paying — the advisor often finds money they didn't know they were losing. Add each account as a row in the Accounts & Assets section.",
    ],
    fields: [
      { api: "Investment_Selection_Process__c", label: "Process for choosing current investments / what they liked", type: "longtext" },
      { api: "Expected_Advisor_Support__c", label: "Level of support expected from a financial advisor", type: "longtext" },
      { api: "Annual_Investment_Fees_Pct__c", label: "Annual investment fees %", type: "percent" },
      { api: "HSA_Bank_Values__c", label: "HSA / bank values", type: "text" },
      { api: "Investment_Notes__c", label: "Notes for investment", type: "longtext" },
    ],
  },
  {
    id: "taxes",
    title: "Taxes",
    coaching: [
      "Preparation looks backward; planning looks forward. Most people have a tax preparer, not a tax planner — that gap is one of the biggest the advisor closes.",
      "Don't lecture, just capture. Never done a Roth conversion? Not a failure — an opportunity the advisor will size up.",
    ],
    fields: [
      { api: "Current_Marginal_Tax_Rate__c", label: "Current marginal tax rate %", type: "percent" },
      { api: "Has_CPA__c", label: "Has a CPA", type: "checkbox" },
      { api: "CPA_Name__c", label: "CPA name", type: "text" },
      { api: "Tax_Professional_Focus__c", label: "Tax professional focuses on", type: "picklist", options: ["Tax Planning", "Tax Preparation", "Both", "Unsure"] },
      { api: "Has_Done_Roth_Conversions__c", label: "Has done Roth conversions", type: "checkbox" },
      { api: "Tax_Notes__c", label: "Notes for taxes", type: "longtext" },
    ],
  },
  {
    id: "legacy",
    title: "Legacy",
    coaching: [
      "Legacy is emotional — slow down. Late-night-DJ voice. Label it gently: “It sounds like making sure your family is taken care of really matters to you.”",
      "No will or an outdated trust isn't judgment — it's why Meeting 2 matters. If they need an estate attorney, the advisor can connect them.",
    ],
    fields: [
      { api: "Estate_Attorney__c", label: "Estate attorney", type: "text" },
      { api: "Needs_Estate_Attorney_Referral__c", label: "Needs an estate attorney referral", type: "checkbox" },
      { api: "Has_Will__c", label: "Has a will", type: "checkbox" },
      { api: "Will_Last_Updated__c", label: "Will last updated", type: "text" },
      { api: "Has_Revocable_Living_Trust__c", label: "Has a revocable living trust", type: "checkbox" },
      { api: "Trust_Last_Updated__c", label: "Trust last updated", type: "text" },
      { api: "Accounts_Titled_Properly__c", label: "Accounts titled properly & beneficiaries up to date?", type: "picklist", options: YESNO_UNSURE },
      { api: "Number_of_Children__c", label: "Number of children", type: "number" },
      { api: "Goal_To_Leave_Legacy__c", label: "Goal to leave money to family", type: "checkbox" },
      { api: "Legacy_Notes__c", label: "Notes for legacy", type: "longtext" },
    ],
  },
  {
    id: "goals",
    title: "Goals & The Close",
    coaching: [
      "Get them to paint the picture — that picture is what the advisor protects. Use the exact words: “Paint a picture for me — what would you like your retirement to look like?” Mirror and label.",
      "BELFORT — the close. Be directive, do NOT ask permission: “Here's what happens next. The advisor builds your Retirement Money Map — fee analysis, risk assessment, income plan — all from what you gave me today. That visit is complimentary, and you'll know any costs upfront.”",
      "Then the one no-oriented question: “If we put together ideas that address your concerns and meet your goals — would you be opposed to working together?” “No” is the yes. Then book Meeting 2 on the spot.",
    ],
    fields: [
      { api: "Would_Retire_Today__c", label: "If you could retire today, would you?", type: "picklist", options: ["Yes", "No", "Not Applicable"] },
      { api: "Retirement_Vision__c", label: "Paint a picture - what would retirement look like?", type: "longtext" },
      { api: "Opposed_To_Working_Together__c", label: "Would you be opposed to working together?", type: "picklist", options: ["No - open to working together", "Yes - not interested", "Undecided"] },
      { api: "Next_Step_RMM_Analysis__c", label: "Next step: RMM Retirement Analysis to be created", type: "checkbox" },
      { api: "Next_Step_Email_Sent__c", label: "Next step: follow-up email sent (questionnaire, expense plan, upload link)", type: "checkbox" },
      { api: "Additional_Docs_Expected_Date__c", label: "Additional documents expected date", type: "date" },
      { api: "Additional_Notes__c", label: "Additional notes", type: "longtext" },
    ],
  },
];

/** Asset (line-item) field config — Current Investments, Real Estate, Life Insurance rows. */
export const ASSET_CATEGORIES = ["Current Investment", "Real Estate", "Life Insurance"];

export interface AssetFieldDef extends FieldDef {
  /** Which categories this field is relevant to. */
  forCategories: string[];
}

export const ASSET_FIELDS: AssetFieldDef[] = [
  { api: "Asset_Owner__c", label: "Owner (P1 / P2 / Joint)", type: "text", forCategories: ASSET_CATEGORIES },
  { api: "Company__c", label: "Company", type: "text", forCategories: ["Current Investment", "Life Insurance"] },
  { api: "Tax_Status__c", label: "Tax status", type: "picklist", options: ["NQ", "IRA", "401k", "ROTH"], forCategories: ["Current Investment"] },
  { api: "Investment_Type__c", label: "Investment type", type: "picklist", options: ["MM", "MF", "VA", "FIA", "Savings", "CDs", "Other"], forCategories: ["Current Investment"] },
  { api: "Balance__c", label: "Balance", type: "currency", forCategories: ["Current Investment"] },
  { api: "Issued_Date__c", label: "Issued date", type: "text", forCategories: ["Current Investment"] },
  { api: "Market_Value__c", label: "Market value", type: "currency", forCategories: ["Real Estate"] },
  { api: "Remaining_Mortgage__c", label: "Remaining mortgage", type: "currency", forCategories: ["Real Estate"] },
  { api: "Insured__c", label: "Insured", type: "text", forCategories: ["Life Insurance"] },
  { api: "Insurance_Type__c", label: "Insurance type", type: "text", forCategories: ["Life Insurance"] },
  { api: "Death_Benefit__c", label: "Death benefit", type: "currency", forCategories: ["Life Insurance"] },
  { api: "Cash_Value__c", label: "Cash value", type: "currency", forCategories: ["Life Insurance"] },
];

/** All parent-record field API names (used to build the save payload). */
export const ALL_FIELD_APIS: string[] = SECTIONS.flatMap((s) => s.fields.map((f) => f.api));
