"use client";
import { useEffect, useState } from "react";

const NAVY = "#16253C";
const GOLD = "#C7A356";

interface Campaign { Id: string; Name: string; NumberOfLeads: number; }

export default function EventsIndex() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    fetch("/api/events")
      .then((r) => r.json())
      .then((d) => { if (d.error) setErr(d.error); else setCampaigns(d.campaigns || []); })
      .catch((e) => setErr(String(e)))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: "#F7F4ED" }}>
      <header style={{ background: NAVY, padding: "20px 24px" }}>
        <h1 style={{ color: "#fff", fontSize: 24, fontWeight: 700, margin: 0 }}>
          Event Check-In
        </h1>
        <p style={{ color: GOLD, margin: "4px 0 0", fontSize: 14 }}>Select today&apos;s event</p>
      </header>
      <main style={{ maxWidth: 720, margin: "0 auto", padding: 24 }}>
        {loading && <p>Loading events…</p>}
        {err && <p style={{ color: "#C23934" }}>Error: {err}</p>}
        {campaigns.map((c) => (
          <a key={c.Id} href={`/events/${c.Id}`}
            style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              background: "#fff", border: `1px solid ${GOLD}`, borderRadius: 12,
              padding: "20px 24px", marginBottom: 12, textDecoration: "none",
              color: NAVY, fontSize: 18, fontWeight: 600,
            }}>
            <span>{c.Name}</span>
            <span style={{ color: GOLD, fontSize: 14 }}>{c.NumberOfLeads ?? 0} registered →</span>
          </a>
        ))}
        {!loading && !err && campaigns.length === 0 && <p>No active Federal events found.</p>}
      </main>
    </div>
  );
}
