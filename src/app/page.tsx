"use client";
import React, { useState, useEffect } from "react";

interface ReportItem {
  email: string;
  status: "SUCCESS" | "FAILED";
  error?: string;
}

const STORAGE_KEY = "gmail_rotator_campaign";

export default function Home() {
  const [senderName, setSenderName] = useState("Babu");
  const [senderEmail, setSenderEmail] = useState("");
  const [appPassword, setAppPassword] = useState("");
  const [batchSize, setBatchSize] = useState<number>(15); // डिफ़ॉल्ट 15
  const [rawSheetData, setRawSheetData] = useState("");
  const [subject, setSubject] = useState("Quick question regarding your website");
  const [template, setTemplate] = useState(
    "I help businesses elevate their online presence with clean, fast, and modern responsive websites.\n\nWould you be open to a quick redesign preview for your site to see what it could look like?"
  );

  const [allEmails, setAllEmails] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<ReportItem[]>([]);
  const [isCampaignStarted, setIsCampaignStarted] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setAllEmails(parsed.allEmails || []);
        setCurrentIndex(parsed.currentIndex || 0);
        setReport(parsed.report || []);
        setSenderName(parsed.senderName || "Babu");
        setSenderEmail(parsed.senderEmail || "");
        setSubject(parsed.subject || "Quick question regarding your website");
        setTemplate(parsed.template || "");
        setBatchSize(parsed.batchSize || 15);
        setIsCampaignStarted(parsed.isCampaignStarted || false);
      } catch (e) {
        console.error("Local state parse error", e);
      }
    }
  }, []);

  const saveState = (
    emails: string[],
    idx: number,
    rep: ReportItem[],
    name: string,
    fromEmail: string,
    sub: string,
    tmpl: string,
    bSize: number,
    active: boolean
  ) => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        allEmails: emails,
        currentIndex: idx,
        report: rep,
        senderName: name.trim(),
        senderEmail: fromEmail.trim().toLowerCase(),
        subject: sub.trim(),
        template: tmpl.trim(),
        batchSize: bSize,
        isCampaignStarted: active,
      })
    );
  };

  const extractCleanEmails = (text: string): string[] => {
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const matches = text.match(emailRegex) || [];
    return Array.from(new Set(matches.map((e) => e.trim().toLowerCase())));
  };

  const handleStartCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    const emails = extractCleanEmails(rawSheetData);
    if (emails.length === 0) {
      alert("कृपया वैध ईमेल आईडी पेस्ट करें!");
      return;
    }

    const cleanName = senderName.trim();
    const cleanEmail = senderEmail.trim().toLowerCase();
    const cleanPass = appPassword.replace(/\s+/g, "");
    const cleanSub = subject.trim();
    const cleanTmpl = template.trim();

    setAllEmails(emails);
    setCurrentIndex(0);
    setReport([]);
    setIsCampaignStarted(true);

    saveState(emails, 0, [], cleanName, cleanEmail, cleanSub, cleanTmpl, batchSize, true);
    await executeBatch(emails, 0, batchSize, cleanName, cleanEmail, cleanPass, cleanSub, cleanTmpl);
  };

  const executeBatch = async (
    emailList: string[],
    startIdx: number,
    size: number,
    activeName: string,
    activeEmail: string,
    activePass: string,
    activeSub: string,
    activeTmpl: string
  ) => {
    const batchToSend = emailList.slice(startIdx, startIdx + size);
    if (batchToSend.length === 0) {
      alert("🎉 सभी ईमेल्स पूरे हो चुके हैं!");
      return;
    }

    if (!activeEmail || !activePass) {
      alert("कृपया इस लॉट के लिए Gmail ID और App Password भरें!");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/send-campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          senderName: activeName.trim(),
          senderEmail: activeEmail.trim().toLowerCase(),
          appPassword: activePass.replace(/\s+/g, ""),
          recipients: batchToSend,
          subject: activeSub.trim(),
          template: activeTmpl.trim(),
        }),
      });

      const data = await res.json();
      if (res.ok) {
        const updatedReport = [...report, ...data.report];
        const nextIdx = startIdx + batchToSend.length;

        setReport(updatedReport);
        setCurrentIndex(nextIdx);

        saveState(emailList, nextIdx, updatedReport, activeName, activeEmail, activeSub, activeTmpl, size, true);

        if (nextIdx < emailList.length) {
          alert(`✅ लॉट पूरा हुआ (${startIdx + 1} से ${nextIdx})!\nअब आप अगली Gmail ID और App Password बदलकर अगला लॉट भेज सकते हैं।`);
        }
      } else {
        alert(data.error || "डिलीवरी में त्रुटि आई!");
      }
    } catch (err) {
      alert("सर्वर से संपर्क नहीं हो पाया!");
    } finally {
      setLoading(false);
    }
  };

  const handleNextBatch = (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    executeBatch(
      allEmails,
      currentIndex,
      batchSize,
      senderName.trim(),
      senderEmail.trim().toLowerCase(),
      appPassword.replace(/\s+/g, ""),
      subject.trim(),
      template.trim()
    );
  };

  const handleFullReset = () => {
    if (loading) return;
    if (confirm("क्या आप वाकई पूरा कैंपेन रीसेट करना चाहते हैं?")) {
      localStorage.removeItem(STORAGE_KEY);
      setIsCampaignStarted(false);
      setAllEmails([]);
      setCurrentIndex(0);
      setReport([]);
      setRawSheetData("");
      setAppPassword("");
    }
  };

  const totalLeads = allEmails.length;
  const successCount = report.filter((r) => r.status === "SUCCESS").length;
  const remainingCount = Math.max(0, totalLeads - currentIndex);
  const currentBatchTarget = Math.min(batchSize, remainingCount);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 py-10 px-4">
      <div className="max-w-4xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-xl">
          <div>
            <h1 className="text-2xl font-bold bg-linear-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
              ReachOut Multi-Account Rotator
            </h1>
            <p className="text-slate-400 text-xs mt-0.5">
              हर लॉट पर नई Gmail ID और App Password बदलें | 100% Zero-Brevo/Direct SMTP
            </p>
          </div>
          <button
            type="button"
            disabled={loading}
            onClick={handleFullReset}
            className="px-4 py-2 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/30 rounded-xl text-xs font-semibold transition disabled:opacity-40"
          >
            🔄 Reset Campaign
          </button>
        </div>

        {/* Realtime Stats */}
        <div className="grid grid-cols-4 gap-3">
          <div className="bg-slate-900 p-4 rounded-xl border border-slate-800">
            <p className="text-[10px] text-slate-400 uppercase font-semibold">Total Leads</p>
            <p className="text-xl font-bold mt-1 text-slate-100">{totalLeads}</p>
          </div>
          <div className="bg-slate-900 p-4 rounded-xl border border-slate-800">
            <p className="text-[10px] text-indigo-400 uppercase font-semibold">Processed</p>
            <p className="text-xl font-bold text-indigo-400 mt-1">{currentIndex}</p>
          </div>
          <div className="bg-slate-900 p-4 rounded-xl border border-slate-800">
            <p className="text-[10px] text-emerald-400 uppercase font-semibold">Delivered</p>
            <p className="text-xl font-bold text-emerald-400 mt-1">{successCount}</p>
          </div>
          <div className="bg-slate-900 p-4 rounded-xl border border-slate-800">
            <p className="text-[10px] text-amber-400 uppercase font-semibold">Remaining</p>
            <p className="text-xl font-bold text-amber-400 mt-1">{remainingCount}</p>
          </div>
        </div>

        {/* STEP 1: INITIAL SETUP */}
        {!isCampaignStarted ? (
          <form onSubmit={handleStartCampaign} className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-5 shadow-xl">
            <div className="border-b border-slate-800 pb-2">
              <h2 className="text-sm font-semibold text-blue-400 uppercase tracking-wider">
                Step 1: Setup Campaign & Lot 1
              </h2>
            </div>

            {/* ROW 1: SENDER EMAIL & APP PASSWORD (2 Columns) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Sender Gmail ID (Auto-trimmed)</label>
                <input
                  type="email"
                  required
                  disabled={loading}
                  value={senderEmail}
                  onChange={(e) => setSenderEmail(e.target.value)}
                  onBlur={(e) => setSenderEmail(e.target.value.trim().toLowerCase())}
                  placeholder="account1@gmail.com"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 focus:border-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Gmail App Password (16-digits)</label>
                <input
                  type="password"
                  required
                  disabled={loading}
                  value={appPassword}
                  onChange={(e) => setAppPassword(e.target.value)}
                  onBlur={(e) => setAppPassword(e.target.value.replace(/\s+/g, ""))}
                  placeholder="xxxx xxxx xxxx xxxx"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-amber-300 font-mono focus:border-blue-500 outline-none"
                />
              </div>
            </div>

            {/* ROW 2: SENDER NAME & LOT SIZE (2 Columns) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Sender Name (Display Name)</label>
                <input
                  type="text"
                  required
                  disabled={loading}
                  value={senderName}
                  onChange={(e) => setSenderName(e.target.value)}
                  onBlur={(e) => setSenderName(e.target.value.trim())}
                  placeholder="e.g. Babu"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 focus:border-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Lot Size (Default 15)</label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  required
                  disabled={loading}
                  value={batchSize}
                  onChange={(e) => setBatchSize(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-blue-400 font-bold focus:border-blue-500 outline-none"
                />
              </div>
            </div>

            {/* ROW 3: SUBJECT LINE */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Subject Line</label>
              <input
                type="text"
                required
                disabled={loading}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                onBlur={(e) => setSubject(e.target.value.trim())}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 focus:border-blue-500 outline-none"
              />
            </div>

            {/* ROW 4: TARGET LEADS & TEMPLATE BODY (2 Columns) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Target Leads (Full Sheet List)</label>
                <textarea
                  rows={6}
                  required
                  disabled={loading}
                  value={rawSheetData}
                  onChange={(e) => setRawSheetData(e.target.value)}
                  placeholder="lead1@example.com&#10;lead2@example.com"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs font-mono text-slate-200 focus:border-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Message Core</label>
                <textarea
                  rows={6}
                  required
                  disabled={loading}
                  value={template}
                  onChange={(e) => setTemplate(e.target.value)}
                  onBlur={(e) => setTemplate(e.target.value.trim())}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-slate-100 focus:border-blue-500 outline-none"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-sm transition shadow-lg disabled:opacity-50"
            >
              {loading ? "Sending Lot 1..." : `🚀 Start Campaign & Send First ${batchSize} Leads`}
            </button>
          </form>
        ) : (
          /* STEP 2: LOT ROTATION DASHBOARD */
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-4 shadow-xl">
            {remainingCount > 0 ? (
              <form onSubmit={handleNextBatch} className="space-y-4 bg-slate-950/70 border border-slate-800 p-5 rounded-xl">
                <div className="border-b border-slate-800 pb-2 flex justify-between items-center">
                  <h3 className="text-sm font-bold text-blue-400">
                    Next Batch: Leads #{currentIndex + 1} to #{currentIndex + currentBatchTarget}
                  </h3>
                  <span className="text-xs text-amber-400 font-mono">Remaining: {remainingCount}</span>
                </div>

                {/* ROW 1: SENDER EMAIL & APP PASSWORD FOR THIS LOT (2 Columns) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">New Sender Gmail ID (Change Here)</label>
                    <input
                      type="email"
                      required
                      disabled={loading}
                      value={senderEmail}
                      onChange={(e) => setSenderEmail(e.target.value)}
                      onBlur={(e) => setSenderEmail(e.target.value.trim().toLowerCase())}
                      placeholder="account2@gmail.com"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">New App Password (Change Here)</label>
                    <input
                      type="password"
                      required
                      disabled={loading}
                      value={appPassword}
                      onChange={(e) => setAppPassword(e.target.value)}
                      onBlur={(e) => setAppPassword(e.target.value.replace(/\s+/g, ""))}
                      placeholder="xxxx xxxx xxxx xxxx"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-amber-300 font-mono outline-none"
                    />
                  </div>
                </div>

                {/* ROW 2: SENDER NAME & LOT SIZE (2 Columns) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Sender Name (Editable)</label>
                    <input
                      type="text"
                      required
                      disabled={loading}
                      value={senderName}
                      onChange={(e) => setSenderName(e.target.value)}
                      onBlur={(e) => setSenderName(e.target.value.trim())}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Lot Size</label>
                    <input
                      type="number"
                      min="1"
                      max="50"
                      required
                      disabled={loading}
                      value={batchSize}
                      onChange={(e) => setBatchSize(Number(e.target.value))}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-blue-400 font-bold outline-none"
                    />
                  </div>
                </div>

                {/* ROW 3: SUBJECT LINE */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Subject Line (Editable)</label>
                  <input
                    type="text"
                    required
                    disabled={loading}
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    onBlur={(e) => setSubject(e.target.value.trim())}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100 outline-none"
                  />
                </div>

                {/* ROW 4: MESSAGE CORE */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Message Core (Editable)</label>
                  <textarea
                    rows={4}
                    required
                    disabled={loading}
                    value={template}
                    onChange={(e) => setTemplate(e.target.value)}
                    onBlur={(e) => setTemplate(e.target.value.trim())}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-sm text-slate-100 outline-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-sm transition shadow-lg disabled:opacity-50"
                >
                  {loading ? "Sending next batch..." : `▶ Dispatch Next Lot (${currentBatchTarget} Leads)`}
                </button>
              </form>
            ) : (
              <div className="p-5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-center rounded-xl font-semibold text-sm">
                🎉 All {allEmails.length} leads have been processed successfully!
              </div>
            )}
          </div>
        )}

        {/* Live Delivery Audit Log */}
        {report.length > 0 && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
            <h2 className="text-sm font-bold text-slate-300 mb-3 uppercase tracking-wider">
              Live Delivery Audit ({report.length} Processed)
            </h2>
            <div className="divide-y divide-slate-800 max-h-60 overflow-y-auto pr-1">
              {report.map((r, i) => (
                <div key={i} className="py-2.5 flex items-center justify-between text-xs font-mono">
                  <span className="text-slate-300">{r.email}</span>
                  <span
                    className={`px-2 py-0.5 rounded-full ${
                      r.status === "SUCCESS"
                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                        : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                    }`}
                  >
                    {r.status} {r.error ? `• ${r.error}` : ""}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </main>
  );
}