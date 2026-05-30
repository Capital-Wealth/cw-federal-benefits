import StartForm from "./StartForm";

/**
 * Generic, tokenless Meeting 1 Intake entry point.
 *
 * This is the link Ann (and anyone without a Salesforce login) uses. She enters
 * first name / last name / email behind a shared passcode; the app looks the
 * person up in Salesforce and drops her into the real intake form at
 * /meeting1/<recordId>. Data only ever flows INTO Salesforce.
 *
 * The sibling route /meeting1/[token] handles the token (record-Id) form itself.
 */
export default function Meeting1StartPage() {
  return <StartForm />;
}
