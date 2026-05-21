"use client";
import { useEffect, useState, useCallback, use } from "react";

const NAVY = "#16253C";
const GOLD = "#C7A356";
const GREEN = "#00716B";
const LOGO = "https://www.capitalwealth.com/assets/images/logos/logo-horizontal-white.png";

interface Lead {
  Id: string; FirstName?: string; LastName?: string; Name: string;
  Phone?: string; Email?: string; Attendance__c?: string; Workshop_Attended__c?: boolean;
}

function CheckIcon() {
  return (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg>);
}
function ClipboardIcon() {
  return (<svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="6" y="4" width="12" height="17" rx="2" stroke="currentColor" strokeWidth="2"/><path d="M9 4V3a1 1 0 011-1h4a1 1 0 011 1v1" stroke="currentColor" strokeWidth="2"/><path d="M9 10h6M9 14h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>);
}

export default function RosterPage({ params }: { params: Promise<{ campaignId: string }> }) {
  const { campaignId } = use(params);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [showWalkin, setShowWalkin] = useState(false);
  const [w, setW] = useState({ first: "", last: "", phone: "", email: "" });

  const load = useCallback(() => {
    setLoading(true); setErr("");
    fetch(`/api/events/roster?campaignId=${campaignId}`).then((r) => r.json())
      .then((d) => { if (d.error) setErr(d.error); else setLeads(d.leads || []); })
      .catch((e) => setErr(String(e))).finally(() => setLoading(false));
  }, [campaignId]);
  useEffect(() => { load(); }, [load]);

  // Escape closes walk-in modal
  useEffect(() => {
    if (!showWalkin) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setShowWalkin(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showWalkin]);

  async function toggle(l: Lead) {
    const attended = !!l.Workshop_Attended__c;
    setBusy((b) => ({ ...b, [l.Id]: true }));
    const res = await fetch("/api/events/checkin", { method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadId: l.Id, undo: attended }) }).then((r) => r.json());
    if (res.success) {
      setLeads((ls) => ls.map((x) => x.Id === l.Id
        ? { ...x, Workshop_Attended__c: res.attended, Attendance__c: res.attended ? "Attended" : "Confirmed" } : x));
    } else alert("Error: " + (res.error || "failed"));
    setBusy((b) => ({ ...b, [l.Id]: false }));
  }

  async function startIntake(l: Lead) {
    setBusy((b) => ({ ...b, [l.Id + "_i"]: true }));
    const res = await fetch("/api/events/start-intake", { method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadId: l.Id }) }).then((r) => r.json());
    setBusy((b) => ({ ...b, [l.Id + "_i"]: false }));
    if (res.success) window.open(res.url, "_blank");
    else alert("Error: " + (res.error || "failed"));
  }

  async function addWalkin() {
    if (!w.last.trim()) { alert("Last name required"); return; }
    const res = await fetch("/api/events/walkin", { method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId, firstName: w.first, lastName: w.last, phone: w.phone, email: w.email }) }).then((r) => r.json());
    if (res.success) { setShowWalkin(false); setW({ first: "", last: "", phone: "", email: "" }); load(); }
    else alert("Error: " + (res.error || "failed"));
  }

  const filtered = leads.filter((l) =>
    (l.Name || "").toLowerCase().includes(search.toLowerCase()) || (l.Phone || "").includes(search));
  const checkedIn = leads.filter((l) => l.Workshop_Attended__c).length;

  return (
    <div className="lc-events" style={{ minHeight: "100dvh", background: "#F7F4ED" }}>
      <header style={{ background: NAVY, padding: "env(safe-area-inset-top,12px) 16px 14px", position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, maxWidth: 1100, margin: "0 auto" }}>
          <a href="/events" aria-label="Back to events" style={{ color: "#fff", textDecoration: "none", fontSize: 15, whiteSpace: "nowrap", fontWeight: 600 }}>← Events</a>
          <img src={LOGO} alt="Capital Wealth" width={140} height={22} style={{ height: 22, width: "auto" }} />
          <span aria-live="polite" style={{ color: "#fff", fontWeight: 700, fontSize: 16, whiteSpace: "nowrap" }}>{checkedIn}/{leads.length} in</span>
        </div>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or phone…"
            aria-label="Search attendees by name or phone" autoComplete="off" type="search"
            style={{ width: "100%", marginTop: 12, padding: "16px 18px", fontSize: 18, borderRadius: 12, border: "none", boxSizing: "border-box", color: NAVY }} />
        </div>
      </header>
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "16px 16px 96px" }}>
        {loading && <p style={{ color: NAVY }}>Loading roster…</p>}
        {err && (
          <div role="alert" style={{ color: "#9B1C1C" }}>
            <p>Couldn&apos;t load roster: {err}</p>
            <button onClick={load} style={{ padding: "10px 18px", background: NAVY, color: "#fff", border: "none", borderRadius: 8, fontSize: 15, cursor: "pointer" }}>Retry</button>
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(min(100%,360px),1fr))", gap: 12 }}>
          {filtered.map((l) => {
            const on = !!l.Workshop_Attended__c;
            return (
              <div key={l.Id}
                style={{ display: "flex", alignItems: "stretch", width: "100%",
                  background: on ? GREEN : "#fff", color: on ? "#fff" : NAVY,
                  border: `2px solid ${on ? GREEN : "#d9d2c2"}`, borderRadius: 14,
                  overflow: "hidden", minHeight: 76, opacity: busy[l.Id] ? 0.6 : 1 }}>
                <button onClick={() => toggle(l)} disabled={busy[l.Id]}
                  aria-pressed={on} aria-label={`${on ? "Checked in" : "Check in"} ${l.Name}`}
                  style={{ flex: 1, display: "flex", justifyContent: "space-between", alignItems: "center",
                    background: "transparent", color: "inherit", border: "none", cursor: "pointer",
                    textAlign: "left", padding: "18px 18px", fontSize: 18, minWidth: 0 }}>
                  <span style={{ minWidth: 0 }}>
                    <strong style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.Name}</strong>
                    {l.Phone && <span style={{ fontSize: 13, opacity: 0.85 }}>{l.Phone}</span>}
                  </span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 15, fontWeight: 700, whiteSpace: "nowrap", marginLeft: 10 }}>
                    {on ? (<><CheckIcon /> IN</>) : "Check in"}
                  </span>
                </button>
                <button onClick={() => startIntake(l)} disabled={busy[l.Id + "_i"]}
                  aria-label={`Open intake form for ${l.Name}`}
                  style={{ width: 64, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                    background: on ? "rgba(255,255,255,.15)" : "#F1ECE0",
                    color: on ? "#fff" : NAVY, border: "none", borderLeft: `1px solid ${on ? "rgba(255,255,255,.3)" : "#d9d2c2"}`,
                    cursor: "pointer" }}>
                  {busy[l.Id + "_i"] ? "…" : <ClipboardIcon />}
                </button>
              </div>
            );
          })}
        </div>
        {!loading && !err && filtered.length === 0 && (
          <p style={{ color: NAVY, textAlign: "center", marginTop: 32 }}>
            {leads.length === 0 ? "No one registered for this event yet — use “Add walk-in.”" : "No matches. Clear the search to see everyone."}
          </p>
        )}
      </main>
      <button onClick={() => setShowWalkin(true)} aria-label="Add a walk-in attendee"
        style={{ position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)",
          padding: "16px 28px", background: GOLD, color: NAVY, border: "none", borderRadius: 999,
          fontSize: 18, fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 16px rgba(0,0,0,.25)", zIndex: 15 }}>
        + Add walk-in
      </button>
      {showWalkin && (
        <div role="dialog" aria-modal="true" aria-label="Add walk-in"
          onClick={(e) => { if (e.target === e.currentTarget) setShowWalkin(false); }}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", display: "flex",
            alignItems: "center", justifyContent: "center", zIndex: 20, padding: 16 }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 24, width: "100%", maxWidth: 440 }}>
            <h2 style={{ color: NAVY, marginTop: 0 }}>Add walk-in</h2>
            {([["First name", "first", "text"], ["Last name (required)", "last", "text"], ["Phone", "phone", "tel"], ["Email", "email", "email"]] as const).map(([ph, k, t]) => (
              <label key={k} style={{ display: "block" }}>
                <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>{ph}</span>
                <input placeholder={ph} value={w[k]} inputMode={t === "tel" ? "tel" : t === "email" ? "email" : "text"} aria-label={ph}
                  onChange={(e) => setW((p) => ({ ...p, [k]: e.target.value }))}
                  style={{ width: "100%", padding: 16, fontSize: 16, marginBottom: 10, borderRadius: 10, border: "1px solid #b9b09a", boxSizing: "border-box", color: NAVY }} />
              </label>
            ))}
            <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
              <button onClick={() => setShowWalkin(false)} style={{ flex: 1, padding: 16, background: "#eee", color: NAVY, border: "none", borderRadius: 10, fontSize: 16, cursor: "pointer" }}>Cancel</button>
              <button onClick={addWalkin} style={{ flex: 1, padding: 16, background: GREEN, color: "#fff", border: "none", borderRadius: 10, fontSize: 16, fontWeight: 700, cursor: "pointer" }}>Add &amp; check in</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
