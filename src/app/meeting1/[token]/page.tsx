import Meeting1Form from "./Meeting1Form";

/**
 * Meeting 1 Intake builder — opened from Salesforce via the Builder_URL__c link.
 * The [token] segment is the Meeting_1_Intake__c record Id.
 */
export default async function Meeting1Page({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <Meeting1Form token={token} />;
}
