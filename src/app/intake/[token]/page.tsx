"use client";

import { useState, useEffect, useCallback, useRef } from "react";

// ============================================================
// Types
// ============================================================

interface SessionData {
  intakeId: string;
  intakeName: string;
  status: string;
  prefill: {
    firstName?: string;
    lastName?: string;
    email?: string;
    dateOfBirth?: string;
    maritalStatus?: string;
    state?: string;
    spouseName?: string;
    spouseDob?: string;
  };
  nextMeeting?: { date: string; type: string } | null;
}

interface FormData {
  // Personal
  plannedRetirementAge: string;
  timeHorizon: string;
  riskTolerance: string;

  // What matters
  concerns: string[];
  meetingValue: string;
  primaryConcern: string;

  // Employment (if not in SF)
  employer: string;
  jobTitle: string;
  annualIncome: string;
  employmentStatus: string;

  // Quick financials
  totalInvestableAssets: string;
  monthlyExpenses: string;
  desiredRetirementIncome: string;
  receivingSS: boolean;

  // Is federal
  isFederalEmployee: boolean;
}

const CONCERNS = [
  { id: "outliving", label: "Outliving my savings" },
  { id: "ss", label: "Social Security uncertainty" },
  { id: "healthcare", label: "Healthcare costs" },
  { id: "ltc", label: "Long-term care" },
  { id: "legacy", label: "Leaving a legacy" },
  { id: "volatility", label: "Market volatility" },
  { id: "taxes", label: "Taxes in retirement" },
];

const ASSET_RANGES = [
  "Under $100,000",
  "$100,000 - $250,000",
  "$250,000 - $500,000",
  "$500,000 - $1,000,000",
  "$1,000,000 - $3,000,000",
  "$3,000,000+",
];

// ============================================================
// Component
// ============================================================

export default function IntakePortal({ params }: { params: Promise<{ token: string }> }) {
  const [token, setToken] = useState("");
  const [session, setSession] = useState<SessionData | null>(null);
  const [step, setStep] = useState(0); // 0=loading, 1=welcome+basics, 2=upload, 3=confirm
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<FormData>({
    plannedRetirementAge: "",
    timeHorizon: "",
    riskTolerance: "",
    concerns: [],
    meetingValue: "",
    primaryConcern: "",
    employer: "",
    jobTitle: "",
    annualIncome: "",
    employmentStatus: "",
    totalInvestableAssets: "",
    monthlyExpenses: "",
    desiredRetirementIncome: "",
    receivingSS: false,
    isFederalEmployee: false,
  });

  // Unwrap params
  useEffect(() => { params.then((p) => setToken(p.token)); }, [params]);

  // Load session
  useEffect(() => {
    if (!token) return;
    fetch(`/api/rmm/session?token=${token}`)
      .then(async (res) => {
        if (res.status === 410) { setExpired(true); return; }
        if (!res.ok) { setError("Invalid or expired link."); return; }
        const data = await res.json();
        setSession(data);
        setStep(1);
      })
      .catch(() => setError("Unable to connect. Please try again."));
  }, [token]);

  const updateForm = (key: keyof FormData, value: unknown) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const toggleConcern = (id: string) => {
    setForm((prev) => ({
      ...prev,
      concerns: prev.concerns.includes(id)
        ? prev.concerns.filter((c) => c !== id)
        : [...prev.concerns, id],
    }));
  };

  // Submit questionnaire answers
  const handleSubmitQuestionnaire = async () => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/rmm/questionnaire", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, ...form }),
      });
      if (!res.ok) throw new Error("Failed to save");
      setStep(2);
    } catch {
      setError("Failed to save your answers. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // Upload documents
  const handleUpload = useCallback(async (files: File[]) => {
    if (files.length === 0) return;
    setUploading(true);
    for (const file of files) {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("token", token);
      formData.append("intakeType", "rmm");
      formData.append("documentType", "Other");
      try {
        const res = await fetch("/api/upload", { method: "POST", body: formData });
        if (res.ok) setUploadedFiles((prev) => [...prev, file.name]);
      } catch { /* silent */ }
    }
    setUploading(false);
  }, [token]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    handleUpload(Array.from(e.dataTransfer.files));
  }, [handleUpload]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    handleUpload(Array.from(e.target.files || []));
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [handleUpload]);

  const handleFinish = async () => {
    setSubmitting(true);
    try {
      await fetch("/api/rmm/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      // Reload session to get meeting info
      const res = await fetch(`/api/rmm/session?token=${token}`);
      if (res.ok) setSession(await res.json());
    } catch { /* silent */ }
    setSubmitting(false);
    setStep(3);
  };

  // ============================================================
  // RENDER
  // ============================================================

  if (expired) {
    return (
      <Shell>
        <div className="max-w-md mx-auto text-center py-20">
          <div className="text-5xl mb-4">&#128274;</div>
          <h1 className="text-2xl font-semibold text-zinc-900 mb-2">Link Expired</h1>
          <p className="text-zinc-600">Please contact your Capital Wealth advisor for a new link.</p>
        </div>
      </Shell>
    );
  }

  if (error && !session) {
    return (
      <Shell>
        <div className="max-w-md mx-auto text-center py-20">
          <h1 className="text-2xl font-semibold text-zinc-900 mb-2">Unable to Load</h1>
          <p className="text-zinc-600">{error}</p>
        </div>
      </Shell>
    );
  }

  if (!session || step === 0) {
    return (
      <Shell>
        <div className="text-center py-20 text-zinc-500">Loading...</div>
      </Shell>
    );
  }

  // ---- STEP 1: Welcome + Basics ----
  if (step === 1) {
    return (
      <Shell>
        {/* Hero */}
        <div className="bg-[#16253C] text-white rounded-xl overflow-hidden mb-8">
          <div className="px-8 py-10 text-center">
            <img src="https://www.capitalwealth.com/assets/images/logos/logo-horizontal-white.png"
              alt="Capital Wealth" className="h-10 mx-auto mb-6" />
            <h1 className="text-3xl font-bold mb-2">Tell Us About You.</h1>
            <p className="text-[#C7A356] text-lg font-semibold">YOUR STORY SHAPES YOUR RETIREMENT.</p>
          </div>
        </div>

        <div className="max-w-2xl mx-auto">
          <p className="text-center text-zinc-600 mb-2 font-semibold">We believe in relationships, not transactions.</p>
          <p className="text-center text-zinc-500 text-sm mb-8">
            Spend 3-5 minutes on this short questionnaire so we can understand where you are today and what matters most.
            We'll use it to tailor your visit and explore how our Retirement Money Map can support your goals.
          </p>

          {/* Video embed */}
          <div className="mb-8 rounded-lg overflow-hidden">
            <iframe src="https://player.vimeo.com/video/1131424148" width="100%" height="360"
              frameBorder="0" allow="autoplay; fullscreen" allowFullScreen className="w-full" />
          </div>

          {/* Pre-filled info */}
          {session.prefill.firstName && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 mb-6">
              <p className="text-sm text-emerald-800">
                Welcome back, <strong>{session.prefill.firstName}</strong>. We've pre-filled some information for you.
              </p>
            </div>
          )}

          {/* Quick questions */}
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Planned Retirement Age</label>
                <input type="number" value={form.plannedRetirementAge}
                  onChange={(e) => updateForm("plannedRetirementAge", e.target.value)}
                  placeholder="65" className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Time Horizon</label>
                <select value={form.timeHorizon} onChange={(e) => updateForm("timeHorizon", e.target.value)}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm bg-white">
                  <option value="">Select...</option>
                  <option value="0-5 years">0-5 years</option>
                  <option value="5-10 years">5-10 years</option>
                  <option value="10-20 years">10-20 years</option>
                  <option value="20+ years">20+ years</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Are you a federal employee?</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input type="radio" name="federal" checked={form.isFederalEmployee}
                    onChange={() => updateForm("isFederalEmployee", true)} /> Yes
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="radio" name="federal" checked={!form.isFederalEmployee}
                    onChange={() => updateForm("isFederalEmployee", false)} /> No
                </label>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-2">What concerns you most about retirement?</label>
              <div className="grid grid-cols-2 gap-2">
                {CONCERNS.map((c) => (
                  <label key={c.id} className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                    form.concerns.includes(c.id) ? "bg-[#16253C] text-white border-[#16253C]" : "bg-white border-zinc-300 hover:border-[#C7A356]"
                  }`}>
                    <input type="checkbox" className="hidden" checked={form.concerns.includes(c.id)}
                      onChange={() => toggleConcern(c.id)} />
                    {c.label}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Approximate total investable assets</label>
              <select value={form.totalInvestableAssets} onChange={(e) => updateForm("totalInvestableAssets", e.target.value)}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm bg-white">
                <option value="">Select range...</option>
                {ASSET_RANGES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">
                What would make this meeting valuable to you?
              </label>
              <textarea value={form.meetingValue}
                onChange={(e) => updateForm("meetingValue", e.target.value)}
                placeholder="Tell us what's on your mind..."
                rows={3} className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm" />
            </div>
          </div>

          <button onClick={handleSubmitQuestionnaire} disabled={submitting}
            className="w-full mt-8 py-3 bg-[#16253C] text-white rounded-lg font-semibold text-lg hover:bg-[#1E3456] disabled:opacity-50 transition-colors">
            {submitting ? "Saving..." : "Continue to Document Upload"}
          </button>
        </div>
      </Shell>
    );
  }

  // ---- STEP 2: Upload Documents ----
  if (step === 2) {
    return (
      <Shell>
        <div className="bg-[#16253C] text-white rounded-xl overflow-hidden mb-8">
          <div className="px-8 py-10 text-center">
            <img src="https://www.capitalwealth.com/assets/images/logos/logo-horizontal-white.png"
              alt="Capital Wealth" className="h-10 mx-auto mb-6" />
            <h1 className="text-3xl font-bold mb-2">Your Story, Our Roadmap</h1>
            <p className="text-[#C7A356] text-lg">Confidently and securely upload your documents</p>
          </div>
        </div>

        <div className="max-w-2xl mx-auto">
          {/* Video */}
          <div className="mb-6 rounded-lg overflow-hidden">
            <iframe src="https://player.vimeo.com/video/1131424065" width="100%" height="360"
              frameBorder="0" allow="autoplay; fullscreen" allowFullScreen className="w-full" />
          </div>

          <p className="text-center text-zinc-600 text-sm mb-6">
            Watch the video to see exactly what to upload and why it matters.
            Our AI will automatically extract the important data — no manual entry needed.
          </p>

          {/* Security notice */}
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 mb-6">
            <div className="flex items-start gap-3">
              <span className="text-emerald-700">&#128274;</span>
              <p className="text-sm text-emerald-800">
                Your documents are <strong>encrypted</strong> in transit and at rest. Only your assigned advisor can access them.
              </p>
            </div>
          </div>

          {/* Upload zone */}
          <div onDrop={handleDrop} onDragOver={(e) => e.preventDefault()}
            className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors mb-6 ${
              uploading ? "border-[#C7A356] bg-[#C7A356]/5" : "border-zinc-300 hover:border-[#C7A356]"
            }`}>
            {uploading ? (
              <div className="text-lg text-zinc-600 animate-pulse">Uploading securely...</div>
            ) : (
              <div>
                <div className="text-4xl mb-3">&#128196;</div>
                <p className="text-zinc-900 font-medium text-lg mb-1">Drop all your documents here</p>
                <p className="text-sm text-zinc-500 mb-4">PDF, JPEG, or PNG — multiple files at once</p>
                <label className="inline-flex px-6 py-3 bg-[#16253C] text-white rounded-lg font-medium cursor-pointer hover:bg-[#1E3456]">
                  Choose Files
                  <input ref={fileInputRef} type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png" multiple onChange={handleFileSelect} />
                </label>
              </div>
            )}
          </div>

          {/* What to upload */}
          <div className="bg-white rounded-lg border border-zinc-200 p-5 mb-6">
            <p className="text-sm font-semibold text-zinc-900 mb-3">Documents we need:</p>
            <div className="grid grid-cols-2 gap-2 text-sm">
              {[
                "Social Security statement(s)",
                "Investment/brokerage statements",
                "401(k) / IRA statements",
                "Annuity statements",
                "Most recent tax return",
                "Life insurance policies",
              ].map((doc) => (
                <div key={doc} className="flex items-center gap-2">
                  <span className="text-[#C7A356]">&#9679;</span>
                  <span className="text-zinc-600">{doc}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Uploaded files */}
          {uploadedFiles.length > 0 && (
            <div className="mb-6">
              <p className="text-sm font-semibold text-zinc-900 mb-2">Uploaded ({uploadedFiles.length})</p>
              {uploadedFiles.map((f, i) => (
                <div key={i} className="flex items-center gap-2 text-sm py-1">
                  <span className="text-emerald-600">&#10003;</span>
                  <span className="text-zinc-700">{f}</span>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-4">
            <button onClick={() => setStep(1)}
              className="flex-1 py-3 border border-zinc-300 text-zinc-700 rounded-lg font-medium hover:bg-zinc-50">
              Back
            </button>
            <button onClick={handleFinish} disabled={submitting}
              className="flex-1 py-3 bg-[#16253C] text-white rounded-lg font-semibold hover:bg-[#1E3456] disabled:opacity-50">
              {submitting ? "Finishing..." : uploadedFiles.length > 0 ? "Submit & Finish" : "Skip & Finish Later"}
            </button>
          </div>
        </div>
      </Shell>
    );
  }

  // ---- STEP 3: Confirmation ----
  return (
    <Shell>
      <div className="max-w-2xl mx-auto">
        <div className="bg-[#16253C] text-white rounded-xl overflow-hidden mb-8 px-8 py-10 text-center">
          <div className="text-5xl mb-4">&#9989;</div>
          <h1 className="text-3xl font-bold mb-2">Thank You!</h1>
          <p className="text-[#C7A356] text-lg">Thank you for taking the time to complete this questionnaire.</p>
        </div>

        <div className="bg-white rounded-xl border border-zinc-200 p-6 mb-6">
          {session.nextMeeting ? (
            <div className="text-center mb-4">
              <p className="text-sm text-zinc-500 mb-1">Your Upcoming Appointment</p>
              <p className="text-xl font-semibold text-zinc-900">
                {new Date(session.nextMeeting.date).toLocaleDateString("en-US", {
                  weekday: "long", year: "numeric", month: "long", day: "numeric",
                })}
              </p>
              <p className="text-sm text-zinc-600">{session.nextMeeting.type}</p>
            </div>
          ) : (
            <p className="text-center text-zinc-600">
              Your advisor will review your information and reach out to schedule your Retirement Money Map session.
            </p>
          )}
        </div>

        <div className="bg-white rounded-xl border border-zinc-200 p-6">
          <p className="text-sm font-semibold text-zinc-900 mb-3">What Happens Next</p>
          <div className="space-y-3">
            {[
              "Your advisor reviews your questionnaire and documents",
              "Our AI analyzes your financial data automatically",
              "Your personalized Retirement Money Map is generated",
              "Your advisor walks you through the findings at your appointment",
            ].map((text, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-[#16253C] flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-bold text-[#C7A356]">{i + 1}</span>
                </div>
                <p className="text-sm text-zinc-600">{text}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="text-center text-xs text-zinc-400 mt-8">
          We will be in touch once we have a chance to review it. You may now close this window.
        </p>
      </div>
    </Shell>
  );
}

// ============================================================
// Shell wrapper
// ============================================================

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="bg-white border-b border-zinc-200 px-8 py-4">
        <div className="max-w-3xl mx-auto">
          <img src="https://www.capitalwealth.com/assets/images/logos/logo-horizontal-color.png"
            alt="Capital Wealth Advisors" className="h-8" />
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-8 py-8">{children}</main>
      <footer className="border-t border-zinc-200 bg-white px-8 py-6 mt-12">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-xs text-zinc-400">
            Capital Wealth Advisors &middot; Your responses are confidential and only used to prepare for your visit.
          </p>
        </div>
      </footer>
    </div>
  );
}
