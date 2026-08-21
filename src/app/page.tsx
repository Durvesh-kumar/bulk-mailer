// src/app/page.tsx
"use client";

import React, { useState, useEffect } from "react";
import { getClientMachineId } from "@/lib/fingerprint";
import SuspendedScreen from "@/components/SuspendedScreen";
import ReferralBanner from "@/components/ReferralBanner";

const STORAGE_KEY = "inboxsend_queue_session";
const SESSION_TOKEN_KEY = "reachout_daily_session_token";
const DEFAULT_BATCH_SIZE = 15;
const MAX_ALLOWED_BATCH_SIZE = 100;
const MIN_ALLOWED_BATCH_SIZE = 1;
const CHUNK_SIZE = 10;

export default function Home() {
  // 🔒 लाइसेंस और डिवाइस स्टेट्स
  const [loadingLicense, setLoadingLicense] = useState(true);
  const [isSuspended, setIsSuspended] = useState(false);
  const [userType, setUserType] = useState<"NEW_USER" | "SUSPENDED" | "EXPIRED">("NEW_USER");
  const [expiryDate, setExpiryDate] = useState("");
  const [machineId, setMachineId] = useState("");
  const [appDomain, setAppDomain] = useState("");

  // फॉर्म और कैंपेन स्टेट्स
  const [senderName, setSenderName] = useState("");
  const [senderEmail, setSenderEmail] = useState("");
  const [appPassword, setAppPassword] = useState("");
  const [batchSize, setBatchSize] = useState<number>(DEFAULT_BATCH_SIZE);
  const [rawSheetData, setRawSheetData] = useState("");
  const [subject, setSubject] = useState("");
  const [template, setTemplate] = useState("");
  const [customSignoffName, setCustomSignoffName] = useState("");

  // 🎯 कतार (Queue) आधारित स्टेट्स
  const [pendingEmails, setPendingEmails] = useState<string[]>([]); // सिर्फ बची हुई ईमेल
  const [initialTotalCount, setInitialTotalCount] = useState<number>(0); // ओरिजिनल कुल ईमेल
  const [processedCount, setProcessedCount] = useState<number>(0); // भेजी जा चुकी ईमेल की संख्या
  const [successCount, setSuccessCount] = useState<number>(0);
  
  const [loading, setLoading] = useState(false);
  const [progressStatus, setProgressStatus] = useState<string>("");
  const [isCampaignStarted, setIsCampaignStarted] = useState(false);
  const [lastBatchMessage, setLastBatchMessage] = useState<string>("");

  // 1️⃣ लाइसेंस वेरिफिकेशन
  useEffect(() => {
    async function initSecurityAndLicense() {
      try {
        const currentDomain = window.location.hostname;
        setAppDomain(currentDomain);

        const currentMachineId = await getClientMachineId();
        setMachineId(currentMachineId);

        const savedSession = localStorage.getItem(SESSION_TOKEN_KEY) || "";

        const res = await fetch("/api/check-license", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            machineId: currentMachineId,
            domain: currentDomain,
            sessionToken: savedSession,
          }),
        });

        const data = await res.json();

        if (!res.ok || !data.allowed) {
          setIsSuspended(true);
          if (data.reason === "EXPIRED") {
            setUserType("EXPIRED");
            setExpiryDate(data.expiryDate || "Expired");
          } else if (data.reason === "NEW_DEVICE") {
            setUserType("NEW_USER");
          } else {
            setUserType("SUSPENDED");
          }
        } else {
          setIsSuspended(false);
          if (data.sessionToken) {
            localStorage.setItem(SESSION_TOKEN_KEY, data.sessionToken);
          }
        }
      } catch {
        setIsSuspended(true);
        setUserType("NEW_USER");
      } finally {
        setLoadingLicense(false);
      }
    }

    initSecurityAndLicense();
  }, []);

  // 2️⃣ लोकल स्टोरेज से एक्टिव कतार लोड करना
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setPendingEmails(parsed.pendingEmails || []);
        setInitialTotalCount(parsed.initialTotalCount || 0);
        setProcessedCount(parsed.processedCount || 0);
        setSuccessCount(parsed.successCount || 0);
        setSenderName(parsed.senderName || "");
        setSenderEmail(parsed.senderEmail || "");
        setSubject(parsed.subject || "website design");
        setTemplate(parsed.template || "");
        setCustomSignoffName(parsed.customSignoffName ?? "");
        setBatchSize(parsed.batchSize || DEFAULT_BATCH_SIZE);
        setIsCampaignStarted(parsed.isCampaignStarted || false);
        if (parsed.pendingEmails && parsed.pendingEmails.length > 0) {
          setRawSheetData(parsed.pendingEmails.join("\n"));
        }
      } catch (e) {
        console.error("Local queue parse error:", e);
      }
    }
  }, []);

  // 💾 केवल बची हुई (Pending) ईमेल और काउंट्स सेव करना
  const saveQueueState = (
    remainingList: string[],
    totalInit: number,
    processed: number,
    delivered: number,
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
        pendingEmails: remainingList,
        initialTotalCount: totalInit,
        processedCount: processed,
        successCount: delivered,
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

  // 🚀 Step 1: कैंपेन शुरू करना
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

    setPendingEmails(emails);
    setInitialTotalCount(emails.length);
    setProcessedCount(0);
    setSuccessCount(0);
    setIsCampaignStarted(true);
    setLastBatchMessage("");

    saveQueueState(emails, emails.length, 0, 0, cleanName, cleanEmail, cleanSub, cleanTmpl, cleanSignName, safeBatchSize, true);
    await consumeQueueBatch(emails, emails.length, 0, 0, safeBatchSize, cleanName, cleanEmail, cleanPass, cleanSub, cleanTmpl, cleanSignName);
  };

  // ⚙️ कतार को प्रोसेस और रिमूव करने वाला कोर इंजन
  const consumeQueueBatch = async (
    currentQueue: string[],
    totalInit: number,
    currentProcessed: number,
    currentSuccess: number,
    size: number,
    activeName: string,
    activeEmail: string,
    activePass: string,
    activeSub: string,
    activeTmpl: string,
    activeSignName: string
  ) => {
    if (currentQueue.length === 0) {
      alert("🎉 All leads have been processed successfully!");
      return;
    }

    if (!activeEmail || !activePass) {
      alert("Please fill in the Sender Email and App Password for this batch!");
      return;
    }

    setLoading(true);
    setLastBatchMessage("");
    let latestSessionToken = localStorage.getItem(SESSION_TOKEN_KEY) || "";
    
    // इस बैच के लिए लीड्स निकालें (हमेशा Index 0 से)
    const batchToSend = currentQueue.slice(0, size);
    let workingQueue = [...currentQueue];
    let updatedProcessed = currentProcessed;
    let updatedSuccess = currentSuccess;

    try {
      const currentMachineId = await getClientMachineId();

      for (let i = 0; i < batchToSend.length; i += CHUNK_SIZE) {
        const chunk = batchToSend.slice(i, i + CHUNK_SIZE);
        const startNum = i + 1;
        const endNum = Math.min(i + CHUNK_SIZE, batchToSend.length);

        setProgressStatus(`Dispatching queue batch ${startNum} to ${endNum} of ${batchToSend.length}...`);

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
            machineId: currentMachineId,
            sessionToken: latestSessionToken,
          }),
        });

        const data = await res.json();

        if (res.status === 403) {
          setIsSuspended(true);
          if (data.reason === "EXPIRED") {
            setUserType("EXPIRED");
            setExpiryDate(data.expiryDate || "Expired");
          } else if (data.reason === "NEW_DEVICE") {
            setUserType("NEW_USER");
          } else {
            setUserType("SUSPENDED");
          }
          if (data.clearSession) {
            localStorage.removeItem(SESSION_TOKEN_KEY);
          }
          break;
        }

        if (!res.ok) {
          alert(`Execution Error: ${data.error || "Delivery halted unexpectedly"}`);
          break;
        }

        if (data.sessionToken) {
          latestSessionToken = data.sessionToken;
          localStorage.setItem(SESSION_TOKEN_KEY, latestSessionToken);
        }

        const chunkResults: { status: string }[] = data.report || [];
        const chunkSuccess = chunkResults.filter((r) => r.status === "SUCCESS").length;
        
        // ✂️ जादुई लाइन: भेजी जा चुकी चंक को कतार से हमेशा के लिए हटा दें
        workingQueue = workingQueue.slice(chunk.length);
        updatedProcessed += chunk.length;
        updatedSuccess += chunkSuccess;

        // स्टेट्स अपडेट
        setPendingEmails([...workingQueue]);
        setProcessedCount(updatedProcessed);
        setSuccessCount(updatedSuccess);

        // 💾 लोकल स्टोरेज में भी केवल बची हुई ईमेल ही रहेंगी
        saveQueueState(
          workingQueue,
          totalInit,
          updatedProcessed,
          updatedSuccess,
          activeName,
          activeEmail,
          activeSub,
          activeTmpl,
          activeSignName,
          size,
          true
        );
      }

      if (batchToSend.length > 0) {
        setLastBatchMessage(`✅ Batch of ${batchToSend.length} leads dispatched & removed from queue! Ready for next account.`);
      }
    } catch {
      alert("Failed to connect to the server. Please check your connection!");
    } finally {
      setLoading(false);
      setProgressStatus("");
    }
  };

  // ▶️ अगला बैच भेजना (हमेशा 0 से उठाएगा)
  const handleNextBatch = (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    const safeBatchSize = batchSize > 0 ? Math.min(batchSize, MAX_ALLOWED_BATCH_SIZE) : DEFAULT_BATCH_SIZE;

    consumeQueueBatch(
      pendingEmails,
      initialTotalCount,
      processedCount,
      successCount,
      safeBatchSize,
      senderName.trim(),
      senderEmail.trim().toLowerCase(),
      appPassword.replace(/\s+/g, ""),
      subject.trim(),
      template.trim(),
      customSignoffName.trim()
    );
  };

  // 🔄 पूरा रीसेट: कतार, काउंट्स और लोकल स्टोरेज सब 100% खाली
  const handleFullReset = () => {
    if (loading) return;
    if (confirm("Are you sure you want to reset the entire campaign? All progress and queue will be cleared.")) {
      localStorage.removeItem(STORAGE_KEY);
      setIsCampaignStarted(false);
      setPendingEmails([]);
      setInitialTotalCount(0);
      setProcessedCount(0);
      setSuccessCount(0);
      setRawSheetData("");
      setAppPassword("");
      setSenderEmail("");
      setSenderName("");
      setSubject("website design");
      setTemplate("");
      setCustomSignoffName("Ruby");
      setBatchSize(DEFAULT_BATCH_SIZE);
      setProgressStatus("");
      setLastBatchMessage("");
    }
  };

  if (loadingLicense) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-400 text-xs font-mono gap-3">
        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
        <span className="tracking-wide">Verifying Security Gateway & License...</span>
      </div>
    );
  }

  if (isSuspended) {
    return (
      <SuspendedScreen
        machineId={machineId}
        appDomain={appDomain}
        userType={userType}
        expiryDate={expiryDate}
        adminPhone="+918266821377"
        adminEmail="inboxsend.support@gmail.com"
      />
    );
  }

  const remainingCount = pendingEmails.length;
  const currentBatchTarget = Math.min(batchSize || DEFAULT_BATCH_SIZE, remainingCount);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 py-8 px-4 selection:bg-indigo-500 selection:text-white">
      <div className="max-w-4xl mx-auto space-y-6">

        <ReferralBanner />
        
        {/* Main Header */}
        <div className="bg-slate-900/90 backdrop-blur-xl border border-slate-800 p-6 rounded-3xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-2xl relative overflow-hidden">
          <div className="space-y-1 z-10">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_10px_rgba(52,211,153,0.8)]" />
              <h1 className="text-2xl font-black bg-gradient-to-r from-blue-400 via-indigo-300 to-purple-400 bg-clip-text text-transparent tracking-tight">
                InboxSend Multi-Account Rotator
              </h1>
            </div>
            <p className="text-slate-400 text-xs font-medium">
              Enterprise Multi-Channel Delivery Engine | Dynamic Queue Consumption & High-Priority Inbox Placement
            </p>
          </div>

          <button
            type="button"
            disabled={loading}
            onClick={handleFullReset}
            className="z-10 px-4 py-2 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 rounded-xl text-xs font-bold transition duration-200 disabled:opacity-40 cursor-pointer shadow-sm active:scale-95 flex items-center gap-1.5"
          >
            <span>🔄</span> Reset Campaign
          </button>
        </div>

        {/* 🔢 Realtime Queue Statistics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-slate-900/70 backdrop-blur-md p-4 rounded-2xl border border-slate-800/80 shadow-lg">
            <p className="text-[10px] text-slate-400 uppercase font-black tracking-wider">Total Leads</p>
            <p className="text-2xl font-black mt-1 text-slate-100 font-mono">{initialTotalCount}</p>
          </div>
          <div className="bg-slate-900/70 backdrop-blur-md p-4 rounded-2xl border border-indigo-500/20 shadow-lg">
            <p className="text-[10px] text-indigo-400 uppercase font-black tracking-wider">Processed</p>
            <p className="text-2xl font-black text-indigo-400 mt-1 font-mono">{processedCount}</p>
          </div>
          <div className="bg-slate-900/70 backdrop-blur-md p-4 rounded-2xl border border-emerald-500/20 shadow-lg">
            <p className="text-[10px] text-emerald-400 uppercase font-black tracking-wider">Delivered</p>
            <p className="text-2xl font-black text-emerald-400 mt-1 font-mono">{successCount}</p>
          </div>
          <div className="bg-slate-900/70 backdrop-blur-md p-4 rounded-2xl border border-amber-500/20 shadow-lg">
            <p className="text-[10px] text-amber-400 uppercase font-black tracking-wider">In Queue</p>
            <p className="text-2xl font-black text-amber-400 mt-1 font-mono">{remainingCount}</p>
          </div>
        </div>

        {/* Progress Alert */}
        {loading && (
          <div className="bg-indigo-950/40 border border-indigo-500/30 p-4 rounded-2xl flex items-center gap-3 shadow-xl animate-pulse">
            <div className="w-5 h-5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-xs font-mono text-indigo-300 font-bold">{progressStatus}</p>
          </div>
        )}

        {lastBatchMessage && !loading && (
          <div className="bg-emerald-950/30 border border-emerald-500/30 p-4 rounded-2xl flex items-center justify-between text-xs text-emerald-300 font-medium">
            <span>{lastBatchMessage}</span>
            <button onClick={() => setLastBatchMessage("")} className="text-slate-400 hover:text-white text-xs">✕</button>
          </div>
        )}

        {/* STEP 1: INITIAL CAMPAIGN SETUP */}
        {!isCampaignStarted ? (
          <form onSubmit={handleStartCampaign} className="bg-slate-900/90 backdrop-blur-xl border border-slate-800 p-6 sm:p-7 rounded-3xl space-y-5 shadow-2xl">
            <div className="border-b border-slate-800 pb-3 flex items-center justify-between">
              <h2 className="text-xs font-black text-indigo-400 uppercase tracking-widest flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-indigo-400" />
                Step 1: Setup Campaign & Target Queue
              </h2>
              <span className="text-[11px] text-slate-500 font-mono">Zero-Duplicate Engine</span>
            </div>

            {/* Row 1: Credentials */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">Sender Google Account ID</label>
                <input
                  type="email"
                  required
                  disabled={loading}
                  value={senderEmail}
                  onChange={(e) => setSenderEmail(e.target.value)}
                  onBlur={(e) => setSenderEmail(e.target.value.trim().toLowerCase())}
                  placeholder="account1@gmail.com"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-100 focus:border-indigo-500 outline-none transition"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">App Password (16-digits)</label>
                <input
                  type="password"
                  required
                  disabled={loading}
                  value={appPassword}
                  onChange={(e) => setAppPassword(e.target.value)}
                  onBlur={(e) => setAppPassword(e.target.value.replace(/\s+/g, ""))}
                  placeholder="xxxx xxxx xxxx xxxx"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-amber-300 font-mono focus:border-indigo-500 outline-none transition"
                />
              </div>
            </div>

            {/* Row 2: Target Leads (Left) + Header Name & Batch Size (Right) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">Target Leads (Paste Sheet Column)</label>
                <textarea
                  rows={7}
                  required
                  disabled={loading}
                  value={rawSheetData}
                  onChange={(e) => setRawSheetData(e.target.value)}
                  placeholder="lead1@example.com&#10;lead2@example.com&#10;lead3@example.com"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-xs font-mono text-slate-200 focus:border-indigo-500 outline-none resize-none leading-relaxed"
                />
              </div>

              <div className="space-y-4 flex flex-col justify-center">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">Sender Header Display Name</label>
                  <input
                    type="text"
                    required
                    disabled={loading}
                    value={senderName}
                    onChange={(e) => setSenderName(e.target.value)}
                    onBlur={(e) => setSenderName(e.target.value.trim())}
                    placeholder="e.g. Ruby Support"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-100 focus:border-indigo-500 outline-none transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">
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
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-indigo-400 font-black focus:border-indigo-500 outline-none transition [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>
              </div>
            </div>

            {/* Row 3: Subject */}
            <div className="w-full">
              <label className="block text-xs font-bold text-slate-300 mb-1.5">Subject Line</label>
              <input
                type="text"
                required
                disabled={loading}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                onBlur={(e) => setSubject(e.target.value.trim())}
                placeholder="e.g. Quick question regarding website design"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-100 focus:border-indigo-500 outline-none transition"
              />
            </div>

            {/* Row 4: Message Body */}
            <div className="w-full">
              <label className="block text-xs font-bold text-slate-300 mb-1.5">Email Body Template</label>
              <textarea
                rows={6}
                required
                disabled={loading}
                value={template}
                onChange={(e) => setTemplate(e.target.value)}
                placeholder="Type your outreach message here..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-sm text-slate-100 focus:border-indigo-500 outline-none leading-relaxed resize-none transition"
              />
            </div>

            {/* Row 5: Dynamic Signoff Name */}
            <div className="w-full bg-slate-950/60 p-4 rounded-2xl border border-slate-800/80">
              <label className="block text-xs font-bold text-emerald-400 mb-1.5">
                Dynamic Sign-off Name (e.g. Ruby, Neelam, Babu)
              </label>
              <input
                type="text"
                disabled={loading}
                value={customSignoffName}
                onChange={(e) => setCustomSignoffName(e.target.value)}
                onBlur={(e) => setCustomSignoffName(e.target.value.trim())}
                placeholder="e.g. Ruby"
                className="w-full bg-slate-900 border border-emerald-500/30 rounded-xl px-4 py-2.5 text-sm text-slate-100 focus:border-emerald-500 outline-none font-bold transition"
              />
              <p className="text-[11px] text-slate-400 mt-1.5">
                💡 Human-like signoffs will auto-rotate dynamically above this name.
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-black rounded-2xl text-sm transition shadow-xl disabled:opacity-50 flex justify-center items-center gap-2 cursor-pointer active:scale-[0.99]"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Dispatching Batch 1...</span>
                </>
              ) : (
                `🚀 Launch Campaign & Send Batch 1 (${batchSize || DEFAULT_BATCH_SIZE} Leads)`
              )}
            </button>
          </form>
        ) : (
          /* STEP 2: BATCH ROTATION DASHBOARD */
          <div className="bg-slate-900/90 backdrop-blur-xl border border-slate-800 p-6 sm:p-7 rounded-3xl space-y-5 shadow-2xl">
            {remainingCount > 0 ? (
              <form onSubmit={handleNextBatch} className="space-y-4 bg-slate-950/80 border border-slate-800/90 p-5 rounded-2xl">
                <div className="border-b border-slate-800 pb-3 flex justify-between items-center">
                  <h3 className="text-sm font-black text-indigo-400 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-indigo-400 animate-ping" />
                    Next Batch: {currentBatchTarget} Pending Leads Ready
                  </h3>
                  <span className="text-xs text-amber-400 font-mono font-bold bg-amber-500/10 px-2.5 py-1 rounded-full border border-amber-500/20">
                    Remaining in Queue: {remainingCount}
                  </span>
                </div>

                {/* Account Switch Inputs */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1.5">New Sender Account (Rotate Now)</label>
                    <input
                      type="email"
                      required
                      disabled={loading}
                      value={senderEmail}
                      onChange={(e) => setSenderEmail(e.target.value)}
                      onBlur={(e) => setSenderEmail(e.target.value.trim().toLowerCase())}
                      placeholder="account2@gmail.com"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-100 outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1.5">New App Password (Rotate Now)</label>
                    <input
                      type="password"
                      required
                      disabled={loading}
                      value={appPassword}
                      onChange={(e) => setAppPassword(e.target.value)}
                      onBlur={(e) => setAppPassword(e.target.value.replace(/\s+/g, ""))}
                      placeholder="xxxx xxxx xxxx xxxx"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-amber-300 font-mono outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                {/* Batch Config Controls */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1.5">Sender Display Name</label>
                    <input
                      type="text"
                      required
                      disabled={loading}
                      value={senderName}
                      onChange={(e) => setSenderName(e.target.value)}
                      onBlur={(e) => setSenderName(e.target.value.trim())}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-100 outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1.5">Batch Size</label>
                    <input
                      type="number"
                      min={MIN_ALLOWED_BATCH_SIZE}
                      max={MAX_ALLOWED_BATCH_SIZE}
                      required
                      disabled={loading}
                      value={batchSize || ""}
                      onChange={(e) => handleBatchSizeChange(e.target.value)}
                      onBlur={handleBatchSizeBlur}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-indigo-400 font-bold outline-none focus:border-indigo-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  </div>
                </div>

                {/* Subject Line */}
                <div className="w-full">
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">Subject Line</label>
                  <input
                    type="text"
                    required
                    disabled={loading}
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    onBlur={(e) => setSubject(e.target.value.trim())}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-100 outline-none focus:border-indigo-500"
                  />
                </div>

                {/* Message Body */}
                <div className="w-full">
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">Message Body</label>
                  <textarea
                    rows={4}
                    required
                    disabled={loading}
                    value={template}
                    onChange={(e) => setTemplate(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl p-4 text-sm text-slate-100 outline-none leading-relaxed resize-none focus:border-indigo-500"
                  />
                </div>

                {/* Sign-off Bottom Name */}
                <div className="w-full">
                  <label className="block text-xs font-bold text-emerald-400 mb-1.5">Sign-off Bottom Name</label>
                  <input
                    type="text"
                    disabled={loading}
                    value={customSignoffName}
                    onChange={(e) => setCustomSignoffName(e.target.value)}
                    onBlur={(e) => setCustomSignoffName(e.target.value.trim())}
                    className="w-full bg-slate-900 border border-emerald-500/30 rounded-xl px-4 py-2 text-sm text-slate-100 outline-none font-semibold focus:border-emerald-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-4 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-black rounded-2xl text-sm transition-all duration-300 shadow-xl hover:shadow-indigo-500/25 disabled:opacity-50 flex justify-center items-center gap-2 cursor-pointer active:scale-[0.99]"
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
              <div className="p-6 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-center rounded-2xl font-bold text-sm shadow-inner flex items-center justify-center gap-2">
                <span>🎉</span> All {initialTotalCount} leads have been processed, delivered, and cleared from the queue!
              </div>
            )}
          </div>
        )}

      </div>
    </main>
  );
}