// src/app/outlook/page.tsx
"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import { useLicenseGuard } from "@/hook/useLicenseGuard";
import { useWarmupQueue, AccountNode } from "@/hook/useWarmupQueue";
import SuspendedScreen from "@/components/SuspendedScreen";
import { SESSION_TOKEN_KEY } from "@/types/vault";
import FollowUpModal from "./components/FollowUpModal";
import SmartReplyActions from "./components/SmartReplyActions";
import ScheduleActions from "./components/ScheduleActions";

interface EmailItem {
  uid: number;
  messageId: string;
  from: string;
  fromName: string;
  subject: string;
  snippet: string;
  fullText: string;
  html?: string;
  date: string;
  isUnread?: boolean;
  isAnswered?: boolean;
  category?: "REPLY" | "IMPORTANT" | "NORMAL";
  isSpamRescued?: boolean;
  reminderDate?: string;
  accountEmail?: string;
  previousOutreach?: string;
}

type FilterTab = "ALL" | "REPLIES" | "IMPORTANT" | "RESCUED" | "UNREAD";

const RADAR_CHUNK_SIZE = 5;

const playBeepSound = () => {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + 0.35);
    osc.stop(ctx.currentTime + 0.35);
  } catch (e) {
    console.error("Audio Beep Error:", e);
  }
};

const createWorkerInterval = (callback: () => void, intervalMs: number) => {
  const blob = new Blob([`
    let timer = null;
    self.onmessage = function(e) {
      if (e.data === "START") {
        if (timer) clearInterval(timer);
        timer = setInterval(() => { self.postMessage("TICK"); }, ${intervalMs});
      } else if (e.data === "STOP") {
        if (timer) { clearInterval(timer); timer = null; }
      }
    };
  `], { type: "application/javascript" });

  const worker = new Worker(URL.createObjectURL(blob));
  worker.onmessage = () => callback();
  return worker;
};

export default function OutlookPage() {
  const { loadingLicense, isSuspended, userType, expiryDate, machineId, appDomain } = useLicenseGuard();
  const { allVaultAccounts, isLoading: loadingAccounts } = useWarmupQueue(machineId);

  const [selectedAcc, setSelectedAcc] = useState<AccountNode | null>(null);
  const [emails, setEmails] = useState<EmailItem[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<EmailItem | null>(null);

  const [accountSearch, setAccountSearch] = useState<string>("");
  const [emailSearch, setEmailSearch] = useState<string>("");
  const [activeTab, setActiveTab] = useState<FilterTab>("ALL");

  const [scanHours, setScanHours] = useState<number>(24);

  const [loadingEmails, setLoadingEmails] = useState<boolean>(false);
  const [sending, setSending] = useState<boolean>(false);

  const [showHindi, setShowHindi] = useState<boolean>(false);
  const [hindiTranslation, setHindiTranslation] = useState<string>("");
  const [translating, setTranslating] = useState<boolean>(false);

  const [isAutoScanning, setIsAutoScanning] = useState<boolean>(false);
  const [currentScanningChunkIndex, setCurrentScanningChunkIndex] = useState<number>(0);
  const [radarAlert, setRadarAlert] = useState<string | null>(null);
  const [pendingHotEmails, setPendingHotEmails] = useState<EmailItem[]>([]);

  // ⚠️ फ़ेल या मिसमैच पासवर्ड वाले अकाउंट्स को ट्रैक करने के लिए स्टेट
  const [failedAccounts, setFailedAccounts] = useState<Record<string, string>>({});

  const [replyText, setReplyText] = useState<string>("");
  const [statusMessage, setStatusMessage] = useState<string>("Ready");
  const [showReminderInput, setShowReminderInput] = useState<boolean>(false);

  const isScanningRef = useRef(isAutoScanning);
  const chunkIdxRef = useRef(currentScanningChunkIndex);
  const pendingHotRef = useRef<EmailItem[]>([]);
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => { isScanningRef.current = isAutoScanning; }, [isAutoScanning]);
  useEffect(() => { chunkIdxRef.current = currentScanningChunkIndex; }, [currentScanningChunkIndex]);
  useEffect(() => { pendingHotRef.current = pendingHotEmails; }, [pendingHotEmails]);

  const handleQuickSchedule = (days: number) => {
    if (!selectedEmail) return;
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + days);
    const formattedDate = targetDate.toLocaleDateString();

    const updatedEmail = { ...selectedEmail, reminderDate: formattedDate };
    setSelectedEmail(updatedEmail);

    setEmails((prev) =>
      prev.map((m) => (m.uid === selectedEmail.uid ? updatedEmail : m))
    );
  };

  const filteredAccounts = useMemo(() => {
    if (!accountSearch.trim()) return allVaultAccounts;
    const query = accountSearch.toLowerCase().trim();
    return allVaultAccounts.filter((acc) => {
      const emailMatch = acc.email.toLowerCase().includes(query);
      const nameMatch = acc.senderName ? acc.senderName.toLowerCase().includes(query) : false;
      return emailMatch || nameMatch;
    });
  }, [allVaultAccounts, accountSearch]);

  const filteredEmails = useMemo(() => {
    let result = emails;
    if (activeTab === "REPLIES") {
      result = result.filter((m) => m.category === "REPLY");
    } else if (activeTab === "IMPORTANT") {
      result = result.filter((m) => m.category === "IMPORTANT" || m.category === "REPLY");
    } else if (activeTab === "RESCUED") {
      result = result.filter((m) => m.isSpamRescued);
    } else if (activeTab === "UNREAD") {
      result = result.filter((m) => m.isUnread);
    }

    if (emailSearch.trim()) {
      const q = emailSearch.toLowerCase().trim();
      result = result.filter(
        (m) =>
          m.subject.toLowerCase().includes(q) ||
          m.from.toLowerCase().includes(q) ||
          m.fromName.toLowerCase().includes(q) ||
          m.snippet.toLowerCase().includes(q)
      );
    }
    return result;
  }, [emails, activeTab, emailSearch]);

  // 📥 सिंगल अकाउंट लोड करना (हाथ से क्लिक करने पर)
  const loadInbox = useCallback(
    async (acc: AccountNode): Promise<EmailItem[]> => {
      if (!acc?.email || !machineId) return [];

      setSelectedAcc(acc);
      setEmails([]);
      setSelectedEmail(null);
      setShowHindi(false);
      setHindiTranslation("");
      setShowReminderInput(false);
      setLoadingEmails(true);
      setStatusMessage(`Scanning ${acc.senderName || acc.email}...`);

      try {
        const storedToken =
          typeof window !== "undefined" ? localStorage.getItem(SESSION_TOKEN_KEY) || "" : "";

        const res = await fetch("/api/inbox/fetch", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-session-token": storedToken,
            "x-machine-id": machineId,
          },
          body: JSON.stringify({
            machineId,
            sessionToken: storedToken,
            email: acc.email.toLowerCase().trim(),
            appPassword: acc.appPassword,
            scanHours,
          }),
        });

        const data = await res.json();
        if (res.ok && data.success) {
          // अगर पहले एरर था तो उसे क्लियर करें
          setFailedAccounts((prev) => {
            const next = { ...prev };
            delete next[acc.email.toLowerCase()];
            return next;
          });

          const fetched: EmailItem[] = Array.isArray(data.emails) ? data.emails : [];
          setEmails(fetched);
          setStatusMessage(`Loaded ${fetched.length} messages for ${acc.senderName || acc.email}`);
          return fetched;
        } else {
          if (data.authFailed) {
            setFailedAccounts((prev) => ({
              ...prev,
              [acc.email.toLowerCase()]: data.error || "Password Mismatch",
            }));
          }
          setStatusMessage(`IMAP Error: ${data.error || "Failed to fetch emails"}`);
          return [];
        }
      } catch (err: any) {
        console.error("Inbox Network Error:", err);
        setStatusMessage(`Network Error: ${err.message}`);
        return [];
      } finally {
        setLoadingEmails(false);
      }
    },
    [machineId, scanHours]
  );

  // 🚀 5-5 अकाउंट्स के चंक्स वाला ऑटो-राडार स्कैनर
  useEffect(() => {
    if (!isAutoScanning || allVaultAccounts.length === 0) {
      if (workerRef.current) {
        workerRef.current.postMessage("STOP");
        workerRef.current.terminate();
        workerRef.current = null;
      }
      return;
    }

    const chunks: AccountNode[][] = [];
    for (let i = 0; i < allVaultAccounts.length; i += RADAR_CHUNK_SIZE) {
      chunks.push(allVaultAccounts.slice(i, i + RADAR_CHUNK_SIZE));
    }

    workerRef.current = createWorkerInterval(async () => {
      if (!isScanningRef.current) return;
      workerRef.current?.postMessage("STOP");

      const chunkIdx = chunkIdxRef.current % chunks.length;
      const currentChunk = chunks[chunkIdx];

      setStatusMessage(
        `📡 Radar Scanning Chunk (${chunkIdx + 1}/${chunks.length}) — [${currentChunk.length} IDs in parallel]...`
      );

      try {
        const storedToken =
          typeof window !== "undefined" ? localStorage.getItem(SESSION_TOKEN_KEY) || "" : "";

        const res = await fetch("/api/inbox/fetch", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-session-token": storedToken,
            "x-machine-id": machineId,
          },
          body: JSON.stringify({
            machineId,
            sessionToken: storedToken,
            accounts: currentChunk.map((a) => ({ email: a.email, appPassword: a.appPassword })),
            scanHours,
          }),
        });

        const data = await res.json();
        if (data.success && Array.isArray(data.chunkResults)) {
          let foundHotEmails: EmailItem[] = [];
          let targetAccountEmail = "";

          for (const item of data.chunkResults) {
            // 🎯 अगर किसी अकाउंट का पासवर्ड गलत है तो उसे ट्रैक करें, बाकी प्रोसेस न रुके
            if (item.authFailed) {
              setFailedAccounts((prev) => ({
                ...prev,
                [item.email.toLowerCase()]: item.error || "Password Mismatch",
              }));
              continue;
            } else {
              setFailedAccounts((prev) => {
                const next = { ...prev };
                delete next[item.email.toLowerCase()];
                return next;
              });
            }

            // बाकी सही अकाउंट्स के मेल्स फ़िल्टर करें
            const hots = (item.emails || []).filter(
              (m: EmailItem) => (m.category === "REPLY" || m.category === "IMPORTANT" || m.isSpamRescued) && !m.isAnswered
            );

            if (hots.length > 0 && !foundHotEmails.length) {
              foundHotEmails = hots;
              targetAccountEmail = item.email;
            }
          }

          if (foundHotEmails.length > 0) {
            playBeepSound();
            setIsAutoScanning(false);

            const matchedAcc = allVaultAccounts.find((a) => a.email.toLowerCase() === targetAccountEmail.toLowerCase()) || currentChunk[0];
            setSelectedAcc(matchedAcc);

            const firstHot = foundHotEmails[0];
            const remainingHots = foundHotEmails.slice(1);

            setSelectedEmail(firstHot);
            setPendingHotEmails(remainingHots);
            setActiveTab("ALL");
            setShowHindi(false);
            setHindiTranslation("");
            setShowReminderInput(false);

            const spamTag = firstHot.isSpamRescued ? " [🛡️ SPAM RESCUED]" : "";
            setRadarAlert(`🚨${spamTag} Client response in ${matchedAcc.email}! (${foundHotEmails.length} items)`);
            return;
          }
        }
      } catch (err) {
        console.error("Radar chunk scan error:", err);
      }

      if (isScanningRef.current) {
        const nextIdx = (chunkIdx + 1) % chunks.length;
        setCurrentScanningChunkIndex(nextIdx);
        workerRef.current?.postMessage("START");
      }
    }, 4000);

    workerRef.current.postMessage("START");

    return () => {
      if (workerRef.current) {
        workerRef.current.postMessage("STOP");
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };
  }, [isAutoScanning, allVaultAccounts, machineId, scanHours]);

  const handleProceedNext = useCallback(() => {
    setReplyText("");
    setShowHindi(false);
    setHindiTranslation("");
    setShowReminderInput(false);

    const remaining = [...pendingHotRef.current];

    if (remaining.length > 0) {
      const nextEmail = remaining.shift()!;
      setPendingHotEmails(remaining);
      setSelectedEmail(nextEmail);
      playBeepSound();
      const spamTag = nextEmail.isSpamRescued ? " [🛡️ SPAM RESCUED]" : "";
      setRadarAlert(`🔔${spamTag} Next message in ${selectedAcc?.email} (${remaining.length} remaining).`);
    } else {
      setRadarAlert(null);
      setSelectedEmail(null);
      setPendingHotEmails([]);
      const totalChunks = Math.ceil(allVaultAccounts.length / RADAR_CHUNK_SIZE) || 1;
      setCurrentScanningChunkIndex((prev) => (prev + 1) % totalChunks);
      setIsAutoScanning(true);
    }
  }, [allVaultAccounts.length, selectedAcc?.email]);

  useEffect(() => {
    if (allVaultAccounts && allVaultAccounts.length > 0 && !selectedAcc && !isAutoScanning) {
      const first = allVaultAccounts[0];
      setSelectedAcc(first);
      loadInbox(first);
    }
  }, [allVaultAccounts, selectedAcc, loadInbox, isAutoScanning]);

  const handleTranslateToHindi = async () => {
    if (!selectedEmail) return;
    if (hindiTranslation) {
      setShowHindi(!showHindi);
      return;
    }

    setTranslating(true);
    try {
      const res = await fetch("/api/inbox/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: selectedEmail.fullText || selectedEmail.snippet,
          subject: selectedEmail.subject,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setHindiTranslation(data.translatedText);
        setShowHindi(true);
      } else {
        alert("अनुवाद नहीं हो पाया: " + data.error);
      }
    } catch (_) {
      alert("हिंदी ट्रांसलेशन नेटवर्क एरर");
    } finally {
      setTranslating(false);
    }
  };

  const handleSendReply = async () => {
    if (!replyText.trim() || !selectedEmail || !selectedAcc || !machineId) return;
    setSending(true);
    try {
      const storedToken =
        typeof window !== "undefined" ? localStorage.getItem(SESSION_TOKEN_KEY) || "" : "";

      const res = await fetch("/api/inbox/reply", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-session-token": storedToken,
          "x-machine-id": machineId,
        },
        body: JSON.stringify({
          machineId,
          sessionToken: storedToken,
          fromEmail: selectedAcc.email,
          appPassword: selectedAcc.appPassword,
          senderName: selectedAcc.senderName || "",
          toEmail: selectedEmail.from,
          subject: selectedEmail.subject,
          replyText,
          messageId: selectedEmail.messageId,
        }),
      });
      const data = await res.json();
      if (data.success) {
        alert("✅ Reply Sent Successfully!");
        handleProceedNext();
      } else {
        alert("Failed to send: " + (data.error || "Unknown error"));
      }
    } catch (_) {
      alert("Network Error sending reply.");
    } finally {
      setSending(false);
    }
  };

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
      <div className="bg-slate-900 border-b border-slate-800 px-4 py-2 text-xs flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/warmup" className="text-indigo-400 hover:underline">
            ← Warmup Dashboard
          </Link>
          <span className="text-slate-600">|</span>
          <span className="font-semibold text-slate-400">STATUS:</span>
          <span className="text-cyan-400 font-mono">{statusMessage}</span>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800">
            <span className="text-slate-400 font-medium">Window:</span>
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

          <button
            onClick={() => {
              setRadarAlert(null);
              setIsAutoScanning(!isAutoScanning);
            }}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow cursor-pointer ${
              isAutoScanning
                ? "bg-rose-600 hover:bg-rose-700 text-white animate-pulse"
                : "bg-indigo-600 hover:bg-indigo-500 text-white"
            }`}
          >
            {isAutoScanning ? "🛑 Stop Radar Scan" : "📡 Start 5x Auto-Radar Scan"}
          </button>

          <span>
            Total IDs: <b className="text-amber-400">{allVaultAccounts.length}</b>
          </span>
          <span>
            Active: <b className="text-emerald-400">{selectedAcc?.senderName || selectedAcc?.email || "None"}</b>
          </span>
        </div>
      </div>

      {radarAlert && (
        <div className="bg-rose-950/90 border-b border-rose-500 text-rose-200 px-4 py-2.5 text-xs flex items-center justify-between shadow-lg shrink-0">
          <div className="flex items-center gap-2">
            <span className="animate-ping inline-flex h-2 w-2 rounded-full bg-rose-400 opacity-75"></span>
            <span className="font-bold">{radarAlert}</span>
            {pendingHotEmails.length > 0 && (
              <span className="bg-rose-800 text-white font-mono px-2 py-0.5 rounded text-[10px]">
                +{pendingHotEmails.length} more in this account
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleProceedNext}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-3 py-1 rounded text-xs transition flex items-center gap-1 cursor-pointer"
            >
              {pendingHotEmails.length > 0 ? "⏭️ Next Email in this Account" : "▶️ All Done, Next Account"}
            </button>
            <button
              onClick={() => setRadarAlert(null)}
              className="text-slate-400 hover:text-white px-2 py-1 text-xs cursor-pointer"
            >
              ✕ Dismiss
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* बायाँ कॉलम: अकाउंट्स लिस्ट */}
        <div className="w-64 border-r border-slate-800 p-3 flex flex-col bg-slate-950 shrink-0">
          <div className="flex justify-between items-center mb-2 px-1">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Accounts ({allVaultAccounts.length})
            </h2>
            {accountSearch && (
              <span className="text-[10px] bg-indigo-950 text-indigo-300 px-1.5 py-0.5 rounded font-mono border border-indigo-800">
                {filteredAccounts.length}
              </span>
            )}
          </div>

          <div className="mb-2">
            <input
              type="text"
              value={accountSearch}
              onChange={(e) => setAccountSearch(e.target.value)}
              placeholder="🔍 Search accounts..."
              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
            />
          </div>

          <div className="flex-1 overflow-y-auto space-y-1 pr-1">
            {loadingAccounts ? (
              <div className="text-xs text-slate-500 p-2 animate-pulse">Loading accounts...</div>
            ) : filteredAccounts.length === 0 ? (
              <div className="text-xs text-slate-500 p-3 text-center">No matching account found.</div>
            ) : (
              filteredAccounts.map((acc) => {
                const isFailed = !!failedAccounts[acc.email.toLowerCase()];
                return (
                  <button
                    key={acc.email}
                    onClick={() => {
                      if (isAutoScanning) setIsAutoScanning(false);
                      loadInbox(acc);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition relative cursor-pointer ${
                      selectedAcc?.email === acc.email
                        ? "bg-blue-600 text-white font-medium shadow-sm"
                        : "text-slate-300 hover:bg-slate-900"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <div className="truncate font-medium text-xs">{acc.senderName || acc.email}</div>
                      {isFailed && (
                        <span 
                          className="text-[9px] bg-rose-500/20 text-rose-400 border border-rose-500/40 px-1.5 py-0.2 rounded font-mono font-bold shrink-0"
                          title={failedAccounts[acc.email.toLowerCase()]}
                        >
                          ⚠️ Auth Fail
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-400 truncate font-mono">{acc.email}</div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* बीच का कॉलम: ईमेल्स लिस्ट */}
        <div className="w-80 border-r border-slate-800 flex flex-col bg-slate-900/40 shrink-0">
          <div className="p-3 border-b border-slate-800 bg-slate-900/90 flex justify-between items-center">
            <div className="overflow-hidden pr-2">
              <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">
                Active Mailbox
              </div>
              <div className="text-xs font-bold text-emerald-400 truncate">
                👤 {selectedAcc?.senderName || "Unknown"}
              </div>
              <div className="text-[11px] text-slate-400 font-mono truncate">
                {selectedAcc?.email}
              </div>
            </div>

            {selectedAcc && (
              <button
                onClick={() => loadInbox(selectedAcc)}
                disabled={loadingEmails}
                className="text-xs text-blue-400 hover:underline disabled:opacity-50 whitespace-nowrap cursor-pointer"
              >
                {loadingEmails ? "Syncing..." : "Refresh"}
              </button>
            )}
          </div>

          <div className="p-2 border-b border-slate-800 bg-slate-900/40">
            <input
              type="text"
              value={emailSearch}
              onChange={(e) => setEmailSearch(e.target.value)}
              placeholder="🔍 Search in messages/subject..."
              className="w-full bg-slate-950 border border-slate-800 rounded-md px-2.5 py-1 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="flex border-b border-slate-800 bg-slate-950 text-[11px] font-medium text-slate-400">
            <button
              onClick={() => setActiveTab("ALL")}
              className={`flex-1 py-1.5 text-center border-b-2 transition cursor-pointer ${
                activeTab === "ALL" ? "border-blue-500 text-blue-400 bg-slate-900" : "border-transparent hover:text-slate-200"
              }`}
            >
              All ({emails.length})
            </button>
            <button
              onClick={() => setActiveTab("REPLIES")}
              className={`flex-1 py-1.5 text-center border-b-2 transition cursor-pointer ${
                activeTab === "REPLIES" ? "border-emerald-500 text-emerald-400 bg-slate-900" : "border-transparent hover:text-slate-200"
              }`}
            >
              💬 Replies
            </button>
            <button
              onClick={() => setActiveTab("RESCUED")}
              className={`flex-1 py-1.5 text-center border-b-2 transition cursor-pointer ${
                activeTab === "RESCUED" ? "border-rose-500 text-rose-400 bg-slate-900 font-bold" : "border-transparent hover:text-slate-200"
              }`}
            >
              🛡️ Rescued
            </button>
            <button
              onClick={() => setActiveTab("IMPORTANT")}
              className={`flex-1 py-1.5 text-center border-b-2 transition cursor-pointer ${
                activeTab === "IMPORTANT" ? "border-amber-500 text-amber-400 bg-slate-900" : "border-transparent hover:text-slate-200"
              }`}
            >
              ⭐ Important
            </button>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-800/60">
            {loadingEmails ? (
              <div className="p-6 text-center text-slate-500 text-sm animate-pulse">
                Fetching messages for {selectedAcc?.senderName || selectedAcc?.email}...
              </div>
            ) : !selectedAcc ? (
              <div className="p-6 text-center text-slate-500 text-sm">Select an account</div>
            ) : filteredEmails.length === 0 ? (
              <div className="p-6 text-center text-slate-500 text-sm">No matching messages found</div>
            ) : (
              filteredEmails.map((m) => (
                <div
                  key={m.uid || m.messageId}
                  onClick={() => {
                    setSelectedEmail(m);
                    setReplyText("");
                    setShowHindi(false);
                    setHindiTranslation("");
                    setShowReminderInput(false);
                  }}
                  className={`p-3 cursor-pointer transition border-b border-slate-800/40 relative ${
                    selectedEmail?.uid === m.uid
                      ? "bg-slate-800 border-l-4 border-blue-500"
                      : "hover:bg-slate-900"
                  }`}
                >
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {m.isSpamRescued && (
                        <span className="text-[9px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40 px-1.5 py-0.5 rounded animate-pulse">
                          🛡️ RESCUED
                        </span>
                      )}
                      {m.category === "REPLY" && (
                        <span className="text-[9px] font-bold bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-500/30">
                          💬 REPLY
                        </span>
                      )}
                      {m.category === "IMPORTANT" && !m.isSpamRescued && (
                        <span className="text-[9px] font-bold bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded border border-amber-500/30">
                          ⭐ IMPORTANT
                        </span>
                      )}
                      {m.isAnswered && (
                        <span className="text-[9px] font-medium bg-slate-800 text-slate-400 px-1 py-0.2 rounded border border-slate-700">
                          ✓ Replied
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      {m.reminderDate && (
                        <span className="text-[9px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded border border-amber-500/30">
                          ⏰ {m.reminderDate}
                        </span>
                      )}
                      <span className="text-[10px] text-slate-500 font-mono">
                        {m.date ? new Date(m.date).toLocaleDateString() : ""}
                      </span>
                    </div>
                  </div>

                  <div className="text-sm font-medium text-slate-200 truncate">{m.fromName || m.from}</div>
                  <div className="text-xs font-semibold text-slate-300 truncate mt-0.5">{m.subject}</div>
                  <div className="text-xs text-slate-500 truncate mt-1">{m.snippet}</div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* दायाँ कॉलम: ईमेल बॉडी और ऐक्शन व्यू */}
        <div className="flex-1 flex flex-col bg-slate-950 min-w-0">
          {selectedEmail ? (
            <>
              {/* 🎯 टॉप हेडर: सब्जेक्ट, सेंडर और हिंदी अनुवाद */}
              <div className="p-3 border-b border-slate-800 bg-slate-900/60 flex items-center justify-between gap-3 shrink-0">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <h1 className="text-sm font-bold text-white truncate">{selectedEmail.subject}</h1>
                    {selectedEmail.isSpamRescued && (
                      <span className="text-[10px] bg-rose-500/20 text-rose-300 px-1.5 py-0.2 rounded border border-rose-500/40 font-semibold">
                        🛡️ Rescued
                      </span>
                    )}
                    {selectedEmail.reminderDate && (
                      <span className="text-[10px] text-amber-400 bg-amber-500/10 px-1.5 py-0.2 rounded border border-amber-500/20 font-mono">
                        Due: {selectedEmail.reminderDate}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-400">
                    From: <span className="text-blue-400 font-medium">{selectedEmail.from}</span>
                  </div>
                </div>

                {/* 🇮🇳 हिंदी अनुवाद बटन */}
                <button
                  onClick={handleTranslateToHindi}
                  disabled={translating}
                  className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition flex items-center gap-1 shrink-0 cursor-pointer shadow-sm ${
                    showHindi 
                      ? "bg-amber-600 text-white border-amber-500"
                      : "bg-slate-800 hover:bg-slate-700 text-amber-300 border-amber-700/50"
                  }`}
                >
                  {translating ? "अनुवाद..." : showHindi ? "🇬🇧 English" : "🇮🇳 हिंदी अनुवाद"}
                </button>
              </div>

              {/* 🌟 सब्जेक्ट और हिंदी अनुवाद के जस्ट नीचे: फॉलो-अप शेड्यूल + AI स्मार्ट रिप्लाई */}
              <div className="px-4 py-2 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between gap-3 shrink-0 flex-wrap">
                {/* ⏰ फॉलो-अप शेड्यूल */}
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">
                    Follow-up:
                  </span>
                  <ScheduleActions
                    currentReminder={selectedEmail.reminderDate}
                    onScheduleSelect={handleQuickSchedule}
                    onCustomClick={() => setShowReminderInput(true)}
                  />
                </div>

                {/* 🤖 Smart AI Reply Buttons (⚡ Quick Reply & ✨ AI Thread Reply) */}
                <div className="flex items-center gap-2">
                  <SmartReplyActions
                    machineId={machineId}
                    fromEmail={selectedEmail.from}
                    accountEmail={selectedAcc?.email || ""}
                    appPassword={selectedAcc?.appPassword || ""}
                    fromName={selectedEmail.fromName}
                    subject={selectedEmail.subject}
                    currentUid={selectedEmail.uid}
                    emailText={selectedEmail.fullText || selectedEmail.snippet}
                    previousOutreach={selectedEmail.previousOutreach}
                    onReplyGenerated={(suggested) => setReplyText(suggested)}
                  />
                </div>
              </div>

              {showReminderInput && (
                <FollowUpModal
                  currentReminder={selectedEmail.reminderDate}
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

              {showHindi && hindiTranslation && (
                <div className="mx-4 mt-2 p-3 bg-amber-950/30 border border-amber-700/60 rounded-lg text-amber-200 shrink-0">
                  <div className="text-xs font-bold text-amber-400 mb-1 flex items-center gap-1.5">
                    <span>🇮🇳 हिंदी अनुवाद (सरल भाषा में):</span>
                  </div>
                  <div className="text-xs whitespace-pre-wrap leading-relaxed font-sans">
                    {hindiTranslation}
                  </div>
                </div>
              )}

              {/* ईमेल की मुख्य बॉडी */}
              <div className="flex-1 p-4 overflow-y-auto whitespace-pre-wrap text-xs text-slate-300 leading-relaxed font-sans bg-slate-950/20">
                {selectedEmail.fullText || selectedEmail.snippet}
              </div>

              {/* 🎯 नीचे का ड्राफ्ट और सेंड बॉक्स */}
              <div className="p-3 border-t border-slate-800 bg-slate-900/90 flex flex-col gap-2 shrink-0">
                <div className="flex justify-between items-center">
                  <div className="text-[11px] text-slate-400">
                    Replying as: <span className="text-emerald-400 font-mono font-medium">{selectedAcc?.email}</span>
                  </div>
                  {replyText && (
                    <button
                      onClick={() => setReplyText("")}
                      className="text-[11px] text-rose-400 hover:text-rose-300 transition cursor-pointer"
                    >
                      ✕ Clear Draft
                    </button>
                  )}
                </div>

                <textarea
                  rows={3}
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Click '⚡ Quick Reply' or '✨ AI Thread Reply' above to generate draft, or type here..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-indigo-500 transition leading-relaxed font-sans resize-none"
                />

                <div className="flex justify-between items-center pt-1">
                  <span className="text-[10px] text-slate-500 italic">
                    {pendingHotEmails.length > 0
                      ? `After reply, next message in ${selectedAcc?.senderName || selectedAcc?.email} will open.`
                      : "Manual control: Draft will only be sent when clicked."}
                  </span>
                  
                  <button
                    onClick={handleSendReply}
                    disabled={sending || !replyText.trim()}
                    className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold px-4 py-1.5 rounded-lg transition shadow flex items-center gap-1.5 cursor-pointer"
                  >
                    {sending ? "Sending..." : "✓ Send Reply & Continue"}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center flex-1 text-slate-600 text-xs">
              Select an email from the list to view details
            </div>
          )}
        </div>
      </div>
    </div>
  );
}