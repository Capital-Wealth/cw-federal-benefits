"use client";

import { useState, useEffect, useCallback } from "react";

interface IntakeRecord {
  id: string;
  name: string;
  status: string;
  contactName?: string;
  portalUrl?: string;
  token?: string;
  confidence?: number;
  reportGenerated?: boolean;
  createdDate?: string;
}

export default function Dashboard() {
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [creating, setCreating] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const [intakes, setIntakes] = useState<IntakeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const loadIntakes = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard/intakes");
      if (res.ok) {
        const data = await res.json();
        setIntakes(data.records || []);
      }
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadIntakes(); }, [loadIntakes]);

  // Invite client to upload — creates intake + sends email
  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientName || !clientEmail) return;

    setCreating(true);
    setMessage(null);
    setSentTo(null);

    try {
      const res = await fetch("/api/dashboard/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientName, clientEmail }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed");
      }

      const data = await res.json();
      setSentTo(clientEmail);
      setMessage({
        type: "success",
        text: `Secure upload invitation sent to ${clientEmail}. Intake ${data.intakeName} created.`,
      });
      setClientName("");
      setClientEmail("");
      loadIntakes();
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Failed" });
    } finally {
      setCreating(false);
    }
  };

  // Trigger AI parsing
  const handleParse = async (intake: IntakeRecord) => {
    setActionLoading(intake.id);
    setMessage(null);

    try {
      const res = await fetch("/api/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: intake.token }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Parsing failed");
      }

      const data = await res.json();
      setMessage({
        type: "success",
        text: `${intake.name}: Parsed ${data.fieldsExtracted} fields (${data.confidence}% confidence)`,
      });
      loadIntakes();
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Failed" });
    } finally {
      setActionLoading(null);
    }
  };

  // Generate report
  const handleReport = async (intake: IntakeRecord) => {
    setActionLoading(intake.id);
    setMessage(null);

    try {
      const res = await fetch("/api/dashboard/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intakeId: intake.id }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Report generation failed");
      }

      setMessage({ type: "success", text: `${intake.name}: Retirement Money Map Report generated.` });
      loadIntakes();
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Failed" });
    } finally {
      setActionLoading(null);
    }
  };

  const statusLabel = (status: string) => {
    const map: Record<string, { bg: string; text: string; label: string }> = {
      Draft: { bg: "bg-zinc-100", text: "text-zinc-600", label: "Draft" },
      "Link Sent": { bg: "bg-purple-100", text: "text-purple-700", label: "Invite Sent" },
      "Docs Uploaded": { bg: "bg-amber-100", text: "text-amber-700", label: "Docs Received" },
      "AI Parsed": { bg: "bg-blue-100", text: "text-blue-700", label: "AI Parsed" },
      "Advisor Review": { bg: "bg-orange-100", text: "text-orange-700", label: "Review Needed" },
      Complete: { bg: "bg-emerald-100", text: "text-emerald-700", label: "Complete" },
    };
    const s = map[status] || map.Draft;
    return s;
  };

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="bg-white border-b border-zinc-200 px-8 py-5">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-emerald-700 flex items-center justify-center">
              <span className="text-white text-sm font-bold">CW</span>
            </div>
            <div>
              <h1 className="text-xl font-semibold text-zinc-900">Retirement Money Map</h1>
              <p className="text-xs text-zinc-400">Capital Wealth Advisors</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-8 py-8">
        {message && (
          <div className={`mb-6 px-4 py-3 rounded-lg text-sm ${
            message.type === "success"
              ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
              : "bg-red-50 border border-red-200 text-red-800"
          }`}>
            {message.text}
          </div>
        )}

        {/* Invite Form */}
        <div className="bg-white rounded-xl border border-zinc-200 p-6 mb-8">
          <h2 className="text-lg font-semibold text-zinc-900 mb-1">Invite Client to Upload Documents</h2>
          <p className="text-sm text-zinc-500 mb-4">
            The client will receive a secure email with a link to upload their federal benefits documents
            (LES, SF-50, TSP Statement, DD-214, Social Security Statement).
          </p>

          <form onSubmit={handleInvite} className="flex items-end gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-zinc-700 mb-1">Client Name</label>
              <input type="text" value={clientName} onChange={(e) => setClientName(e.target.value)}
                placeholder="Jane Smith" required
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none" />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-zinc-700 mb-1">Client Email</label>
              <input type="email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)}
                placeholder="jane.smith@gsa.gov" required
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none" />
            </div>
            <button type="submit" disabled={creating}
              className="px-6 py-2 bg-emerald-700 text-white rounded-lg text-sm font-medium hover:bg-emerald-800 disabled:opacity-50 whitespace-nowrap">
              {creating ? "Sending..." : "Invite to Upload"}
            </button>
          </form>

          {sentTo && (
            <div className="mt-4 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
              <p className="text-sm text-emerald-800">
                Secure upload invitation sent to <strong>{sentTo}</strong>.
                The client will receive an email with a link to upload their documents.
                You'll see updates below as they upload.
              </p>
            </div>
          )}
        </div>

        {/* Pipeline */}
        <div className="bg-white rounded-xl border border-zinc-200">
          <div className="px-6 py-4 border-b border-zinc-100 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-zinc-900">Client Pipeline</h2>
            <button onClick={() => { setLoading(true); loadIntakes(); }}
              className="text-sm text-zinc-500 hover:text-zinc-700">Refresh</button>
          </div>

          {loading ? (
            <div className="px-6 py-12 text-center text-zinc-400 text-sm">Loading pipeline...</div>
          ) : intakes.length === 0 ? (
            <div className="px-6 py-12 text-center text-zinc-400 text-sm">
              No clients yet. Invite one above to start.
            </div>
          ) : (
            <div className="divide-y divide-zinc-100">
              {intakes.map((intake) => {
                const s = statusLabel(intake.status);
                return (
                  <div key={intake.id} className="px-6 py-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-mono font-medium text-zinc-900">{intake.name}</span>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${s.bg} ${s.text}`}>
                          {s.label}
                        </span>
                        {intake.confidence != null && (
                          <span className="text-xs text-zinc-400">{intake.confidence}% confidence</span>
                        )}
                        {intake.reportGenerated && (
                          <span className="text-xs bg-emerald-100 text-emerald-700 font-medium px-2 py-0.5 rounded-full">
                            Report Ready
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {/* Parse button — show when docs uploaded or link sent */}
                        {["Link Sent", "Docs Uploaded"].includes(intake.status) && intake.token && (
                          <button onClick={() => handleParse(intake)}
                            disabled={actionLoading === intake.id}
                            className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 disabled:opacity-50">
                            {actionLoading === intake.id ? "Reading Docs..." : "Read Documents"}
                          </button>
                        )}

                        {/* Generate Report — show when parsed or reviewed */}
                        {["AI Parsed", "Advisor Review", "Complete"].includes(intake.status) && !intake.reportGenerated && (
                          <button onClick={() => handleReport(intake)}
                            disabled={actionLoading === intake.id}
                            className="px-3 py-1.5 bg-emerald-700 text-white rounded-lg text-xs font-medium hover:bg-emerald-800 disabled:opacity-50">
                            {actionLoading === intake.id ? "Generating..." : "Generate Money Map"}
                          </button>
                        )}

                        {/* Review button — show when AI has parsed or later */}
                        {["AI Parsed", "Advisor Review", "Complete"].includes(intake.status) && (
                          <a href={`/dashboard/review?id=${intake.id}`}
                            className="px-3 py-1.5 border border-emerald-300 bg-emerald-50 rounded-lg text-xs font-medium text-emerald-700 hover:bg-emerald-100">
                            Review Data
                          </a>
                        )}

                        {/* SF link */}
                        <a href={`https://capitalwealth.my.salesforce.com/lightning/r/Federal_Benefits_Intake__c/${intake.id}/view`}
                          target="_blank" rel="noopener noreferrer"
                          className="px-3 py-1.5 border border-zinc-300 rounded-lg text-xs font-medium text-zinc-600 hover:bg-zinc-50">
                          SF Record
                        </a>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
