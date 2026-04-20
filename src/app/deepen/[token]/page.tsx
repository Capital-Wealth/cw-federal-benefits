"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface FieldDescriptor {
  apiName: string;
  label: string;
  type: "string" | "textarea" | "date" | "datetime" | "email" | "phone" | "picklist" | "boolean" | "address";
  picklistValues?: string[];
}

interface SessionResponse {
  valid?: boolean;
  intakeId?: string;
  status?: string;
  firstName?: string | null;
  lastName?: string | null;
  fields?: FieldDescriptor[];
  message?: string;
}

interface AddressValue {
  street: string;
  city: string;
  state: string;
  postalCode: string;
}

type FieldValue = string | AddressValue;

export default function DeepenIntakePage({ params }: { params: Promise<{ token: string }> }) {
  const [token, setToken] = useState("");
  const [state, setState] = useState<"loading" | "ready" | "submitting" | "done" | "error" | "already">("loading");
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [values, setValues] = useState<Record<string, FieldValue>>({});
  const [error, setError] = useState<string | null>(null);
  const openMarkedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const p = await params;
      if (cancelled) return;
      setToken(p.token);

      try {
        const res = await fetch(`/api/deepen/session?token=${encodeURIComponent(p.token)}`);
        const data = (await res.json()) as SessionResponse & { error?: string };
        if (!res.ok) {
          setError(data.error || "Unable to load form");
          setState("error");
          return;
        }
        if (data.status === "Submitted") {
          setSession(data);
          setState("already");
          return;
        }
        setSession(data);
        setState("ready");

        // Mark Opened (fire-and-forget)
        if (!openMarkedRef.current) {
          openMarkedRef.current = true;
          fetch("/api/deepen/open", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: p.token }),
          }).catch(() => {});
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params]);

  const updateField = useCallback((apiName: string, value: FieldValue) => {
    setValues((prev) => ({ ...prev, [apiName]: value }));
  }, []);

  const skipField = useCallback((apiName: string) => {
    setValues((prev) => {
      const next = { ...prev };
      delete next[apiName];
      return next;
    });
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!token) return;
    setState("submitting");
    setError(null);
    try {
      const res = await fetch("/api/deepen/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, values }),
      });
      const data = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || data.error) {
        setError(data.error || "Submit failed");
        setState("ready");
        return;
      }
      setState("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setState("ready");
    }
  }, [token, values]);

  const greeting = useMemo(() => {
    if (!session?.firstName) return "Hello";
    return `Hi, ${session.firstName}`;
  }, [session?.firstName]);

  if (state === "loading") {
    return <Shell>Loading your form...</Shell>;
  }

  if (state === "error") {
    return (
      <Shell>
        <h1>We hit a snag</h1>
        <p>{error || "Your link may have expired or already been used."}</p>
        <p>Please reach out to your Capital Wealth advisor — we will send a fresh link.</p>
      </Shell>
    );
  }

  if (state === "already") {
    return (
      <Shell>
        <h1>{greeting} — we already have what we need.</h1>
        <p>Thanks for submitting your details. See you at your next meeting.</p>
      </Shell>
    );
  }

  if (state === "done") {
    return (
      <Shell>
        <h1>Thanks, {session?.firstName || "there"}.</h1>
        <p>Your answers are saved. We will put them to work before our next meeting.</p>
      </Shell>
    );
  }

  const fields = session?.fields || [];

  return (
    <Shell>
      <h1>{greeting} — a few quick details</h1>
      <p style={{ marginBottom: "1.5rem" }}>
        We just need a few more details so we can make the most of our time together.
        Leave any field blank if you would rather answer it in person.
      </p>

      {fields.length === 0 ? (
        <p>Looks like we already have everything. You can close this page.</p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
        >
          {fields.map((f) => (
            <FieldRow
              key={f.apiName}
              descriptor={f}
              value={values[f.apiName]}
              onChange={(v) => updateField(f.apiName, v)}
              onSkip={() => skipField(f.apiName)}
            />
          ))}

          {error && (
            <div style={{ color: "#c0392b", margin: "1rem 0" }}>{error}</div>
          )}

          <button
            type="submit"
            disabled={state === "submitting"}
            style={{
              background: "#0a4d8c",
              color: "white",
              padding: "0.75rem 1.5rem",
              border: "none",
              borderRadius: "4px",
              fontSize: "1rem",
              cursor: "pointer",
              marginTop: "1rem",
            }}
          >
            {state === "submitting" ? "Saving..." : "Submit"}
          </button>
        </form>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main
      style={{
        maxWidth: "640px",
        margin: "0 auto",
        padding: "2rem 1rem",
        fontFamily: "system-ui, -apple-system, sans-serif",
        lineHeight: 1.5,
        color: "#222",
      }}
    >
      {children}
    </main>
  );
}

function FieldRow({
  descriptor,
  value,
  onChange,
  onSkip,
}: {
  descriptor: FieldDescriptor;
  value: FieldValue | undefined;
  onChange: (v: FieldValue) => void;
  onSkip: () => void;
}) {
  const labelStyle: React.CSSProperties = { display: "block", fontWeight: 600, marginBottom: "0.25rem" };
  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "0.5rem",
    border: "1px solid #ccc",
    borderRadius: "4px",
    fontSize: "1rem",
  };
  const rowStyle: React.CSSProperties = { marginBottom: "1.25rem" };

  const strVal = typeof value === "string" ? value : "";

  if (descriptor.type === "address") {
    const addr: AddressValue =
      value && typeof value === "object" ? value : { street: "", city: "", state: "", postalCode: "" };
    return (
      <div style={rowStyle}>
        <label style={labelStyle}>{descriptor.label}</label>
        <input
          type="text"
          placeholder="Street"
          style={{ ...inputStyle, marginBottom: "0.5rem" }}
          value={addr.street}
          onChange={(e) => onChange({ ...addr, street: e.target.value })}
        />
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: "0.5rem" }}>
          <input
            type="text"
            placeholder="City"
            style={inputStyle}
            value={addr.city}
            onChange={(e) => onChange({ ...addr, city: e.target.value })}
          />
          <input
            type="text"
            placeholder="State"
            style={inputStyle}
            value={addr.state}
            onChange={(e) => onChange({ ...addr, state: e.target.value })}
          />
          <input
            type="text"
            placeholder="ZIP"
            style={inputStyle}
            value={addr.postalCode}
            onChange={(e) => onChange({ ...addr, postalCode: e.target.value })}
          />
        </div>
        <SkipLink onSkip={onSkip} />
      </div>
    );
  }

  if (descriptor.type === "picklist") {
    return (
      <div style={rowStyle}>
        <label style={labelStyle}>{descriptor.label}</label>
        <select style={inputStyle} value={strVal} onChange={(e) => onChange(e.target.value)}>
          <option value="">— Select —</option>
          {(descriptor.picklistValues || []).map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
        <SkipLink onSkip={onSkip} />
      </div>
    );
  }

  if (descriptor.type === "textarea") {
    return (
      <div style={rowStyle}>
        <label style={labelStyle}>{descriptor.label}</label>
        <textarea
          style={{ ...inputStyle, minHeight: "80px" }}
          value={strVal}
          onChange={(e) => onChange(e.target.value)}
        />
        <SkipLink onSkip={onSkip} />
      </div>
    );
  }

  const htmlType =
    descriptor.type === "date"
      ? "date"
      : descriptor.type === "email"
      ? "email"
      : descriptor.type === "phone"
      ? "tel"
      : "text";

  return (
    <div style={rowStyle}>
      <label style={labelStyle}>{descriptor.label}</label>
      <input
        type={htmlType}
        style={inputStyle}
        value={strVal}
        onChange={(e) => onChange(e.target.value)}
      />
      <SkipLink onSkip={onSkip} />
    </div>
  );
}

function SkipLink({ onSkip }: { onSkip: () => void }) {
  return (
    <button
      type="button"
      onClick={onSkip}
      style={{
        background: "none",
        border: "none",
        color: "#0a4d8c",
        fontSize: "0.85rem",
        cursor: "pointer",
        padding: "0.25rem 0",
      }}
    >
      I'd rather answer this in person
    </button>
  );
}
