import SRIntakeForm from "./SRIntakeForm";

/**
 * Pre-Strategic-Review client intake survey.
 * The [token] segment is the SR_Intake__c record Id, emailed to the client
 * before their review (link built by SRIntakeLauncher in Salesforce).
 */
export default async function SRIntakePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <SRIntakeForm token={token} />;
}
