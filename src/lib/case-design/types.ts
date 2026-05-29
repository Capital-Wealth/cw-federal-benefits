/**
 * Case Design — TypeScript types mirroring the Salesforce schema.
 *
 * One Case_Design__c (parent) has many:
 *   - Case_Design_Section__c   (named groupings on the canvas)
 *   - Case_Design_Position__c  (account boxes — source or destination)
 *   - Case_Design_Edge__c      (money-movement arrows between positions)
 *   - Case_Design_Annotation__c (free-text notes anchored to canvas / sections / positions)
 *
 * Sources are typically linked to a Meeting_1_Intake_Asset__c via Source_Asset__c
 * and to the originating Vault document (so the audit trail back to the client
 * statement PDF is preserved).
 */

export type CaseDesignStatus = "Draft" | "Finalized" | "Presented" | "Locked";

export type PlanType =
  | "Rollover"
  | "Replacement"
  | "Consolidation"
  | "LPOA"
  | "Roth Conversion"
  | "IUL Strategy"
  | "1035 Exchange"
  | "Tax Planning";

export type PositionRole = "Source" | "Destination" | "Standalone";

export type AccountType =
  | "401k"
  | "403b"
  | "Roth 401k"
  | "Roth 403b"
  | "TSP"
  | "Roth TSP"
  | "IRA"
  | "Roth IRA"
  | "Roth"
  | "Simple IRA"
  | "SEP IRA"
  | "Inherited IRA"
  | "Inherited IRA Trust"
  | "NQ"
  | "NQ-TOD"
  | "Trust NQ"
  | "Non Proto-Trust"
  | "HSA"
  | "1099"
  | "Bank Savings"
  | "Cash"
  | "Crypto"
  | "Whole Life"
  | "Whole Life (Paid Up)"
  | "IUL"
  | "Variable Annuity"
  | "Fixed Indexed Annuity"
  | "Overseas Investment"
  | "Other";

export type EdgeMethod =
  | "TOA"
  | "Rollover"
  | "Replacement"
  | "LPOA"
  | "LPOA Completed"
  | "1035"
  | "Internal Roth"
  | "Roth Conversion"
  | "Continue Contributions"
  | "Partial Transfer"
  | "Custom";

export type EdgeStatus = "Planned" | "In Progress" | "Completed";

export type SectionType =
  | "Consolidation"
  | "Continue Contributions"
  | "Tax Planning"
  | "Self Directed"
  | "Stage"
  | "Custom";

export type AnnotationStyle = "Standard" | "High Priority" | "Disclaimer" | "Note Block";

export interface CaseDesignParent {
  Id: string;
  Name: string;
  Account__c: string | null;
  /** Hydrated from Account__r.Name at load time; null if Account__c is null. */
  Account_Name__c?: string | null;
  Opportunity__c: string | null;
  Status__c: CaseDesignStatus;
  Plan_Date__c: string | null;
  Document_Title__c: string;
  Plan_Type__c: string | null;
  Has_Roth_Conversion__c: boolean;
  Notes__c: string | null;
  PDF_ContentVersion_Id__c: string | null;
  PDF_Vault_Document_Id__c: string | null;
  Finalized_At__c: string | null;
  Presented_At__c: string | null;
  Locked_At__c: string | null;
  Total_Source_Value__c: number | null;
  Total_Destination_Value__c: number | null;
}

/**
 * A named TAB on a Case Design — one per meeting/stage (e.g. "Consolidation"
 * 04/13, "Allocation Map" 04/15). Each tab maps to a Page_Number; positions,
 * edges, sections, and annotations belong to whichever tab their
 * Page_Number__c matches. Master-Detail to Case_Design__c (relationshipName
 * `Tabs`).
 */
export interface CaseDesignTab {
  Id: string;
  Name: string;
  Case_Design__c: string;
  Label__c: string;
  Tab_Date__c: string | null;
  Page_Number__c: number;
  Sort_Order__c: number | null;
}

export interface CaseDesignSection {
  Id: string;
  Name: string;
  Case_Design__c: string;
  Label__c: string;
  Section_Type__c: SectionType;
  Page_Number__c: number;
  Sort_Order__c: number | null;
  Style__c: "Standard" | "Highlighted";
}

export interface CaseDesignPosition {
  Id: string;
  Name: string;
  Case_Design__c: string;
  Section__c: string | null;
  Role__c: PositionRole;
  Stage__c: string | null;
  Source_Asset__c: string | null;
  Source_Vault_Document_Id__c: string | null;
  Source_Vault_Document_Name__c: string | null;
  Owner_Label__c: string;
  Account_Type__c: AccountType;
  Account_Type_Other__c: string | null;
  Custodian__c: string;
  Product_Detail__c: string | null;
  Account_Number_Last4__c: string | null;
  Inception_Date_Text__c: string | null;
  Amount__c: number | null;
  Account_Value__c: number | null;
  Surrender_Value__c: number | null;
  Cash_Value__c: number | null;
  Death_Benefit__c: number | null;
  Annual_Fee_Pct__c: number | null;
  Annual_Fee_Display__c: string | null;
  Fee_Is_Approximate__c: boolean;
  Contribution_Note__c: string | null;
  Position_X__c: number | null;
  Position_Y__c: number | null;
  Replaces_Position__c: string | null;
  /** Which tab (page) this position belongs to. Null = legacy → first tab. */
  Page_Number__c: number | null;
}

export interface CaseDesignEdge {
  Id: string;
  Name: string;
  Case_Design__c: string;
  From_Position__c: string;
  To_Position__c: string;
  Method__c: EdgeMethod;
  Method_Label_Override__c: string | null;
  Partial_Amount__c: number | null;
  Gross_Amount__c: number | null;
  Federal_Tax__c: number | null;
  State_Tax__c: number | null;
  Tax_Payment_Source__c: string | null;
  Timing_Note__c: string | null;
  Stage__c: string | null;
  Status__c: EdgeStatus;
  /** Which tab (page) this edge belongs to. Null = legacy → first tab. */
  Page_Number__c: number | null;
}

export interface CaseDesignAnnotation {
  Id: string;
  Name: string;
  Case_Design__c: string;
  Text__c: string;
  Style__c: AnnotationStyle;
  Section__c: string | null;
  Anchor_Position__c: string | null;
  Anchor_Edge__c: string | null;
  Page_Number__c: number;
  Sort_Order__c: number | null;
}

export interface CaseDesignBundle {
  parent: CaseDesignParent;
  tabs: CaseDesignTab[];
  sections: CaseDesignSection[];
  positions: CaseDesignPosition[];
  edges: CaseDesignEdge[];
  annotations: CaseDesignAnnotation[];
}
