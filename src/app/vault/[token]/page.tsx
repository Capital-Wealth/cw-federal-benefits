"use client";

import { useState, useEffect, useCallback, useRef, use } from "react";

interface Doc {
  id: string;
  fileName: string;
  mime: string;
  sizeBytes: number;
  sha256: string;
  scanStatus: string;
  uploadedAt: string;
}
interface AuditEvent {
  at: string;
  actor: string;
  action: string;
  detail: Record<string, unknown>;
  ip?: string;
}

export default function VaultDashboard({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [client, setClient] = useState<{ name: string; email: string } | null>(null);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [tab, setTab] = useState<"docs" | "audit">("docs");
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/vault/documents?token=${token}`);
    if (res.status === 401) { setInvalid(true); return; }
    const data = await res.json();
    setClient(data.client);
    setDocs(data.documents || []);
    const aRes = await fetch(`/api/vault/audit?token=${token}`);
    if (aRes.ok) setEvents((await aRes.json()).events || []);
  }, [token]);

  useEffect(() => { refresh(); }, [refresh]);

  const upload = useCallback(async (files: File[]) => {
    if (!files.length) return;
    setUploading(true); setErr(null); setMsg(null);
    for (const file of files) {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("token", token);
      try {
        const res = await fetch("/api/vault/upload", { method: "POST", body: fd });
        const data = await res.json();
        if (res.ok) {
          setMsg(`Encrypted & stored: ${data.fileName} (${data.detectedMime}, SHA-256 ${String(data.sha256).slice(0, 12)}...)`);
        } else {
          setErr(`${file.name}: ${data.error}${data.detected ? ` (detected ${data.detected}, claimed ${data.claimed})` : ""}`);
        }
      } catch {
        setErr(`${file.name}: connection failed`);
      }
    }
    setUploading(false);
    await refresh();
  }, [token, refresh]);

  if (invalid) {
    return (
      <Shell>
        <div className="max-w-md mx-auto text-center py-20">
          <div className="text-5xl mb-4">&#128274;</div>
          <h1 className="text-2xl font-semibold text-zinc-900 mb-2">Link Expired or Invalid</h1>
          <p className="text-zinc-600">Request a new secure link from the Vault sign-in page.</p>
          <a href="/vault" className="inline-block mt-5 px-5 py-2.5 bg-[#16253C] text-white rounded-lg font-medium">Back to sign-in</a>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="bg-[#16253C] text-white rounded-xl px-8 py-7 mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Your Vault</h1>
          {client && <p className="text-[#C7A356] text-sm">{client.name} &middot; {client.email}</p>}
        </div>
        <div className="text-4xl">&#128274;</div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-5">
        <button onClick={() => setTab("docs")}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === "docs" ? "bg-[#16253C] text-white" : "bg-white border border-zinc-300 text-zinc-700"}`}>
          Documents ({docs.length})
        </button>
        <button onClick={() => setTab("audit")}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === "audit" ? "bg-[#16253C] text-white" : "bg-white border border-zinc-300 text-zinc-700"}`}>
          Audit Trail ({events.length})
        </button>
      </div>

      {tab === "docs" && (
        <>
          <div
            onDrop={(e) => { e.preventDefault(); upload(Array.from(e.dataTransfer.files)); }}
            onDragOver={(e) => e.preventDefault()}
            className={`border-2 border-dashed rounded-xl p-8 text-center mb-5 ${uploading ? "border-[#C7A356] bg-[#C7A356]/5" : "border-zinc-300 hover:border-[#C7A356]"}`}>
            {uploading ? (
              <p className="text-zinc-600 animate-pulse">Encrypting & storing...</p>
            ) : (
              <>
                <div className="text-4xl mb-2">&#128196;</div>
                <p className="font-medium text-zinc-900 mb-1">Drop documents to encrypt & upload</p>
                <p className="text-sm text-zinc-500 mb-4">PDF, JPEG, PNG, TIFF &middot; validated by content, not extension</p>
                <label className="inline-flex px-5 py-2.5 bg-[#16253C] text-white rounded-lg font-medium cursor-pointer hover:bg-[#1E3456]">
                  Choose Files
                  <input ref={fileRef} type="file" multiple className="hidden"
                    onChange={(e) => { upload(Array.from(e.target.files || [])); if (fileRef.current) fileRef.current.value = ""; }} />
                </label>
              </>
            )}
          </div>

          {msg && <div className="mb-4 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 text-sm text-emerald-800">{msg}</div>}
          {err && <div className="mb-4 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-800">{err}</div>}

          <div className="bg-white rounded-xl border border-zinc-200 divide-y divide-zinc-100">
            {docs.length === 0 ? (
              <p className="text-center text-zinc-400 py-10 text-sm">No documents yet. Upload your first above.</p>
            ) : docs.map((d) => (
              <div key={d.id} className="flex items-center justify-between px-5 py-3">
                <div className="min-w-0">
                  <p className="font-medium text-zinc-900 truncate">{d.fileName}</p>
                  <p className="text-xs text-zinc-500">
                    Uploaded {new Date(d.uploadedAt).toLocaleString()} &middot;
                    {" "}{d.mime} &middot; {(d.sizeBytes / 1024).toFixed(1)} KB &middot;
                    <span className="text-emerald-600 font-medium"> {d.scanStatus}</span> &middot;
                    SHA-256 {d.sha256.slice(0, 12)}...
                  </p>
                </div>
                <a href={`/api/vault/download/${d.id}?token=${token}`} target="_blank" rel="noopener noreferrer"
                  className="ml-4 px-3 py-1.5 text-sm border border-zinc-300 rounded-lg text-zinc-700 hover:border-[#C7A356] whitespace-nowrap">
                  View
                </a>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === "audit" && (
        <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
          <div className="px-5 py-3 bg-zinc-50 border-b border-zinc-200 text-xs font-semibold text-zinc-500 uppercase tracking-wide">
            Append-only audit trail
          </div>
          {events.length === 0 ? (
            <p className="text-center text-zinc-400 py-10 text-sm">No events yet.</p>
          ) : (
            <div className="divide-y divide-zinc-100 font-mono text-xs">
              {events.map((e, i) => (
                <div key={i} className="px-5 py-2.5">
                  <span className="text-zinc-400">{new Date(e.at).toLocaleString()}</span>{" "}
                  <span className="font-semibold text-[#16253C]">{e.action}</span>{" "}
                  <span className="text-zinc-600">by {e.actor}</span>
                  {e.detail?.fileName ? <span className="text-zinc-500"> &middot; {String(e.detail.fileName)}</span> : null}
                  {e.ip ? <span className="text-zinc-400"> &middot; {e.ip}</span> : null}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <p className="text-center text-xs text-zinc-400 mt-8">
        Documents are AES-256-GCM encrypted at rest. Every action is logged. You can only see your own documents.
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="bg-white border-b border-zinc-200 px-8 py-4">
        <img src="https://www.capitalwealth.com/assets/images/logos/logo-horizontal-color.png" alt="Capital Wealth" className="h-8" />
      </header>
      <main className="max-w-3xl mx-auto px-6 py-8">{children}</main>
    </div>
  );
}
