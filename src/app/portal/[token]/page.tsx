"use client";

import { useState, useCallback, useEffect } from "react";
import type { DocumentType } from "@/types";

const DOCUMENT_TYPES: { value: DocumentType; label: string; description: string }[] = [
  { value: "LES", label: "Leave & Earnings Statement", description: "Your most recent LES showing pay, deductions, and leave balances" },
  { value: "SF50", label: "SF-50", description: "Notification of Personnel Action — shows your service computation date and retirement plan" },
  { value: "TSP_Statement", label: "TSP Statement", description: "Thrift Savings Plan statement showing fund balances and contributions" },
  { value: "DD214", label: "DD-214", description: "Certificate of Release or Discharge from Active Duty (if applicable)" },
  { value: "PSB", label: "Benefits Statement", description: "Personal Statement of Benefits showing FEGLI, FEHB, and annuity estimates" },
  { value: "SS_Statement", label: "Social Security Statement", description: "Your Social Security benefit estimate (from ssa.gov)" },
];

interface UploadedDoc {
  documentId: string;
  fileName: string;
  documentType: DocumentType;
  parsing: boolean;
}

interface SessionInfo {
  session: { client_name: string; status: string };
  documents: { id: string; file_name: string; document_type: DocumentType; parsed: boolean }[];
}

export default function UploadPortal({ params }: { params: Promise<{ token: string }> }) {
  const [token, setToken] = useState<string>("");
  const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null);
  const [uploads, setUploads] = useState<UploadedDoc[]>([]);
  const [uploading, setUploading] = useState(false);
  const [selectedType, setSelectedType] = useState<DocumentType>("LES");
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);

  // Unwrap params
  useEffect(() => {
    params.then((p) => setToken(p.token));
  }, [params]);

  // Load session on mount
  useEffect(() => {
    if (!token) return;
    fetch(`/api/intake?token=${token}`)
      .then(async (res) => {
        if (res.status === 410) {
          setExpired(true);
          return;
        }
        if (!res.ok) {
          setError("Invalid or expired link. Please contact your advisor for a new one.");
          return;
        }
        const data = await res.json();
        setSessionInfo(data);
      })
      .catch(() => setError("Unable to connect. Please try again."));
  }, [token]);

  const handleUpload = useCallback(
    async (file: File) => {
      setUploading(true);
      setError(null);

      const formData = new FormData();
      formData.append("file", file);
      formData.append("token", token);
      formData.append("documentType", selectedType);

      try {
        const res = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const data = await res.json();
          setError(data.error || "Upload failed");
          return;
        }

        const data = await res.json();
        setUploads((prev) => [
          ...prev,
          {
            documentId: data.documentId,
            fileName: data.fileName,
            documentType: data.documentType,
            parsing: data.parsing,
          },
        ]);
      } catch {
        setError("Upload failed. Please try again.");
      } finally {
        setUploading(false);
      }
    },
    [token, selectedType]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) handleUpload(file);
    },
    [handleUpload]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleUpload(file);
    },
    [handleUpload]
  );

  if (expired) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 p-8">
        <div className="max-w-md text-center">
          <div className="text-5xl mb-4">&#128274;</div>
          <h1 className="text-2xl font-semibold text-zinc-900 mb-2">Link Expired</h1>
          <p className="text-zinc-600">
            This upload link has expired for your security. Please contact your Capital Wealth advisor for a new link.
          </p>
        </div>
      </div>
    );
  }

  if (error && !sessionInfo) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 p-8">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-semibold text-zinc-900 mb-2">Unable to Load</h1>
          <p className="text-zinc-600">{error}</p>
        </div>
      </div>
    );
  }

  if (!sessionInfo) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50">
        <div className="text-zinc-500">Loading secure upload portal...</div>
      </div>
    );
  }

  const allDocs = [
    ...sessionInfo.documents.map((d) => ({
      documentId: d.id,
      fileName: d.file_name,
      documentType: d.document_type,
      parsing: false,
      parsed: d.parsed,
    })),
    ...uploads.map((u) => ({ ...u, parsed: false })),
  ];

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Header */}
      <header className="bg-white border-b border-zinc-200 px-8 py-6">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-8 h-8 rounded-full bg-emerald-700 flex items-center justify-center">
              <span className="text-white text-sm font-bold">CW</span>
            </div>
            <span className="text-sm font-medium text-zinc-500">Capital Wealth Advisors</span>
          </div>
          <h1 className="text-2xl font-semibold text-zinc-900 mt-4">
            Secure Document Upload
          </h1>
          <p className="text-zinc-600 mt-1">
            Welcome, {sessionInfo.session.client_name}. Upload your federal benefits documents below.
          </p>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-8 py-8">
        {/* Security notice */}
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 mb-8">
          <div className="flex items-start gap-3">
            <span className="text-emerald-700 mt-0.5">&#128274;</span>
            <div>
              <p className="text-sm font-medium text-emerald-900">
                Your documents are encrypted and secure
              </p>
              <p className="text-sm text-emerald-700 mt-0.5">
                All files are encrypted in transit and at rest. Only your assigned Capital Wealth advisor can access them.
              </p>
            </div>
          </div>
        </div>

        {/* Document type selector */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-zinc-700 mb-2">
            Document Type
          </label>
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value as DocumentType)}
            className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-zinc-900 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none"
          >
            {DOCUMENT_TYPES.map((dt) => (
              <option key={dt.value} value={dt.value}>
                {dt.label}
              </option>
            ))}
          </select>
          <p className="text-sm text-zinc-500 mt-1">
            {DOCUMENT_TYPES.find((d) => d.value === selectedType)?.description}
          </p>
        </div>

        {/* Upload area */}
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors ${
            uploading
              ? "border-emerald-400 bg-emerald-50"
              : "border-zinc-300 hover:border-emerald-400 hover:bg-emerald-50/50"
          }`}
        >
          {uploading ? (
            <div>
              <div className="text-3xl mb-3 animate-pulse">&#128196;</div>
              <p className="text-zinc-600 font-medium">Uploading securely...</p>
            </div>
          ) : (
            <div>
              <div className="text-3xl mb-3">&#128196;</div>
              <p className="text-zinc-900 font-medium mb-1">
                Drag and drop your file here
              </p>
              <p className="text-sm text-zinc-500 mb-4">
                PDF, JPEG, or PNG — up to 50MB
              </p>
              <label className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-700 text-white rounded-lg font-medium cursor-pointer hover:bg-emerald-800 transition-colors">
                Choose File
                <input
                  type="file"
                  className="hidden"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={handleFileSelect}
                />
              </label>
            </div>
          )}
        </div>

        {error && (
          <div className="mt-4 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {/* Uploaded documents list */}
        {allDocs.length > 0 && (
          <div className="mt-8">
            <h2 className="text-lg font-semibold text-zinc-900 mb-4">
              Uploaded Documents
            </h2>
            <div className="space-y-3">
              {allDocs.map((doc) => (
                <div
                  key={doc.documentId}
                  className="flex items-center justify-between bg-white rounded-lg border border-zinc-200 px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl">
                      {doc.parsed ? "\u2705" : doc.parsing ? "\u23F3" : "\u2705"}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-zinc-900">
                        {doc.fileName}
                      </p>
                      <p className="text-xs text-zinc-500">
                        {DOCUMENT_TYPES.find((d) => d.value === doc.documentType)?.label || doc.documentType}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`text-xs font-medium px-2 py-1 rounded-full ${
                      doc.parsed
                        ? "bg-emerald-100 text-emerald-700"
                        : doc.parsing
                          ? "bg-amber-100 text-amber-700"
                          : "bg-blue-100 text-blue-700"
                    }`}
                  >
                    {doc.parsed ? "Processed" : doc.parsing ? "Processing..." : "Uploaded"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Instructions */}
        <div className="mt-8 bg-white rounded-lg border border-zinc-200 p-6">
          <h2 className="text-lg font-semibold text-zinc-900 mb-3">
            Documents We Need
          </h2>
          <p className="text-sm text-zinc-600 mb-4">
            To prepare your retirement analysis, please upload as many of the following as you have available:
          </p>
          <ul className="space-y-2">
            {DOCUMENT_TYPES.map((dt) => {
              const uploaded = allDocs.some((d) => d.documentType === dt.value);
              return (
                <li key={dt.value} className="flex items-start gap-2 text-sm">
                  <span className={uploaded ? "text-emerald-600" : "text-zinc-400"}>
                    {uploaded ? "\u2713" : "\u25CB"}
                  </span>
                  <div>
                    <span className={`font-medium ${uploaded ? "text-emerald-900" : "text-zinc-700"}`}>
                      {dt.label}
                    </span>
                    <span className="text-zinc-500"> — {dt.description}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-200 bg-white px-8 py-6 mt-12">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-xs text-zinc-400">
            Capital Wealth Advisors &middot; Secure Document Portal &middot; All documents are encrypted and handled in compliance with federal privacy standards
          </p>
        </div>
      </footer>
    </div>
  );
}
