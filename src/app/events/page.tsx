"use client";
import { useEffect, useState } from "react";

const NAVY = "#16253C";
const GOLD = "#C7A356";
const GOLD_TEXT = "#8A6A24"; // AA-contrast gold for text on light bg
const LOGO = "https://www.capitalwealth.com/assets/images/logos/logo-horizontal-white.png";

interface Campaign { Id: string; Name: string; NumberOfLeads: number; }

export default function EventsIndex() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  function load() {
    setLoading(true); setErr("");
    fetch("/api/events").then((r) => r.json())
      .then((d) => { if (d.error) setErr(d.error); else setCampaigns(d.campaigns || []); })
      .catch((e) => setErr(String(e))).finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, []);

  return (
    <div className="lc-events" style={{ minHeight: "100dvh", background: "#F7F4ED" }}>
      <header style={{ background: NAVY, padding: "env(safe-area-inset-top,16px) 24px 18px", textAlign: "center" }}>
        <img src={LOGO} alt="Capital Wealth" width={180} height={28} style={{ height: 28, width: "auto", margin: "8px auto 10px" }} />
        <h1 style={{ color: "#fff", fontSize: "clamp(20px,4vw,26px)", fontWeight: 700, margin: 0 }}>Event Check-In</h1>
        <p style={{ color: GOLD, margin: "4px 0 0", fontSize: 14 }}>Select today&apos;s event</p>
      </header>
      <main style={{ maxWidth: 920, margin: "0 auto", padding: "20px 16px",
        display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(min(100%,340px),1fr))", gap: 14 }}>
        {loading && <p style={{ color: NAVY }}>Loading events…</p>}
        {err && (
          <div role="alert" style={{ color: "#9B1C1C" }}>
            <p>Couldn&apos;t load events: {err}</p>
            <button onClick={load} style={{ padding: "10px 18px", background: NAVY, color: "#fff", border: "none", borderRadius: 8, fontSize: 15, cursor: "pointer" }}>Retry</button>
          </div>
        )}
        {campaigns.map((c) => (
          <a key={c.Id} href={`/events/${c.Id}`} aria-label={`Open check-in for ${c.Name}, ${c.NumberOfLeads ?? 0} registered`}
            style={{ display: "flex", flexDirection: "column", gap: 6, background: "#fff",
              border: `1px solid ${GOLD}`, borderRadius: 14, padding: "22px 24px",
              textDecoration: "none", color: NAVY, minHeight: 84, justifyContent: "center" }}>
            <span style={{ fontSize: 19, fontWeight: 700 }}>{c.Name}</span>
            <span style={{ color: GOLD_TEXT, fontSize: 14, fontWeight: 600 }}>{c.NumberOfLeads ?? 0} registered →</span>
          </a>
        ))}
        {!loading && !err && campaigns.length === 0 && <p style={{ color: NAVY }}>No active Federal events found.</p>}
      </main>
    </div>
  );
}
