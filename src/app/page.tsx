"use client";

import React, { useState, useEffect } from "react";
import { getClientMachineId } from "@/lib/fingerprint";

interface ReportItem {
  email: string;
  status: "SUCCESS" | "FAILED";
  error?: string;
}

const STORAGE_KEY = "gmail_rotator_campaign";
const SESSION_TOKEN_KEY = "reachout_daily_session_token";
const DEFAULT_BATCH_SIZE = 15;
const MAX_ALLOWED_BATCH_SIZE = 50;
const MIN_ALLOWED_BATCH_SIZE = 1;
const CHUNK_SIZE = 6;

export default function Home() {
  const [senderName, setSenderName] = useState("");
  const [senderEmail, setSenderEmail] = useState("");
  const [appPassword, setAppPassword] = useState("");
  const [batchSize, setBatchSize] = useState<number>(DEFAULT_BATCH_SIZE);
  const [rawSheetData, setRawSheetData] = useState("");
  const [subject, setSubject] = useState("");
  const [template, setTemplate] = useState("");
  const [customSignoffName, setCustomSignoffName] = useState("");

  const [allEmails, setAllEmails] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [progressStatus, setProgressStatus] = useState<string>("");
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
        setSenderName(parsed.senderName || "");
        setSenderEmail(parsed.senderEmail || "");
        setSubject(parsed.subject || "website design");
        setTemplate(parsed.template || "");
        setCustomSignoffName(parsed.customSignoffName ?? "");
        setBatchSize(parsed.batchSize || DEFAULT_BATCH_SIZE);
        setIsCampaignStarted(parsed.isCampaignStarted || false);
      } catch (e) {
        console.error("Local state parse error:", e);
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
    signName: string,
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
        customSignoffName: signName.trim(),
        batchSize: bSize,
        isCampaignStarted: active,
      })
    );
  };

  const handleBatchSizeChange = (val: string) => {
    if (val === "") {
      setBatchSize(0);
      return;
    }
    const num = parseInt(val, 10);
    if (!isNaN(num)) {
      setBatchSize(Math.min(num, MAX_ALLOWED_BATCH_SIZE));
    }
  };

  const handleBatchSizeBlur = () => {
    if (!batchSize || batchSize < MIN_ALLOWED_BATCH_SIZE) {
      setBatchSize(DEFAULT_BATCH_SIZE);
    } else if (batchSize > MAX_ALLOWED_BATCH_SIZE) {
      setBatchSize(MAX_ALLOWED_BATCH_SIZE);
    }
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
      alert("Please paste valid email addresses!");
      return;
    }

    const cleanName = senderName.trim();
    const cleanEmail = senderEmail.trim().toLowerCase();
    const cleanPass = appPassword.replace(/\s+/g, "");
    const cleanSub = subject.trim();
    const cleanTmpl = template.trim();
    const cleanSignName = customSignoffName.trim();
    const safeBatchSize = batchSize > 0 ? Math.min(batchSize, MAX_ALLOWED_BATCH_SIZE) : DEFAULT_BATCH_SIZE;

    setAllEmails(emails);
    setCurrentIndex(0);
    setReport([]);
    setIsCampaignStarted(true);

    saveState(emails, 0, [], cleanName, cleanEmail, cleanSub, cleanTmpl, cleanSignName, safeBatchSize, true);
    await executeBatch(emails, 0, safeBatchSize, cleanName, cleanEmail, cleanPass, cleanSub, cleanTmpl, cleanSignName);
  };

  const executeBatch = async (
    emailList: string[],
    startIdx: number,
    size: number,
    activeName: string,
    activeEmail: string,
    activePass: string,
    activeSub: string,
    activeTmpl: string,
    activeSignName: string
  ) => {
    const batchToSend = emailList.slice(startIdx, startIdx + size);
    if (batchToSend.length === 0) {
      alert("🎉 All leads have been processed successfully!");
      return;
    }

    if (!activeEmail || !activePass) {
      alert("Please fill in the Sender Email and App Password for this batch!");
      return;
    }

    setLoading(true);
    let currentReportState = [...report];
    let latestSessionToken = localStorage.getItem(SESSION_TOKEN_KEY) || "";
    let processedInThisBatch = 0;

    try {
      const machineId = getClientMachineId();

      for (let i = 0; i < batchToSend.length; i += CHUNK_SIZE) {
        const chunk = batchToSend.slice(i, i + CHUNK_SIZE);
        const startNum = i + 1;
        const endNum = Math.min(i + CHUNK_SIZE, batchToSend.length);

        setProgressStatus(`Dispatching batch leads ${startNum} to ${endNum} of ${batchToSend.length}...`);

        const res = await fetch("/api/send-campaign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            senderName: activeName.trim(),
            senderEmail: activeEmail.trim().toLowerCase(),
            appPassword: activePass.replace(/\s+/g, ""),
            recipients: chunk,
            subject: activeSub.trim(),
            template: activeTmpl.trim(),
            customSignoffName: activeSignName.trim(),
            machineId,
            sessionToken: latestSessionToken,
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          alert(`Execution Error: ${data.error || "Delivery halted unexpectedly"}`);
          break;
        }

        if (data.sessionToken) {
          latestSessionToken = data.sessionToken;
          localStorage.setItem(SESSION_TOKEN_KEY, latestSessionToken);
        }

        const chunkResults: ReportItem[] = data.report || [];
        currentReportState = [...currentReportState, ...chunkResults];
        processedInThisBatch += chunk.length;

        setReport([...currentReportState]);
        setCurrentIndex(startIdx + processedInThisBatch);
        saveState(
          emailList,
          startIdx + processedInThisBatch,
          currentReportState,
          activeName,
          activeEmail,
          activeSub,
          activeTmpl,
          activeSignName,
          size,
          true
        );
      }

      const finalIdx = startIdx + processedInThisBatch;
      if (finalIdx < emailList.length && processedInThisBatch === batchToSend.length) {
        alert(
          `✅ Batch completed (${startIdx + 1} to ${finalIdx})!\nYou can now change the Sender Account and App Password for the next batch.`
        );
      }
    } catch (err) {
      alert("Failed to connect to the server. Please check your connection!");
    } finally {
      setLoading(false);
      setProgressStatus("");
    }
  };

  const handleNextBatch = (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    const safeBatchSize = batchSize > 0 ? Math.min(batchSize, MAX_ALLOWED_BATCH_SIZE) : DEFAULT_BATCH_SIZE;

    executeBatch(
      allEmails,
      currentIndex,
      safeBatchSize,
      senderName.trim(),
      senderEmail.trim().toLowerCase(),
      appPassword.replace(/\s+/g, ""),
      subject.trim(),
      template.trim(),
      customSignoffName.trim()
    );
  };

  const handleFullReset = () => {
    if (loading) return;
    if (confirm("Are you sure you want to reset the entire campaign? All progress will be cleared.")) {
      localStorage.removeItem(STORAGE_KEY);
      setIsCampaignStarted(false);
      setAllEmails([]);
      setCurrentIndex(0);
      setReport([]);
      setRawSheetData("");
      setAppPassword("");
      setCustomSignoffName("Ruby");
      setBatchSize(DEFAULT_BATCH_SIZE);
      setProgressStatus("");
    }
  };

  const totalLeads = allEmails.length;
  const successCount = report.filter((r) => r.status === "SUCCESS").length;
  const remainingCount = Math.max(0, totalLeads - currentIndex);
  const currentBatchTarget = Math.min(batchSize || DEFAULT_BATCH_SIZE, remainingCount);

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
              Direct SMTP Inboxing | Dynamic Human Pacing & Name Customizer
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

        {/* Realtime Statistics */}
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

        {/* Progress Notification */}
        {loading && (
          <div className="bg-blue-500/10 border border-blue-500/30 p-4 rounded-xl flex items-center gap-3">
            <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-xs font-mono text-blue-300 font-semibold">{progressStatus}</p>
          </div>
        )}

        {/* STEP 1: INITIAL CAMPAIGN SETUP */}
        {!isCampaignStarted ? (
          <form onSubmit={handleStartCampaign} className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-5 shadow-xl">
            <div className="border-b border-slate-800 pb-2">
              <h2 className="text-sm font-semibold text-blue-400 uppercase tracking-wider">
                Step 1: Setup Campaign & Batch 1
              </h2>
            </div>

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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Sender Header Name (From Display)</label>
                <input
                  type="text"
                  required
                  disabled={loading}
                  value={senderName}
                  onChange={(e) => setSenderName(e.target.value)}
                  onBlur={(e) => setSenderName(e.target.value.trim())}
                  placeholder="e.g. Ruby"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 focus:border-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Batch Size (Max {MAX_ALLOWED_BATCH_SIZE})
                </label>
                <input
                  type="number"
                  min={MIN_ALLOWED_BATCH_SIZE}
                  max={MAX_ALLOWED_BATCH_SIZE}
                  required
                  disabled={loading}
                  value={batchSize || ""}
                  onChange={(e) => handleBatchSizeChange(e.target.value)}
                  onBlur={handleBatchSizeBlur}
                  placeholder={String(DEFAULT_BATCH_SIZE)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-blue-400 font-bold focus:border-blue-500 outline-none"
                />
              </div>
            </div>

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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Target Leads (Paste Sheet List)</label>
                <textarea
                  rows={5}
                  required
                  disabled={loading}
                  value={rawSheetData}
                  onChange={(e) => setRawSheetData(e.target.value)}
                  placeholder="lead1@example.com&#10;lead2@example.com"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs font-mono text-slate-200 focus:border-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Message Body</label>
                <textarea
                  rows={5}
                  required
                  disabled={loading}
                  value={template}
                  onChange={(e) => setTemplate(e.target.value)}
                  placeholder="Type your core pitch here..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-slate-100 focus:border-blue-500 outline-none"
                />
              </div>
            </div>

            {/* Custom Sign-off Name Input (Best regards will auto-randomize, you control the name below) */}
            <div>
              <label className="block text-xs font-semibold text-emerald-400 mb-1">
                Sign-off Bottom Name (e.g. Ruby, Neelam, Babu)
              </label>
              <input
                type="text"
                disabled={loading}
                value={customSignoffName}
                onChange={(e) => setCustomSignoffName(e.target.value)}
                onBlur={(e) => setCustomSignoffName(e.target.value.trim())}
                placeholder="e.g. Ruby"
                className="w-full bg-slate-950 border border-emerald-500/30 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 focus:border-emerald-500 outline-none font-semibold"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                💡 "Best regards,", "Thanks & regards,", etc. will auto-rotate with a clean 1-line space before this name.
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-sm transition shadow-lg disabled:opacity-50 flex justify-center items-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Dispatching Batch 1...</span>
                </>
              ) : (
                `🚀 Start Campaign & Send First ${batchSize || DEFAULT_BATCH_SIZE} Leads`
              )}
            </button>
          </form>
        ) : (
          /* STEP 2: BATCH ROTATION DASHBOARD */
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-4 shadow-xl">
            {remainingCount > 0 ? (
              <form onSubmit={handleNextBatch} className="space-y-4 bg-slate-950/70 border border-slate-800 p-5 rounded-xl">
                <div className="border-b border-slate-800 pb-2 flex justify-between items-center">
                  <h3 className="text-sm font-bold text-blue-400">
                    Next Batch: Leads #{currentIndex + 1} to #{currentIndex + currentBatchTarget}
                  </h3>
                  <span className="text-xs text-amber-400 font-mono">Remaining: {remainingCount}</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">New Sender Gmail ID (Change Account)</label>
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
                    <label className="block text-xs font-semibold text-slate-300 mb-1">New App Password (Change Account)</label>
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

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Sender Header Name (Editable)</label>
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
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Batch Size</label>
                    <input
                      type="number"
                      min={MIN_ALLOWED_BATCH_SIZE}
                      max={MAX_ALLOWED_BATCH_SIZE}
                      required
                      disabled={loading}
                      value={batchSize || ""}
                      onChange={(e) => handleBatchSizeChange(e.target.value)}
                      onBlur={handleBatchSizeBlur}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-blue-400 font-bold outline-none"
                    />
                  </div>
                </div>

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

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Message Body (Editable)</label>
                  <textarea
                    rows={3}
                    required
                    disabled={loading}
                    value={template}
                    onChange={(e) => setTemplate(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-sm text-slate-100 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-emerald-400 mb-1">Sign-off Bottom Name (Editable)</label>
                  <input
                    type="text"
                    disabled={loading}
                    value={customSignoffName}
                    onChange={(e) => setCustomSignoffName(e.target.value)}
                    onBlur={(e) => setCustomSignoffName(e.target.value.trim())}
                    className="w-full bg-slate-900 border border-emerald-500/30 rounded-xl px-3.5 py-2 text-sm text-slate-100 outline-none font-semibold"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-sm transition shadow-lg disabled:opacity-50 flex justify-center items-center gap-2"
                >
                  {loading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>Dispatching Next Batch...</span>
                    </>
                  ) : (
                    `▶ Dispatch Next Batch (${currentBatchTarget} Leads)`
                  )}
                </button>
              </form>
            ) : (
              <div className="p-5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-center rounded-xl font-semibold text-sm">
                🎉 All {allEmails.length} leads have been processed successfully!
              </div>
            )}
          </div>
        )}

        {/* Live Audit Log */}
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