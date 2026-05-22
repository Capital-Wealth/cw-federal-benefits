"use client";

import { useState, useEffect, useCallback } from "react";
import { SECTIONS, ALL_FIELD_APIS, type FieldDef } from "@/lib/sr-intake/fields";

// Capital Wealth brand
const NAVY = "#16253C";
const GOLD = "#C7A356";
const LOGO_WHITE =
  "https://www.capitalwealth.com/assets/images/logos/logo-horizontal-white.png";

type FieldValue = string | boolean | null;
type RecordMap = Record<string, FieldValue>;

export default function SRIntakeForm({ token }: { token: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accountName, setAccountName] = useState("");
  const [record, setRecord] = useState<RecordMap>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  // ---- load ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/sr-intake/session?token=${encodeURIComponent(token)}`
        );
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(data.error || "We couldn't open this survey.");
          return;
        }
        setAccountName(data.accountName || "");
        if (data.record?.Status__c === "Completed") setDone(true);

        const rec: RecordMap = {};
        for (const api of ALL_FIELD_APIS) {
          const v = data.record?.[api];
          rec[api] = v === undefined ? null : (v as FieldValue);
        }
        setRecord(rec);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Network error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const setField = useCallback((api: string, value: FieldValue) => {
    setRecord((r) => ({ ...r, [api]: value }));
  }, []);

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const fields: RecordMap = {};
      for (const api of ALL_FIELD_APIS) fields[api] = record[api] ?? null;
      const res = await fetch("/api/sr-intake/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, fields }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong submitting your answers.");
        return;
      }
      setDone(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setSubmitting(false);
    }
  };

  // ---- render helpers ----
  const visible = (f: FieldDef) =>
    !f.showIf || record[f.showIf] === true;

  function renderField(f: FieldDef) {
    if (!visible(f)) return null;
    const val = record[f.api];

    if (f.type === "checkbox") {
      return (
        <label key={f.api} className="sr-check">
          <input
            type="checkbox"
            checked={val === true}
            onChange={(e) => setField(f.api, e.target.checked)}
          />
          <span>{f.label}</span>
        </label>
      );
    }

    if (f.type === "picklist") {
      return (
        <div key={f.api} className="sr-field">
          <label>{f.label}</label>
          <select
            value={(val as string) || ""}
            onChange={(e) => setField(f.api, e.target.value || null)}
          >
            <option value="">Select…</option>
            {f.options?.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>
      );
    }

    if (f.type === "longtext") {
      return (
        <div key={f.api} className="sr-field">
          <label>{f.label}</label>
          <textarea
            rows={3}
            placeholder={f.placeholder || ""}
            value={(val as string) || ""}
            onChange={(e) => setField(f.api, e.target.value || null)}
          />
        </div>
      );
    }

    return (
      <div key={f.api} className="sr-field">
        <label>{f.label}</label>
        <input
          type="text"
          placeholder={f.placeholder || ""}
          value={(val as string) || ""}
          onChange={(e) => setField(f.api, e.target.value || null)}
        />
      </div>
    );
  }

  // ---- states ----
  if (loading) {
    return (
      <Shell>
        <p style={{ textAlign: "center", color: "#666", padding: "60px 0" }}>
          Loading your survey…
        </p>
      </Shell>
    );
  }

  if (error && !done) {
    return (
      <Shell>
        <div className="sr-card">
          <h2 style={{ color: NAVY }}>We hit a snag</h2>
          <p style={{ color: "#555" }}>{error}</p>
          <p style={{ color: "#888", fontSize: 14 }}>
            Please reply to the email we sent, or call your advisor — we'll sort it out.
          </p>
        </div>
      </Shell>
    );
  }

  if (done) {
    return (
      <Shell>
        <div className="sr-card" style={{ textAlign: "center" }}>
          <div style={{ fontSize: 44, marginBottom: 8 }}>✓</div>
          <h2 style={{ color: NAVY, marginTop: 0 }}>Thank you!</h2>
          <p style={{ color: "#555", maxWidth: 460, margin: "0 auto" }}>
            Your answers are with your advisor. We'll use them to make your Strategic
            Review focused on exactly what matters to you. See you soon.
          </p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="sr-card">
        <p style={{ color: GOLD, fontWeight: 700, letterSpacing: 1, fontSize: 13, margin: 0 }}>
          BEFORE YOUR STRATEGIC REVIEW
        </p>
        <h1 style={{ color: NAVY, fontSize: 26, margin: "6px 0 4px" }}>
          {accountName ? `Welcome, ${accountName.split(" ")[0]}` : "A quick prep for your review"}
        </h1>
        <p style={{ color: "#555", marginTop: 0 }}>
          Five minutes here helps your advisor make this review entirely about you.
          Every question is optional — skip anything you'd rather discuss in person.
        </p>

        {SECTIONS.map((s) => (
          <section key={s.id} className="sr-section">
            <h2 style={{ color: NAVY }}>{s.title}</h2>
            {s.intro && <p className="sr-intro">{s.intro}</p>}
            {s.id === "mind" ? (
              <>
                {renderField(s.fields[0])}
                <p className="sr-grouplabel">Which of these are on your mind? (check any)</p>
                <div className="sr-checks">
                  {s.fields.slice(1, 6).map(renderField)}
                </div>
                {renderField(s.fields[6])}
              </>
            ) : (
              s.fields.map(renderField)
            )}
          </section>
        ))}

        {error && <p style={{ color: "#b00020" }}>{error}</p>}

        <button
          className="sr-submit"
          onClick={handleSubmit}
          disabled={submitting}
          style={{ background: NAVY }}
        >
          {submitting ? "Sending…" : "Send to my advisor"}
        </button>
        <p style={{ color: "#999", fontSize: 12, textAlign: "center", marginTop: 14 }}>
          Capital Wealth · Your answers are private and shared only with your advisor.
        </p>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: "#f4f5f7" }}>
      <header style={{ background: NAVY, padding: "18px 20px", textAlign: "center" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={LOGO_WHITE} alt="Capital Wealth" style={{ height: 30 }} />
      </header>
      <main style={{ maxWidth: 600, margin: "0 auto", padding: "24px 16px 60px" }}>
        {children}
      </main>
      <style>{`
        .sr-card { background:#fff; border-radius:14px; padding:28px 24px; box-shadow:0 1px 4px rgba(0,0,0,.08); }
        .sr-section { margin-top:26px; padding-top:18px; border-top:1px solid #eee; }
        .sr-section h2 { font-size:18px; margin:0 0 4px; }
        .sr-intro { color:#666; font-size:14px; margin:0 0 14px; }
        .sr-field { margin:14px 0; }
        .sr-field label { display:block; font-size:15px; color:#222; margin-bottom:6px; font-weight:600; }
        .sr-field input[type=text], .sr-field select, .sr-field textarea {
          width:100%; box-sizing:border-box; padding:11px 12px; border:1px solid #cdd2da;
          border-radius:8px; font-size:16px; font-family:inherit; color:#222; background:#fff;
        }
        .sr-field textarea { resize:vertical; }
        .sr-grouplabel { font-size:15px; color:#222; font-weight:600; margin:16px 0 8px; }
        .sr-checks { display:flex; flex-direction:column; gap:2px; }
        .sr-check { display:flex; align-items:flex-start; gap:10px; padding:9px 0; font-size:15px; color:#222; cursor:pointer; }
        .sr-check input { margin-top:3px; width:18px; height:18px; flex-shrink:0; }
        .sr-submit { width:100%; color:#fff; border:none; border-radius:9px; padding:15px;
          font-size:16px; font-weight:700; cursor:pointer; margin-top:26px; }
        .sr-submit:disabled { opacity:.6; cursor:default; }
      `}</style>
    </div>
  );
}
