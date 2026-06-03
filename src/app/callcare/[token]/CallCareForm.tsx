"use client";

import { useState, useEffect } from "react";
import {
  DISPOSITIONS,
  WORKING_STATUS,
  MODALITIES,
  ADVISORS,
  type CallCareSubmission,
} from "@/lib/callcare/fields";

// Capital Wealth brand
const NAVY = "#16253C";
const GOLD = "#C7A356";
const LOGO_WHITE =
  "https://www.capitalwealth.com/assets/images/logos/logo-horizontal-white.png";

type LeadCtx = {
  id: string;
  name: string;
  firstName: string;
  phone: string;
  email: string;
  company: string;
  leadSource: string;
  status: string;
  createdDate: string;
};

const EMPTY: Omit<CallCareSubmission, "token"> = {
  callTime: null,
  connected: true,
  disposition: null,
  age: null,
  workingStatus: null,
  married: false,
  spouseAge: null,
  currentAdvisor: null,
  assetLocation: null,
  investableAssets: null,
  mainConcern: null,
  moneyGoal: null,
  questions: null,
  apptDate: null,
  apptTime: null,
  modality: null,
  advisor: null,
  notes: null,
};

/** Local datetime → value for <input type="datetime-local">. */
function nowLocal(): string {
  const d = new Date();
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}

export default function CallCareForm({ token }: { token: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lead, setLead] = useState<LeadCtx | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [callTime, setCallTime] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    setCallTime(nowLocal());
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/callcare/session?token=${encodeURIComponent(token)}`
        );
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(data.error || "We couldn't open this lead.");
          return;
        }
        setLead(data.lead);
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

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit() {
    if (!form.disposition) {
      setError("Pick a call outcome before logging.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const payload: CallCareSubmission = {
        ...form,
        token,
        callTime: callTime ? new Date(callTime).toISOString() : null,
      };
      const res = await fetch("/api/callcare/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong logging this call.");
        return;
      }
      setDone(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <Shell>
        <p style={{ textAlign: "center", color: "#666", padding: "60px 0" }}>
          Loading lead…
        </p>
      </Shell>
    );
  }

  if (error && !lead && !done) {
    return (
      <Shell>
        <div className="cc-card">
          <h2 style={{ color: NAVY }}>We hit a snag</h2>
          <p style={{ color: "#555" }}>{error}</p>
        </div>
      </Shell>
    );
  }

  if (done) {
    return (
      <Shell>
        <div className="cc-card" style={{ textAlign: "center" }}>
          <div style={{ fontSize: 44, marginBottom: 8 }}>✓</div>
          <h2 style={{ color: NAVY, marginTop: 0 }}>Call logged</h2>
          <p style={{ color: "#555", maxWidth: 460, margin: "0 auto" }}>
            This call is now on {lead?.firstName || "the lead"}&rsquo;s record in
            Salesforce. You can close this tab.
          </p>
        </div>
      </Shell>
    );
  }

  const apptBooked = form.disposition === "Appointment Booked";

  return (
    <Shell>
      <div className="cc-card">
        <p style={{ color: GOLD, fontWeight: 700, letterSpacing: 1, fontSize: 13, margin: 0 }}>
          CALLCARE — LOG THIS CALL
        </p>
        <h1 style={{ color: NAVY, fontSize: 24, margin: "6px 0 2px" }}>
          {lead?.name || "Lead"}
        </h1>
        <div className="cc-meta">
          {lead?.phone && <span>{lead.phone}</span>}
          {lead?.email && <span>{lead.email}</span>}
          {lead?.leadSource && <span>Source: {lead.leadSource}</span>}
          {lead?.status && <span>Status: {lead.status}</span>}
        </div>

        {/* Outcome */}
        <section className="cc-section">
          <h2 style={{ color: NAVY }}>Outcome</h2>
          <label className="cc-check">
            <input
              type="checkbox"
              checked={form.connected}
              onChange={(e) => set("connected", e.target.checked)}
            />
            <span>Connected with the prospect</span>
          </label>

          <div className="cc-field">
            <label>Disposition</label>
            <select
              value={form.disposition || ""}
              onChange={(e) => set("disposition", e.target.value || null)}
            >
              <option value="">Select…</option>
              {DISPOSITIONS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          <div className="cc-field">
            <label>Call time</label>
            <input
              type="datetime-local"
              value={callTime}
              onChange={(e) => setCallTime(e.target.value)}
            />
          </div>
        </section>

        {/* Appointment (conditional) */}
        {apptBooked && (
          <section className="cc-section">
            <h2 style={{ color: NAVY }}>Appointment</h2>
            <div className="cc-row">
              <div className="cc-field">
                <label>Date</label>
                <input
                  type="date"
                  value={form.apptDate || ""}
                  onChange={(e) => set("apptDate", e.target.value || null)}
                />
              </div>
              <div className="cc-field">
                <label>Time</label>
                <input
                  type="time"
                  value={form.apptTime || ""}
                  onChange={(e) => set("apptTime", e.target.value || null)}
                />
              </div>
            </div>
            <div className="cc-row">
              <div className="cc-field">
                <label>Modality</label>
                <select
                  value={form.modality || ""}
                  onChange={(e) => set("modality", e.target.value || null)}
                >
                  <option value="">Select…</option>
                  {MODALITIES.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <div className="cc-field">
                <label>Advisor</label>
                <select
                  value={form.advisor || ""}
                  onChange={(e) => set("advisor", e.target.value || null)}
                >
                  <option value="">Select…</option>
                  {ADVISORS.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </section>
        )}

        {/* Qualifying */}
        <section className="cc-section">
          <h2 style={{ color: NAVY }}>Qualifying</h2>
          <div className="cc-row">
            <div className="cc-field">
              <label>Age</label>
              <input
                type="text"
                inputMode="numeric"
                value={form.age || ""}
                onChange={(e) => set("age", e.target.value || null)}
              />
            </div>
            <div className="cc-field">
              <label>Working status</label>
              <select
                value={form.workingStatus || ""}
                onChange={(e) => set("workingStatus", e.target.value || null)}
              >
                <option value="">Select…</option>
                {WORKING_STATUS.map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <label className="cc-check">
            <input
              type="checkbox"
              checked={form.married}
              onChange={(e) => set("married", e.target.checked)}
            />
            <span>Married</span>
          </label>
          {form.married && (
            <div className="cc-field">
              <label>Spouse age</label>
              <input
                type="text"
                inputMode="numeric"
                value={form.spouseAge || ""}
                onChange={(e) => set("spouseAge", e.target.value || null)}
              />
            </div>
          )}

          <div className="cc-field">
            <label>Currently working with an advisor?</label>
            <input
              type="text"
              placeholder="No — or who"
              value={form.currentAdvisor || ""}
              onChange={(e) => set("currentAdvisor", e.target.value || null)}
            />
          </div>
          <div className="cc-field">
            <label>Where are assets located?</label>
            <input
              type="text"
              value={form.assetLocation || ""}
              onChange={(e) => set("assetLocation", e.target.value || null)}
            />
          </div>
          <div className="cc-field">
            <label>Investable assets (ballpark)</label>
            <input
              type="text"
              value={form.investableAssets || ""}
              onChange={(e) => set("investableAssets", e.target.value || null)}
            />
          </div>
          <div className="cc-field">
            <label>Main concern</label>
            <textarea
              rows={2}
              value={form.mainConcern || ""}
              onChange={(e) => set("mainConcern", e.target.value || null)}
            />
          </div>
          <div className="cc-field">
            <label>Goal of the money</label>
            <textarea
              rows={2}
              value={form.moneyGoal || ""}
              onChange={(e) => set("moneyGoal", e.target.value || null)}
            />
          </div>
          <div className="cc-field">
            <label>Questions / concerns</label>
            <textarea
              rows={2}
              value={form.questions || ""}
              onChange={(e) => set("questions", e.target.value || null)}
            />
          </div>
        </section>

        {/* Notes */}
        <section className="cc-section">
          <h2 style={{ color: NAVY }}>Notes</h2>
          <div className="cc-field">
            <label>Anything pertinent for the advisor</label>
            <textarea
              rows={4}
              placeholder="Personality, life events, tone, context…"
              value={form.notes || ""}
              onChange={(e) => set("notes", e.target.value || null)}
            />
          </div>
        </section>

        {error && <p style={{ color: "#b00020" }}>{error}</p>}

        <button
          className="cc-submit"
          onClick={handleSubmit}
          disabled={submitting}
          style={{ background: NAVY }}
        >
          {submitting ? "Logging…" : "Log this call"}
        </button>
        <p style={{ color: "#999", fontSize: 12, textAlign: "center", marginTop: 14 }}>
          Capital Wealth · Syncs directly to Salesforce.
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
        .cc-card { background:#fff; border-radius:14px; padding:28px 24px; box-shadow:0 1px 4px rgba(0,0,0,.08); }
        .cc-meta { display:flex; flex-wrap:wrap; gap:6px 14px; color:#667; font-size:13px; margin:4px 0 6px; }
        .cc-section { margin-top:24px; padding-top:18px; border-top:1px solid #eee; }
        .cc-section h2 { font-size:17px; margin:0 0 8px; }
        .cc-field { margin:12px 0; flex:1; }
        .cc-row { display:flex; gap:12px; }
        .cc-field label { display:block; font-size:14px; color:#222; margin-bottom:6px; font-weight:600; }
        .cc-field input, .cc-field select, .cc-field textarea {
          width:100%; box-sizing:border-box; padding:11px 12px; border:1px solid #cdd2da;
          border-radius:8px; font-size:16px; font-family:inherit; color:#222; background:#fff;
        }
        .cc-field textarea { resize:vertical; }
        .cc-check { display:flex; align-items:center; gap:10px; padding:10px 0; font-size:15px; color:#222; cursor:pointer; }
        .cc-check input { width:18px; height:18px; flex-shrink:0; }
        .cc-submit { width:100%; color:#fff; border:none; border-radius:9px; padding:15px;
          font-size:16px; font-weight:700; cursor:pointer; margin-top:24px; }
        .cc-submit:disabled { opacity:.6; cursor:default; }
      `}</style>
    </div>
  );
}
