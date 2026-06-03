import CallCareForm from "./CallCareForm";

/**
 * CallCare per-lead call-logging form.
 * The [token] segment is the Lead Id. The lead-push automation builds the link
 * (benefits.capitalwealth.com/callcare/<LeadId>) and sends it to CallCare with
 * the lead. The agent opens it on connect and logs the call straight into SF.
 */
export default async function CallCarePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <CallCareForm token={token} />;
}
