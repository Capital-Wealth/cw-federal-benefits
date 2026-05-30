"use client";

import { useState } from "react";

// Capital Wealth brand
const NAVY = "#16253C";
const GOLD = "#C7A356";
const LOGO_WHITE =
  "https://www.capitalwealth.com/assets/images/logos/logo-horizontal-white.png";

/**
 * Tokenless entry screen for the Meeting 1 Intake.
 *
 * Collects a shared passcode + first/last/email, posts to /api/meeting1/start,
 * and on success navigates to the per-record form (/meeting1/<recordId>).
 */
export default function StartForm() {
  const [passcode, setPasscode] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
    passcode.trim() !== "" && lastName.trim() !== "" && !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/meeting1/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode, firstName, lastName, email }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        setError(data.error || "Could not start the intake. Please try again.");
        return;
      }
      // Hand off to the real form. A full navigation keeps the passcode out of
      // the form's URL and gives the builder a clean load.
      window.location.assign(data.url as string);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-100" style={{ colorScheme: "light" }}>
      <header className="sticky top-0 z-20" style={{ backgroundColor: NAVY }}>
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO_WHITE} alt="Capital Wealth" className="h-7" />
          <div className="text-[10px] uppercase tracking-widest text-white/60">
            Meeting 1 Intake
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-md px-4 py-12">
        <div className="rounded-xl bg-white p-8 shadow-sm">
          <h1 className="text-xl font-semibold" style={{ color: NAVY }}>
            Start a Meeting 1 Intake
          </h1>
          <p className="mt-2 text-sm text-zinc-600">
            Enter the prospect&rsquo;s name and email. We&rsquo;ll find their
            record in Salesforce (or create one) and open their intake.
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <Field label="Access passcode" required>
              <input
                type="password"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                autoComplete="off"
                className="cw-input"
                placeholder="Shared passcode"
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="First name">
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="cw-input"
                  placeholder="Jane"
                />
              </Field>
              <Field label="Last name" required>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="cw-input"
                  placeholder="Doe"
                />
              </Field>
            </div>

            <Field label="Email">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="off"
                className="cw-input"
                placeholder="jane.doe@example.com"
              />
            </Field>

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition disabled:opacity-50"
              style={{ backgroundColor: NAVY }}
            >
              {submitting ? "Looking up…" : "Open intake"}
            </button>
          </form>
        </div>

        <p className="mt-4 text-center text-xs text-zinc-500">
          Capital Wealth Advisors · Information you enter syncs securely into our
          records.
        </p>
      </div>

      <style>{`
        .cw-input {
          width: 100%;
          border-radius: 0.5rem;
          border: 1px solid #d4d4d8;
          background: #fff;
          color: ${NAVY};
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
          color-scheme: light;
        }
        .cw-input:focus {
          outline: none;
          border-color: ${GOLD};
          box-shadow: 0 0 0 2px ${GOLD}33;
        }
      `}</style>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-zinc-700">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </span>
      {children}
    </label>
  );
}
