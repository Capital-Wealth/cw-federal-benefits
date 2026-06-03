"use client";

import { useState, useCallback, useEffect, useRef } from "react";

// ============================================================
// Types
// ============================================================

interface UploadedDoc { fileName: string; status: "uploading" | "uploaded" }
interface SessionInfo {
  session: { client_name: string; status: string };
  documents: { id: string; file_name: string; document_type: string }[];
  nextMeeting?: { date: string; type: string } | null;
  intakeType?: "federal" | "general";
}

interface FormData {
  preferredName: string;
  age: string;
  maritalStatus: string;
  spouseName: string;
  spousePreferredName: string;
  employmentStatus: string;
  employerName: string;
  hasAdvisor: string;
  advisorRepresentsEmployer: string;
  advisorRelationship: string;
  totalInvestableAssets: string;
  concerns: string[];
}

const CONCERN_OPTIONS = [
  "Retirement income planning",
  "Optimizing Social Security",
  "Reducing retirement taxes",
  "Healthcare costs in retirement",
  "Long-term care planning",
  "Leaving a legacy",
  "Managing market volatility",
  "Employer plan optimization",
];

const ASSET_RANGES = [
  "Under $100,000",
  "$100,000 – $250,000",
  "$250,000 – $500,000",
  "$500,000 – $1,000,000",
  "$1,000,000 – $3,000,000",
  "$3,000,000+",
];

const FEDERAL_DOCS = [
  "Leave & Earnings Statement (LES)",
  "SF-50 (Personnel Action)",
  "TSP Statement (Thrift Savings Plan)",
  "DD-214 (Military discharge)",
  "Social Security Statement",
  "Personal Benefits Statement",
];

const GENERAL_DOCS = [
  "IRA / Roth IRA statements",
  "401(k) / 403(b) statements",
  "Brokerage / investment statements",
  "Annuity statements",
  "Social Security statement",
  "Most recent tax return",
];

// ============================================================
// Component
// ============================================================

export default function IntakePortal({ params }: { params: Promise<{ token: string }> }) {
  const [token, setToken] = useState("");
  const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null);
  const [step, setStep] = useState(0); // 0=loading, 1=questionnaire, 2=upload, 3=done
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedDoc[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<FormData>({
    preferredName: "",
    age: "",
    maritalStatus: "",
    spouseName: "",
    spousePreferredName: "",
    employmentStatus: "",
    employerName: "",
    hasAdvisor: "",
    advisorRepresentsEmployer: "",
    advisorRelationship: "",
    totalInvestableAssets: "",
    concerns: [],
  });

  const isMarried = form.maritalStatus === "Married" || form.maritalStatus === "Domestic Partnership";
  const isEmployed = form.employmentStatus === "Working";
  const hasAdvisor = form.hasAdvisor === "Yes";

  // This portal serves BOTH federal (/portal/{token}) and general (/intake/{token})
  // The session API tells us which type it is
  const isFederal = sessionInfo?.intakeType === "federal";
  const docList = isFederal ? FEDERAL_DOCS : GENERAL_DOCS;

  useEffect(() => { params.then((p) => setToken(p.token)); }, [params]);

  useEffect(() => {
    if (!token) return;
    // Try federal session first, then RMM session
    fetch(`/api/intake?token=${token}`)
      .then(async (res) => {
        if (res.status === 410) { setExpired(true); return; }
        if (res.ok) {
          const data = await res.json();
          setSessionInfo({ ...data, intakeType: "federal" });
          setStep(1);
          return;
        }
        // Try non-federal
        const rmmRes = await fetch(`/api/rmm/session?token=${token}`);
        if (rmmRes.status === 410) { setExpired(true); return; }
        if (rmmRes.ok) {
          const data = await rmmRes.json();
          setSessionInfo({
            session: { client_name: data.intakeName || data.prefill?.firstName || "", status: data.status },
            documents: [],
            nextMeeting: data.nextMeeting,
            intakeType: "general",
          });
          setStep(1);
          return;
        }
        setError("Invalid or expired link. Please contact your advisor for a new one.");
      })
      .catch(() => setError("Unable to connect. Please try again."));
  }, [token]);

  const updateForm = (key: keyof FormData, value: unknown) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const toggleConcern = (label: string) => {
    setForm((prev) => ({
      ...prev,
      concerns: prev.concerns.includes(label)
        ? prev.concerns.filter((c) => c !== label)
        : [...prev.concerns, label],
    }));
  };

  const handleSubmitQuestionnaire = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const endpoint = isFederal ? "/api/intake" : "/api/rmm/questionnaire";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, ...form }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to save. Please try again.");
        setSubmitting(false);
        return;
      }
      setStep(2);
    } catch {
      setError("Connection failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpload = useCallback(async (files: File[]) => {
    if (files.length === 0) return;
    setUploading(true);
    setError(null);
    const newUploads: UploadedDoc[] = files.map((f) => ({ fileName: f.name, status: "uploading" as const }));
    setUploadedFiles((prev) => [...prev, ...newUploads]);

    for (const file of files) {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("token", token);
      formData.append("documentType", "Other");
      try {
        const res = await fetch("/api/upload", { method: "POST", body: formData });
        if (res.ok) {
          setUploadedFiles((prev) => prev.map((u) => u.fileName === file.name ? { ...u, status: "uploaded" as const } : u));
        } else {
          const data = await res.json().catch(() => ({}));
          setError(`Failed to upload ${file.name}: ${data.error || "Unknown error"}`);
          setUploadedFiles((prev) => prev.map((u) => u.fileName === file.name ? { ...u, status: "uploaded" as const } : u));
        }
      } catch {
        setError(`Failed to upload ${file.name}. Please try again.`);
      }
    }
    setUploading(false);
  }, [token]);

  const handleDrop = useCallback((e: React.DragEvent) => { e.preventDefault(); handleUpload(Array.from(e.dataTransfer.files)); }, [handleUpload]);
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    handleUpload(Array.from(e.target.files || []));
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [handleUpload]);

  const handleFinish = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const endpoint = isFederal ? "/api/intake" : "/api/rmm/complete";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, action: "complete" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to submit. Please try again.");
        setSubmitting(false);
        return;
      }
      // Reload session for meeting info
      try {
        const sRes = await fetch(`/api/rmm/session?token=${token}`);
        if (sRes.ok) {
          const data = await sRes.json();
          if (data.nextMeeting) {
            setSessionInfo((prev) => prev ? { ...prev, nextMeeting: data.nextMeeting } : prev);
          }
        }
      } catch { /* silent */ }
      setStep(3);
    } catch {
      setError("Connection failed. Please try again.");
    }
    setSubmitting(false);
  };

  // ============================================================
  // RENDER
  // ============================================================

  if (expired) return <Shell><Expired /></Shell>;
  if (error && !sessionInfo) return <Shell><ErrorPage message={error} /></Shell>;
  if (!sessionInfo || step === 0) return <Shell><div className="text-center py-20 text-zinc-500">Loading...</div></Shell>;

  const successUploads = uploadedFiles.filter((u) => u.status === "uploaded").length;

  // ---- STEP 1: Questionnaire ----
  if (step === 1) {
    return (
      <Shell>
        {/* Hero */}
        <div className="bg-[#16253C] text-white rounded-xl overflow-hidden mb-8">
          <div className="px-6 py-10 text-center sm:px-8">
            <img src="https://www.capitalwealth.com/assets/images/logos/logo-horizontal-white.png" alt="Capital Wealth" className="h-10 mx-auto mb-6" />
            <h1 className="text-2xl sm:text-3xl font-bold mb-2 text-balance whitespace-nowrap">Tell Us About You</h1>
            <p className="text-[#C7A356] text-lg font-semibold text-balance">YOUR STORY SHAPES YOUR RETIREMENT.</p>
          </div>
        </div>

        <div className="max-w-2xl mx-auto">
          <p className="text-center text-zinc-600 mb-1 font-semibold">We believe in relationships, not transactions.</p>
          <p className="text-center text-zinc-500 text-base mb-4">
            Spend 2-3 minutes answering a few quick questions so your advisor can prepare for your meeting.
          </p>

          {/* Video */}
          <div className="mb-6 rounded-lg overflow-hidden aspect-video">
            <iframe src="https://player.vimeo.com/video/1131424148"
              frameBorder="0" allow="autoplay; fullscreen" allowFullScreen className="w-full h-full" />
          </div>

          <div className="space-y-5">
            {/* Preferred Name */}
            <div>
              <label className="block text-base font-medium text-zinc-700 mb-1">What do you prefer to be called?</label>
              <input type="text" value={form.preferredName} onChange={(e) => updateForm("preferredName", e.target.value)}
                placeholder="e.g. Chip, Bobby, etc." className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-base" />
            </div>

            {/* Age */}
            <div>
              <label className="block text-base font-medium text-zinc-700 mb-1">How old are you?</label>
              <input type="number" value={form.age} onChange={(e) => updateForm("age", e.target.value)}
                placeholder="e.g. 57" className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-base" />
            </div>

            {/* Marital Status */}
            <div>
              <label className="block text-base font-medium text-zinc-700 mb-1">Marital status</label>
              <select value={form.maritalStatus} onChange={(e) => updateForm("maritalStatus", e.target.value)}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-base bg-white">
                <option value="">Select...</option>
                <option value="Single">Single</option>
                <option value="Married">Married</option>
                <option value="Divorced">Divorced</option>
                <option value="Widowed">Widowed</option>
                <option value="Domestic Partnership">Domestic Partnership</option>
              </select>
            </div>

            {/* Spouse fields — conditional */}
            {isMarried && (
              <div className="bg-zinc-50 rounded-lg p-4 space-y-4 border border-zinc-200">
                <div>
                  <label className="block text-base font-medium text-zinc-700 mb-1">Spouse / partner name</label>
                  <input type="text" value={form.spouseName} onChange={(e) => updateForm("spouseName", e.target.value)}
                    className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-base" />
                </div>
                <div>
                  <label className="block text-base font-medium text-zinc-700 mb-1">Spouse preferred name</label>
                  <input type="text" value={form.spousePreferredName} onChange={(e) => updateForm("spousePreferredName", e.target.value)}
                    placeholder="What do they go by?" className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-base" />
                </div>
              </div>
            )}

            {/* Employment */}
            <div>
              <label className="block text-base font-medium text-zinc-700 mb-1">Are you currently working or retired?</label>
              <div className="flex gap-3">
                {["Working", "Retired"].map((opt) => (
                  <button key={opt} type="button" onClick={() => updateForm("employmentStatus", opt)}
                    className={`flex-1 py-2.5 rounded-lg border text-base font-medium transition-colors ${
                      form.employmentStatus === opt
                        ? "bg-[#16253C] text-white border-[#16253C]"
                        : "bg-white text-zinc-700 border-zinc-300 hover:border-[#C7A356]"
                    }`}>{opt}</button>
                ))}
              </div>
            </div>

            {/* Employer — conditional */}
            {isEmployed && (
              <div>
                <label className="block text-base font-medium text-zinc-700 mb-1">Who is your employer?</label>
                <input type="text" value={form.employerName} onChange={(e) => updateForm("employerName", e.target.value)}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-base" />
              </div>
            )}

            {/* Has Advisor */}
            <div>
              <label className="block text-base font-medium text-zinc-700 mb-1">Do you currently work with a financial advisor?</label>
              <div className="flex gap-3">
                {["Yes", "No"].map((opt) => (
                  <button key={opt} type="button" onClick={() => updateForm("hasAdvisor", opt)}
                    className={`flex-1 py-2.5 rounded-lg border text-base font-medium transition-colors ${
                      form.hasAdvisor === opt
                        ? "bg-[#16253C] text-white border-[#16253C]"
                        : "bg-white text-zinc-700 border-zinc-300 hover:border-[#C7A356]"
                    }`}>{opt}</button>
                ))}
              </div>
            </div>

            {/* Advisor sub-questions — conditional */}
            {hasAdvisor && (
              <div className="bg-zinc-50 rounded-lg p-4 space-y-4 border border-zinc-200">
                <div>
                  <label className="block text-base font-medium text-zinc-700 mb-1">Does your advisor represent your employer-sponsored plan?</label>
                  <div className="flex gap-3">
                    {["Yes", "No", "Not sure"].map((opt) => (
                      <button key={opt} type="button" onClick={() => updateForm("advisorRepresentsEmployer", opt)}
                        className={`flex-1 py-2 rounded-lg border text-base transition-colors ${
                          form.advisorRepresentsEmployer === opt
                            ? "bg-[#16253C] text-white border-[#16253C]"
                            : "bg-white text-zinc-600 border-zinc-300"
                        }`}>{opt}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-base font-medium text-zinc-700 mb-1">Which best describes your relationship with your current advisor?</label>
                  <select value={form.advisorRelationship} onChange={(e) => updateForm("advisorRelationship", e.target.value)}
                    className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-base bg-white">
                    <option value="">Select...</option>
                    <option value="Would never switch">I would never switch advisors</option>
                    <option value="Looking to change">I'm looking to change advisors</option>
                    <option value="Not sure">I'm not sure</option>
                  </select>
                </div>
              </div>
            )}

            {/* Total Investable Assets */}
            <div>
              <label className="block text-base font-medium text-zinc-700 mb-1">Approximate total investable assets</label>
              <select value={form.totalInvestableAssets} onChange={(e) => updateForm("totalInvestableAssets", e.target.value)}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-base bg-white">
                <option value="">Select range...</option>
                {ASSET_RANGES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>

            {/* Financial Concerns */}
            <div>
              <label className="block text-base font-medium text-zinc-700 mb-2">What are you most interested in? <span className="text-zinc-400 font-normal">(select all that apply)</span></label>
              <div className="grid grid-cols-2 gap-2">
                {CONCERN_OPTIONS.map((c) => (
                  <button key={c} type="button" onClick={() => toggleConcern(c)}
                    className={`text-left text-base px-3 py-2.5 rounded-lg border transition-colors ${
                      form.concerns.includes(c)
                        ? "bg-[#16253C] text-white border-[#16253C]"
                        : "bg-white border-zinc-300 hover:border-[#C7A356] text-zinc-700"
                    }`}>{c}</button>
                ))}
              </div>
            </div>
          </div>

          {error && <div className="mt-4 bg-red-50 border border-red-200 rounded-lg px-4 py-3"><p className="text-base text-red-800">{error}</p></div>}

          <button onClick={handleSubmitQuestionnaire} disabled={submitting}
            className="w-full mt-8 py-3 bg-[#16253C] text-white rounded-lg font-semibold text-lg hover:bg-[#1E3456] disabled:opacity-50">
            {submitting ? "Saving..." : "Next — Upload Documents"}
          </button>
        </div>
      </Shell>
    );
  }

  // ---- STEP 2: Upload Docs ----
  if (step === 2) {
    return (
      <Shell>
        <div className="bg-[#16253C] text-white rounded-xl overflow-hidden mb-8">
          <div className="px-8 py-10 text-center">
            <img src="https://www.capitalwealth.com/assets/images/logos/logo-horizontal-white.png" alt="Capital Wealth" className="h-10 mx-auto mb-6" />
            <h1 className="text-3xl font-bold mb-2">Your Story, Our Roadmap</h1>
            <p className="text-[#C7A356] text-lg">Confidently and securely upload your documents</p>
          </div>
        </div>

        <div className="max-w-2xl mx-auto">
          <div className="mb-6 rounded-lg overflow-hidden">
            <iframe src="https://player.vimeo.com/video/1131424065" width="100%" height="340"
              frameBorder="0" allow="autoplay; fullscreen" allowFullScreen className="w-full" />
          </div>

          <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 mb-6">
            <div className="flex items-start gap-3">
              <span className="text-emerald-700">&#128274;</span>
              <p className="text-base text-emerald-800">Your documents are <strong>encrypted</strong> in transit and at rest. Only your assigned advisor can access them.</p>
            </div>
          </div>

          {/* Upload zone */}
          <div onDrop={handleDrop} onDragOver={(e) => e.preventDefault()}
            className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors mb-6 ${
              uploading ? "border-[#C7A356] bg-[#C7A356]/5" : "border-zinc-300 hover:border-[#C7A356]"
            }`}>
            {uploading ? (
              <div className="text-lg text-zinc-600 animate-pulse">Uploading securely... ({successUploads} of {uploadedFiles.length})</div>
            ) : (
              <div>
                <div className="text-4xl mb-3">&#128196;</div>
                <p className="text-zinc-900 font-medium text-lg mb-1">Drop all your documents here</p>
                <p className="text-base text-zinc-500 mb-4">PDF, JPEG, or PNG — multiple files at once</p>
                <label className="inline-flex px-6 py-3 bg-[#16253C] text-white rounded-lg font-medium cursor-pointer hover:bg-[#1E3456]">
                  Choose Files
                  <input ref={fileInputRef} type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png" multiple onChange={handleFileSelect} />
                </label>
              </div>
            )}
          </div>

          {/* What to upload — doc list varies by flow, label does not */}
          <div className="bg-white rounded-lg border border-zinc-200 p-5 mb-6">
            <p className="text-base font-semibold text-zinc-900 mb-3">
              Documents for your Capital Wealth Vault:
            </p>
            <div className="grid grid-cols-2 gap-2 text-base">
              {docList.map((doc) => (
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
              <p className="text-base font-semibold text-zinc-900 mb-2">Uploaded ({successUploads})</p>
              {uploadedFiles.map((f, i) => (
                <div key={i} className="flex items-center gap-2 text-base py-1">
                  <span className={f.status === "uploaded" ? "text-emerald-600" : "text-amber-500"}>
                    {f.status === "uploaded" ? "\u2713" : "\u23F3"}
                  </span>
                  <span className="text-zinc-700">{f.fileName}</span>
                </div>
              ))}
            </div>
          )}

          {error && <div className="mb-4 bg-red-50 border border-red-200 rounded-lg px-4 py-3"><p className="text-base text-red-800">{error}</p></div>}

          <div className="flex gap-4">
            <button onClick={() => setStep(1)}
              className="flex-1 py-3 border border-zinc-300 text-zinc-700 rounded-lg font-medium hover:bg-zinc-50">Back</button>
            <button onClick={handleFinish} disabled={submitting}
              className="flex-1 py-3 bg-[#16253C] text-white rounded-lg font-semibold hover:bg-[#1E3456] disabled:opacity-50">
              {submitting ? "Finishing..." : successUploads > 0 ? "Submit" : "Skip — Upload Later"}
            </button>
          </div>
        </div>
      </Shell>
    );
  }

  // ---- STEP 3: Thank You ----
  return (
    <Shell>
      <div className="max-w-2xl mx-auto">
        <div className="bg-[#16253C] text-white rounded-xl overflow-hidden mb-8 px-8 py-10 text-center">
          <img src="https://www.capitalwealth.com/assets/images/logos/logo-horizontal-white.png" alt="Capital Wealth" className="h-10 mx-auto mb-4" />
          <h1 className="text-3xl font-bold mb-3">Thank You!</h1>
          <p className="text-[#C7A356] text-lg">We appreciate you taking the time to complete this.</p>
        </div>

        {/* Meeting confirmation — primary focus */}
        <div className="bg-white rounded-xl border border-zinc-200 p-8 mb-6">
          {sessionInfo.nextMeeting ? (
            <div className="text-center">
              <p className="text-base font-medium text-zinc-500 mb-3">Your Meeting Is Confirmed</p>
              <p className="text-2xl font-bold text-zinc-900 mb-1">
                {new Date(sessionInfo.nextMeeting.date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
              </p>
              {sessionInfo.nextMeeting.date.includes("T") && (
                <p className="text-lg font-semibold text-[#16253C]">
                  {new Date(sessionInfo.nextMeeting.date).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                </p>
              )}
              <p className="text-base text-zinc-500 mt-2">{sessionInfo.nextMeeting.type}</p>
            </div>
          ) : (
            <div className="text-center">
              <p className="text-base font-medium text-zinc-500 mb-2">Next Step</p>
              <p className="text-zinc-700">Your advisor will reach out to confirm your meeting date and time.</p>
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-zinc-200 p-6">
          <p className="text-base font-semibold text-zinc-900 mb-3">What Happens Next</p>
          <div className="space-y-3">
            {["Our team analyzes your financial data",
              "Your Personalized Retirement Money Map is Prepared",
              "Your advisor walks you through the findings at your appointment"
            ].map((text, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-[#16253C] flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-bold text-[#C7A356]">{i + 1}</span>
                </div>
                <p className="text-base text-zinc-600">{text}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Blog — while you wait, learn from Capital Wealth insights */}
        <div className="mt-6">
          <div className="flex items-baseline justify-between mb-4">
            <p className="text-base font-semibold text-zinc-900">While You Wait — From Our Blog</p>
            <a href="https://www.capitalwealth.com/blog/" target="_blank" rel="noopener noreferrer"
               className="text-xs font-medium text-[#16253C] hover:text-[#C7A356] transition-colors">
              See all &rarr;
            </a>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              {
                href: "https://www.capitalwealth.com/blog/2026-retirement-forecast-jan-24-2026/",
                tag: "Outlook",
                title: "2026 Retirement Forecast",
                desc: "What retirees should expect from markets, rates, and policy this year.",
              },
              {
                href: "https://www.capitalwealth.com/blog/dependable-retirement-income-apr-12-2025/",
                tag: "Income",
                title: "Dependable Retirement Income",
                desc: "Turning your savings into a paycheck you can count on.",
              },
              {
                href: "https://www.capitalwealth.com/blog/estate-planning-primary-march2-2026/",
                tag: "Estate",
                title: "Estate Planning Essentials",
                desc: "What every Utah family needs in place before retirement.",
              },
            ].map((post) => (
              <a key={post.href} href={post.href} target="_blank" rel="noopener noreferrer"
                 className="group bg-white rounded-xl border border-zinc-200 p-5 hover:border-[#C7A356] hover:shadow-md transition-all">
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#C7A356] mb-2">{post.tag}</p>
                <p className="text-base font-semibold text-[#16253C] mb-1 group-hover:underline">{post.title}</p>
                <p className="text-xs text-zinc-600 leading-relaxed">{post.desc}</p>
                <p className="text-xs font-medium text-[#16253C] mt-3 group-hover:text-[#C7A356]">Read &rarr;</p>
              </a>
            ))}
          </div>
        </div>

        <p className="text-center text-xs text-zinc-400 mt-8">You may now close this window.</p>
      </div>
    </Shell>
  );
}

// ============================================================
// Sub-components
// ============================================================

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="bg-white border-b border-zinc-200 px-8 py-4">
        <div className="max-w-3xl mx-auto">
          <img src="https://www.capitalwealth.com/assets/images/logos/logo-horizontal-color.png" alt="Capital Wealth" className="h-8" />
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-8 py-8">{children}</main>
      <footer className="border-t border-zinc-200 bg-white px-8 py-6 mt-12">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-xs text-zinc-400">Capital Wealth &middot; Your responses are confidential and only used to prepare for your visit.</p>
        </div>
      </footer>
    </div>
  );
}

function Expired() {
  return (
    <div className="max-w-md mx-auto text-center py-20">
      <div className="text-5xl mb-4">&#128274;</div>
      <h1 className="text-2xl font-semibold text-zinc-900 mb-2">Link Expired</h1>
      <p className="text-zinc-600">Please contact your Capital Wealth advisor for a new link.</p>
    </div>
  );
}

function ErrorPage({ message }: { message: string }) {
  return (
    <div className="max-w-md mx-auto text-center py-20">
      <h1 className="text-2xl font-semibold text-zinc-900 mb-2">Unable to Load</h1>
      <p className="text-zinc-600">{message}</p>
    </div>
  );
}
