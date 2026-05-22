/**
 * Pre-Strategic-Review intake survey — client-facing field + section config.
 *
 * API names match the Salesforce `SR_Intake__c` object 1:1 so the payload posts
 * straight through SRIntakeService Apex with no mapping. Unlike the Meeting 1
 * builder (advisor-run, with rep coaching), this form is filled out by the CLIENT
 * before their review, so copy is warm and plain-language — no internal coaching.
 */

export type FieldType = "text" | "longtext" | "checkbox" | "picklist";

export interface FieldDef {
  api: string;
  label: string;
  type: FieldType;
  options?: string[];
  /** Show this field only when another checkbox field is true. */
  showIf?: string;
  placeholder?: string;
}

export interface SectionDef {
  id: string;
  title: string;
  intro?: string;
  fields: FieldDef[];
}

export const SECTIONS: SectionDef[] = [
  {
    id: "changes",
    title: "Since we last met",
    intro:
      "A few quick questions so your advisor can make this review about what matters most to you.",
    fields: [
      {
        api: "Retirement_Timing__c",
        label: "Are you (or your spouse) planning to retire soon?",
        type: "picklist",
        options: [
          "Already retired",
          "Planning to retire within 12 months",
          "In 1-3 years",
          "No plans to retire soon",
          "Prefer not to say",
        ],
      },
      {
        api: "Expecting_Windfall__c",
        label:
          "We expect a significant change in our finances soon — an inheritance, the sale of a home or business, or another windfall.",
        type: "checkbox",
      },
      {
        api: "Windfall_Amount_Range__c",
        label: "If so, roughly how much?",
        type: "picklist",
        showIf: "Expecting_Windfall__c",
        options: ["Under $100k", "$100k - $499k", "$500k - $999k", "$1M+", "Unsure"],
      },
      {
        api: "Windfall_Notes__c",
        label: "Anything you'd like us to know about it?",
        type: "longtext",
        showIf: "Expecting_Windfall__c",
      },
      {
        api: "Life_Changes__c",
        label:
          "Any major life changes since we last met? (a move, a health change, family, a new job or retirement)",
        type: "longtext",
        placeholder: "Optional",
      },
    ],
  },
  {
    id: "accounts",
    title: "Your accounts",
    fields: [
      {
        api: "Has_Held_Away_Accounts__c",
        label:
          "We have retirement accounts or investments held somewhere Capital Wealth doesn't currently manage.",
        type: "checkbox",
      },
      {
        api: "Held_Away_Notes__c",
        label: "If so, what kind, and roughly where or how much?",
        type: "longtext",
        showIf: "Has_Held_Away_Accounts__c",
      },
      {
        api: "Has_Employer_Plan_To_Review__c",
        label:
          "We have a 401(k) or 403(b) with a current or former employer we'd like reviewed.",
        type: "checkbox",
      },
    ],
  },
  {
    id: "mind",
    title: "What's on your mind",
    fields: [
      {
        api: "Top_Concern__c",
        label: "What's your biggest financial concern right now?",
        type: "longtext",
        placeholder: "In your own words",
      },
      {
        api: "Concern_Market_Volatility__c",
        label: "Market ups and downs",
        type: "checkbox",
      },
      {
        api: "Concern_Not_Growing_Enough__c",
        label: "Not growing fast enough / missing out on gains",
        type: "checkbox",
      },
      {
        api: "Concern_Running_Out_Of_Money__c",
        label: "Running out of money in retirement",
        type: "checkbox",
      },
      { api: "Concern_Taxes__c", label: "Taxes", type: "checkbox" },
      {
        api: "Concern_Legacy__c",
        label: "Leaving a legacy / estate planning",
        type: "checkbox",
      },
      {
        api: "Topics_To_Cover__c",
        label: "Anything specific you'd like to make sure we cover?",
        type: "longtext",
        placeholder: "Optional",
      },
    ],
  },
  {
    id: "income",
    title: "Your income",
    fields: [
      {
        api: "Income_Plan_Confidence__c",
        label: "How confident are you in your retirement income plan?",
        type: "picklist",
        options: ["Very confident", "Somewhat confident", "Not confident", "Unsure"],
      },
    ],
  },
];

/** The five "concern" checkboxes render as a single grouped question. */
export const CONCERN_INTRO_API = "Concern_Market_Volatility__c";

export const ALL_FIELD_APIS: string[] = SECTIONS.flatMap((s) =>
  s.fields.map((f) => f.api)
);
