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

const LOGO_URL = "https://www.capitalwealth.com/assets/images/logos/logo-icon-white.png";

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

  const firstName = session?.firstName?.trim() || "";

  if (state === "loading") {
    return (
      <BrandedShell firstName={firstName}>
        <div className="text-center py-12 text-zinc-500">Loading your form…</div>
      </BrandedShell>
    );
  }

  if (state === "error") {
    return (
      <BrandedShell firstName={firstName}>
        <div className="text-center py-6">
          <h2 className="text-xl font-semibold text-zinc-800 mb-2">We hit a snag.</h2>
          <p className="text-zinc-600 text-base mb-1">{error || "Your link may have expired or already been used."}</p>
          <p className="text-zinc-500 text-sm">Reply to your advisor email and we&apos;ll send a fresh link.</p>
        </div>
      </BrandedShell>
    );
  }

  if (state === "already") {
    return (
      <BrandedShell firstName={firstName}>
        <div className="text-center py-6">
          <h2 className="text-xl font-semibold text-zinc-800 mb-2">
            {firstName ? `Thanks, ${firstName}.` : "Thanks."}
          </h2>
          <p className="text-zinc-600 text-base">We already have what we need. See you at your next meeting.</p>
        </div>
      </BrandedShell>
    );
  }

  if (state === "done") {
    return (
      <BrandedShell firstName={firstName}>
        <div className="text-center py-6">
          <h2 className="text-xl font-semibold text-zinc-800 mb-2">
            {firstName ? `Thanks, ${firstName}.` : "Thanks."}
          </h2>
          <p className="text-zinc-600 text-base">Your answers are saved. We&apos;ll put them to work before our next meeting.</p>
        </div>
      </BrandedShell>
    );
  }

  const fields = session?.fields || [];

  return (
    <BrandedShell firstName={firstName}>
      <p className="text-zinc-700 text-base sm:text-lg mb-1 text-center font-semibold">
        {firstName ? `Hi ${firstName} — a few quick details.` : "A few quick details."}
      </p>
      <p className="text-zinc-500 text-sm sm:text-base mb-8 text-center text-balance">
        These help your advisor prepare. Skip anything you&apos;d rather answer in person.
      </p>

      {fields.length === 0 ? (
        <p className="text-zinc-500 text-center py-4">
          Looks like we already have everything. You can close this page.
        </p>
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
            <div className="mb-4 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="mt-2 text-center sm:text-left">
            <button
              type="submit"
              disabled={state === "submitting"}
              className="w-full sm:w-auto inline-block bg-[#16253C] text-white font-bold tracking-wider text-sm uppercase px-8 py-3.5 rounded-lg hover:bg-[#1f3554] disabled:opacity-60 transition-colors"
            >
              {state === "submitting" ? "Saving…" : "Submit my details"}
            </button>
          </div>
        </form>
      )}
    </BrandedShell>
  );
}

function BrandedShell({ firstName: _firstName, children }: { firstName?: string; children: React.ReactNode }) {
  // firstName reserved for future personalization in the hero (currently unused there)
  void _firstName;
  return (
    <main className="min-h-screen bg-[#f4f4f4] py-8 px-4" style={{ colorScheme: "light" }}>
      <div className="max-w-2xl mx-auto bg-white rounded-xl overflow-hidden shadow-sm">
        <div className="bg-[#16253C] text-white px-6 sm:px-8 py-10 text-center border-b-[3px] border-[#C7A356]">
          <img
            src={LOGO_URL}
            alt="Capital Wealth"
            width={44}
            height={34}
            className="block mx-auto mb-2"
            style={{ width: 44, height: "auto", border: 0 }}
          />
          <div className="text-[#C7A356] text-xs font-bold tracking-[0.2em] mb-3">CAPITAL WEALTH</div>
          <h1 className="font-serif text-2xl sm:text-3xl font-normal tracking-wide text-balance">TELL US ABOUT YOU</h1>
          <p className="text-[#C7A356] text-sm sm:text-base font-semibold mt-2 text-balance">
            YOUR STORY SHAPES YOUR RETIREMENT
          </p>
        </div>

        <div className="px-5 sm:px-10 py-8 text-zinc-900">{children}</div>

        <div className="bg-zinc-50 border-t border-zinc-200 px-6 py-5 text-center">
          <p className="text-zinc-500 text-xs">
            Capital Wealth · 1850 Ashton Blvd., Suite 175, Lehi, UT 84043 · 801.210.2800
          </p>
          <p className="text-zinc-400 text-[11px] mt-2">
            Advisory services offered through Capital Wealth, LLC, a State of Utah Registered Investment Advisor.
          </p>
        </div>
      </div>
    </main>
  );
}

const LABEL_CLASS = "block text-sm font-semibold text-zinc-700 mb-1.5";
const INPUT_CLASS =
  "w-full rounded-lg border border-zinc-300 px-3.5 py-2.5 text-base text-zinc-900 bg-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#C7A356]/40 focus:border-[#16253C]";
const ROW_CLASS = "mb-6";

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
  const strVal = typeof value === "string" ? value : "";

  if (descriptor.type === "address") {
    const addr: AddressValue =
      value && typeof value === "object" ? value : { street: "", city: "", state: "", postalCode: "" };
    return (
      <div className={ROW_CLASS}>
        <label className={LABEL_CLASS}>{descriptor.label}</label>
        <input
          type="text"
          placeholder="Street"
          className={`${INPUT_CLASS} mb-2`}
          value={addr.street}
          onChange={(e) => onChange({ ...addr, street: e.target.value })}
          autoComplete="street-address"
        />
        <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr_1fr] gap-2">
          <input
            type="text"
            placeholder="City"
            className={INPUT_CLASS}
            value={addr.city}
            onChange={(e) => onChange({ ...addr, city: e.target.value })}
            autoComplete="address-level2"
          />
          <input
            type="text"
            placeholder="State"
            className={INPUT_CLASS}
            value={addr.state}
            onChange={(e) => onChange({ ...addr, state: e.target.value })}
            autoComplete="address-level1"
          />
          <input
            type="text"
            placeholder="ZIP"
            className={INPUT_CLASS}
            value={addr.postalCode}
            onChange={(e) => onChange({ ...addr, postalCode: e.target.value })}
            autoComplete="postal-code"
          />
        </div>
        <SkipLink onSkip={onSkip} />
      </div>
    );
  }

  if (descriptor.type === "picklist") {
    return (
      <div className={ROW_CLASS}>
        <label className={LABEL_CLASS}>{descriptor.label}</label>
        <select className={INPUT_CLASS} value={strVal} onChange={(e) => onChange(e.target.value)}>
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
      <div className={ROW_CLASS}>
        <label className={LABEL_CLASS}>{descriptor.label}</label>
        <textarea
          className={`${INPUT_CLASS} min-h-[88px] resize-y`}
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
    <div className={ROW_CLASS}>
      <label className={LABEL_CLASS}>{descriptor.label}</label>
      <input
        type={htmlType}
        className={INPUT_CLASS}
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
      className="text-zinc-400 hover:text-[#16253C] text-xs underline underline-offset-2 mt-1.5"
    >
      Skip this — I&apos;ll share in person
    </button>
  );
}
