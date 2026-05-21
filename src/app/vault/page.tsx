"use client";

import { useState } from "react";

/**
 * /vault — DEMO entry point. Issues a magic link and shows it on screen.
 * Production: the link is emailed via Postmark and never displayed here.
 */
export default function VaultLogin() {
  const [name, setName] = useState("Demo Client");
  const [email, setEmail] = useState("demo@example.com");
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const requestLink = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/vault/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientName: name, clientEmail: email }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error || "Failed"); return; }
      setLink(data.magicLinkPath);
    } catch {
      setErr("Connection failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col">
      <header className="bg-white border-b border-zinc-200 px-8 py-4">
        <img src="https://www.capitalwealth.com/assets/images/logos/logo-horizontal-color.png" alt="Capital Wealth" className="h-8" />
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <div className="bg-[#16253C] text-white rounded-xl px-8 py-10 text-center mb-6">
            <div className="text-4xl mb-3">&#128274;</div>
            <h1 className="text-2xl font-bold mb-1">Capital Wealth Vault</h1>
            <p className="text-[#C7A356] text-sm font-semibold">SECURE DOCUMENT PORTAL</p>
          </div>

          <div className="bg-white rounded-xl border border-zinc-200 p-6">
            <p className="text-sm text-zinc-600 mb-5">
              Enter your details to receive a secure sign-in link.
              <span className="block mt-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                DEMO MODE: the link appears below instead of being emailed.
              </span>
            </p>

            <label className="block text-sm font-medium text-zinc-700 mb-1">Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 mb-4" />

            <label className="block text-sm font-medium text-zinc-700 mb-1">Email</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email"
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 mb-5" />

            <button onClick={requestLink} disabled={busy}
              className="w-full py-3 bg-[#16253C] text-white rounded-lg font-semibold hover:bg-[#1E3456] disabled:opacity-50">
              {busy ? "Generating secure link..." : "Get Secure Link"}
            </button>

            {err && <p className="mt-3 text-sm text-red-700">{err}</p>}

            {link && (
              <div className="mt-5 bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                <p className="text-xs font-semibold text-emerald-800 mb-2">Your secure link is ready:</p>
                <a href={link} className="text-sm font-medium text-[#16253C] underline break-all">{link}</a>
                <a href={link} className="block mt-3 text-center py-2 bg-[#C7A356] text-[#16253C] rounded-lg font-semibold text-sm">
                  Enter the Vault &rarr;
                </a>
              </div>
            )}
          </div>

          <p className="text-center text-xs text-zinc-400 mt-6">
            AES-256-GCM encryption &middot; magic-link auth &middot; full audit trail
          </p>
        </div>
      </main>
    </div>
  );
}
