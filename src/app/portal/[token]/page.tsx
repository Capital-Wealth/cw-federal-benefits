"use client";

import { useState, useCallback, useEffect, useRef } from "react";

interface UploadedDoc {
  fileName: string;
  status: "uploading" | "uploaded" | "processing";
}

interface SessionInfo {
  session: { client_name: string; status: string };
  documents: { id: string; file_name: string; document_type: string; parsed: boolean }[];
}

export default function UploadPortal({ params }: { params: Promise<{ token: string }> }) {
  const [token, setToken] = useState<string>("");
  const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null);
  const [uploads, setUploads] = useState<UploadedDoc[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [allDone, setAllDone] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    params.then((p) => setToken(p.token));
  }, [params]);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/intake?token=${token}`)
      .then(async (res) => {
        if (res.status === 410) { setExpired(true); return; }
        if (!res.ok) { setError("Invalid or expired link. Please contact your advisor for a new one."); return; }
        setSessionInfo(await res.json());
      })
      .catch(() => setError("Unable to connect. Please try again."));
  }, [token]);

  const uploadFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      setUploading(true);
      setError(null);

      // Add all files to the upload list immediately
      const newUploads: UploadedDoc[] = files.map((f) => ({
        fileName: f.name,
        status: "uploading" as const,
      }));
      setUploads((prev) => [...prev, ...newUploads]);

      // Upload each file — AI will auto-detect the document type
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const formData = new FormData();
        formData.append("file", file);
        formData.append("token", token);
        formData.append("documentType", "Other"); // AI will classify it

        try {
          const res = await fetch("/api/upload", {
            method: "POST",
            body: formData,
          });

          if (!res.ok) {
            const data = await res.json();
            setError(data.error || `Failed to upload ${file.name}`);
            setUploads((prev) =>
              prev.map((u) =>
                u.fileName === file.name ? { ...u, status: "uploaded" as const } : u
              )
            );
            continue;
          }

          // Mark as uploaded
          setUploads((prev) =>
            prev.map((u) =>
              u.fileName === file.name ? { ...u, status: "uploaded" as const } : u
            )
          );
        } catch {
          setError(`Failed to upload ${file.name}. Please try again.`);
        }
      }

      setUploading(false);
      setAllDone(true);
    },
    [token]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const files = Array.from(e.dataTransfer.files);
      uploadFiles(files);
    },
    [uploadFiles]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      uploadFiles(files);
      // Reset the input so the same files can be selected again
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [uploadFiles]
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

  const existingDocs = sessionInfo.documents.map((d) => ({
    fileName: d.file_name,
    status: "uploaded" as const,
  }));
  const allDocs = [...existingDocs, ...uploads];

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Header */}
      <header className="bg-white border-b border-zinc-200 px-8 py-6">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center gap-3 mb-1">
            <img
              src="https://www.capitalwealth.com/assets/images/logos/logo-horizontal-color.png"
              alt="Capital Wealth Advisors"
              className="h-8"
            />
          </div>
          <h1 className="text-2xl font-semibold text-zinc-900 mt-4">
            Secure Document Upload
          </h1>
          <p className="text-zinc-600 mt-1">
            Upload your federal benefits documents below. Our system will automatically identify each document.
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

        {/* Upload area — multi-file, no type selector */}
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
              <div className="text-4xl mb-3 animate-pulse">&#128196;</div>
              <p className="text-zinc-700 font-medium text-lg">Uploading securely...</p>
              <p className="text-sm text-zinc-500 mt-1">
                {uploads.filter((u) => u.status === "uploaded").length} of {uploads.length} files uploaded
              </p>
            </div>
          ) : (
            <div>
              <div className="text-4xl mb-3">&#128196;</div>
              <p className="text-zinc-900 font-medium text-lg mb-1">
                Drag and drop all your documents here
              </p>
              <p className="text-sm text-zinc-500 mb-5">
                You can upload multiple files at once — PDF, JPEG, or PNG up to 50MB each
              </p>
              <label className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-700 text-white rounded-lg font-medium cursor-pointer hover:bg-emerald-800 transition-colors text-base">
                Choose Files
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept=".pdf,.jpg,.jpeg,.png"
                  multiple
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
              Uploaded Documents ({allDocs.length})
            </h2>
            <div className="space-y-3">
              {allDocs.map((doc, i) => (
                <div
                  key={`${doc.fileName}-${i}`}
                  className="flex items-center justify-between bg-white rounded-lg border border-zinc-200 px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl">
                      {doc.status === "uploading" ? "\u23F3" : "\u2705"}
                    </span>
                    <p className="text-sm font-medium text-zinc-900">{doc.fileName}</p>
                  </div>
                  <span
                    className={`text-xs font-medium px-2 py-1 rounded-full ${
                      doc.status === "uploading"
                        ? "bg-amber-100 text-amber-700"
                        : "bg-emerald-100 text-emerald-700"
                    }`}
                  >
                    {doc.status === "uploading" ? "Uploading..." : "Uploaded"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Success message after all uploads */}
        {allDone && !uploading && (
          <div className="mt-8 bg-emerald-50 border border-emerald-200 rounded-xl p-6 text-center">
            <div className="text-4xl mb-3">&#9989;</div>
            <h2 className="text-xl font-semibold text-emerald-900 mb-2">
              Documents Uploaded Successfully
            </h2>
            <p className="text-sm text-emerald-700">
              Your advisor has been notified and will review your documents shortly.
              You can close this page or upload additional documents above.
            </p>
          </div>
        )}

        {/* What to upload — simple checklist */}
        <div className="mt-8 bg-white rounded-lg border border-zinc-200 p-6">
          <h2 className="text-lg font-semibold text-zinc-900 mb-3">
            What to Upload
          </h2>
          <p className="text-sm text-zinc-600 mb-4">
            Upload as many of the following as you have. Don't worry about labeling them — our system will identify each document automatically.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { name: "Leave & Earnings Statement", desc: "Your most recent pay stub" },
              { name: "SF-50", desc: "Personnel action notification" },
              { name: "TSP Statement", desc: "Thrift Savings Plan balances" },
              { name: "DD-214", desc: "Military discharge (if applicable)" },
              { name: "Social Security Statement", desc: "Benefit estimates from ssa.gov" },
              { name: "Benefits Statement", desc: "FEGLI, FEHB, and retirement summary" },
            ].map((item) => (
              <div key={item.name} className="flex items-start gap-2 text-sm">
                <span className="text-emerald-500 mt-0.5">&#9679;</span>
                <div>
                  <span className="font-medium text-zinc-700">{item.name}</span>
                  <span className="text-zinc-400 block text-xs">{item.desc}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>

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
