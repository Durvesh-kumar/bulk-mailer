// src/app/page.tsx
"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { getClientMachineId } from "@/lib/fingerprint";
import SuspendedScreen from "@/components/SuspendedScreen";
import ReferralBanner from "@/components/ReferralBanner";
import { AccountAgeMode, MODE_CONFIGS } from "@/config/AccountAgeMode";

// 🚀 Smart Modules & Modals Integration (फालतू generateFrontendPreviewVariation इम्पोर्ट यहाँ से हटा दिया गया है)
import RejectedLeadsModal from "@/components/modals/RejectedLeadsModal";
import SpintaxPreviewModal from "@/components/modals/SpintaxPreviewModal";
import { cleanAndFilterLeads, RejectedEmailItem } from "@/lib/leadCleaner";

export type ProfileTier = "CURRENT" | "YEAR_1" | "YEAR_2" | "YEAR_4" | "YEAR_6";

const SESSION_TOKEN_KEY = "reachout_daily_session_token";
const PENDING_QUEUE_STORAGE_KEY = "inboxsend_pending_queue_state";
const SENDERS_QUEUE_STORAGE_KEY = "inboxsend_senders_state";
const DEFAULT_BATCH_SIZE = 10;
const MIN_ALLOWED_BATCH_SIZE = 1;

interface SmtpAccount {
  _id: string;
  email: string;
  appPassword: string;
  senderName: string;
  profileTier: ProfileTier;
}

interface FailedEmailItem {
  email: string;
  reason: string;
  senderUsed: string;
  time: string;
}

const TIER_META: Record<ProfileTier, { label: string; badge: string; modeMap: AccountAgeMode; color: string }> = {
  CURRENT: { label: "Fresh (<6 Mo)", badge: "🔴 Fresh", modeMap: "FRESH", color: "border-rose-500 text-rose-300 bg-rose-950/30" },
  YEAR_1: { label: "1 Year Aged", badge: "🟡 1 Year", modeMap: "STANDARD", color: "border-amber-500 text-amber-300 bg-amber-950/30" },
  YEAR_2: { label: "2 Year Aged", badge: "🟢 2 Year", modeMap: "AGED", color: "border-emerald-500 text-emerald-300 bg-emerald-950/30" },
  YEAR_4: { label: "4 Year Prime", badge: "💎 4 Year", modeMap: "AGED", color: "border-blue-500 text-blue-300 bg-blue-950/30" },
  YEAR_6: { label: "6+ Year Ultra", badge: "👑 6+ Year", modeMap: "AGED", color: "border-purple-500 text-purple-300 bg-purple-950/30" },
};

export default function Home() {
  const [loadingLicense, setLoadingLicense] = useState(true);
  const [isSuspended, setIsSuspended] = useState(false);
  const [userType, setUserType] = useState<"NEW_USER" | "SUSPENDED" | "EXPIRED">("NEW_USER");
  const [expiryDate, setExpiryDate] = useState("");
  const [machineId, setMachineId] = useState("");
  const [appDomain, setAppDomain] = useState("");

  const [selectedTier, setSelectedTier] = useState<ProfileTier>("YEAR_2");
  const [isVaultLoaded, setIsVaultLoaded] = useState(false);

  const [senderName, setSenderName] = useState("");
  const [senderEmail, setSenderEmail] = useState("");
  const [appPassword, setAppPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [inMemorySenders, setInMemorySenders] = useState<SmtpAccount[]>([]);
  const [currentSenderIndex, setCurrentSenderIndex] = useState<number>(0);
  const [sendersUsedRounds, setSendersUsedRounds] = useState<number>(0);

  const [batchSize, setBatchSize] = useState<number>(DEFAULT_BATCH_SIZE);
  const [rawSheetData, setRawSheetData] = useState("");
  const [subject, setSubject] = useState("");
  const [template, setTemplate] = useState("");
  const [customSignoffName, setCustomSignoffName] = useState("");
  const [accountAgeMode, setAccountAgeMode] = useState<AccountAgeMode>("AGED");

  const [rotationMode, setRotationMode] = useState<"CONTINUOUS" | "EVERY_N_SENDERS" | "EVERY_SINGLE_SENDER">("CONTINUOUS");
  const [pauseAfterNSenders, setPauseAfterNSenders] = useState<number>(2);

  const isStopRequestedRef = useRef(false);

  const [pendingEmails, setPendingEmails] = useState<string[]>([]);
  const [initialTotalCount, setInitialTotalCount] = useState<number>(0);
  const [processedCount, setProcessedCount] = useState<number>(0);
  const [successCount, setSuccessCount] = useState<number>(0);
  
  const [loading, setLoading] = useState(false);
  const [progressStatus, setProgressStatus] = useState<string>("");
  const [isCampaignStarted, setIsCampaignStarted] = useState(false);
  const [lastBatchMessage, setLastBatchMessage] = useState<string>("");

  const [showRejectedModal, setShowRejectedModal] = useState(false);
  const [rejectedData, setRejectedData] = useState<RejectedEmailItem[]>([]);
  const [rejectedStats, setRejectedStats] = useState({ total: 0, dups: 0, syntax: 0, temp: 0 });

  const [failedLeadsList, setFailedLeadsList] = useState<FailedEmailItem[]>([]);
  const [showFailedModal, setShowFailedModal] = useState(false);
  const [copiedType, setCopiedType] = useState<"DETAILED" | "EMAILS" | null>(null);

  const [showPreviewModal, setShowPreviewModal] = useState(false);

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
          setUserType(data.reason === "EXPIRED" ? "EXPIRED" : data.reason === "SUSPENDED" ? "SUSPENDED" : "NEW_USER");
          if (data.expiryDate) setExpiryDate(data.expiryDate);
        } else {
          setIsSuspended(false);
          if (data.sessionToken) localStorage.setItem(SESSION_TOKEN_KEY, data.sessionToken);

          try {
            const savedQueue = localStorage.getItem(PENDING_QUEUE_STORAGE_KEY);
            if (savedQueue) {
              const parsed = JSON.parse(savedQueue);
              if (Array.isArray(parsed) && parsed.length > 0) {
                setPendingEmails(parsed);
                setRawSheetData(parsed.join("\n"));
                setInitialTotalCount(parsed.length);
                setIsCampaignStarted(true);
                setLastBatchMessage(`⚡ Restored ${parsed.length} pending leads from last active session`);
              }
            }
          } catch (e) {
            console.error("Queue restore error:", e);
          }

          try {
            const savedSendersState = localStorage.getItem(SENDERS_QUEUE_STORAGE_KEY);
            if (savedSendersState) {
              const parsedState = JSON.parse(savedSendersState);
              if (parsedState.senders && parsedState.senders.length > 0) {
                setInMemorySenders(parsedState.senders);
                const sIdx = parsedState.currentIndex || 0;
                setCurrentSenderIndex(sIdx);
                setSendersUsedRounds(parsedState.rounds || 0);

                const active = parsedState.senders[sIdx] || parsedState.senders[0];
                setSenderEmail(active.email);
                setAppPassword(active.appPassword);
                setSenderName(active.senderName);
                if (active.profileTier) {
                  const tierKey = active.profileTier as ProfileTier;
                  setSelectedTier(tierKey);
                  if (TIER_META[tierKey]) {
                    setAccountAgeMode(TIER_META[tierKey].modeMap);
                  }
                }
                setIsVaultLoaded(true);
              }
            }
          } catch (e) {
            console.error("Senders restore error:", e);
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

  const handleLoadTierAccounts = async (tier: ProfileTier) => {
    if (!machineId) return;
    setLoading(true);
    setProgressStatus(`Loading ${TIER_META[tier].label} accounts...`);

    const savedSession = localStorage.getItem(SESSION_TOKEN_KEY) || "";

    try {
      const res = await fetch(`/api/smtp-vault?machineId=${encodeURIComponent(machineId)}&tier=${tier}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "x-session-token": savedSession,
        },
      });

      const data = await res.json();
      if (data.accounts && data.accounts.length > 0) {
        const currentTierOnly: SmtpAccount[] = data.accounts.filter((a: SmtpAccount) => a.profileTier === tier);
        
        if (currentTierOnly.length > 0) {
          setInMemorySenders(currentTierOnly);
          setCurrentSenderIndex(0);
          setSendersUsedRounds(0);
          setSenderEmail(currentTierOnly[0].email);
          setAppPassword(currentTierOnly[0].appPassword);
          setSenderName(currentTierOnly[0].senderName);
          setSelectedTier(tier);
          setAccountAgeMode(TIER_META[tier].modeMap);
          setIsVaultLoaded(true);
          setLastBatchMessage(`⚡ Loaded ${currentTierOnly.length} account(s) for ${TIER_META[tier].label}`);

          localStorage.setItem(
            SENDERS_QUEUE_STORAGE_KEY,
            JSON.stringify({ senders: currentTierOnly, currentIndex: 0, rounds: 0 })
          );
        } else {
          alert(`No accounts registered under ${TIER_META[tier].label} in your Vault.`);
        }
      } else {
        alert(`No accounts registered under ${TIER_META[tier].label} in your Vault.`);
      }
    } catch {
      alert("Failed to load vault accounts.");
    } finally {
      setLoading(false);
      setProgressStatus("");
    }
  };

  const handleBatchSizeChange = (val: string) => {
    if (val === "") {
      setBatchSize(0);
      return;
    }
    const num = parseInt(val, 10);
    const maxLimit = MODE_CONFIGS[accountAgeMode]?.maxLot || 100;
    if (!isNaN(num)) {
      setBatchSize(Math.min(num, maxLimit));
    }
  };

  const handleBatchSizeBlur = () => {
    const maxLimit = MODE_CONFIGS[accountAgeMode]?.maxLot || 100;
    if (!batchSize || batchSize < MIN_ALLOWED_BATCH_SIZE) {
      setBatchSize(DEFAULT_BATCH_SIZE);
    } else if (batchSize > maxLimit) {
      setBatchSize(maxLimit);
    }
  };

  const handleAutoCleanLeads = () => {
    if (!rawSheetData.trim()) {
      alert("⚠️ Please paste your email leads list in the box first to clean!");
      return;
    }

    const result = cleanAndFilterLeads(rawSheetData);
    setRawSheetData(result.cleanedText);
    setRejectedData(result.rejectedList);
    setRejectedStats({
      total: result.rejectedCount,
      dups: result.duplicatesCount,
      syntax: result.syntaxErrorsCount,
      temp: result.disposableCount,
    });

    if (result.rejectedCount > 0) {
      setShowRejectedModal(true);
    } else if (result.validEmails.length > 0) {
      alert(`✨ All ${result.validEmails.length} leads are 100% clean and valid!`);
    } else {
      alert("❌ No valid email addresses found.");
    }
  };

  const handleCopyFailedDetailed = () => {
    if (failedLeadsList.length === 0) return;
    const header = "Failed Lead Email | Sender Used | Reason | Time\n" + "-".repeat(70) + "\n";
    const body = failedLeadsList
      .map((item) => `${item.email} | Sender: ${item.senderUsed} | Reason: ${item.reason} | Time: ${item.time}`)
      .join("\n");

    navigator.clipboard.writeText(header + body);
    setCopiedType("DETAILED");
    setTimeout(() => setCopiedType(null), 2500);
  };

  const handleCopyFailedEmailsOnly = () => {
    if (failedLeadsList.length === 0) return;
    const emailsText = failedLeadsList.map((item) => item.email).join("\n");
    navigator.clipboard.writeText(emailsText);
    setCopiedType("EMAILS");
    setTimeout(() => setCopiedType(null), 2500);
  };

  const handleStopCampaign = () => {
    isStopRequestedRef.current = true;
    setLoading(false);
    setIsCampaignStarted(false);
    setProgressStatus("Campaign stopped manually by user.");
    setLastBatchMessage("🛑 Campaign halted. Remaining queue is safely saved.");
  };

  const handleStartCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    isStopRequestedRef.current = false;

    const result = cleanAndFilterLeads(rawSheetData);
    if (result.validEmails.length === 0) {
      alert("Please paste valid email addresses in the target leads box!");
      return;
    }

    if (!senderEmail || !appPassword || !senderName) {
      alert("Sender credentials missing! Please select an Age Profile or enter details.");
      return;
    }

    let activeSenders = inMemorySenders;
    if (activeSenders.length === 0) {
      activeSenders = [{
        _id: "manual_1",
        email: senderEmail.trim().toLowerCase(),
        appPassword: appPassword.replace(/\s+/g, ""),
        senderName: senderName.trim(),
        profileTier: selectedTier,
      }];
      setInMemorySenders(activeSenders);
    }

    const currentModeConfig = MODE_CONFIGS[accountAgeMode];
    const safeBatchSize = batchSize > 0 
      ? Math.min(batchSize, currentModeConfig.maxLot) 
      : Math.min(DEFAULT_BATCH_SIZE, currentModeConfig.maxLot);

    localStorage.setItem(PENDING_QUEUE_STORAGE_KEY, JSON.stringify(result.validEmails));
    localStorage.setItem(
      SENDERS_QUEUE_STORAGE_KEY,
      JSON.stringify({ senders: activeSenders, currentIndex: 0, rounds: 0 })
    );

    setPendingEmails(result.validEmails);
    setInitialTotalCount(result.validEmails.length);
    setProcessedCount(0);
    setSuccessCount(0);
    setSendersUsedRounds(0);
    setFailedLeadsList([]);
    setCurrentSenderIndex(0);
    setIsCampaignStarted(true);
    setLastBatchMessage("");

    await consumeQueueBatch(
      result.validEmails,
      activeSenders,
      0,
      0,
      0,
      0,
      safeBatchSize,
      accountAgeMode,
      senderEmail.trim().toLowerCase(),
      appPassword.replace(/\s+/g, ""),
      senderName.trim()
    );
  };

  const consumeQueueBatch = async (
    currentQueue: string[],
    sendersList: SmtpAccount[],
    senderIdx: number,
    roundsDone: number,
    currentProcessed: number,
    currentSuccess: number,
    bSize: number,
    mode: AccountAgeMode,
    activeEmail: string,
    activePass: string,
    activeName: string
  ) => {
    if (isStopRequestedRef.current || currentQueue.length === 0) {
      setIsCampaignStarted(false);
      setLoading(false);
      if (currentQueue.length === 0) {
        localStorage.removeItem(PENDING_QUEUE_STORAGE_KEY);
        alert("🎉 All leads have been processed, delivered, and cleared from the queue!");
      }
      return;
    }

    setLoading(true);
    setLastBatchMessage("");
    let latestSessionToken = localStorage.getItem(SESSION_TOKEN_KEY) || "";
    
    const batchToSend = currentQueue.slice(0, bSize);
    const activeChunkSize = MODE_CONFIGS[mode]?.chunkSize || 10;

    let batchProcessedCount = 0;
    let batchSuccessCount = 0;
    let fallbackTriggered = false;

    try {
      for (let i = 0; i < batchToSend.length; i += activeChunkSize) {
        if (isStopRequestedRef.current) break;

        const chunk = batchToSend.slice(i, i + activeChunkSize);
        const startNum = i + 1;
        const endNum = Math.min(i + activeChunkSize, batchToSend.length);

        setProgressStatus(`[${activeEmail}] Dispatching ${startNum}-${endNum} of ${batchToSend.length}...`);

        const res = await fetch("/api/send-campaign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            senderName: activeName.trim(),
            senderEmail: activeEmail.trim().toLowerCase(),
            appPassword: activePass.replace(/\s+/g, ""),
            recipients: chunk,
            subject: subject.trim(),
            template: template.trim(),
            customSignoffName: customSignoffName.trim(),
            accountAgeMode: mode,
            machineId,
            sessionToken: latestSessionToken,
          }),
        });

        const data = await res.json();

        if (data.accountError || res.status === 400 || res.status === 401) {
          fallbackTriggered = true;
          const reasonText =
            data.accountErrorType === "QUOTA_EXCEEDED"
              ? "Daily Sending Quota Exceeded"
              : "Authentication Failed / Invalid Password";

          alert(`⚠️ [${activeEmail}] ${reasonText}!\n⚡ Auto-switching to next healthy account from Vault...`);

          const remainingSenders = sendersList.filter(
            (s) => s.email.toLowerCase() !== activeEmail.toLowerCase()
          );

          if (remainingSenders.length === 0) {
            alert("❌ All sender accounts in this tier failed or hit daily limit. Please update accounts in Vault.");
            setLoading(false);
            return;
          }

          const nextSender = remainingSenders[0];
          setInMemorySenders(remainingSenders);
          setCurrentSenderIndex(0);
          setSenderEmail(nextSender.email);
          setAppPassword(nextSender.appPassword);
          setSenderName(nextSender.senderName);

          localStorage.setItem(
            SENDERS_QUEUE_STORAGE_KEY,
            JSON.stringify({ senders: remainingSenders, currentIndex: 0, rounds: roundsDone })
          );

          const unhandledQueue = currentQueue.slice(batchProcessedCount);
          await consumeQueueBatch(
            unhandledQueue,
            remainingSenders,
            0,
            roundsDone,
            currentProcessed + batchProcessedCount,
            currentSuccess + batchSuccessCount,
            bSize,
            mode,
            nextSender.email,
            nextSender.appPassword,
            nextSender.senderName
          );
          return;
        }

        if (res.status === 403) {
          setIsSuspended(true);
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

        const chunkResults: { email: string; status: string; error?: string }[] = data.report || [];
        const chunkSuccess = chunkResults.filter((r) => r.status === "SUCCESS").length;

        const newlyFailed = chunkResults
          .filter((r) => r.status === "FAILED")
          .map((r) => ({
            email: r.email,
            reason: r.error || "SMTP Delivery Refused",
            senderUsed: activeEmail,
            time: new Date().toLocaleTimeString(),
          }));

        if (newlyFailed.length > 0) {
          setFailedLeadsList((prev) => [...prev, ...newlyFailed]);
        }
        
        batchProcessedCount += chunk.length;
        batchSuccessCount += chunkSuccess;
      }

      if (!isStopRequestedRef.current && !fallbackTriggered) {
        const remainingQueue = currentQueue.slice(batchToSend.length);
        const updatedTotalProcessed = currentProcessed + batchProcessedCount;
        const updatedTotalSuccess = currentSuccess + batchSuccessCount;
        const updatedRounds = roundsDone + 1;

        setPendingEmails(remainingQueue);
        setProcessedCount(updatedTotalProcessed);
        setSuccessCount(updatedTotalSuccess);
        setSendersUsedRounds(updatedRounds);

        if (remainingQueue.length > 0) {
          localStorage.setItem(PENDING_QUEUE_STORAGE_KEY, JSON.stringify(remainingQueue));
        } else {
          localStorage.removeItem(PENDING_QUEUE_STORAGE_KEY);
        }

        if (batchToSend.length > 0) {
          setLastBatchMessage(`✅ Batch of ${batchToSend.length} leads dispatched using ${activeEmail}`);
        }

        if (sendersList.length > 0) {
          const nextSenderIdx = (senderIdx + 1) % sendersList.length;
          const nextSender = sendersList[nextSenderIdx];
          setCurrentSenderIndex(nextSenderIdx);
          setSenderEmail(nextSender.email);
          setAppPassword(nextSender.appPassword);
          setSenderName(nextSender.senderName);

          localStorage.setItem(
            SENDERS_QUEUE_STORAGE_KEY,
            JSON.stringify({
              senders: sendersList,
              currentIndex: nextSenderIdx,
              rounds: updatedRounds,
            })
          );
        }

        if (remainingQueue.length === 0) {
          setIsCampaignStarted(false);
          setRawSheetData("");
        }

        if (remainingQueue.length > 0 && rotationMode !== "CONTINUOUS") {
          let shouldPause = false;

          if (rotationMode === "EVERY_SINGLE_SENDER") {
            shouldPause = true;
          } else if (rotationMode === "EVERY_N_SENDERS") {
            const n = Math.max(1, pauseAfterNSenders);
            if (updatedRounds > 0 && updatedRounds % n === 0) {
              shouldPause = true;
            }
          }

          if (shouldPause) {
            alert(
              `⏸️ [Rotation Pause Triggered]\n` +
              `Sender [${activeEmail}] completed turn #${updatedRounds}.\n` +
              `Please update your Subject and Email Template before sending the next batch!`
            );
          }
        }
      }
    } catch {
      alert("Network error. Please check your connection.");
    } finally {
      setLoading(false);
      setProgressStatus("");
    }
  };

  const handleNextBatch = (e: React.FormEvent) => {
    e.preventDefault();
    if (loading || pendingEmails.length === 0) return;
    const maxLimit = MODE_CONFIGS[accountAgeMode]?.maxLot || 100;
    const safeBatchSize = batchSize > 0 ? Math.min(batchSize, maxLimit) : DEFAULT_BATCH_SIZE;

    isStopRequestedRef.current = false;
    consumeQueueBatch(
      pendingEmails,
      inMemorySenders,
      currentSenderIndex,
      sendersUsedRounds,
      processedCount,
      successCount,
      safeBatchSize,
      accountAgeMode,
      senderEmail,
      appPassword,
      senderName
    );
  };

  const handleFullReset = () => {
    if (loading) return;
    if (confirm("Reset current campaign and clear queue?")) {
      isStopRequestedRef.current = true;
      setIsCampaignStarted(false);
      setPendingEmails([]);
      setInMemorySenders([]);
      setIsVaultLoaded(false);
      setInitialTotalCount(0);
      setProcessedCount(0);
      setSuccessCount(0);
      setSendersUsedRounds(0);
      setCurrentSenderIndex(0);
      setFailedLeadsList([]);
      setRawSheetData("");
      setSubject("");
      setTemplate("");
      setCustomSignoffName("");
      setSenderEmail("");
      setAppPassword("");
      setSenderName("");
      setBatchSize(DEFAULT_BATCH_SIZE);
      setProgressStatus("");
      setLastBatchMessage("");
      localStorage.removeItem(PENDING_QUEUE_STORAGE_KEY);
      localStorage.removeItem(SENDERS_QUEUE_STORAGE_KEY);
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
        expiryDate={expiryDate}
        adminPhone="+918266821377"
        adminEmail="inboxsend.support@gmail.com"
      />
    );
  }

  const remainingCount = pendingEmails.length;
  const currentMaxLot = MODE_CONFIGS[accountAgeMode]?.maxLot || 100;
  const currentBatchTarget = Math.min(batchSize || DEFAULT_BATCH_SIZE, remainingCount);

  const totalAccountsCount = inMemorySenders.length;
  const remainingAccountsInQueue = totalAccountsCount > 0 
    ? (totalAccountsCount - (currentSenderIndex % totalAccountsCount)) 
    : 0;

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 py-5 px-3 sm:px-6 font-sans selection:bg-indigo-500 selection:text-white">
      <div className="max-w-7xl mx-auto space-y-4">

        <ReferralBanner />
        
        <div className="bg-slate-900/90 border border-slate-800 px-5 py-3 rounded-2xl flex flex-wrap justify-between items-center gap-3 shadow-xl">
          <div className="flex items-center gap-3">
            <img src="/icons/engine-hub.svg" alt="Hub" className="w-7 h-7 object-contain" />
            <div>
              <h1 className="text-lg font-black bg-gradient-to-r from-blue-400 via-indigo-300 to-purple-400 bg-clip-text text-transparent leading-tight">
                InboxSend Multi-Account Rotator
              </h1>
              <p className="text-[10px] text-slate-400 font-mono">
                Hardware Binding: <span className="text-indigo-400">{machineId || "Authenticating..."}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/vault"
              className="px-3 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
            >
              <span>🔐</span> Senders Vault
            </Link>
            <button
              type="button"
              disabled={loading}
              onClick={handleFullReset}
              className="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 rounded-xl text-xs font-bold transition cursor-pointer"
            >
              🔄 Reset
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 bg-slate-900/90 border border-slate-800 p-3 rounded-2xl shadow-lg">
          <div className="bg-slate-950/80 p-2.5 rounded-xl border border-slate-800/80 text-center">
            <span className="text-[9px] text-slate-400 uppercase font-black block">Senders Loaded</span>
            <p className="text-base font-black text-white font-mono">{totalAccountsCount}</p>
          </div>
          <div className="bg-slate-950/80 p-2.5 rounded-xl border border-blue-500/20 text-center">
            <span className="text-[9px] text-blue-400 uppercase font-black block">Turns Done</span>
            <p className="text-base font-black text-blue-400 font-mono">{sendersUsedRounds}</p>
          </div>
          <div className="bg-slate-950/80 p-2.5 rounded-xl border border-emerald-500/20 text-center">
            <span className="text-[9px] text-emerald-400 uppercase font-black block">Current Turn</span>
            <p className="text-base font-black text-emerald-400 font-mono">
              #{totalAccountsCount > 0 ? (currentSenderIndex % totalAccountsCount) + 1 : 0}
            </p>
          </div>
          <div className="bg-slate-950/80 p-2.5 rounded-xl border border-indigo-500/20 text-center">
            <span className="text-[9px] text-indigo-400 uppercase font-black block">Senders Queue</span>
            <p className="text-base font-black text-indigo-400 font-mono">{remainingAccountsInQueue}</p>
          </div>

          <div className="bg-slate-950/80 p-2.5 rounded-xl border border-slate-800/80 text-center">
            <span className="text-[9px] text-slate-400 uppercase font-black block">Total Leads</span>
            <p className="text-base font-black text-slate-100 font-mono">{initialTotalCount}</p>
          </div>
          <div className="bg-slate-950/80 p-2.5 rounded-xl border border-indigo-500/20 text-center">
            <span className="text-[9px] text-indigo-400 uppercase font-black block">Processed</span>
            <p className="text-base font-black text-indigo-400 font-mono">{processedCount}</p>
          </div>
          <div className="bg-slate-950/80 p-2.5 rounded-xl border border-emerald-500/20 text-center">
            <span className="text-[9px] text-emerald-400 uppercase font-black block">Delivered</span>
            <p className="text-base font-black text-emerald-400 font-mono">{successCount}</p>
          </div>
          <div 
            onClick={() => failedLeadsList.length > 0 && setShowFailedModal(true)}
            className={`p-2.5 rounded-xl border text-center transition ${
              failedLeadsList.length > 0 
                ? "bg-rose-950/40 border-rose-500/40 cursor-pointer hover:border-rose-400 animate-pulse" 
                : "bg-slate-950/80 border-slate-800 opacity-60"
            }`}
          >
            <span className="text-[9px] text-rose-400 uppercase font-black block">
              Failed {failedLeadsList.length > 0 && "👁️"}
            </span>
            <p className="text-base font-black text-rose-400 font-mono">{failedLeadsList.length}</p>
          </div>
        </div>

        {loading && (
          <div className="bg-indigo-950/40 border border-indigo-500/30 px-4 py-2.5 rounded-2xl flex items-center justify-between shadow-xl animate-pulse">
            <div className="flex items-center gap-3">
              <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-xs font-mono text-indigo-300 font-bold">{progressStatus}</p>
            </div>
            <button
              type="button"
              onClick={handleStopCampaign}
              className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold transition shadow-md cursor-pointer"
            >
              🛑 Stop Campaign
            </button>
          </div>
        )}

        {lastBatchMessage && !loading && (
          <div className="bg-emerald-950/30 border border-emerald-500/30 px-4 py-2.5 rounded-2xl flex items-center justify-between text-xs text-emerald-300 font-medium">
            <span>{lastBatchMessage}</span>
            <button onClick={() => setLastBatchMessage("")} className="text-slate-400 hover:text-white text-xs cursor-pointer">✕</button>
          </div>
        )}

        {!isCampaignStarted ? (
          <form onSubmit={handleStartCampaign} className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
            
            <div className="lg:col-span-5 flex flex-col justify-between gap-3">
              
              <div className="bg-slate-900/90 border border-slate-800 p-3.5 rounded-2xl space-y-2 shadow-lg">
                <div className="flex justify-between items-center">
                  <span className="text-[11px] font-bold text-slate-300 flex items-center gap-1">
                    <span>📅</span> 1. Select Age Group:
                  </span>
                  {isVaultLoaded && (
                    <span className="text-[10px] text-emerald-400 font-mono bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded-md">
                      ✓ {inMemorySenders.length} Loaded
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
                  {(Object.keys(TIER_META) as ProfileTier[]).map((tier) => {
                    const meta = TIER_META[tier];
                    const isSelected = selectedTier === tier;
                    return (
                      <button
                        key={tier}
                        type="button"
                        disabled={loading}
                        onClick={() => handleLoadTierAccounts(tier)}
                        className={`py-1.5 px-1 rounded-xl border text-[10px] font-bold transition flex flex-col items-center justify-center cursor-pointer ${
                          isSelected
                            ? `${meta.color} shadow-md scale-105`
                            : "bg-slate-950 border-slate-800 text-slate-400 hover:text-white"
                        }`}
                      >
                        <span>{meta.badge}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="bg-slate-900/90 border border-slate-800 p-3.5 rounded-2xl space-y-2.5 shadow-lg">
                <div>
                  <label className="text-[11px] font-bold text-slate-300 block mb-1">Active Sender Gmail</label>
                  <input
                    type="email"
                    required
                    disabled={loading}
                    value={senderEmail}
                    onChange={(e) => setSenderEmail(e.target.value)}
                    placeholder="account1@gmail.com"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white outline-none focus:border-indigo-500 font-mono"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-[11px] font-bold text-slate-300">App Password</label>
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="text-[9px] text-slate-400 hover:text-white cursor-pointer"
                      >
                        {showPassword ? "🙈 Hide" : "👁️ Show"}
                      </button>
                    </div>
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      disabled={loading}
                      value={appPassword}
                      onChange={(e) => setAppPassword(e.target.value)}
                      placeholder="xxxx xxxx xxxx xxxx"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-amber-300 font-mono outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-300 block mb-1">Display Name</label>
                    <input
                      type="text"
                      required
                      disabled={loading}
                      value={senderName}
                      onChange={(e) => setSenderName(e.target.value)}
                      placeholder="e.g. Sales Lead"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
              </div>

              <div className="bg-slate-900/90 border border-slate-800 p-3.5 rounded-2xl space-y-2 shadow-lg flex-1 flex flex-col">
                <div className="flex justify-between items-center">
                  <label className="text-[11px] font-bold text-slate-300 flex items-center gap-1">
                    <img src="/icons/target-lead.svg" alt="Target" className="w-3.5 h-3.5 object-contain" />
                    Target Leads Box
                  </label>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={handleAutoCleanLeads}
                      className="px-2.5 py-0.5 bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 border border-indigo-500/50 rounded-lg text-[10px] font-bold transition cursor-pointer flex items-center gap-1"
                    >
                      ✨ Auto Clean
                    </button>
                    {rejectedData.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setShowRejectedModal(true)}
                        className="px-2 py-0.5 bg-rose-500/20 text-rose-300 border border-rose-500/40 rounded-lg text-[9px] font-semibold cursor-pointer"
                      >
                        ⚠️ Rejected ({rejectedData.length})
                      </button>
                    )}
                  </div>
                </div>

                <textarea
                  required
                  disabled={loading}
                  value={rawSheetData}
                  onChange={(e) => setRawSheetData(e.target.value)}
                  placeholder="lead1@example.com&#10;lead2@example.com&#10;lead3@example.com"
                  className="w-full flex-1 min-h-[300px] bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs font-mono text-slate-200 focus:border-indigo-500 outline-none resize-none leading-relaxed"
                />
              </div>

            </div>

            <div className="lg:col-span-7 bg-slate-900/90 border border-slate-800 p-4 sm:p-5 rounded-2xl shadow-lg flex flex-col justify-between">
              
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-bold text-indigo-300 block mb-1">Account Mode</label>
                    <select
                      disabled={loading}
                      value={accountAgeMode}
                      onChange={(e) => {
                        const newMode = e.target.value as AccountAgeMode;
                        setAccountAgeMode(newMode);
                        const maxLimit = MODE_CONFIGS[newMode]?.maxLot || 100;
                        if (batchSize > maxLimit) setBatchSize(maxLimit);
                      }}
                      className="w-full bg-slate-950 border border-indigo-500/40 rounded-xl px-3 py-2 text-xs font-bold text-slate-100 outline-none focus:border-indigo-500 cursor-pointer"
                    >
                      <option value="AGED">🟢 Aged (2+ Yrs) - Max 100</option>
                      <option value="STANDARD">🟡 Standard (6 Mo-2 Yrs) - Max 50</option>
                      <option value="FRESH">🔴 Fresh (&lt;6 Mo) - Max 30</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-300 block mb-1">Batch Size per Sender Turn</label>
                    <input
                      type="number"
                      min={MIN_ALLOWED_BATCH_SIZE}
                      max={currentMaxLot}
                      required
                      disabled={loading}
                      value={batchSize || ""}
                      onChange={(e) => handleBatchSizeChange(e.target.value)}
                      onBlur={handleBatchSizeBlur}
                      placeholder={String(DEFAULT_BATCH_SIZE)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-indigo-400 font-black outline-none focus:border-indigo-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  </div>
                </div>

                <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl space-y-2">
                  <label className="text-[11px] font-bold text-indigo-300 block">
                    🔄 Template & Subject Rotation Control:
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                    <label className={`flex items-center gap-2 cursor-pointer p-2 rounded-lg border transition ${rotationMode === "CONTINUOUS" ? "bg-indigo-950/50 border-indigo-500 text-white" : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white"}`}>
                      <input 
                        type="radio" 
                        name="rotationModeOption" 
                        checked={rotationMode === "CONTINUOUS"} 
                        onChange={() => setRotationMode("CONTINUOUS")} 
                      />
                      <span>Continuous (No Stop)</span>
                    </label>
                    
                    <label className={`flex items-center gap-2 cursor-pointer p-2 rounded-lg border transition ${rotationMode === "EVERY_N_SENDERS" ? "bg-indigo-950/50 border-indigo-500 text-white" : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white"}`}>
                      <input 
                        type="radio" 
                        name="rotationModeOption" 
                        checked={rotationMode === "EVERY_N_SENDERS"} 
                        onChange={() => setRotationMode("EVERY_N_SENDERS")} 
                      />
                      <span>Pause after N Senders</span>
                    </label>

                    <label className={`flex items-center gap-2 cursor-pointer p-2 rounded-lg border transition ${rotationMode === "EVERY_SINGLE_SENDER" ? "bg-indigo-950/50 border-indigo-500 text-white" : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white"}`}>
                      <input 
                        type="radio" 
                        name="rotationModeOption" 
                        checked={rotationMode === "EVERY_SINGLE_SENDER"} 
                        onChange={() => setRotationMode("EVERY_SINGLE_SENDER")} 
                      />
                      <span>Pause Every Sender Turn</span>
                    </label>
                  </div>

                  {rotationMode === "EVERY_N_SENDERS" && (
                    <div className="pt-2 flex items-center gap-3">
                      <span className="text-[11px] text-slate-300">Pause after how many senders?</span>
                      <input 
                        type="number" 
                        min={1} 
                        max={totalAccountsCount || 10} 
                        value={pauseAfterNSenders}
                        onChange={(e) => setPauseAfterNSenders(parseInt(e.target.value) || 1)}
                        className="w-16 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-indigo-400 font-bold outline-none text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-300 block mb-1">Subject Line</label>
                  <input
                    type="text"
                    required
                    disabled={loading}
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="e.g. Quick question regarding partnership"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:border-indigo-500 outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <label className="text-[11px] font-bold text-slate-300 flex items-center gap-1">
                      <img src="/icons/copy-clipboard.svg" alt="Body" className="w-3 h-3 object-contain opacity-70" />
                      Email Body Template
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowPreviewModal(true)}
                      className="px-2 py-0.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-lg text-[9px] font-semibold cursor-pointer"
                    >
                      👁️ Spintax Preview (4 Samples)
                    </button>
                  </div>

                  <textarea
                    rows={11}
                    required
                    disabled={loading}
                    value={template}
                    onChange={(e) => setTemplate(e.target.value)}
                    placeholder="Type your outreach message here..."
                    className="w-full min-h-[230px] bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-100 focus:border-indigo-500 outline-none leading-relaxed resize-none"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-emerald-400 block mb-1">Custom Signature & Signoff Details</label>
                  <input
                    type="text"
                    disabled={loading}
                    value={customSignoffName}
                    onChange={(e) => setCustomSignoffName(e.target.value)}
                    placeholder="e.g. John Doe | Founder at Acme Corp (Optional)"
                    className="w-full bg-slate-950 border border-emerald-500/30 rounded-xl px-3 py-1.5 text-xs text-slate-100 focus:border-emerald-500 outline-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-black rounded-xl text-xs sm:text-sm transition shadow-xl disabled:opacity-50 flex justify-center items-center gap-2 cursor-pointer active:scale-[0.99] mt-3"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Dispatching Batch 1...</span>
                  </>
                ) : (
                  <>
                    <img src="/icons/gmail.svg" alt="Send" className="w-4 h-4 object-contain" />
                    <span>🚀 Launch Campaign & Send Batch 1 ({Math.min(batchSize || DEFAULT_BATCH_SIZE, currentMaxLot)} Leads)</span>
                  </>
                )}
              </button>
            </div>

          </form>
        ) : (
          <div className="bg-slate-900/90 border border-slate-800 p-5 rounded-2xl space-y-4 shadow-xl">
            {remainingCount > 0 ? (
              <form onSubmit={handleNextBatch} className="space-y-3 bg-slate-950/80 border border-slate-800/90 p-4 rounded-xl">
                <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                  <h3 className="text-xs font-black text-indigo-400 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-indigo-400 animate-ping" />
                    Next Batch: {currentBatchTarget} Pending Leads Ready
                  </h3>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-amber-400 font-mono font-bold bg-amber-500/10 px-2.5 py-0.5 rounded-full border border-amber-500/20">
                      Remaining in Queue: {remainingCount}
                    </span>
                    <button
                      type="button"
                      onClick={handleStopCampaign}
                      className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold transition shadow-sm cursor-pointer"
                    >
                      🛑 Stop Campaign
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-0.5">Active Sender Gmail</label>
                    <input
                      type="email"
                      required
                      disabled={loading}
                      value={senderEmail}
                      onChange={(e) => setSenderEmail(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white font-mono outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-0.5">
                      <label className="text-[10px] text-slate-400">App Password</label>
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="text-[9px] text-slate-400 hover:text-white cursor-pointer"
                      >
                        {showPassword ? "🙈 Hide" : "👁️ Show"}
                      </button>
                    </div>
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      disabled={loading}
                      value={appPassword}
                      onChange={(e) => setAppPassword(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-amber-300 font-mono outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] text-slate-400 block mb-0.5">Sender Display Name</label>
                    <input
                      type="text"
                      required
                      disabled={loading}
                      value={senderName}
                      onChange={(e) => setSenderName(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3.5 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-black rounded-xl text-xs sm:text-sm transition-all duration-300 shadow-xl disabled:opacity-50 flex justify-center items-center gap-2 cursor-pointer active:scale-[0.99]"
                >
                  {loading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>Dispatching Next Batch...</span>
                    </>
                  ) : (
                    <>
                      <img src="/icons/gmail.svg" alt="Send" className="w-4 h-4 object-contain" />
                      <span>Dispatch Next Batch ({currentBatchTarget} Leads)</span>
                    </>
                  )}
                </button>
              </form>
            ) : (
              <div className="p-5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-center rounded-xl font-bold text-xs shadow-inner flex items-center justify-center gap-2">
                <img src="/icons/sparkle-star.svg" alt="Done" className="w-4 h-4 object-contain" />
                All {initialTotalCount} leads have been processed, delivered, and cleared from the queue!
              </div>
            )}
          </div>
        )}

      </div>

      <RejectedLeadsModal
        isOpen={showRejectedModal}
        onClose={() => setShowRejectedModal(false)}
        rejectedData={rejectedData}
        stats={rejectedStats}
      />

      {showFailedModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="bg-slate-900 border border-rose-500/40 w-full max-w-2xl rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-black text-rose-400 uppercase tracking-wider flex items-center gap-2">
                  <span>🔴</span> Delivery Failed Leads ({failedLeadsList.length})
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  These emails could not be delivered by the SMTP provider.
                </p>
              </div>
              <button
                onClick={() => setShowFailedModal(false)}
                className="text-slate-400 hover:text-white text-sm bg-slate-800 px-2.5 py-1 rounded-lg cursor-pointer"
              >
                ✕ Close
              </button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-950 p-2.5 rounded-xl border border-slate-800">
              <span className="text-[11px] text-slate-400 font-mono">Export / Clipboard Actions:</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyFailedEmailsOnly}
                  className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 shadow-sm"
                >
                  <span>📧</span>
                  <span>{copiedType === "EMAILS" ? "✓ Emails Copied!" : "Copy Emails Only"}</span>
                </button>
                <button
                  type="button"
                  onClick={handleCopyFailedDetailed}
                  className="px-3 py-1 bg-rose-600/30 hover:bg-rose-600/50 text-rose-300 border border-rose-500/50 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 shadow-sm"
                >
                  <span>📋</span>
                  <span>{copiedType === "DETAILED" ? "✓ Full Log Copied!" : "Copy All (Detailed Log)"}</span>
                </button>
              </div>
            </div>

            <div className="max-h-80 overflow-y-auto space-y-2 pr-1">
              {failedLeadsList.map((item, idx) => (
                <div key={idx} className="bg-slate-950 p-3 rounded-xl border border-rose-950/80 flex flex-col sm:flex-row justify-between sm:items-center gap-1 text-xs">
                  <div>
                    <span className="font-bold text-white">{item.email}</span>
                    <p className="text-[10px] text-rose-400 font-mono mt-0.5">{item.reason}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 font-mono">Via: {item.senderUsed}</span>
                    <p className="text-[9px] text-slate-500 font-mono">{item.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* SpintaxPreviewModal अब सीधे raw template, subject और signoff को props में लेता है */}
      <SpintaxPreviewModal
        isOpen={showPreviewModal}
        onClose={() => setShowPreviewModal(false)}
        template={template}
        subject={subject}
        senderName={senderName}
        customSignoffName={customSignoffName}
      />
    </main>
  );
}