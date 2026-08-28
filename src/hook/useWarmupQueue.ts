// src/hook/useWarmupQueue.ts
"use client";

import { useState, useEffect, useRef } from "react";
import { SESSION_TOKEN_KEY } from "@/types/vault";
import {
  isSenderInCooldown,
  markSenderLotCompleted,
  syncTimestampsToDatabase,
} from "@/utils/cooldown";

export interface AccountNode {
  _id?: string;
  senderName?: string;
  email: string;
  appPassword?: string;
  profileTier?: string;
  lastSentAt?: string | null;
  isExternalPeer?: boolean;
}

export interface WarmupStats {
  totalProcessed: number;
  totalFailed: number;
  rescuedCount: number;
  currentSenderIndex: number;
}

function deduplicateAccounts(accounts: any[]): AccountNode[] {
  const seen = new Set<string>();
  const uniqueList: AccountNode[] = [];

  for (const item of accounts) {
    if (!item.email) continue;
    const cleanEmail = item.email.toLowerCase().trim();
    if (!seen.has(cleanEmail)) {
      seen.add(cleanEmail);
      uniqueList.push({
        _id: item._id,
        senderName: item.senderName,
        email: cleanEmail,
        appPassword: item.appPassword || item.password || item.smtpPassword,
        profileTier: item.profileTier,
        lastSentAt: item.lastSentAt,
        isExternalPeer: item.isExternalPeer,
      });
    }
  }
  return uniqueList;
}

export function useWarmupQueue(machineId: string, directSessionToken?: string) {
  const [allVaultAccounts, setAllVaultAccounts] = useState<AccountNode[]>([]);
  const [allReceivers, setAllReceivers] = useState<AccountNode[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [logs, setLogs] = useState<string[]>([]);
  
  const [intervalSeconds, setIntervalSeconds] = useState<number>(5);
  const [lotSizePerAccount, setLotSizePerAccount] = useState<number>(5);

  const [stats, setStats] = useState<WarmupStats>({
    totalProcessed: 0,
    totalFailed: 0,
    rescuedCount: 0,
    currentSenderIndex: 0,
  });

  const isRunningRef = useRef(isRunning);
  const activePoolRef = useRef<AccountNode[]>([]);
  const receiversRef = useRef<AccountNode[]>([]);
  const senderSentCountRef = useRef<Record<string, number>>({});
  const senderProcessedTimesRef = useRef<Record<string, string>>({});
  const intervalSecRef = useRef(intervalSeconds);
  const lotSizeRef = useRef(lotSizePerAccount);
  const currentSenderIdxRef = useRef<number>(0);
  const currentReceiverIdxRef = useRef<number>(0);

  useEffect(() => { isRunningRef.current = isRunning; }, [isRunning]);
  useEffect(() => { receiversRef.current = allReceivers; }, [allReceivers]);
  useEffect(() => { intervalSecRef.current = intervalSeconds; }, [intervalSeconds]);
  useEffect(() => { lotSizeRef.current = lotSizePerAccount; }, [lotSizePerAccount]);

  // 1. Initial Load (केवल एक बार DB से लाएगा)
  useEffect(() => {
    if (!machineId) return;

    const loadNetworkNodes = async () => {
      try {
        setIsLoading(true);
        const storedToken =
          directSessionToken ||
          (typeof window !== "undefined"
            ? localStorage.getItem(SESSION_TOKEN_KEY) || ""
            : "");

        const [vaultRes, peerRes] = await Promise.all([
          fetch(`/api/smtp-vault?machineId=${encodeURIComponent(machineId)}`, {
            headers: { "x-session-token": storedToken },
          }),
          fetch(`/api/warmup-peers?machineId=${encodeURIComponent(machineId)}`, {
            headers: { "x-session-token": storedToken },
          }),
        ]);

        const vaultData = await vaultRes.json();
        const peerData = await peerRes.json();

        const cleanSenders = deduplicateAccounts(vaultData.accounts || []);
        const cleanReceivers = deduplicateAccounts(peerData.receivers || cleanSenders);

        setAllVaultAccounts(cleanSenders);
        setAllReceivers(cleanReceivers);

        const readySenders = cleanSenders.filter((s) => !isSenderInCooldown(s.email, s.lastSentAt));
        activePoolRef.current = readySenders;

        // काउंट रीसेट
        senderSentCountRef.current = {};
        readySenders.forEach((s) => {
          senderSentCountRef.current[s.email.toLowerCase().trim()] = 0;
        });

        setLogs((prev) => [
          `[${new Date().toLocaleTimeString()}] 🌐 Network Connected: ${cleanSenders.length} Senders (${readySenders.length} Ready in Queue) | ${cleanReceivers.length} Peer Receivers.`,
          ...prev,
        ]);
      } catch (err: any) {
        console.error("Network fetch error:", err);
      } finally {
        setIsLoading(false);
      }
    };

    loadNetworkNodes();
  }, [machineId, directSessionToken]);

  // 2. Core Round-Robin & Lot Size Eviction Loop
  useEffect(() => {
    if (!isRunning) return;

    let timeoutId: NodeJS.Timeout | null = null;

    if (activePoolRef.current.length === 0) {
      const ready = allVaultAccounts.filter((s) => !isSenderInCooldown(s.email, s.lastSentAt));
      activePoolRef.current = ready;
      senderSentCountRef.current = {};
      ready.forEach((s) => {
        senderSentCountRef.current[s.email.toLowerCase().trim()] = 0;
      });
    }

    const processNextRobinStep = async () => {
      if (!isRunningRef.current) return;

      const currentPool = activePoolRef.current;
      const currentReceivers = receiversRef.current;
      const targetLot = lotSizeRef.current;

      // 🛑 जब Queue पूरी तरह खाली हो जाए
      if (currentPool.length === 0 || currentReceivers.length === 0) {
        setLogs((prev) => [
          `[${new Date().toLocaleTimeString()}] 🎉 Target Completed! All accounts finished their lot (${targetLot} emails each) and evicted. Warm-up Stopped.`,
          ...prev,
        ]);
        setIsRunning(false);
        if (Object.keys(senderProcessedTimesRef.current).length > 0) {
          await syncTimestampsToDatabase(machineId, senderProcessedTimesRef.current);
        }
        return;
      }

      // राउंड रॉबिन से सेंडर चुनें
      const senderIdx = currentSenderIdxRef.current % currentPool.length;
      const activeSender = currentPool[senderIdx];
      const activeEmail = activeSender.email.toLowerCase().trim();

      setStats((prev) => ({
        ...prev,
        currentSenderIndex: currentSenderIdxRef.current,
      }));

      // पासवर्ड न होने पर कतार से बाहर करें
      if (!activeSender.appPassword) {
        activePoolRef.current = currentPool.filter((s) => s.email.toLowerCase().trim() !== activeEmail);
        setAllVaultAccounts((prev) => prev.filter((a) => a.email.toLowerCase().trim() !== activeEmail));
        setLogs((prev) => [
          `[${new Date().toLocaleTimeString()}] ⚠️ Password missing for ${activeSender.email}. Removed from Queue.`,
          ...prev.slice(0, 49),
        ]);
        timeoutId = setTimeout(processNextRobinStep, 1000);
        return;
      }

      // सेंडर से अलग रिसीवर चुनें
      const validReceivers = currentReceivers.filter(
        (r) => r.email.toLowerCase().trim() !== activeEmail
      );

      if (validReceivers.length === 0) {
        setLogs((prev) => [`[${new Date().toLocaleTimeString()}] ⚠️ No peer receiver for ${activeSender.email}`, ...prev]);
        currentSenderIdxRef.current += 1;
        timeoutId = setTimeout(processNextRobinStep, 2000);
        return;
      }

      const receiverIdx = currentReceiverIdxRef.current % validReceivers.length;
      const activeReceiver = validReceivers[receiverIdx];

      const effectiveToken =
        directSessionToken ||
        (typeof window !== "undefined"
          ? localStorage.getItem(SESSION_TOKEN_KEY) || ""
          : "");

      try {
        const res = await fetch("/api/silent-warmup", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-session-token": effectiveToken,
          },
          body: JSON.stringify({
            machineId,
            sessionToken: effectiveToken,
            senderEmail: activeSender.email,
            senderName: activeSender.senderName,
            appPassword: activeSender.appPassword,
            encryptedPassword: activeSender.appPassword,
            receiverEmail: activeReceiver.email,
          }),
        });

        const data = await res.json();

        const nowIso = new Date().toISOString();
        const currentSent = (senderSentCountRef.current[activeEmail] || 0) + 1;
        senderSentCountRef.current[activeEmail] = currentSent;
        senderProcessedTimesRef.current[activeEmail] = nowIso;

        if (res.ok && (data.success || data.status === "SUCCESS")) {
          setStats((prev) => ({
            ...prev,
            totalProcessed: prev.totalProcessed + 1,
            rescuedCount: prev.rescuedCount + (data.rescued ? 1 : 0),
          }));

          setLogs((prev) => [
            `[${new Date().toLocaleTimeString()}] 🚀 [Sent: ${currentSent}/${targetLot}] "${activeSender.senderName || "Sender"}" <${activeSender.email}> ➔ ${activeReceiver.email}`,
            ...prev.slice(0, 49),
          ]);

          // 🎯 केवल लॉट साइज़ पूरा होने पर ही कतार से बाहर (Evict) होगा
          if (currentSent >= targetLot) {
            markSenderLotCompleted(activeEmail);
            activePoolRef.current = activePoolRef.current.filter(
              (s) => s.email.toLowerCase().trim() !== activeEmail
            );

            setAllVaultAccounts((prev) =>
              prev.map((acc) =>
                acc.email.toLowerCase().trim() === activeEmail
                  ? { ...acc, lastSentAt: nowIso }
                  : acc
              )
            );

            setLogs((prev) => [
              `[${new Date().toLocaleTimeString()}] 🏁 [Lot Done: ${currentSent}/${targetLot}] ${activeSender.email} completed quota & evicted from active queue.`,
              ...prev.slice(0, 49),
            ]);
          } else {
            // लॉट पूरा नहीं हुआ तो अगले सेंडर पर जाएँ
            currentSenderIdxRef.current += 1;
          }
        } else {
          setStats((prev) => ({
            ...prev,
            totalFailed: prev.totalFailed + 1,
          }));
          currentSenderIdxRef.current += 1;

          setLogs((prev) => [
            `[${new Date().toLocaleTimeString()}] ❌ Failed: ${activeSender.email} ➔ ${data.error || "Delivery Error"}`,
            ...prev.slice(0, 49),
          ]);
        }

        currentReceiverIdxRef.current += 1;
      } catch (err: any) {
        setStats((prev) => ({
          ...prev,
          totalFailed: prev.totalFailed + 1,
        }));
        currentSenderIdxRef.current += 1;
        currentReceiverIdxRef.current += 1;

        setLogs((prev) => [
          `[${new Date().toLocaleTimeString()}] ❌ Network Error for ${activeSender.email}`,
          ...prev.slice(0, 49),
        ]);
      }

      const baseMs = (intervalSecRef.current || 5) * 1000;
      const jitterMs = Math.floor(Math.random() * 2000) + 1000;
      const totalWaitMs = baseMs + jitterMs;

      if (isRunningRef.current) {
        timeoutId = setTimeout(processNextRobinStep, totalWaitMs);
      }
    };

    processNextRobinStep();

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      if (Object.keys(senderProcessedTimesRef.current).length > 0) {
        syncTimestampsToDatabase(machineId, senderProcessedTimesRef.current);
      }
    };
  }, [isRunning, machineId, directSessionToken]);

  return {
    allVaultAccounts,
    allReceivers,
    isLoading,
    isRunning,
    setIsRunning,
    logs,
    stats,
    intervalSeconds,
    setIntervalSeconds,
    lotSizePerAccount,
    setLotSizePerAccount,
  };
}