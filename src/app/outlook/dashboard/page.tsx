// src/app/outlook/dashboard/page.tsx
"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useLicenseGuard } from "@/hook/useLicenseGuard";
import { useWarmupQueue } from "@/hook/useWarmupQueue";
import SuspendedScreen from "@/components/SuspendedScreen";
import FollowUpModal from "../components/FollowUpModal";
import SmartReplyActions from "../components/SmartReplyActions";
import ScheduleActions from "../components/ScheduleActions";
import { SESSION_TOKEN_KEY } from "@/types/vault";

interface MailNode {
  uid: number;
  from: string;
  fromName: string;
  subject: string;
  snippet: string;
  fullText: string;
  date: string;
  accountEmail?: string;
  previousOutreach?: string;
  reminderDate?: string;
  categoryTag?: "HOT" | "BUDGET" | "COLD" | "NIL";
}

const CHUNK_SIZE = 5; // 🎯 एक बार में 5 अकाउंट्स का चंक स्कैन होगा

export default function OutlookDashboardPage() {
  const { loadingLicense, isSuspended, userType, expiryDate, machineId, appDomain } = useLicenseGuard();
  const { allVaultAccounts } = useWarmupQueue(machineId);

  const [hotList, setHotList] = useState<MailNode[]>([]);
  const [budgetList, setBudgetList] = useState<MailNode[]>([]);
  const [coldList, setColdList] = useState<MailNode[]>([]);
  const [nilList, setNilList] = useState<MailNode[]>([]);
  const [totalScanned, setTotalScanned] = useState<number>(0);

  // ⚠️ फ़ेल हुए अकाउंट्स का स्टेटस ट्रैक करने के लिए स्टेट
  const [failedCount, setFailedCount] = useState<number>(0);

  const [activeFilter, setActiveFilter] = useState<"HOT" | "BUDGET" | "COLD" | "NIL" | "ALL">("HOT");
  const [selectedMail, setSelectedMail] = useState<MailNode | null>(null);

  const [scanHours, setScanHours] = useState<number>(24);
  const [replyText, setReplyText] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [sending, setSending] = useState<boolean>(false);
  const [statusMsg, setStatusMsg] = useState<string>("Ready");
  const [showReminderInput, setShowReminderInput] = useState<boolean>(false);

  // ⏰ फॉलो-अप रिमाइंडर शेड्यूलर
  const handleQuickSchedule = (days: number) => {
    if (!selectedMail) return;
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + days);
    const formattedDate = targetDate.toLocaleDateString();

    const updatedMail = { ...selectedMail, reminderDate: formattedDate };
    setSelectedMail(updatedMail);

    const updateList = (list: MailNode[]) =>
      list.map((m) => (m.uid === selectedMail.uid && m.accountEmail === selectedMail.accountEmail ? updatedMail : m));

    setHotList(updateList(hotList));
    setBudgetList(updateList(budgetList));
    setColdList(updateList(coldList));
    setNilList(updateList(nilList));
  };

  // 🚀 चंक-बेस्ड स्कैनर (फ़ॉल्ट-टॉलरेंट)
  const fetchAnalytics = useCallback(async () => {
    if (allVaultAccounts.length === 0) return;

    setLoading(true);
    setStatusMsg(`Scanning ${allVaultAccounts.length} accounts in chunks of ${CHUNK_SIZE}...`);

    let accHot: MailNode[] = [];
    let accBudget: MailNode[] = [];
    let accCold: MailNode[] = [];
    let accNil: MailNode[] = [];
    let totalAuthFailed = 0;

    // फ्रेश स्कैन के लिए स्टेट्स रीसेट
    setHotList([]);
    setBudgetList([]);
    setColdList([]);
    setNilList([]);
    setTotalScanned(0);
    setFailedCount(0);
    setSelectedMail(null);

    const storedToken = typeof window !== "undefined" ? localStorage.getItem(SESSION_TOKEN_KEY) || "" : "";

    // 5-5 अकाउंट्स के चंक में बाँटना
    const chunks: (typeof allVaultAccounts)[] = [];
    for (let i = 0; i < allVaultAccounts.length; i += CHUNK_SIZE) {
      chunks.push(allVaultAccounts.slice(i, i + CHUNK_SIZE));
    }

    let processedCount = 0;

    for (const chunk of chunks) {
      try {
        const res = await fetch("/api/inbox/analytics", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            machineId,
            sessionToken: storedToken,
            accounts: chunk.map((a) => ({ email: a.email, appPassword: a.appPassword })),
            scanHours,
          }),
        });

        const data = await res.json();
        if (data.success && data.data) {
          accHot = [...accHot, ...(data.data.hotLeads || [])];
          accBudget = [...accBudget, ...(data.data.budgetLeads || [])];
          accCold = [...accCold, ...(data.data.coldLeads || [])];
          accNil = [...accNil, ...(data.data.nilLeads || [])];

          if (Array.isArray(data.data.failedAccounts)) {
            totalAuthFailed += data.data.failedAccounts.length;
            setFailedCount(totalAuthFailed);
          }

          // 🎯 हर चंक के बाद UI में तुरंत नया डेटा जुड़ता जाएगा
          setHotList([...accHot]);
          setBudgetList([...accBudget]);
          setColdList([...accCold]);
          setNilList([...accNil]);

          const currentTotal = accHot.length + accBudget.length + accCold.length + accNil.length;
          setTotalScanned(currentTotal);

          setSelectedMail((prev) => {
            if (prev) return prev;
            const allNow = [...accHot, ...accBudget, ...accCold, ...accNil];
            return allNow.length > 0 ? allNow[0] : null;
          });
        }
      } catch (e) {
        console.error("Chunk scan error:", e);
      }

      processedCount += chunk.length;
      setStatusMsg(`Scanned: ${Math.min(processedCount, allVaultAccounts.length)}/${allVaultAccounts.length} accounts...`);
    }

    setStatusMsg(`✅ Completed scan for all ${allVaultAccounts.length} accounts.`);
    setLoading(false);
  }, [allVaultAccounts, machineId, scanHours]);

  useEffect(() => {
    if (allVaultAccounts.length > 0) {
      fetchAnalytics();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allVaultAccounts.length, scanHours]);

  const allLeadsCombined = [...hotList, ...budgetList, ...coldList, ...nilList];
  const displayedList =
    activeFilter === "HOT"
      ? hotList
      : activeFilter === "BUDGET"
      ? budgetList
      : activeFilter === "COLD"
      ? coldList
      : activeFilter === "NIL"
      ? nilList
      : allLeadsCombined;

  const activeVaultAccount =
    allVaultAccounts.find((acc) => acc.email === selectedMail?.accountEmail) ||
    allVaultAccounts[0];

  if (loadingLicense) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-400 text-xs font-mono gap-3">
        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
        <span>Verifying Security Gateway...</span>
      </div>
    );
  }

  if (isSuspended) {
    return (
      <SuspendedScreen
        machineId={machineId}
        appDomain={appDomain}
        userType={userType}
        expiryDate={expiryDate ?? undefined}
        adminPhone="+918266821377"
        adminEmail="inboxsend.support@gmail.com"
      />
    );
  }

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-100 font-sans">
      <div className="bg-slate-900 border-b border-slate-800 px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/outlook" className="text-indigo-400 hover:underline text-xs font-mono">
            ← Outlook Radar
          </Link>
          <span className="text-slate-600">|</span>
          <h1 className="text-sm font-bold text-white uppercase tracking-wider">
            📊 Dashboard Lead Filtering & Smart Reply
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800">
            <span className="text-slate-400 font-medium text-xs">Window:</span>
            <select
              value={scanHours}
              onChange={(e) => setScanHours(Number(e.target.value))}
              className="bg-transparent text-amber-300 font-semibold focus:outline-none cursor-pointer text-xs"
            >
              <option value={24} className="bg-slate-900 text-slate-200">Last 24 Hours</option>
              <option value={48} className="bg-slate-900 text-slate-200">Last 48 Hours</option>
              <option value={72} className="bg-slate-900 text-slate-200">Last 3 Days</option>
            </select>
          </div>

          {failedCount > 0 && (
            <span className="text-xs bg-rose-950 text-rose-400 border border-rose-800 px-2 py-1 rounded-md font-mono">
              ⚠️ {failedCount} Auth Failed
            </span>
          )}

          <span className="text-xs text-cyan-400 font-mono">{statusMsg}</span>
          <button
            onClick={() => fetchAnalytics()}
            disabled={loading}
            className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition disabled:opacity-50 cursor-pointer"
          >
            {loading ? "Scanning..." : "🔄 Rescan"}
          </button>
        </div>
      </div>

      <div className="flex-1 p-6 overflow-y-auto space-y-6 flex flex-col">
        {/* 🎯 5 कार्ड्स ग्रिड */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 shrink-0">
          <button
            onClick={() => { setActiveFilter("HOT"); setReplyText(""); setShowReminderInput(false); if (hotList.length > 0) setSelectedMail(hotList[0]); else setSelectedMail(null); }}
            className={`p-3.5 rounded-xl text-left border transition flex flex-col justify-between cursor-pointer ${activeFilter === "HOT" ? "bg-slate-900 border-emerald-500 shadow-lg ring-1 ring-emerald-500" : "bg-slate-900/50 border-slate-800 hover:bg-slate-900"}`}
          >
            <span className="text-xs text-slate-400 font-medium">🔥 Hot Leads</span>
            <span className="text-2xl font-bold text-emerald-400 mt-2 font-mono">{hotList.length}</span>
            <span className="text-[10px] text-slate-500 mt-1">Ready to close</span>
          </button>

          <button
            onClick={() => { setActiveFilter("BUDGET"); setReplyText(""); setShowReminderInput(false); if (budgetList.length > 0) setSelectedMail(budgetList[0]); else setSelectedMail(null); }}
            className={`p-3.5 rounded-xl text-left border transition flex flex-col justify-between cursor-pointer ${activeFilter === "BUDGET" ? "bg-slate-900 border-amber-500 shadow-lg ring-1 ring-amber-500" : "bg-slate-900/50 border-slate-800 hover:bg-slate-900"}`}
          >
            <span className="text-xs text-slate-400 font-medium">⏳ Budget / Delayed</span>
            <span className="text-2xl font-bold text-amber-400 mt-2 font-mono">{budgetList.length}</span>
            <span className="text-[10px] text-slate-500 mt-1">Follow-up needed</span>
          </button>

          <button
            onClick={() => { setActiveFilter("COLD"); setReplyText(""); setShowReminderInput(false); if (coldList.length > 0) setSelectedMail(coldList[0]); else setSelectedMail(null); }}
            className={`p-3.5 rounded-xl text-left border transition flex flex-col justify-between cursor-pointer ${activeFilter === "COLD" ? "bg-slate-900 border-rose-500 shadow-lg ring-1 ring-rose-500" : "bg-slate-900/50 border-slate-800 hover:bg-slate-900"}`}
          >
            <span className="text-xs text-slate-400 font-medium">❌ Cold / Negative</span>
            <span className="text-2xl font-bold text-rose-400 mt-2 font-mono">{coldList.length}</span>
            <span className="text-[10px] text-slate-500 mt-1">Declined leads</span>
          </button>

          <button
            onClick={() => { setActiveFilter("NIL"); setReplyText(""); setShowReminderInput(false); if (nilList.length > 0) setSelectedMail(nilList[0]); else setSelectedMail(null); }}
            className={`p-3.5 rounded-xl text-left border transition flex flex-col justify-between cursor-pointer ${activeFilter === "NIL" ? "bg-slate-900 border-indigo-500 shadow-lg ring-1 ring-indigo-500" : "bg-slate-900/50 border-slate-800 hover:bg-slate-900"}`}
          >
            <span className="text-xs text-slate-400 font-medium">⚪ Uncategorized</span>
            <span className="text-2xl font-bold text-indigo-400 mt-2 font-mono">{nilList.length}</span>
            <span className="text-[10px] text-slate-500 mt-1">Headless / Untagged</span>
          </button>

          <button
            onClick={() => { setActiveFilter("ALL"); setReplyText(""); setShowReminderInput(false); if (allLeadsCombined.length > 0) setSelectedMail(allLeadsCombined[0]); else setSelectedMail(null); }}
            className={`p-3.5 rounded-xl text-left border transition flex flex-col justify-between cursor-pointer ${activeFilter === "ALL" ? "bg-slate-900 border-cyan-500 shadow-lg ring-1 ring-cyan-500" : "bg-slate-900/50 border-slate-800 hover:bg-slate-900"}`}
          >
            <span className="text-xs text-slate-400 font-medium">📨 All Scanned Leads</span>
            <span className="text-2xl font-bold text-cyan-400 mt-2 font-mono">{totalScanned}</span>
            <span className="text-[10px] text-slate-500 mt-1">Total inboxes</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 flex-1 min-h-[420px]">
          <div className="md:col-span-5 bg-slate-900 border border-slate-800 rounded-xl flex flex-col overflow-hidden">
            <div className="p-3 border-b border-slate-800 text-xs font-bold text-slate-300 uppercase tracking-wider flex justify-between items-center">
              <span>{activeFilter === "NIL" ? "UNCATEGORIZED" : activeFilter} LEADS ({displayedList.length})</span>
              <span className="text-[10px] text-slate-500 font-normal">{scanHours}h Window</span>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-slate-800">
              {displayedList.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs">
                  {loading ? "Scanning inboxes in batches, leads will appear here..." : `No messages found under ${activeFilter} filter.`}
                </div>
              ) : (
                displayedList.map((m) => (
                  <div
                    key={`${m.accountEmail}-${m.uid}`}
                    onClick={() => { setSelectedMail(m); setReplyText(""); setShowReminderInput(false); }}
                    className={`p-3 cursor-pointer transition relative ${selectedMail?.uid === m.uid && selectedMail?.accountEmail === m.accountEmail ? "bg-slate-800 border-l-4 border-indigo-500" : "hover:bg-slate-800/50"}`}
                  >
                    <div className="flex justify-between items-start gap-1">
                      <div className="text-xs font-bold text-slate-200 truncate">{m.fromName || m.from}</div>
                      <div className="flex items-center gap-1 shrink-0">
                        {m.categoryTag === "HOT" && (
                          <span className="text-[9px] bg-emerald-500/20 text-emerald-400 px-1 py-0.2 rounded border border-emerald-500/30 font-semibold">
                            🔥 Hot
                          </span>
                        )}
                        {m.categoryTag === "BUDGET" && (
                          <span className="text-[9px] bg-amber-500/20 text-amber-400 px-1 py-0.2 rounded border border-amber-500/30 font-semibold">
                            ⏳ Budget
                          </span>
                        )}
                        {m.categoryTag === "COLD" && (
                          <span className="text-[9px] bg-rose-500/20 text-rose-400 px-1 py-0.2 rounded border border-rose-500/30 font-semibold">
                            ❌ Cold
                          </span>
                        )}
                        {m.categoryTag === "NIL" && (
                          <span className="text-[9px] bg-indigo-500/20 text-indigo-300 px-1 py-0.2 rounded border border-indigo-500/30 font-semibold">
                            ⚪ Headless
                          </span>
                        )}

                        {m.reminderDate && (
                          <span className="text-[9px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded border border-amber-500/30">
                            ⏰ {m.reminderDate}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-xs font-semibold text-slate-300 truncate mt-0.5">{m.subject}</div>
                    <div className="text-[11px] text-slate-500 truncate mt-1">{m.snippet}</div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="md:col-span-7 bg-slate-900 border border-slate-800 rounded-xl flex flex-col h-full overflow-hidden">
            {selectedMail ? (
              <>
                <div className="p-3 border-b border-slate-800 flex justify-between items-start shrink-0 gap-2">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-xs font-bold text-white truncate max-w-sm">{selectedMail.subject}</h2>
                      {selectedMail.categoryTag && (
                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${
                          selectedMail.categoryTag === "HOT"
                            ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                            : selectedMail.categoryTag === "BUDGET"
                            ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                            : selectedMail.categoryTag === "COLD"
                            ? "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                            : "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                        }`}>
                          {selectedMail.categoryTag === "NIL" ? "HEADLESS" : selectedMail.categoryTag}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-2">
                      From: <span className="text-indigo-400 font-medium">{selectedMail.from}</span>
                      {selectedMail.reminderDate && (
                        <span className="text-[10px] text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                          Reminder Due: {selectedMail.reminderDate}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap justify-end">
                    <ScheduleActions
                      currentReminder={selectedMail.reminderDate}
                      onScheduleSelect={handleQuickSchedule}
                      onCustomClick={() => setShowReminderInput(true)}
                    />

                    <SmartReplyActions
                      machineId={machineId}
                      fromEmail={selectedMail.from}
                      accountEmail={activeVaultAccount?.email || ""}
                      appPassword={activeVaultAccount?.appPassword || ""}
                      fromName={selectedMail.fromName}
                      subject={selectedMail.subject}
                      currentUid={selectedMail.uid}
                      emailText={selectedMail.fullText || selectedMail.snippet}
                      previousOutreach={selectedMail.previousOutreach}
                      onReplyGenerated={(suggested) => setReplyText(suggested)}
                    />
                  </div>
                </div>

                {showReminderInput && (
                  <FollowUpModal
                    currentReminder={selectedMail.reminderDate}
                    onSave={(days) => {
                      handleQuickSchedule(days);
                      setShowReminderInput(false);
                      const targetDate = new Date();
                      targetDate.setDate(targetDate.getDate() + days);
                      alert(`⏰ Follow-up reminder successfully set for ${targetDate.toLocaleDateString()}!`);
                    }}
                    onClose={() => setShowReminderInput(false)}
                  />
                )}

                <div className="p-4 overflow-y-auto whitespace-pre-wrap text-xs text-slate-300 font-sans leading-relaxed flex-1 border-b border-slate-800 bg-slate-950/20 min-h-[160px]">
                  {selectedMail.fullText || selectedMail.snippet}
                </div>

                <div className="p-3 bg-slate-950/40 flex flex-col gap-2 shrink-0">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] text-slate-400 font-medium">
                      Review AI suggestion or write custom reply:
                    </span>
                    {replyText && (
                      <button
                        onClick={() => setReplyText("")}
                        className="text-[10px] text-rose-400 hover:underline cursor-pointer"
                      >
                        Clear Text
                      </button>
                    )}
                  </div>

                  <textarea
                    rows={3}
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Click '⚡ Quick Reply' or '✨ AI Thread Reply' above or type your own custom response here..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-indigo-500 transition leading-relaxed font-sans resize-none"
                  />

                  <div className="flex justify-between items-center pt-2 border-t border-slate-800/60">
                    <span className="text-[10px] text-slate-500 italic">
                      Manual control: Sent only when you click send.
                    </span>

                    <button
                      onClick={async () => {
                        if (!replyText.trim()) return;
                        setSending(true);
                        try {
                          const storedToken = typeof window !== "undefined" ? localStorage.getItem(SESSION_TOKEN_KEY) || "" : "";
                          const res = await fetch("/api/inbox/reply", {
                            method: "POST",
                            headers: {
                              "Content-Type": "application/json",
                              "x-session-token": storedToken,
                            },
                            body: JSON.stringify({
                              machineId,
                              sessionToken: storedToken,
                              fromEmail: activeVaultAccount?.email,
                              appPassword: activeVaultAccount?.appPassword,
                              toEmail: selectedMail.from,
                              subject: selectedMail.subject,
                              replyText,
                            }),
                          });
                          const data = await res.json();
                          if (data.success) {
                            alert("✅ Reply Sent Successfully!");
                            setReplyText("");
                          } else {
                            alert("Failed to send: " + (data.error || "Unknown error"));
                          }
                        } catch (_) {
                          alert("Network Error sending reply.");
                        } finally {
                          setSending(false);
                        }
                      }}
                      disabled={sending || !replyText.trim()}
                      className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold px-4 py-1.5 rounded-lg transition shadow flex items-center gap-1 cursor-pointer"
                    >
                      {sending ? "Sending..." : "✓ Send Reply Instantly"}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center flex-1 text-slate-500 text-xs">
                Select a lead from the list to view and reply
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}