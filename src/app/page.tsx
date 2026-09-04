// src/app/page.tsx
"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import SuspendedScreen from "@/components/SuspendedScreen";
import ReferralBanner from "@/components/ReferralBanner";
import { AccountAgeMode, MODE_CONFIGS } from "@/config/AccountAgeMode";
import RejectedLeadsModal from "@/components/modals/RejectedLeadsModal";
import SpintaxPreviewModal from "@/components/modals/SpintaxPreviewModal";
import { cleanAndFilterLeads, RejectedEmailItem } from "@/lib/leadCleaner";
import { useLicenseGuard } from "@/hook/useLicenseGuard";
import { isSenderInCooldown, markSenderLotCompleted } from "@/utils/cooldown";
import { InputField } from "@/components/ui/InputField";
import {
  ProfileTier,
  SmtpAccount,
  FailedEmailItem,
  TIER_META,
  SESSION_TOKEN_KEY,
  PENDING_QUEUE_STORAGE_KEY,
} from "@/types/vault";

const DEFAULT_BATCH_SIZE = 10;
const MIN_ALLOWED_BATCH_SIZE = 1;

const sleepRandomDelay = (min = 3000, max = 4500) => {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise((resolve) => setTimeout(resolve, ms));
};

export default function Home() {
  const { loadingLicense, isSuspended, userType, expiryDate, machineId, appDomain, setIsSuspended } = useLicenseGuard();

  const [selectedTier, setSelectedTier] = useState<ProfileTier>("YEAR_2");
  const [isVaultLoaded, setIsVaultLoaded] = useState(false);

  // Active Sender State
  const [senderName, setSenderName] = useState("");
  const [senderEmail, setSenderEmail] = useState("");
  const [appPassword, setAppPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [inMemorySenders, setInMemorySenders] = useState<SmtpAccount[]>([]);
  const [currentSenderIndex, setCurrentSenderIndex] = useState<number>(0);
  const [sendersUsedRounds, setSendersUsedRounds] = useState<number>(0);

  // Campaign Form State
  const [batchSize, setBatchSize] = useState<number>(DEFAULT_BATCH_SIZE);
  const [rawSheetData, setRawSheetData] = useState("");
  const [subject, setSubject] = useState("");
  const [template, setTemplate] = useState("");
  const [customSignoffName, setCustomSignoffName] = useState("");
  const [accountAgeMode, setAccountAgeMode] = useState<AccountAgeMode>("AGED");

  // Rotation Control State
  const [rotationMode, setRotationMode] = useState<"CONTINUOUS" | "EVERY_N_SENDERS" | "EVERY_SINGLE_SENDER">("CONTINUOUS");
  const [pauseAfterNSenders, setPauseAfterNSenders] = useState<number>(2);

  // Live Mutable Refs
  const isStopRequestedRef = useRef(false);
  const subjectRef = useRef("");
  const templateRef = useRef("");
  const customSignoffNameRef = useRef("");
  const rotationModeRef = useRef<"CONTINUOUS" | "EVERY_N_SENDERS" | "EVERY_SINGLE_SENDER">("CONTINUOUS");
  const pauseAfterNSendersRef = useRef<number>(2);

  const senderSentCountRef = useRef<Record<string, number>>({});
  const senderProcessedTimesRef = useRef<Record<string, string>>({});
  const completedSendersCountRef = useRef<number>(0);

  // ⚡ HYBRID DIRECT DOM REFS & THROTTLING REFS (0% CPU LAG ON 4,000+ LEADS)
  const domProcessedCountRef = useRef<HTMLSpanElement>(null);
  const domDeliveredCountRef = useRef<HTMLSpanElement>(null);
  const domFailedCountRef = useRef<HTMLSpanElement>(null);
  const domLiveStatusRef = useRef<HTMLParagraphElement>(null);

  const lastRenderedProcessedRef = useRef<number>(0);
  const lastRenderedDeliveredRef = useRef<number>(0);

  useEffect(() => { subjectRef.current = subject; }, [subject]);
  useEffect(() => { templateRef.current = template; }, [template]);
  useEffect(() => { customSignoffNameRef.current = customSignoffName; }, [customSignoffName]);
  useEffect(() => { rotationModeRef.current = rotationMode; }, [rotationMode]);
  useEffect(() => { pauseAfterNSendersRef.current = pauseAfterNSenders; }, [pauseAfterNSenders]);

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

  // ⚡ DYNAMIC REFILL & FOLDER SWITCH MODALS
  const [isAppendModalOpen, setIsAppendModalOpen] = useState(false);
  const [appendLeadInput, setAppendLeadInput] = useState("");
  const [selectedFolderToSwitch, setSelectedFolderToSwitch] = useState<ProfileTier>("YEAR_2");

  const handleLoadTierAccounts = async (tier: ProfileTier) => {
    if (!machineId) return;
    setLoading(true);
    setProgressStatus(`Loading ${TIER_META[tier]?.label || tier} accounts...`);
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
          setInMemorySenders(availableAccounts);
          setCurrentSenderIndex(0);
          setSendersUsedRounds(0);
          setSenderEmail(availableAccounts[0].email);
          setAppPassword(availableAccounts[0].appPassword);
          setSenderName(availableAccounts[0].senderName || "Colleague");
          setSelectedTier(tier);
          if (TIER_META[tier]?.modeMap) {
            setAccountAgeMode(TIER_META[tier].modeMap);
          }
          setIsVaultLoaded(true);
          setLastBatchMessage(`⚡ Loaded ${availableAccounts.length} active account(s) (${currentTierOnly.length - availableAccounts.length} in 24h cooldown skipped)`);
        } else {
          alert(`⚠️ All accounts in ${TIER_META[tier]?.label || tier} are currently under 24-hour cooldown protection!`);
        }
      } else {
        alert(`No accounts registered under ${TIER_META[tier]?.label || tier} in your Vault.`);
      }
    } catch {
      alert("Failed to load vault accounts.");
    } finally {
      setLoading(false);
      setProgressStatus("");
    }
  };

  // ⚡ DYNAMIC SENDER FOLDER SWITCHING HANDLER
  const handleSwitchSenderFolderDirectly = async (tierToSwitch: ProfileTier) => {
    if (!machineId) return;
    setLoading(true);
    setProgressStatus(`Switching Senders to folder ${TIER_META[tierToSwitch]?.label || tierToSwitch}...`);
    const savedSession = localStorage.getItem(SESSION_TOKEN_KEY) || "";

    try {
      const res = await fetch(`/api/smtp-vault?machineId=${encodeURIComponent(machineId)}&tier=${tierToSwitch}`, {
        method: "GET",
        headers: { "Content-Type": "application/json", "x-session-token": savedSession },
      });

      const data = await res.json();
      if (data.accounts && data.accounts.length > 0) {
        const currentTierOnly: SmtpAccount[] = data.accounts.filter((a: SmtpAccount) => a.profileTier === tierToSwitch);
        const availableAccounts = currentTierOnly.filter((acc) => !isSenderInCooldown(acc.email, acc.lastSentAt));

        if (availableAccounts.length > 0) {
          setInMemorySenders(availableAccounts);
          setCurrentSenderIndex(0);
          setSenderEmail(availableAccounts[0].email);
          setAppPassword(availableAccounts[0].appPassword);
          setSenderName(availableAccounts[0].senderName || "Colleague");
          setSelectedTier(tierToSwitch);
          if (TIER_META[tierToSwitch]?.modeMap) {
            setAccountAgeMode(TIER_META[tierToSwitch].modeMap);
          }
          setIsVaultLoaded(true);
          alert(`✅ Successfully switched sender folder to ${TIER_META[tierToSwitch]?.label || tierToSwitch} (${availableAccounts.length} active senders loaded)!`);
        } else {
          alert(`⚠️ All accounts in ${TIER_META[tierToSwitch]?.label || tierToSwitch} are under 24h cooldown!`);
        }
      } else {
        alert(`No accounts registered under ${TIER_META[tierToSwitch]?.label || tierToSwitch} in your Vault.`);
      }
    } catch {
      alert("Failed to switch sender folder.");
    } finally {
      setLoading(false);
      setProgressStatus("");
    }
  };

  // ⚡ APPEND NEW LEADS DYNAMICALLY WITHOUT RESETING PROGRESS
  const handleAppendMoreLeads = (e: React.FormEvent) => {
    e.preventDefault();
    if (!appendLeadInput.trim()) return;

    const result = cleanAndFilterLeads(appendLeadInput);
    if (result.validEmails.length === 0) {
      alert("⚠️ No valid email addresses found in your input text.");
      return;
    }

    setPendingEmails((prevQueue) => {
      const combined = [...prevQueue, ...result.validEmails];
      const uniqueQueue = Array.from(new Set(combined));
      localStorage.setItem(PENDING_QUEUE_STORAGE_KEY, JSON.stringify(uniqueQueue));
      return uniqueQueue;
    });

    setInitialTotalCount((prev) => prev + result.validEmails.length);
    setAppendLeadInput("");
    setIsAppendModalOpen(false);
    alert(`✅ Successfully added ${result.validEmails.length} new clean lead(s) to the active running queue!`);
  };

  const handleBatchSizeChange = (val: string) => {
    if (val === "") { setBatchSize(0); return; }
    const num = parseInt(val, 10);
    const maxLimit = MODE_CONFIGS[accountAgeMode]?.maxLot || 100;
    if (!isNaN(num)) setBatchSize(Math.min(num, maxLimit));
  };

  const handleBatchSizeBlur = () => {
    const maxLimit = MODE_CONFIGS[accountAgeMode]?.maxLot || 100;
    if (!batchSize || batchSize < MIN_ALLOWED_BATCH_SIZE) setBatchSize(DEFAULT_BATCH_SIZE);
    else if (batchSize > maxLimit) setBatchSize(maxLimit);
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
    if (result.rejectedCount > 0) setShowRejectedModal(true);
    else if (result.validEmails.length > 0) alert(`✨ All ${result.validEmails.length} leads are 100% clean and valid!`);
    else alert("❌ No valid email addresses found.");
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
    setProgressStatus("");
    setLastBatchMessage("⏸️ Campaign paused by user! Edit your Subject or Template below and click Resume.");
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

    if (!senderEmail || !senderName) {
      alert("Please enter Sender Email and Display Name!");
      return;
    }

    if (!isVaultLoaded && !appPassword.trim()) {
      alert("Please enter the 16-digit Gmail App Password for this manual account!");
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
    const targetLotSize = batchSize > 0 ? Math.min(batchSize, currentModeConfig.maxLot) : Math.min(DEFAULT_BATCH_SIZE, currentModeConfig.maxLot);

    localStorage.setItem(PENDING_QUEUE_STORAGE_KEY, JSON.stringify(result.validEmails));

    senderSentCountRef.current = {};
    senderProcessedTimesRef.current = {};
    completedSendersCountRef.current = 0;
    activeSenders.forEach(s => { senderSentCountRef.current[s.email.toLowerCase()] = 0; });

    lastRenderedProcessedRef.current = 0;
    lastRenderedDeliveredRef.current = 0;

    if (domProcessedCountRef.current) domProcessedCountRef.current.innerText = "0";
    if (domDeliveredCountRef.current) domDeliveredCountRef.current.innerText = "0";
    if (domFailedCountRef.current) domFailedCountRef.current.innerText = "0";

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
      targetLotSize,
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
    targetLotSize: number,
    mode: AccountAgeMode,
    activeEmail: string,
    activePass: string,
    activeName: string
  ) => {
    if (isStopRequestedRef.current || currentQueue.length === 0 || sendersList.length === 0) {
      setLoading(false);
      setProgressStatus("");

      setProcessedCount(currentProcessed);
      setSuccessCount(currentSuccess);
      lastRenderedProcessedRef.current = currentProcessed;
      lastRenderedDeliveredRef.current = currentSuccess;

      if (currentQueue.length === 0 || sendersList.length === 0) {
        let latestSessionToken = localStorage.getItem(SESSION_TOKEN_KEY) || "";
        try {
          const recordedEntries = Object.entries(senderProcessedTimesRef.current);
          if (recordedEntries.length > 0) {
            const recordsPayload = recordedEntries.map(([email, sentAt]) => ({ email, sentAt }));
            await fetch("/api/smtp-vault", {
              method: "PATCH",
              headers: { "Content-Type": "application/json", "x-session-token": latestSessionToken },
              body: JSON.stringify({
                machineId,
                sessionToken: latestSessionToken,
                updateType: "BULK_UPDATE_TIMESTAMP",
                updateData: { records: recordsPayload }
              })
            });
          }
        } catch (e) {
          console.error("Timestamp Bulk Sync Error:", e);
        }

        if (currentQueue.length === 0) {
          setIsCampaignStarted(false);
          localStorage.removeItem(PENDING_QUEUE_STORAGE_KEY);
          setRawSheetData("");
          alert("🎉 All leads have been processed, delivered, and cleared from the queue!");
        } else {
          alert(`⚠️ All active sender accounts have completed their lot size (${targetLotSize} emails each)!`);
        }
      }
      return;
    }

    setLoading(true);
    setLastBatchMessage("");
    let latestSessionToken = localStorage.getItem(SESSION_TOKEN_KEY) || "";

    const isSingleSenderFullLot = rotationModeRef.current === "EVERY_SINGLE_SENDER";
    const currentSenderCurrentSent = senderSentCountRef.current[activeEmail.toLowerCase()] || 0;
    const remainingLotForThisSender = Math.max(1, targetLotSize - currentSenderCurrentSent);

    const actualBatchLimit = isSingleSenderFullLot 
      ? Math.min(remainingLotForThisSender, currentQueue.length)
      : 1;

    const batchToSend = currentQueue.slice(0, actualBatchLimit);
    const activeChunkSize = isSingleSenderFullLot 
      ? (MODE_CONFIGS[mode]?.chunkSize || 6) 
      : 1;

    let batchProcessedCount = 0;
    let batchSuccessCount = 0;
    let fallbackTriggered = false;

    try {
      for (let i = 0; i < batchToSend.length; i += activeChunkSize) {
        if (isStopRequestedRef.current) break;

        const chunk = batchToSend.slice(i, i + activeChunkSize);
        const currentCountDisplay = currentSenderCurrentSent + batchProcessedCount + chunk.length;

        const liveText = `[${activeEmail}] (Sent: ${currentCountDisplay}/${targetLotSize}) -> Dispatching ${chunk.length} email(s)...`;
        if (domLiveStatusRef.current) {
          domLiveStatusRef.current.innerText = liveText;
        } else {
          setProgressStatus(liveText);
        }

        const res = await fetch("/api/send-campaign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            senderName: activeName.trim(),
            senderEmail: activeEmail.trim().toLowerCase(),
            appPassword: activePass.replace(/\s+/g, ""),
            recipients: chunk,
            subject: subjectRef.current.trim(),
            template: templateRef.current.trim(),
            customSignoffName: customSignoffNameRef.current.trim(),
            accountAgeMode: mode,
            machineId,
            sessionToken: latestSessionToken,
          }),
        });

        const data = await res.json();

        if (data.accountError || res.status === 400 || res.status === 401) {
          fallbackTriggered = true;
          alert(`⚠️ [${activeEmail}] Quota exceeded or auth failed! Switching to next healthy account...`);

          const remainingSenders = sendersList.filter((s) => s.email.toLowerCase() !== activeEmail.toLowerCase());
          if (remainingSenders.length === 0) {
            alert("❌ All sender accounts failed or hit limits.");
            setLoading(false);
            return;
          }

          const nextSender = remainingSenders[0];
          setInMemorySenders(remainingSenders);
          setSenderEmail(nextSender.email);
          setAppPassword(nextSender.appPassword);
          setSenderName(nextSender.senderName || "Ruby");

          const unhandledQueue = currentQueue.slice(batchProcessedCount);
          await consumeQueueBatch(
            unhandledQueue,
            remainingSenders,
            0,
            roundsDone,
            currentProcessed + batchProcessedCount,
            currentSuccess + batchSuccessCount,
            targetLotSize,
            mode,
            nextSender.email,
            nextSender.appPassword,
            nextSender.senderName || "Ruby"
          );
          return;
        }

        if (res.status === 403) {
          localStorage.removeItem(SESSION_TOKEN_KEY);
          setIsSuspended(true);
          setLoading(false);
          return;
        }

        if (!res.ok) {
          alert(`Execution Error: ${data.error || "Delivery halted unexpectedly"}`);
          setLoading(false);
          return;
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
          setFailedLeadsList((prev) => {
            const updated = [...prev, ...newlyFailed];
            if (domFailedCountRef.current) {
              domFailedCountRef.current.innerText = String(updated.length);
            }
            return updated;
          });
        }
        
        batchProcessedCount += chunk.length;
        batchSuccessCount += chunkSuccess;

        // ⚡ INSTANT DIRECT DOM COUNTER UPDATE (0% Virtual DOM Re-render overhead)
        const instantProcessed = currentProcessed + batchProcessedCount;
        const instantSuccess = currentSuccess + batchSuccessCount;
        if (domProcessedCountRef.current) {
          domProcessedCountRef.current.innerText = String(instantProcessed);
        }
        if (domDeliveredCountRef.current) {
          domDeliveredCountRef.current.innerText = String(instantSuccess);
        }
      }

      if (!isStopRequestedRef.current && !fallbackTriggered) {
        const updatedSenderSent = currentSenderCurrentSent + batchProcessedCount;
        senderSentCountRef.current[activeEmail.toLowerCase()] = updatedSenderSent;
        senderProcessedTimesRef.current[activeEmail.toLowerCase()] = new Date().toISOString();

        const remainingQueue = currentQueue.slice(batchToSend.length);
        const updatedTotalProcessed = currentProcessed + batchProcessedCount;
        const updatedTotalSuccess = currentSuccess + batchSuccessCount;
        const updatedRounds = roundsDone + 1;

        // ⚡ THROTTLED STATE UPDATE: React State updates only every 10 leads or when batch completes
        if (
          updatedTotalProcessed - lastRenderedProcessedRef.current >= 10 ||
          remainingQueue.length === 0
        ) {
          setProcessedCount(updatedTotalProcessed);
          setSuccessCount(updatedTotalSuccess);
          lastRenderedProcessedRef.current = updatedTotalProcessed;
          lastRenderedDeliveredRef.current = updatedTotalSuccess;
        }

        setPendingEmails(remainingQueue);
        setSendersUsedRounds(updatedRounds);

        if (remainingQueue.length > 0) {
          localStorage.setItem(PENDING_QUEUE_STORAGE_KEY, JSON.stringify(remainingQueue));
        } else {
          localStorage.removeItem(PENDING_QUEUE_STORAGE_KEY);
        }

        setLastBatchMessage(`✅ Processed via ${activeEmail} (${updatedSenderSent}/${targetLotSize})`);

        let activePool = sendersList;
        let nextIdx = senderIdx;
        let senderJustCompletedLot = false;

        if (updatedSenderSent >= targetLotSize) {
          senderJustCompletedLot = true;
          markSenderLotCompleted(activeEmail);
          completedSendersCountRef.current += 1;
          activePool = sendersList.filter(s => s.email.toLowerCase() !== activeEmail.toLowerCase());
          setInMemorySenders(activePool);
        } else {
          nextIdx = (senderIdx + 1) % activePool.length;
        }

        if (activePool.length === 0 || remainingQueue.length === 0) {
          await consumeQueueBatch(
            remainingQueue,
            [],
            0,
            updatedRounds,
            updatedTotalProcessed,
            updatedTotalSuccess,
            targetLotSize,
            mode,
            "",
            "",
            ""
          );
          return;
        }

        const nextSender = activePool[nextIdx % activePool.length];
        setCurrentSenderIndex(nextIdx % activePool.length);
        setSenderEmail(nextSender.email);
        setAppPassword(nextSender.appPassword);
        setSenderName(nextSender.senderName || "Ruby");

        let shouldPause = false;
        let pauseMessage = "";

        if (rotationModeRef.current === "EVERY_SINGLE_SENDER" && senderJustCompletedLot) {
          shouldPause = true;
          pauseMessage = `⏸️ [Single Sender Lot Finished]\nSender [${activeEmail}] completed full lot of ${targetLotSize} emails.\nClick Resume to start next sender [${nextSender.email}].`;
        }

        if (rotationModeRef.current === "EVERY_N_SENDERS" && senderJustCompletedLot) {
          const targetN = Math.max(1, pauseAfterNSendersRef.current);
          if (completedSendersCountRef.current > 0 && completedSendersCountRef.current % targetN === 0) {
            shouldPause = true;
            pauseMessage = `⏸️ [Batch of ${targetN} Senders Completed]\nAll ${targetN} chosen senders finished their full lot (${targetLotSize} emails each) via 1-by-1 Round-Robin.\nModify your content and click Resume to continue!`;
          }
        }

        if (shouldPause) {
          setLoading(false);
          setProgressStatus("");
          alert(pauseMessage);
          return;
        }

        if (rotationModeRef.current === "CONTINUOUS" || rotationModeRef.current === "EVERY_N_SENDERS") {
          await sleepRandomDelay(3000, 4500);
        } else {
          await new Promise((resolve) => setTimeout(resolve, 50));
        }

        if (!isStopRequestedRef.current) {
          consumeQueueBatch(
            remainingQueue,
            activePool,
            nextIdx % activePool.length,
            updatedRounds,
            updatedTotalProcessed,
            updatedTotalSuccess,
            targetLotSize,
            mode,
            nextSender.email,
            nextSender.appPassword,
            nextSender.senderName || "Ruby"
          );
        }
      }
    } catch {
      alert("Network error. Please check your connection.");
      setLoading(false);
      setProgressStatus("");
    }
  };

  const handleResumeOrNextBatch = (e: React.FormEvent) => {
    e.preventDefault();
    if (loading || pendingEmails.length === 0) return;

    isStopRequestedRef.current = false;
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

    const currentSender = activeSenders[currentSenderIndex % activeSenders.length] || activeSenders[0];
    const currentModeConfig = MODE_CONFIGS[accountAgeMode];
    const targetLotSize = batchSize > 0 ? Math.min(batchSize, currentModeConfig.maxLot) : Math.min(DEFAULT_BATCH_SIZE, currentModeConfig.maxLot);

    consumeQueueBatch(
      pendingEmails,
      activeSenders,
      currentSenderIndex % activeSenders.length,
      sendersUsedRounds,
      processedCount,
      successCount,
      targetLotSize,
      accountAgeMode,
      currentSender.email,
      currentSender.appPassword,
      currentSender.senderName || "Ruby"
    );
  };

  const handleFullReset = () => {
    if (loading) return;
    if (confirm("Reset current campaign and clear queue completely?")) {
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
      senderSentCountRef.current = {};
      senderProcessedTimesRef.current = {};
      completedSendersCountRef.current = 0;
      lastRenderedProcessedRef.current = 0;
      lastRenderedDeliveredRef.current = 0;
      if (domProcessedCountRef.current) domProcessedCountRef.current.innerText = "0";
      if (domDeliveredCountRef.current) domDeliveredCountRef.current.innerText = "0";
      if (domFailedCountRef.current) domFailedCountRef.current.innerText = "0";
      localStorage.removeItem(PENDING_QUEUE_STORAGE_KEY);
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

  const remainingCount = pendingEmails.length;
  const currentMaxLot = MODE_CONFIGS[accountAgeMode]?.maxLot || 100;
  const isSingleSender = rotationMode === "EVERY_SINGLE_SENDER";
  const currentBatchTarget = isSingleSender 
    ? Math.min(batchSize || DEFAULT_BATCH_SIZE, remainingCount) 
    : 1;

  const totalAccountsCount = inMemorySenders.length;
  const remainingAccountsInQueue = totalAccountsCount > 0 
    ? (totalAccountsCount - (currentSenderIndex % totalAccountsCount)) 
    : 0;

    return (
    <main className="min-h-screen bg-slate-950 text-slate-100 py-5 px-3 sm:px-6 font-sans selection:bg-indigo-500 selection:text-white">
      <div className="max-w-7xl mx-auto space-y-4">
        <ReferralBanner />

        {/* Header Bar */}
        <div className="bg-slate-900/90 border border-slate-800 px-5 py-3 rounded-2xl flex flex-wrap justify-between items-center gap-3 shadow-xl">
          <div className="flex items-center gap-3">
            <img src="/icons/engine-hub.svg" alt="Hub" className="w-7 h-7 object-contain" />
            <div>
              <h1 className="text-lg font-black bg-gradient-to-r from-blue-400 via-indigo-300 to-purple-400 bg-clip-text text-transparent leading-tight">
                InboxSend Multi-Account Rotator (V3 Engine)
              </h1>
              <p className="text-[10px] text-slate-400 font-mono">
                Hardware Binding: <span className="text-indigo-400">{machineId || "Authenticating..."}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/outlook/dashboard"
              className="px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
            >
              <span>📊</span> Lead Dashboard
            </Link>
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

        {/* Stats Grid */}
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
            <p className="text-base font-black text-indigo-400 font-mono">
              <span ref={domProcessedCountRef}>{processedCount}</span>
            </p>
          </div>
          <div className="bg-slate-950/80 p-2.5 rounded-xl border border-emerald-500/20 text-center">
            <span className="text-[9px] text-emerald-400 uppercase font-black block">Delivered</span>
            <p className="text-base font-black text-emerald-400 font-mono">
              <span ref={domDeliveredCountRef}>{successCount}</span>
            </p>
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
            <p className="text-base font-black text-rose-400 font-mono">
              <span ref={domFailedCountRef}>{failedLeadsList.length}</span>
            </p>
          </div>
        </div>

        {/* Live Progress Bar */}
        {loading && (
          <div className="bg-indigo-950/40 border border-indigo-500/30 px-4 py-2.5 rounded-2xl flex items-center justify-between shadow-xl animate-pulse">
            <div className="flex items-center gap-3">
              <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin"></div>
              <p ref={domLiveStatusRef} className="text-xs font-mono text-indigo-300 font-bold">
                {progressStatus || "Dispatching Running..."}
              </p>
            </div>
            <button
              type="button"
              onClick={handleStopCampaign}
              className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold transition shadow-md cursor-pointer"
            >
              🛑 Pause / Stop
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
                  {isVaultLoaded ? (
                    <span className="text-[10px] text-emerald-400 font-mono bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded-md">
                      ✓ {inMemorySenders.length} Vault Accounts Active
                    </span>
                  ) : (
                    <span className="text-[10px] text-amber-400 font-mono bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded-md">
                      Manual Account Mode
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

              {/* 🔑 Sender Details */}
              <div className="bg-slate-900/90 border border-slate-800 p-3.5 rounded-2xl space-y-2.5 shadow-lg">
                <div className={`grid grid-cols-1 ${!isVaultLoaded ? "sm:grid-cols-3" : "sm:grid-cols-2"} gap-2`}>
                  <InputField
                    label="Sender Gmail"
                    type="email"
                    required
                    disabled={loading}
                    value={senderEmail}
                    onChange={(e) => setSenderEmail(e.target.value)}
                    placeholder="account1@gmail.com"
                    className="font-mono text-xs"
                  />

                  <InputField
                    label="Display Name"
                    type="text"
                    required
                    disabled={loading}
                    value={senderName}
                    onChange={(e) => setSenderName(e.target.value)}
                    placeholder="e.g. Ruby / Alex"
                    className="text-xs"
                  />

                  {!isVaultLoaded && (
                    <div className="space-y-1">
                      <div className="flex justify-between items-center">
                        <label className="text-[10px] font-bold text-slate-300">16-Digit App Password</label>
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="text-[9px] text-indigo-400 hover:text-indigo-300 font-mono cursor-pointer"
                        >
                          {showPassword ? "Hide" : "Show"}
                        </button>
                      </div>
                      <input
                        type={showPassword ? "text" : "password"}
                        required
                        disabled={loading}
                        value={appPassword}
                        onChange={(e) => setAppPassword(e.target.value)}
                        placeholder="abcd efgh ijkl mnop"
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-xs font-mono text-indigo-300 focus:border-indigo-500 outline-none"
                      />
                    </div>
                  )}
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
                  className="w-full flex-1 min-h-[260px] bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs font-mono text-slate-200 focus:border-indigo-500 outline-none resize-none leading-relaxed"
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
                      <option value="AGED">🟢 Aged (2+ Yrs) - Max 100 (Chunks)</option>
                      <option value="STANDARD">🟡 Standard (6 Mo-2 Yrs) - Max 50 (Chunks)</option>
                      <option value="FRESH">🔴 Fresh (&lt;6 Mo) - Max 30 (Chunks)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-300 block mb-1">Lot Size per Account</label>
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

                {/* Rotation Settings */}
                <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl space-y-2">
                  <label className="text-[11px] font-bold text-indigo-300 block">
                    🔄 Rotation & Dispatching Settings:
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                    <label className={`flex items-center gap-2 cursor-pointer p-2 rounded-lg border transition ${rotationMode === "CONTINUOUS" ? "bg-indigo-950/50 border-indigo-500 text-white" : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white"}`}>
                      <input type="radio" name="rotationModeOption" checked={rotationMode === "CONTINUOUS"} onChange={() => setRotationMode("CONTINUOUS")} />
                      <span>1. Continuous (Non-Stop RR)</span>
                    </label>
                    
                    <label className={`flex items-center gap-2 cursor-pointer p-2 rounded-lg border transition ${rotationMode === "EVERY_N_SENDERS" ? "bg-indigo-950/50 border-indigo-500 text-white" : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white"}`}>
                      <input type="radio" name="rotationModeOption" checked={rotationMode === "EVERY_N_SENDERS"} onChange={() => setRotationMode("EVERY_N_SENDERS")} />
                      <span>2. Pause after N Senders (RR)</span>
                    </label>

                    <label className={`flex items-center gap-2 cursor-pointer p-2 rounded-lg border transition ${rotationMode === "EVERY_SINGLE_SENDER" ? "bg-indigo-950/50 border-indigo-500 text-white" : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white"}`}>
                      <input type="radio" name="rotationModeOption" checked={rotationMode === "EVERY_SINGLE_SENDER"} onChange={() => setRotationMode("EVERY_SINGLE_SENDER")} />
                      <span>3. Pause Every Sender (Full Lot)</span>
                    </label>
                  </div>

                  {rotationMode === "EVERY_N_SENDERS" && (
                    <div className="pt-2 flex items-center gap-3">
                      <span className="text-[11px] text-slate-300">Pause after how many senders complete full lot?</span>
                      <input 
                        type="number" min={1} max={50} 
                        value={pauseAfterNSenders}
                        onChange={(e) => setPauseAfterNSenders(parseInt(e.target.value) || 1)}
                        className="w-16 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-indigo-400 font-bold outline-none text-center"
                      />
                    </div>
                  )}
                </div>

                <InputField
                  label="Subject Line"
                  type="text"
                  required
                  disabled={loading}
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="e.g. Quick question regarding partnership"
                />

                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <label className="text-[11px] font-bold text-slate-300 flex items-center gap-1">
                      Email Body Template (Live Editable)
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowPreviewModal(true)}
                      className="px-2 py-0.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-lg text-[9px] font-semibold cursor-pointer"
                    >
                      👁️ Spintax Preview
                    </button>
                  </div>

                  <textarea
                    rows={8}
                    required
                    disabled={loading}
                    value={template}
                    onChange={(e) => setTemplate(e.target.value)}
                    placeholder="Type your outreach message here..."
                    className="w-full min-h-[190px] bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-100 focus:border-indigo-500 outline-none leading-relaxed resize-none"
                  />
                </div>

                <InputField
                  label="Custom Signature & Signoff Details"
                  type="text"
                  disabled={loading}
                  value={customSignoffName}
                  onChange={(e) => setCustomSignoffName(e.target.value)}
                  placeholder="e.g. John Doe | Founder at Acme Corp (Optional)"
                  accentColor="emerald"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-black rounded-xl text-xs sm:text-sm transition shadow-xl disabled:opacity-50 flex justify-center items-center gap-2 cursor-pointer active:scale-[0.99] mt-3"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Dispatching Running...</span>
                  </>
                ) : (
                  <span>🚀 Launch Campaign & Send (Automated Non-Stop)</span>
                )}
              </button>
            </div>
          </form>
        ) : (
          /* STEP 2: Live Rotation Dashboard */
          <div className="bg-slate-900/90 border border-slate-800 p-5 rounded-2xl space-y-4 shadow-xl">
            {/* ⚡ DYNAMIC ACTION BAR (Add Leads & Switch Senders without resetting campaign) */}
            <div className="bg-slate-950 border border-indigo-500/30 p-3.5 rounded-xl flex flex-wrap items-center justify-between gap-3 shadow-inner">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-indigo-300">⚡ Dynamic Quick Actions:</span>
                <button
                  type="button"
                  onClick={() => setIsAppendModalOpen(true)}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition shadow-sm cursor-pointer flex items-center gap-1"
                >
                  <span>➕</span> Add More Leads
                </button>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-300">Switch Sender Folder:</span>
                <select
                  value={selectedFolderToSwitch}
                  onChange={(e) => {
                    const tier = e.target.value as ProfileTier;
                    setSelectedFolderToSwitch(tier);
                    handleSwitchSenderFolderDirectly(tier);
                  }}
                  className="bg-slate-900 text-indigo-300 font-bold text-xs px-3 py-1.5 rounded-lg border border-indigo-500/40 outline-none cursor-pointer"
                >
                  {(Object.keys(TIER_META) as ProfileTier[]).map((tier) => (
                    <option key={tier} value={tier}>
                      {TIER_META[tier]?.label || tier}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {remainingCount > 0 ? (
              <form onSubmit={handleResumeOrNextBatch} className="space-y-4 bg-slate-950/80 border border-slate-800/90 p-4 rounded-xl">
                <div className="flex flex-wrap justify-between items-center border-b border-slate-800 pb-3 gap-2">
                  <div>
                    <h3 className="text-xs font-black text-indigo-400 flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full ${loading ? "bg-emerald-400 animate-ping" : "bg-amber-400"}`} />
                      {loading ? "🚀 Auto-Dispatching Active..." : "⏸️ Campaign Paused - Ready to Resume"}
                    </h3>
                    <p className="text-[10px] text-slate-400 mt-0.5 font-mono">
                      Active Sender: <span className="text-indigo-300 font-bold">{senderEmail}</span> (Turn #{sendersUsedRounds + 1})
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs text-amber-400 font-mono font-bold bg-amber-500/10 px-2.5 py-1 rounded-full border border-amber-500/20">
                      Remaining in Queue: {remainingCount}
                    </span>
                    {loading ? (
                      <button
                        type="button"
                        onClick={handleStopCampaign}
                        className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold transition shadow-md cursor-pointer"
                      >
                        🛑 Pause / Stop
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handleFullReset}
                        className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-bold transition border border-slate-700 cursor-pointer"
                      >
                        🔄 Reset All
                      </button>
                    )}
                  </div>
                </div>

                <div className={`grid grid-cols-1 ${!isVaultLoaded ? "sm:grid-cols-3" : "sm:grid-cols-2"} gap-3`}>
                  <InputField
                    label="Active Sender Gmail"
                    type="email"
                    required
                    disabled={loading}
                    value={senderEmail}
                    onChange={(e) => setSenderEmail(e.target.value)}
                    className="font-mono bg-slate-900 border-slate-700 text-xs"
                  />

                  <InputField
                    label="Sender Display Name"
                    type="text"
                    required
                    disabled={loading}
                    value={senderName}
                    onChange={(e) => setSenderName(e.target.value)}
                    className="bg-slate-900 border-slate-700 text-xs"
                  />

                  {!isVaultLoaded && (
                    <div className="space-y-1">
                      <div className="flex justify-between items-center">
                        <label className="text-[10px] font-bold text-slate-300">Live App Password</label>
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="text-[9px] text-indigo-400 hover:text-indigo-300 font-mono cursor-pointer"
                        >
                          {showPassword ? "Hide" : "Show"}
                        </button>
                      </div>
                      <input
                        type={showPassword ? "text" : "password"}
                        required
                        disabled={loading}
                        value={appPassword}
                        onChange={(e) => setAppPassword(e.target.value)}
                        placeholder="16-digit password"
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-2 text-xs font-mono text-indigo-300 focus:border-indigo-500 outline-none"
                      />
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  <InputField
                    label="✏️ Live Subject Line (Updates instantly on next send)"
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="bg-slate-900 border-slate-700"
                  />

                  <InputField
                    label="✏️ Live Sign-off / Signature"
                    type="text"
                    value={customSignoffName}
                    onChange={(e) => setCustomSignoffName(e.target.value)}
                    accentColor="emerald"
                    className="bg-slate-900 border-slate-700"
                  />
                </div>

                <div className="w-full space-y-1">
                  <div className="flex justify-between items-center">
                    <label className="text-[10px] text-slate-300 font-bold">
                      ✏️ Live Email Template Body (Takes effect immediately on next send/resume)
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowPreviewModal(true)}
                      className="px-2 py-0.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-lg text-[9px] font-semibold cursor-pointer"
                    >
                      👁️ Spintax Preview
                    </button>
                  </div>
                  <textarea
                    rows={4}
                    value={template}
                    onChange={(e) => setTemplate(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-xs text-slate-100 outline-none leading-relaxed resize-none focus:border-indigo-500"
                  />
                </div>

                {!loading && (
                  <button
                    type="submit"
                    className="w-full py-3.5 bg-gradient-to-r from-emerald-600 via-teal-600 to-indigo-600 hover:from-emerald-500 hover:to-indigo-500 text-white font-black rounded-xl text-xs sm:text-sm transition-all duration-300 shadow-xl flex justify-center items-center gap-2 cursor-pointer active:scale-[0.99]"
                  >
                    <span>▶️ Resume Campaign (Dispatch {currentBatchTarget} Lead(s) via [{senderEmail}])</span>
                  </button>
                )}
              </form>
            ) : (
              <div className="p-5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-center rounded-xl font-bold text-xs shadow-inner flex items-center justify-center gap-2">
                <span>🎉</span> All leads have been processed successfully! You can add more leads above anytime.
              </div>
            )}
          </div>
        )}
      </div>

      {/* ⚡ MODAL FOR ADDING MORE LEADS ON THE FLY */}
      {isAppendModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="bg-slate-900 border border-indigo-500/40 w-full max-w-lg rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="text-sm font-black text-indigo-300 uppercase tracking-wider flex items-center gap-2">
                <span>➕</span> Add More Leads to Running Queue
              </h3>
              <button
                onClick={() => setIsAppendModalOpen(false)}
                className="text-slate-400 hover:text-white text-sm bg-slate-800 px-2.5 py-1 rounded-lg cursor-pointer"
              >
                ✕ Close
              </button>
            </div>

            <form onSubmit={handleAppendMoreLeads} className="space-y-3">
              <p className="text-xs text-slate-400">
                Paste your new lead emails below. They will be automatically sanitized, checked, and appended directly to your active queue without losing any progress or resetting counts!
              </p>
              <textarea
                required
                rows={6}
                value={appendLeadInput}
                onChange={(e) => setAppendLeadInput(e.target.value)}
                placeholder="newlead1@example.com&#10;newlead2@example.com"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs font-mono text-slate-200 outline-none focus:border-indigo-500 resize-none"
              />
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAppendModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs font-bold cursor-pointer hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold cursor-pointer shadow-lg"
                >
                  Append Leads
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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