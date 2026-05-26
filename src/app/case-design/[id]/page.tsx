import { loadCaseDesign } from "@/lib/case-design/sf-client";
import CaseDesignBuilder from "./CaseDesignBuilder";

export const dynamic = "force-dynamic";

/**
 * Case Design builder — opened from Salesforce via the "Open Case Design"
 * Quick Action on an Opportunity. The [id] segment is the Case_Design__c Id.
 *
 * v0: server-loads the bundle, hands off to a client component that renders
 * the structured forms + react-flow diagram preview. The current
 * CaseDesignBuilder is a stub — real builder UI is the next workstream.
 */
export default async function CaseDesignPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const bundle = await loadCaseDesign(id);

  if (!bundle) {
    return (
      <main className="max-w-2xl mx-auto p-10 text-center">
        <h1 className="text-2xl font-semibold mb-3">Case Design not found</h1>
        <p className="text-zinc-600">
          The record <code className="px-1 py-0.5 bg-zinc-100 rounded">{id}</code> doesn&apos;t
          exist or you don&apos;t have access. Try re-opening from the Opportunity in Salesforce.
        </p>
      </main>
    );
  }

  return <CaseDesignBuilder bundle={bundle} />;
}
