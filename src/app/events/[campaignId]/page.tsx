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
    setLoading(true);
    fetch(`/api/events/roster?campaignId=${campaignId}`).then((r) => r.json())
      .then((d) => { if (d.error) setErr(d.error); else setLeads(d.leads || []); })
      .catch((e) => setErr(String(e))).finally(() => setLoading(false));
  }, [campaignId]);
  useEffect(() => { load(); }, [load]);

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
    <div style={{ minHeight: "100dvh", background: "#F7F4ED" }}>
      <header style={{ background: NAVY, padding: "env(safe-area-inset-top,12px) 16px 14px", position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, maxWidth: 1100, margin: "0 auto" }}>
          <a href="/events" style={{ color: GOLD, textDecoration: "none", fontSize: 14, whiteSpace: "nowrap" }}>← Events</a>
          <img src={LOGO} alt="Capital Wealth" style={{ height: 22 }} />
          <span style={{ color: "#fff", fontWeight: 700, fontSize: 16, whiteSpace: "nowrap" }}>{checkedIn}/{leads.length} in</span>
        </div>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or phone…"
            autoComplete="off"
            style={{ width: "100%", marginTop: 12, padding: "16px 18px", fontSize: 18, borderRadius: 12, border: "none", boxSizing: "border-box" }} />
        </div>
      </header>
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "16px 16px 96px" }}>
        {loading && <p>Loading roster…</p>}
        {err && <p style={{ color: "#C23934" }}>Error: {err}</p>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(min(100%,360px),1fr))", gap: 12 }}>
          {filtered.map((l) => {
            const on = !!l.Workshop_Attended__c;
            return (
              <button key={l.Id} onClick={() => toggle(l)} disabled={busy[l.Id]}
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%",
                  background: on ? GREEN : "#fff", color: on ? "#fff" : NAVY,
                  border: `2px solid ${on ? GREEN : "#e3ddd0"}`, borderRadius: 14,
                  padding: "20px 22px", fontSize: 18, cursor: "pointer", textAlign: "left",
                  minHeight: 76, opacity: busy[l.Id] ? 0.6 : 1, transition: "background .15s" }}>
                <span style={{ minWidth: 0 }}>
                  <strong style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.Name}</strong>
                  {l.Phone && <span style={{ fontSize: 13, opacity: 0.8 }}>{l.Phone}</span>}
                </span>
                <span style={{ fontSize: 16, fontWeight: 700, whiteSpace: "nowrap", marginLeft: 12 }}>{on ? "✓ IN" : "Check in"}</span>
              </button>
            );
          })}
        </div>
      </main>
      <button onClick={() => setShowWalkin(true)}
        style={{ position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)",
          padding: "16px 28px", background: GOLD, color: NAVY, border: "none", borderRadius: 999,
          fontSize: 18, fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 16px rgba(0,0,0,.25)", zIndex: 15 }}>
        + Add walk-in
      </button>
      {showWalkin && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", display: "flex",
          alignItems: "center", justifyContent: "center", zIndex: 20, padding: 16 }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 24, width: "100%", maxWidth: 440 }}>
            <h2 style={{ color: NAVY, marginTop: 0 }}>Add walk-in</h2>
            {([["First name", "first"], ["Last name *", "last"], ["Phone", "phone"], ["Email", "email"]] as const).map(([ph, k]) => (
              <input key={k} placeholder={ph} value={w[k]} inputMode={k === "phone" ? "tel" : k === "email" ? "email" : "text"}
                onChange={(e) => setW((p) => ({ ...p, [k]: e.target.value }))}
                style={{ width: "100%", padding: 16, fontSize: 16, marginBottom: 10, borderRadius: 10, border: "1px solid #ccc", boxSizing: "border-box" }} />
            ))}
            <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
              <button onClick={() => setShowWalkin(false)} style={{ flex: 1, padding: 16, background: "#eee", border: "none", borderRadius: 10, fontSize: 16 }}>Cancel</button>
              <button onClick={addWalkin} style={{ flex: 1, padding: 16, background: GREEN, color: "#fff", border: "none", borderRadius: 10, fontSize: 16, fontWeight: 700 }}>Add &amp; check in</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
