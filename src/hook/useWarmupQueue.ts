// src/hook/useWarmupQueue.ts
"use client";

import { useState, useEffect, useRef } from "react";
import { SESSION_TOKEN_KEY } from "@/types/vault";
import { syncTimestampsToDatabase } from "@/utils/cooldown";

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
  const [lotSizePerAccount, setLotSizePerAccount] = useState<number>(1);

  const [stats, setStats] = useState<WarmupStats>({
    totalProcessed: 0,
    totalFailed: 0,
    rescuedCount: 0,
    currentSenderIndex: 0,
  });

  const isRunningRef = useRef(isRunning);
  const activePoolRef = useRef<AccountNode[]>([]);
  const receiversRef = useRef<AccountNode[]>([]);
  const senderProcessedTimesRef = useRef<Record<string, string>>({});
  const intervalSecRef = useRef(intervalSeconds);
  const currentReceiverIdxRef = useRef<number>(0);

  useEffect(() => { isRunningRef.current = isRunning; }, [isRunning]);
  useEffect(() => { receiversRef.current = allReceivers; }, [allReceivers]);
  useEffect(() => { intervalSecRef.current = intervalSeconds; }, [intervalSeconds]);

  // 1. Initial Load
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

        // पूरी सेंडर लिस्ट को एक्टिव क्यू में डालें
        activePoolRef.current = [...cleanSenders];

        setLogs((prev) => [
          `[${new Date().toLocaleTimeString()}] 🌐 Network Connected: ${cleanSenders.length} Senders in Queue | ${cleanReceivers.length} Peer Receivers.`,
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

  // 2. FIFO Queue Consumer Loop (मेल प्रोसेस होते ही तुरंत कतार से बाहर)
  useEffect(() => {
    if (!isRunning) return;

    let timeoutId: NodeJS.Timeout | null = null;

    const processNextInQueue = async () => {
      if (!isRunningRef.current) return;

      const currentPool = activePoolRef.current;
      const currentReceivers = receiversRef.current;

      // 🛑 जब क्यू पूरी खाली हो जाए (Zero Remaining)
      if (currentPool.length === 0) {
        setLogs((prev) => [
          `[${new Date().toLocaleTimeString()}] 🏁 QUEUE FINISHED: All accounts processed and evicted. Auto-Stopped.`,
          ...prev,
        ]);
        setIsRunning(false);
        if (Object.keys(senderProcessedTimesRef.current).length > 0) {
          await syncTimestampsToDatabase(machineId, senderProcessedTimesRef.current);
        }
        return;
      }

      // कतार का पहला सेंडर निकालें (FIFO)
      const activeSender = currentPool[0];
      const activeEmail = activeSender.email.toLowerCase().trim();

      // पासवर्ड न होने पर तुरंत बाहर निकालें ताकि लूप न अटके
      if (!activeSender.appPassword) {
        activePoolRef.current = currentPool.slice(1);
        setAllVaultAccounts([...activePoolRef.current]);
        setLogs((prev) => [
          `[${new Date().toLocaleTimeString()}] ⚠️ Password missing for ${activeSender.email}. Removed from Queue.`,
          ...prev.slice(0, 49),
        ]);
        timeoutId = setTimeout(processNextInQueue, 1000);
        return;
      }

      // सेंडर से अलग रिसीवर चुनें
      const validReceivers = currentReceivers.filter(
        (r) => r.email.toLowerCase().trim() !== activeEmail
      );

      const activeReceiver =
        validReceivers.length > 0
          ? validReceivers[currentReceiverIdxRef.current % validReceivers.length]
          : currentReceivers[0];

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

        // 🎯 मेल सफल हो या फ़ेल — इसे तुरंत Queue से बाहर (Evict/Shift) निकालें
        const updatedPool = currentPool.slice(1);
        activePoolRef.current = updatedPool;
        setAllVaultAccounts([...updatedPool]); // UI लिस्ट से भी तुरंत हटेगा

        const nowIso = new Date().toISOString();
        senderProcessedTimesRef.current[activeEmail] = nowIso;

        if (res.ok && (data.success || data.status === "SUCCESS")) {
          setStats((prev) => ({
            ...prev,
            totalProcessed: prev.totalProcessed + 1,
            rescuedCount: prev.rescuedCount + (data.rescued ? 1 : 0),
          }));

          setLogs((prev) => [
            `[${new Date().toLocaleTimeString()}] 🚀 [Remaining: ${updatedPool.length}] "${activeSender.senderName || "Sender"}" <${activeSender.email}> ➔ ${activeReceiver.email} (Evicted)`,
            ...prev.slice(0, 49),
          ]);
        } else {
          setStats((prev) => ({
            ...prev,
            totalFailed: prev.totalFailed + 1,
          }));

          setLogs((prev) => [
            `[${new Date().toLocaleTimeString()}] ❌ [Remaining: ${updatedPool.length}] Failed: ${activeSender.email} ➔ ${data.error || "Delivery Error"} (Evicted)`,
            ...prev.slice(0, 49),
          ]);
        }

        currentReceiverIdxRef.current += 1;
      } catch (err: any) {
        // नेटवर्क एरर होने पर भी क्यू से बाहर निकालें
        const updatedPool = currentPool.slice(1);
        activePoolRef.current = updatedPool;
        setAllVaultAccounts([...updatedPool]);

        setStats((prev) => ({
          ...prev,
          totalFailed: prev.totalFailed + 1,
        }));

        setLogs((prev) => [
          `[${new Date().toLocaleTimeString()}] ❌ Network Drop for ${activeSender.email} (Evicted)`,
          ...prev.slice(0, 49),
        ]);
      }

      const baseMs = (intervalSecRef.current || 5) * 1000;
      const jitterMs = Math.floor(Math.random() * 1500) + 500;
      const totalWaitMs = baseMs + jitterMs;

      if (isRunningRef.current) {
        timeoutId = setTimeout(processNextInQueue, totalWaitMs);
      }
    };

    processNextInQueue();

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