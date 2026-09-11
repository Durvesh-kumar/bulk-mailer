// src/app/page.tsx
"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import SuspendedScreen from "@/components/SuspendedScreen";
import ReferralBanner from "@/components/ReferralBanner";
import { AccountAgeMode, MODE_CONFIGS } from "@/config/AccountAgeMode";
import RejectedLeadsModal from "@/components/modals/RejectedLeadsModal";
import SpintaxPreviewModal from "@/components/modals/SpintaxPreviewModal";
import CampaignAnalyticsDashboard from "@/components/dashboard/CampaignAnalyticsDashboard";
import { cleanAndFilterLeads, RejectedEmailItem } from "@/lib/leadCleaner";
import { useLicenseGuard } from "@/hook/useLicenseGuard";
import { isSenderInCooldown } from "@/utils/cooldown";
import {
  ProfileTier,
  SmtpAccount,
  FailedEmailItem,
  TIER_META,
  SESSION_TOKEN_KEY,
  PENDING_QUEUE_STORAGE_KEY,
} from "@/types/vault";

// Sub-Components
import HomeHeader from "@/components/home/HomeHeader";
import CampaignStatsGrid from "@/components/home/CampaignStatsGrid";
import LiveDashboard from "@/components/home/LiveDashboard";
import AppendLeadsModal from "@/components/home/AppendLeadsModal";
import CampaignForm from "@/components/home/CampignForm";
import FailedLeadsModal from "@/components/home/FailedLeadsModel";

const DEFAULT_BATCH_SIZE = 10;
const MIN_ALLOWED_BATCH_SIZE = 1;
const COOLDOWN_HOURS_MS = 24 * 60 * 60 * 1000;

function formatDuration(ms: number): string {
  if (ms <= 0) return "Ready now";
  const totalSecs = Math.floor(ms / 1000);
  const hrs = Math.floor(totalSecs / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;

  if (hrs > 0) return `${hrs}h ${mins}m ${secs}s`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

export default function Home() {
  const { loadingLicense, isSuspended, userType, expiryDate, machineId, appDomain, setIsSuspended } = useLicenseGuard();

  const [selectedTier, setSelectedTier] = useState<ProfileTier>("CURRENT");
  const [isVaultLoaded, setIsVaultLoaded] = useState(false);

  // Active Sender State
  const [senderName, setSenderName] = useState("");
  const [senderEmail, setSenderEmail] = useState("");
  const [appPassword, setAppPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [inMemorySenders, setInMemorySenders] = useState<SmtpAccount[]>([]);
  const [peerReceivers, setPeerReceivers] = useState<Array<{ email: string; senderName?: string; appPassword?: string }>>([]);
  const [currentSenderIndex, setCurrentSenderIndex] = useState<number>(0);
  const [sendersUsedRounds, setSendersUsedRounds] = useState<number>(0);

  // Campaign Form State
  const [batchSize, setBatchSize] = useState<number>(DEFAULT_BATCH_SIZE);
  const [rawSheetData, setRawSheetData] = useState("");
  const [subjectList, setSubjectList] = useState<string[]>([""]);
  
  // Multi-Template State
  const [templateList, setTemplateList] = useState<string[]>([""]);
  const [activeTemplateTab, setActiveTemplateTab] = useState<number>(0);

  const [customSignoffName, setCustomSignoffName] = useState("");
  const [accountAgeMode, setAccountAgeMode] = useState<AccountAgeMode>("AGED");

  // Rotation Control State
  const [rotationMode, setRotationMode] = useState<"CONTINUOUS" | "EVERY_N_SENDERS" | "EVERY_SINGLE_SENDER">("CONTINUOUS");
  const [pauseAfterNSenders, setPauseAfterNSenders] = useState<number>(2);

  // Queue & Counter State
  const [pendingEmails, setPendingEmails] = useState<string[]>([]);
  const [initialTotalCount, setInitialTotalCount] = useState<number>(0);
  const [processedCount, setProcessedCount] = useState<number>(0);
  const [successCount, setSuccessCount] = useState<number>(0);

  const [loading, setLoading] = useState(false);
  const [isDnsChecking, setIsDnsChecking] = useState(false);
  const [dnsProgressText, setDnsProgressText] = useState("");
  const [progressStatus, setProgressStatus] = useState<string>("");
  const [isCampaignStarted, setIsCampaignStarted] = useState(false);
  const [lastBatchMessage, setLastBatchMessage] = useState<string>("");

  // Live Cooldown State
  const [cooldownRemainingMs, setCooldownRemainingMs] = useState<number | null>(null);
  const [cooldownTierLabel, setCooldownTierLabel] = useState<string>("");

  // Live Telemetry & Diagnostics Modal State
  const [showAnalyticsDashboard, setShowAnalyticsDashboard] = useState(false);
  const [diagnosticStats, setDiagnosticStats] = useState({
    code550: 0,
    code552: 0,
    code553: 0,
    code554: 0,
    code421: 0,
    other: 0,
  });
  const [senderMetrics, setSenderMetrics] = useState({});
  const [totalWarmupCount, setTotalWarmupCount] = useState(0);
  const [totalRescuedCount, setTotalRescuedCount] = useState(0);

  // Modals State
  const [showRejectedModal, setShowRejectedModal] = useState(false);
  const [rejectedData, setRejectedData] = useState<RejectedEmailItem[]>([]);
  const [rejectedStats, setRejectedStats] = useState({ total: 0, dups: 0, syntax: 0, temp: 0 });

  const [failedLeadsList, setFailedLeadsList] = useState<FailedEmailItem[]>([]);
  const [showFailedModal, setShowFailedModal] = useState(false);
  const [copiedType, setCopiedType] = useState<"DETAILED" | "EMAILS" | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  const [isAppendModalOpen, setIsAppendModalOpen] = useState(false);
  const [appendLeadInput, setAppendLeadInput] = useState("");
  const [selectedFolderToSwitch, setSelectedFolderToSwitch] = useState<ProfileTier>("YEAR_2");

  // DOM Refs
  const domProcessedCountRef = useRef<HTMLSpanElement>(null);
  const domDeliveredCountRef = useRef<HTMLSpanElement>(null);
  const domFailedCountRef = useRef<HTMLSpanElement>(null);
  const domLiveStatusRef = useRef<HTMLParagraphElement>(null);
  const domEtaRef = useRef<HTMLSpanElement>(null);

  const workerRef = useRef<Worker | null>(null);
  const dnsWorkerRef = useRef<Worker | null>(null);

  // केवल उन्हीं सेंडर्स का टाइमस्टैम्प अपडेट करें जिनका मेल वास्तव में प्रोसेस हुआ
  const syncSenderTimestamps = async (usedTimes: Record<string, string>) => {
    if (!usedTimes || Object.keys(usedTimes).length === 0 || !machineId) return;
    try {
      const savedSession = localStorage.getItem(SESSION_TOKEN_KEY) || "";
      await fetch("/api/smtp-vault/sync-timestamps", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-session-token": savedSession },
        body: JSON.stringify({ machineId, timestamps: usedTimes }),
      });
    } catch (_) {}
  };

  useEffect(() => {
    try {
      const savedPending = localStorage.getItem(PENDING_QUEUE_STORAGE_KEY);
      if (savedPending) {
        const parsedQueue = JSON.parse(savedPending);
        if (Array.isArray(parsedQueue) && parsedQueue.length > 0) {
          setPendingEmails(parsedQueue);
          setRawSheetData(parsedQueue.join("\n"));
          setInitialTotalCount(parsedQueue.length);
        }
      }
    } catch (_) {}
  }, []);

  useEffect(() => {
    if (cooldownRemainingMs === null || cooldownRemainingMs <= 0) return;
    const interval = setInterval(() => {
      setCooldownRemainingMs((prev) => {
        if (prev === null || prev <= 1000) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1000;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldownRemainingMs]);

  useEffect(() => {
    if (!machineId) return;
    const fetchPeers = async () => {
      try {
        const savedSession = localStorage.getItem(SESSION_TOKEN_KEY) || "";
        const res = await fetch(`/api/smtp-vault?machineId=${encodeURIComponent(machineId)}`, {
          headers: { "x-session-token": savedSession },
        });
        const data = await res.json();
        if (data.accounts && Array.isArray(data.accounts)) {
          setPeerReceivers(
            data.accounts.map((a: any) => ({
              email: a.email,
              senderName: a.senderName,
              appPassword: a.appPassword || a.password,
            }))
          );
        }
      } catch (_) {}
    };
    fetchPeers();
  }, [machineId]);

  const estimatedTimeRemaining = useMemo(() => {
    const remaining = pendingEmails.length;
    if (remaining === 0) return "";
    const avgSecPerEmail = 5;
    const totalSeconds = remaining * avgSecPerEmail;
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return mins > 0 ? `~${mins}m ${secs}s` : `~${secs}s`;
  }, [pendingEmails.length]);

  useEffect(() => {
    workerRef.current = new Worker("/workers/campaign.worker.js");

    workerRef.current.onmessage = (e) => {
      const { type, payload, message, sessionToken } = e.data;

      if (type === "LIVE_STATUS") {
        if (domLiveStatusRef.current) domLiveStatusRef.current.innerText = payload.text;
        else setProgressStatus(payload.text);
      }

      if (type === "UPDATE_SESSION_TOKEN" && sessionToken) {
        localStorage.setItem(SESSION_TOKEN_KEY, sessionToken);
      }

      if (type === "TELEMETRY_UPDATE") {
        if (payload.diagnosticStats) setDiagnosticStats(payload.diagnosticStats);
        if (payload.senderMetrics) setSenderMetrics(payload.senderMetrics);
        if (payload.totalWarmupCount !== undefined) setTotalWarmupCount(payload.totalWarmupCount);
        if (payload.totalRescuedCount !== undefined) setTotalRescuedCount(payload.totalRescuedCount);
      }

      if (type === "BATCH_CHUNK_DONE") {
        const updatedRemaining = payload.remainingQueue || [];
        setProcessedCount(payload.instantProcessed);
        setSuccessCount(payload.instantSuccess);
        setPendingEmails(updatedRemaining);

        if (payload.diagnosticStats) setDiagnosticStats(payload.diagnosticStats);
        if (payload.senderMetrics) setSenderMetrics(payload.senderMetrics);
        if (payload.totalWarmupCount !== undefined) setTotalWarmupCount(payload.totalWarmupCount);
        if (payload.totalRescuedCount !== undefined) setTotalRescuedCount(payload.totalRescuedCount);

        if (updatedRemaining.length > 0) {
          localStorage.setItem(PENDING_QUEUE_STORAGE_KEY, JSON.stringify(updatedRemaining));
        } else {
          localStorage.removeItem(PENDING_QUEUE_STORAGE_KEY);
        }
        setRawSheetData(updatedRemaining.join("\n"));

        if (domProcessedCountRef.current) domProcessedCountRef.current.innerText = String(payload.instantProcessed);
        if (domDeliveredCountRef.current) domDeliveredCountRef.current.innerText = String(payload.instantSuccess);

        if (payload.newlyFailed && payload.newlyFailed.length > 0) {
          setFailedLeadsList((prev) => {
            const updated = [...prev, ...payload.newlyFailed];
            if (domFailedCountRef.current) domFailedCountRef.current.innerText = String(updated.length);
            return updated;
          });
        }
      }

      if (type === "ROUND_DONE") {
        setSendersUsedRounds(payload.updatedRounds);
        setCurrentSenderIndex(payload.nextSenderIndex);
        setLastBatchMessage(payload.lastBatchMessage);
        if (payload.nextSender) {
          setSenderEmail(payload.nextSender.email);
          setAppPassword(payload.nextSender.appPassword);
          setSenderName(payload.nextSender.senderName || "Colleague");
        }
      }

      if (type === "PAUSED") {
        setLoading(false);
        if (payload?.senderProcessedTimes) {
          syncSenderTimestamps(payload.senderProcessedTimes);
        }
      }

      if (type === "PAUSE_REQUIRED") {
        setLoading(false);
        if (message) alert(message);
      }

      if (type === "QUEUE_FINISHED_OR_STOPPED") {
        setLoading(false);
        setProgressStatus("");
        if (payload.diagnosticStats) setDiagnosticStats(payload.diagnosticStats);
        if (payload.senderMetrics) setSenderMetrics(payload.senderMetrics);

        // केवल प्रयुक्त सेंडर्स का टाइमस्टैम्प अपडेट करें
        if (payload.senderProcessedTimes) {
          syncSenderTimestamps(payload.senderProcessedTimes);
        }

        if (payload.isQueueEmpty) {
          setIsCampaignStarted(false);
          localStorage.removeItem(PENDING_QUEUE_STORAGE_KEY);
          setRawSheetData("");
          setShowAnalyticsDashboard(true);
        } else if (payload.areSendersExhausted) {
          alert("All active sender accounts have reached their specified lot limit.");
        }
      }

      if (type === "SUSPENDED") {
        localStorage.removeItem(SESSION_TOKEN_KEY);
        setIsSuspended(true);
        setLoading(false);
      }

      if (type === "ALERT" && message) alert(message);
      if (type === "FATAL_ERROR" && message) {
        alert(message);
        setLoading(false);
      }
    };

    return () => {
      workerRef.current?.terminate();
      dnsWorkerRef.current?.terminate();
    };
  }, [setIsSuspended, machineId]);

  const handleAddSubjectField = () => {
    if (subjectList.length < 5) setSubjectList([...subjectList, ""]);
  };

  const handleRemoveSubjectField = (indexToRemove: number) => {
    if (subjectList.length > 1) setSubjectList(subjectList.filter((_, idx) => idx !== indexToRemove));
  };

  const handleSubjectTextChange = (index: number, val: string) => {
    const updated = [...subjectList];
    updated[index] = val;
    setSubjectList(updated);
  };

  const handleAddTemplateField = () => {
    if (templateList.length < 3) {
      const nextIndex = templateList.length;
      setTemplateList([...templateList, ""]);
      setActiveTemplateTab(nextIndex);
    }
  };

  const handleRemoveTemplateField = (indexToRemove: number) => {
    if (templateList.length > 1) {
      const updated = templateList.filter((_, idx) => idx !== indexToRemove);
      setTemplateList(updated);
      setActiveTemplateTab(Math.max(0, indexToRemove - 1));
    }
  };

  const handleTemplateTextChange = (index: number, val: string) => {
    const updated = [...templateList];
    updated[index] = val;
    setTemplateList(updated);
  };

  const handleStartCampaign = (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    const result = cleanAndFilterLeads(rawSheetData);
    if (result.validEmails.length === 0) {
      alert("Please paste valid email addresses in the target leads box!");
      return;
    }

    const hasSubject = subjectList.some((s) => s.trim().length > 0);
    if (!hasSubject) {
      alert("Please enter at least one Subject Line!");
      return;
    }

    const validTemplates = templateList.map((t) => t.trim()).filter((t) => t.length > 0);
    if (validTemplates.length === 0) {
      alert("Please enter at least one Email Body Template!");
      return;
    }

    if (!senderEmail || !senderName) {
      alert("Please enter Sender Email and Display Name!");
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
    // उपयोगकर्ता द्वारा सेट किया गया लॉट साइज ही इस्तेमाल होगा
    const targetLotSize = batchSize > 0 ? batchSize : DEFAULT_BATCH_SIZE;

    localStorage.setItem(PENDING_QUEUE_STORAGE_KEY, JSON.stringify(result.validEmails));

    setPendingEmails(result.validEmails);
    setInitialTotalCount(result.validEmails.length);
    setProcessedCount(0);
    setSuccessCount(0);
    setSendersUsedRounds(0);
    setFailedLeadsList([]);
    setCurrentSenderIndex(0);
    setIsCampaignStarted(true);
    setLoading(true);

    if (domProcessedCountRef.current) domProcessedCountRef.current.innerText = "0";
    if (domDeliveredCountRef.current) domDeliveredCountRef.current.innerText = "0";
    if (domFailedCountRef.current) domFailedCountRef.current.innerText = "0";

    const savedSession = localStorage.getItem(SESSION_TOKEN_KEY) || "";
    const adminKey = sessionStorage.getItem("admin_session_key") || "inboxsend_mesh_secret_2026";

    workerRef.current?.postMessage({
      action: "START",
      payload: {
        currentQueue: result.validEmails,
        sendersList: activeSenders,
        peerReceivers: peerReceivers.length > 0 ? peerReceivers : activeSenders,
        senderIdx: 0,
        roundsDone: 0,
        currentProcessed: 0,
        currentSuccess: 0,
        targetLotSize,
        mode: accountAgeMode,
        activeEmail: activeSenders[0].email,
        activePass: activeSenders[0].appPassword,
        activeName: activeSenders[0].senderName || "Colleague",
        rotationMode,
        pauseAfterNSenders,
        subjectList,
        template: validTemplates[0],
        templateList: validTemplates,
        customSignoffName,
        machineId,
        sessionToken: savedSession,
        adminKey,
        modeConfig: currentModeConfig,
      },
    });
  };

  const handleResumeOrNextBatch = (e: React.FormEvent) => {
    e.preventDefault();
    if (loading || pendingEmails.length === 0) return;

    setLoading(true);
    const currentSender = inMemorySenders[currentSenderIndex % inMemorySenders.length] || inMemorySenders[0];
    const currentModeConfig = MODE_CONFIGS[accountAgeMode];
    const targetLotSize = batchSize > 0 ? batchSize : DEFAULT_BATCH_SIZE;
    const savedSession = localStorage.getItem(SESSION_TOKEN_KEY) || "";
    const adminKey = sessionStorage.getItem("admin_session_key") || "inboxsend_mesh_secret_2026";
    const validTemplates = templateList.map((t) => t.trim()).filter((t) => t.length > 0);

    workerRef.current?.postMessage({
      action: "RESUME",
      payload: {
        currentQueue: pendingEmails,
        sendersList: inMemorySenders,
        peerReceivers: peerReceivers.length > 0 ? peerReceivers : inMemorySenders,
        senderIdx: currentSenderIndex % inMemorySenders.length,
        roundsDone: sendersUsedRounds,
        currentProcessed: processedCount,
        currentSuccess: successCount,
        targetLotSize,
        mode: accountAgeMode,
        activeEmail: currentSender.email,
        activePass: currentSender.appPassword,
        activeName: currentSender.senderName || "Colleague",
        rotationMode,
        pauseAfterNSenders,
        subjectList,
        template: validTemplates[0] || templateList[0],
        templateList: validTemplates.length > 0 ? validTemplates : templateList,
        customSignoffName,
        machineId,
        sessionToken: savedSession,
        adminKey,
        modeConfig: currentModeConfig,
      },
    });
  };

  const handleStopCampaign = () => {
    workerRef.current?.postMessage({ action: "STOP" });
    setLoading(false);
    setProgressStatus("");
    setLastBatchMessage("Campaign paused. Scheduled background 2-way replies are still processing safely.");
  };

  const handleFullReset = () => {
    if (loading) return;
    if (confirm("Reset current campaign completely? This will clear all loaded leads.")) {
      workerRef.current?.postMessage({ action: "RESET" });
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
      setSubjectList([""]);
      setTemplateList([""]);
      setActiveTemplateTab(0);
      setCustomSignoffName("");
      setSenderEmail("");
      setAppPassword("");
      setSenderName("");
      setBatchSize(DEFAULT_BATCH_SIZE);
      setProgressStatus("");
      setLastBatchMessage("");
      setCooldownRemainingMs(null);
      if (domProcessedCountRef.current) domProcessedCountRef.current.innerText = "0";
      if (domDeliveredCountRef.current) domDeliveredCountRef.current.innerText = "0";
      if (domFailedCountRef.current) domFailedCountRef.current.innerText = "0";
      localStorage.removeItem(PENDING_QUEUE_STORAGE_KEY);
    }
  };

  // टियर बदलने पर रीसेट और फ्रेश लोड
  const handleLoadTierAccounts = async (tier: ProfileTier) => {
    if (!machineId) return;

    if (workerRef.current) {
      workerRef.current.postMessage({ action: "RESET" });
    }

    setLoading(true);
    const tierLabel = TIER_META[tier]?.label || tier;
    setProgressStatus(`Loading ${tierLabel} accounts...`);
    const savedSession = localStorage.getItem(SESSION_TOKEN_KEY) || "";

    try {
      const res = await fetch(`/api/smtp-vault?machineId=${encodeURIComponent(machineId)}&tier=${tier}`, {
        method: "GET",
        headers: { "Content-Type": "application/json", "x-session-token": savedSession },
      });

      const data = await res.json();
      if (data.accounts && data.accounts.length > 0) {
        const currentTierOnly: SmtpAccount[] = data.accounts.filter((a: SmtpAccount) => a.profileTier === tier);
        const availableAccounts = currentTierOnly.filter((acc) => !isSenderInCooldown(acc.email, acc.lastSentAt));

        if (availableAccounts.length > 0) {
          setCooldownRemainingMs(null);
          setInMemorySenders(availableAccounts);
          setCurrentSenderIndex(0);
          setSendersUsedRounds(0);
          setSenderEmail(availableAccounts[0].email);
          setAppPassword(availableAccounts[0].appPassword);
          setSenderName(availableAccounts[0].senderName || "Colleague");
          setSelectedTier(tier);
          if (TIER_META[tier]?.modeMap) setAccountAgeMode(TIER_META[tier].modeMap);
          setIsVaultLoaded(true);
          setLastBatchMessage(`Successfully loaded ${availableAccounts.length} active sender node(s).`);
        } else {
          let minRemainingMs = COOLDOWN_HOURS_MS;
          currentTierOnly.forEach((acc) => {
            if (acc.lastSentAt) {
              const elapsed = Date.now() - new Date(acc.lastSentAt).getTime();
              const remaining = Math.max(0, COOLDOWN_HOURS_MS - elapsed);
              if (remaining < minRemainingMs) minRemainingMs = remaining;
            }
          });

          setCooldownTierLabel(tierLabel);
          setCooldownRemainingMs(minRemainingMs);
          setLastBatchMessage(
            `All accounts in ${tierLabel} are resting. Earliest node unlocks in ${formatDuration(minRemainingMs)}.`
          );
        }
      } else {
        alert(`No accounts registered under ${tierLabel} in your Vault.`);
      }
    } catch {
      alert("Failed to load vault accounts.");
    } finally {
      setLoading(false);
      setProgressStatus("");
    }
  };

  const handleSwitchSenderFolderDirectly = async (tierToSwitch: ProfileTier) => {
    await handleLoadTierAccounts(tierToSwitch);
  };

  // रनिंग कैंपेन में नई लीड्स जोड़ना
  const handleAppendMoreLeads = (e: React.FormEvent) => {
    e.preventDefault();
    if (!appendLeadInput.trim()) return;

    const result = cleanAndFilterLeads(appendLeadInput);
    if (result.validEmails.length === 0) {
      alert("No valid email addresses found in your input.");
      return;
    }

    const existingSet = new Set(pendingEmails.map((email) => email.toLowerCase()));
    const freshLeads = result.validEmails.filter((email) => !existingSet.has(email.toLowerCase()));

    if (freshLeads.length === 0) {
      alert("All these leads are already in the queue!");
      return;
    }

    const updatedQueue = [...pendingEmails, ...freshLeads];

    setPendingEmails(updatedQueue);
    setInitialTotalCount((prev) => prev + freshLeads.length);
    setRawSheetData(updatedQueue.join("\n"));
    localStorage.setItem(PENDING_QUEUE_STORAGE_KEY, JSON.stringify(updatedQueue));

    // वर्कर को नई लीड्स भेजें
    workerRef.current?.postMessage({
      action: "APPEND_LEADS",
      payload: { newLeads: freshLeads },
    });

    setAppendLeadInput("");
    setIsAppendModalOpen(false);
    alert(`Successfully added ${freshLeads.length} new clean lead(s) to the active queue!`);
  };

  const handleBatchSizeChange = (val: string) => {
    if (val === "") { setBatchSize(0); return; }
    const num = parseInt(val, 10);
    if (!isNaN(num)) setBatchSize(Math.max(1, num));
  };

  const handleBatchSizeBlur = () => {
    if (!batchSize || batchSize < MIN_ALLOWED_BATCH_SIZE) setBatchSize(DEFAULT_BATCH_SIZE);
  };

  const handleQuickClean = () => {
    const input = (rawSheetData || "").trim();
    if (!input) {
      alert("Please paste your email leads list in the box first to clean!");
      return;
    }

    const result = cleanAndFilterLeads(input);
    setRawSheetData(result.cleanedText || "");
    setRejectedData([...result.rejectedList]);
    setRejectedStats({
      total: result.rejectedCount,
      dups: result.duplicatesCount,
      syntax: result.syntaxErrorsCount,
      temp: result.disposableCount,
    });

    if (result.rejectedCount > 0) {
      setShowRejectedModal(true);
    } else if (result.validEmails.length > 0) {
      alert(`Quick Clean Complete! ${result.validEmails.length} valid lead(s) ready.`);
    } else {
      alert("No valid email addresses found.");
    }
  };

  // ⚡ DNS MX चेकर वर्कर कॉल: लाइव प्रोग्रेस और इनपुट बॉक्स से फ़ेल लीड्स को बाहर निकालना
  const handleDnsMxVerify = () => {
    const input = (rawSheetData || "").trim();
    if (!input) {
      alert("Please paste leads first to verify DNS/MX records.");
      return;
    }

    const preCleaned = cleanAndFilterLeads(input);
    if (preCleaned.validEmails.length === 0) {
      alert("No valid email syntax found to verify.");
      return;
    }

    setIsDnsChecking(true);
    setDnsProgressText(`Verifying 0/${preCleaned.validEmails.length}...`);

    if (dnsWorkerRef.current) dnsWorkerRef.current.terminate();
    dnsWorkerRef.current = new Worker("/workers/lead-cleaner.worker.js");

    const verifiedValidList: string[] = [];
    const verifiedFailedList: RejectedEmailItem[] = [];

    if (preCleaned.rejectedList.length > 0) {
      verifiedFailedList.push(...preCleaned.rejectedList);
    }

    dnsWorkerRef.current.onmessage = (e) => {
      const { type, processedSoFar, total, results } = e.data;

      if (type === "CHUNK_PROCESSED") {
        setDnsProgressText(`Verifying ${processedSoFar}/${total}...`);
        results.forEach((item: any) => {
          if (item.valid) {
            verifiedValidList.push(item.email);
          } else {
            verifiedFailedList.push({
              email: item.email,
              reason: item.reason || item.message || "MX_RECORD_MISSING",
              category: "SYNTAX_ERROR",
            });
          }
        });
      }

      if (type === "ALL_VERIFIED") {
        setIsDnsChecking(false);
        setDnsProgressText("");

        // 🛑 केवल वैध लीड्स इनपुट बॉक्स और क्यू में रहेंगी (फ़ेल लीड्स बाहर निकल गईं)
        const cleanString = verifiedValidList.join("\n");
        setRawSheetData(cleanString);
        setPendingEmails(verifiedValidList);
        setInitialTotalCount(verifiedValidList.length);

        if (verifiedFailedList.length > 0) {
          setRejectedData(verifiedFailedList);
          setRejectedStats({
            total: verifiedFailedList.length,
            dups: preCleaned.duplicatesCount,
            syntax: verifiedFailedList.length,
            temp: preCleaned.disposableCount,
          });
          setShowRejectedModal(true);
        }

        alert(`DNS MX Verification complete! ${verifiedValidList.length} verified valid leads ready.`);
        dnsWorkerRef.current?.terminate();
      }
    };

    dnsWorkerRef.current.postMessage({
      action: "START_VERIFY",
      payload: { emails: preCleaned.validEmails, chunkSize: 5 },
    });
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

  const remainingCount = pendingEmails.length;
  const currentMaxLot = MODE_CONFIGS[accountAgeMode]?.maxLot || 100;
  const isSingleSender = rotationMode === "EVERY_SINGLE_SENDER";
  const currentBatchTarget = isSingleSender ? Math.min(batchSize || DEFAULT_BATCH_SIZE, remainingCount) : 1;
  const totalAccountsCount = inMemorySenders.length;
  const remainingAccountsInQueue = totalAccountsCount > 0 ? (totalAccountsCount - (currentSenderIndex % totalAccountsCount)) : 0;

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 py-5 px-3 sm:px-6 font-sans selection:bg-indigo-500 selection:text-white">
      <div className="max-w-7xl mx-auto space-y-4">
        <ReferralBanner />

        <HomeHeader
          machineId={machineId}
          loading={loading}
          onReset={handleFullReset}
        />

        <CampaignStatsGrid
          totalAccountsCount={totalAccountsCount}
          sendersUsedRounds={sendersUsedRounds}
          currentSenderIndex={currentSenderIndex}
          remainingAccountsInQueue={remainingAccountsInQueue}
          initialTotalCount={initialTotalCount}
          processedCount={processedCount}
          successCount={successCount}
          failedLeadsList={failedLeadsList}
          domProcessedCountRef={domProcessedCountRef}
          domDeliveredCountRef={domDeliveredCountRef}
          domFailedCountRef={domFailedCountRef}
          onShowFailedModal={() => setShowFailedModal(true)}
        />

        {/* 📊 Analytics Dashboard Launch Bar */}
        <div className="flex items-center justify-between bg-slate-900/60 border border-slate-800 p-3 rounded-2xl">
          <div className="flex items-center gap-2">
            <span className="text-base">📈</span>
            <span className="text-xs font-mono text-slate-300">Live Deliverability & Spam Analysis Engine</span>
          </div>
          <button
            type="button"
            onClick={() => setShowAnalyticsDashboard(true)}
            className="px-3.5 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/40 text-indigo-300 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
          >
            <span>📊</span> View Visual Analytics Chart
          </button>
        </div>

        {/* Cooldown Alert Banner */}
        {cooldownRemainingMs !== null && cooldownRemainingMs > 0 && (
          <div className="bg-amber-950/40 border border-amber-500/40 p-4 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xl">
            <div className="flex items-center gap-3">
              <span className="text-2xl">⏳</span>
              <div>
                <h4 className="text-xs font-bold text-amber-300">
                  {cooldownTierLabel} Accounts are on Cooldown
                </h4>
                <p className="text-[11px] text-amber-400/80 mt-0.5">
                  Sender accounts are resting to protect deliverability score.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="bg-amber-900/50 border border-amber-500/50 px-3 py-1.5 rounded-xl font-mono text-xs font-bold text-amber-200">
                Ready in: {formatDuration(cooldownRemainingMs)}
              </div>
              <button
                type="button"
                onClick={() => setCooldownRemainingMs(null)}
                className="text-slate-400 hover:text-white text-xs px-2 py-1 cursor-pointer"
              >
                ✕ Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Active Dispatch Progress Bar */}
        {loading && (
          <div className="bg-indigo-950/40 border border-indigo-500/30 px-4 py-3 rounded-2xl flex flex-col md:flex-row items-center justify-between shadow-xl gap-3 animate-pulse">
            <div className="flex items-center gap-3 w-full md:w-auto">
              <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin flex-shrink-0"></div>
              <div>
                <p ref={domLiveStatusRef} className="text-xs font-mono text-indigo-300 font-bold">
                  {progressStatus || "Active Campaign Dispatch in Progress..."}
                </p>
                <div className="text-[11px] text-indigo-400/80 font-mono mt-0.5 flex items-center gap-2">
                  <span>Remaining: {pendingEmails.length} leads</span>
                  <span>•</span>
                  <span>Est. Completion: <strong ref={domEtaRef} className="text-indigo-200">{estimatedTimeRemaining || "Calculating..."}</strong></span>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={handleStopCampaign}
              className="w-full md:w-auto px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition shadow-md cursor-pointer"
            >
              🛑 Pause Campaign
            </button>
          </div>
        )}

        {lastBatchMessage && !loading && (
          <div className="bg-emerald-950/30 border border-emerald-500/30 px-4 py-2.5 rounded-2xl flex items-center justify-between text-xs text-emerald-300 font-medium">
            <span>{lastBatchMessage}</span>
            <button type="button" onClick={() => setLastBatchMessage("")} className="text-slate-400 hover:text-white text-xs cursor-pointer">✕</button>
          </div>
        )}

        {/* Setup Form VS Live Dashboard */}
        {!isCampaignStarted ? (
          <CampaignForm
            loading={loading}
            selectedTier={selectedTier}
            isVaultLoaded={isVaultLoaded}
            inMemorySenders={inMemorySenders}
            handleLoadTierAccounts={handleLoadTierAccounts}
            senderEmail={senderEmail}
            setSenderEmail={setSenderEmail}
            senderName={senderName}
            setSenderName={setSenderName}
            showPassword={showPassword}
            setShowPassword={setShowPassword}
            appPassword={appPassword}
            setAppPassword={setAppPassword}
            handleQuickClean={handleQuickClean}
            handleDnsMxVerify={handleDnsMxVerify}
            isDnsChecking={isDnsChecking}
            dnsProgressText={dnsProgressText}
            rejectedData={rejectedData}
            setShowRejectedModal={setShowRejectedModal}
            rawSheetData={rawSheetData}
            setRawSheetData={setRawSheetData}
            accountAgeMode={accountAgeMode}
            setAccountAgeMode={setAccountAgeMode}
            batchSize={batchSize}
            setBatchSize={setBatchSize}
            handleBatchSizeChange={handleBatchSizeChange}
            handleBatchSizeBlur={handleBatchSizeBlur}
            currentMaxLot={currentMaxLot}
            rotationMode={rotationMode}
            setRotationMode={setRotationMode}
            pauseAfterNSenders={pauseAfterNSenders}
            setPauseAfterNSenders={setPauseAfterNSenders}
            subjectList={subjectList}
            handleSubjectTextChange={handleSubjectTextChange}
            handleRemoveSubjectField={handleRemoveSubjectField}
            handleAddSubjectField={handleAddSubjectField}
            setShowPreviewModal={setShowPreviewModal}
            template={templateList[activeTemplateTab] || ""}
            setTemplate={(val: string) => handleTemplateTextChange(activeTemplateTab, val)}
            templateList={templateList}
            activeTemplateTab={activeTemplateTab}
            setActiveTemplateTab={setActiveTemplateTab}
            handleAddTemplateField={handleAddTemplateField}
            handleRemoveTemplateField={handleRemoveTemplateField}
            handleTemplateTextChange={handleTemplateTextChange}
            customSignoffName={customSignoffName}
            setCustomSignoffName={setCustomSignoffName}
            handleStartCampaign={handleStartCampaign}
          />
        ) : (
          <LiveDashboard
            setIsAppendModalOpen={setIsAppendModalOpen}
            selectedFolderToSwitch={selectedFolderToSwitch}
            setSelectedFolderToSwitch={setSelectedFolderToSwitch}
            handleSwitchSenderFolderDirectly={handleSwitchSenderFolderDirectly}
            remainingCount={remainingCount}
            handleResumeOrNextBatch={handleResumeOrNextBatch}
            loading={loading}
            senderEmail={senderEmail}
            setSenderEmail={setSenderEmail}
            sendersUsedRounds={sendersUsedRounds}
            handleStopCampaign={handleStopCampaign}
            handleFullReset={handleFullReset}
            isVaultLoaded={isVaultLoaded}
            senderName={senderName}
            setSenderName={setSenderName}
            showPassword={showPassword}
            setShowPassword={setShowPassword}
            appPassword={appPassword}
            setAppPassword={setAppPassword}
            subjectList={subjectList}
            handleSubjectTextChange={handleSubjectTextChange}
            handleRemoveSubjectField={handleRemoveSubjectField}
            handleAddSubjectField={handleAddSubjectField}
            customSignoffName={customSignoffName}
            setCustomSignoffName={setCustomSignoffName}
            setShowPreviewModal={setShowPreviewModal}
            template={templateList[activeTemplateTab] || ""}
            setTemplate={(val: string) => handleTemplateTextChange(activeTemplateTab, val)}
            currentBatchTarget={currentBatchTarget}
          />
        )}
      </div>

      {/* Modals */}
      <AppendLeadsModal
        isOpen={isAppendModalOpen}
        onClose={() => setIsAppendModalOpen(false)}
        appendLeadInput={appendLeadInput}
        setAppendLeadInput={setAppendLeadInput}
        onSubmit={handleAppendMoreLeads}
      />

      <RejectedLeadsModal
        isOpen={showRejectedModal}
        onClose={() => setShowRejectedModal(false)}
        rejectedData={rejectedData}
        stats={rejectedStats}
      />

      <FailedLeadsModal
        isOpen={showFailedModal}
        onClose={() => setShowFailedModal(false)}
        failedLeadsList={failedLeadsList}
        copiedType={copiedType}
        onCopyFailedEmailsOnly={handleCopyFailedEmailsOnly}
        onCopyFailedDetailed={handleCopyFailedDetailed}
      />

      <SpintaxPreviewModal
        isOpen={showPreviewModal}
        onClose={() => setShowPreviewModal(false)}
        template={templateList[activeTemplateTab] || ""}
        subject={subjectList[0] || ""}
        subjects={subjectList}
        senderName={senderName}
        customSignoffName={customSignoffName}
      />

      <CampaignAnalyticsDashboard
        isOpen={showAnalyticsDashboard}
        onClose={() => setShowAnalyticsDashboard(false)}
        diagnosticStats={diagnosticStats}
        senderMetrics={senderMetrics}
        totalCold={processedCount}
        totalWarmup={totalWarmupCount}
        totalRescued={totalRescuedCount}
      />
    </main>
  );
}