"use client";
import { useEffect, useState, useCallback, use } from "react";

const NAVY = "#16253C";
const GOLD = "#C7A356";
const GREEN = "#00716B";

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
  const [wFirst, setWFirst] = useState(""); const [wLast, setWLast] = useState("");
  const [wPhone, setWPhone] = useState(""); const [wEmail, setWEmail] = useState("");

  const load = useCallback(() => {
    fetch(`/api/events/roster?campaignId=${campaignId}`)
      .then((r) => r.json())
      .then((d) => { if (d.error) setErr(d.error); else setLeads(d.leads || []); })
      .catch((e) => setErr(String(e)))
      .finally(() => setLoading(false));
  }, [campaignId]);
  useEffect(() => { load(); }, [load]);

  async function toggle(l: Lead) {
    const attended = !!l.Workshop_Attended__c;
    setBusy((b) => ({ ...b, [l.Id]: true }));
    const res = await fetch("/api/events/checkin", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadId: l.Id, undo: attended }),
    }).then((r) => r.json());
    if (res.success) {
      setLeads((ls) => ls.map((x) => x.Id === l.Id
        ? { ...x, Workshop_Attended__c: res.attended, Attendance__c: res.attended ? "Attended" : "Confirmed" }
        : x));
    } else { alert("Error: " + (res.error || "failed")); }
    setBusy((b) => ({ ...b, [l.Id]: false }));
  }

  async function addWalkin() {
    if (!wLast.trim()) { alert("Last name required"); return; }
    const res = await fetch("/api/events/walkin", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId, firstName: wFirst, lastName: wLast, phone: wPhone, email: wEmail }),
    }).then((r) => r.json());
    if (res.success) {
      setShowWalkin(false); setWFirst(""); setWLast(""); setWPhone(""); setWEmail("");
      load();
    } else { alert("Error: " + (res.error || "failed")); }
  }

  const filtered = leads.filter((l) =>
    (l.Name || "").toLowerCase().includes(search.toLowerCase()) ||
    (l.Phone || "").includes(search));
  const checkedIn = leads.filter((l) => l.Workshop_Attended__c).length;

  return (
    <div style={{ minHeight: "100vh", background: "#F7F4ED" }}>
      <header style={{ background: NAVY, padding: "16px 24px", position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <a href="/events" style={{ color: GOLD, textDecoration: "none", fontSize: 14 }}>← Events</a>
          <span style={{ color: "#fff", fontWeight: 700, fontSize: 18 }}>
            {checkedIn} / {leads.length} checked in
          </span>
        </div>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or phone…"
          style={{ width: "100%", marginTop: 12, padding: "14px 16px", fontSize: 18, borderRadius: 10, border: "none" }} />
      </header>
      <main style={{ maxWidth: 760, margin: "0 auto", padding: 16 }}>
        {loading && <p>Loading roster…</p>}
        {err && <p style={{ color: "#C23934" }}>Error: {err}</p>}
        {filtered.map((l) => {
          const on = !!l.Workshop_Attended__c;
          return (
            <button key={l.Id} onClick={() => toggle(l)} disabled={busy[l.Id]}
              style={{
                display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%",
                background: on ? GREEN : "#fff", color: on ? "#fff" : NAVY,
                border: `2px solid ${on ? GREEN : "#ddd"}`, borderRadius: 12,
                padding: "18px 20px", marginBottom: 10, fontSize: 18, cursor: "pointer", textAlign: "left",
              }}>
              <span>
                <strong>{l.Name}</strong>
                {l.Phone && <span style={{ display: "block", fontSize: 13, opacity: 0.8 }}>{l.Phone}</span>}
              </span>
              <span style={{ fontSize: 16, fontWeight: 700 }}>{on ? "✓ IN" : "Check in"}</span>
            </button>
          );
        })}
        <button onClick={() => setShowWalkin(true)}
          style={{ width: "100%", padding: 16, marginTop: 8, background: GOLD, color: NAVY,
            border: "none", borderRadius: 12, fontSize: 18, fontWeight: 700, cursor: "pointer" }}>
          + Add walk-in
        </button>
      </main>
      {showWalkin && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", display: "flex",
          alignItems: "center", justifyContent: "center", zIndex: 20 }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 24, width: "90%", maxWidth: 420 }}>
            <h2 style={{ color: NAVY, marginTop: 0 }}>Add walk-in</h2>
            {[["First name", wFirst, setWFirst], ["Last name *", wLast, setWLast],
              ["Phone", wPhone, setWPhone], ["Email", wEmail, setWEmail]].map(([ph, val, set]) => (
              <input key={ph as string} placeholder={ph as string} value={val as string}
                onChange={(e) => (set as (s: string) => void)(e.target.value)}
                style={{ width: "100%", padding: 14, fontSize: 16, marginBottom: 10, borderRadius: 8, border: "1px solid #ccc" }} />
            ))}
            <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
              <button onClick={() => setShowWalkin(false)}
                style={{ flex: 1, padding: 14, background: "#eee", border: "none", borderRadius: 8, fontSize: 16 }}>Cancel</button>
              <button onClick={addWalkin}
                style={{ flex: 1, padding: 14, background: GREEN, color: "#fff", border: "none", borderRadius: 8, fontSize: 16, fontWeight: 700 }}>Add &amp; check in</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
