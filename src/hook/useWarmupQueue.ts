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
        appPassword: item.appPassword,
        profileTier: item.profileTier,
        lastSentAt: item.lastSentAt,
        isExternalPeer: item.isExternalPeer,
      });
    }
  }
  return uniqueList;
}

export function useWarmupQueue(machineId: string) {
  const [allVaultAccounts, setAllVaultAccounts] = useState<AccountNode[]>([]);
  const [allReceivers, setAllReceivers] = useState<AccountNode[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [logs, setLogs] = useState<string[]>([]);
  
  const [intervalSeconds, setIntervalSeconds] = useState<number>(5);
  const [lotSizePerAccount, setLotSizePerAccount] = useState<number>(10);

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

  // 1. Initial Load
  useEffect(() => {
    if (!machineId) return;

    const loadNetworkNodes = async () => {
      try {
        setIsLoading(true);
        const storedToken = localStorage.getItem(SESSION_TOKEN_KEY) || "";

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

        setLogs((prev) => [
          `[${new Date().toLocaleTimeString()}] 🌐 Network Connected: ${cleanSenders.length} Senders (${readySenders.length} Ready) | ${cleanReceivers.length} Peer Receivers.`,
          ...prev,
        ]);
      } catch (err: any) {
        console.error("Network fetch error:", err);
      } finally {
        setIsLoading(false);
      }
    };

    loadNetworkNodes();
  }, [machineId]);

  // 2. Core Round-Robin Loop
  useEffect(() => {
    if (!isRunning) return;

    let timeoutId: NodeJS.Timeout | null = null;

    if (activePoolRef.current.length === 0) {
      activePoolRef.current = allVaultAccounts.filter((s) => !isSenderInCooldown(s.email, s.lastSentAt));
      senderSentCountRef.current = {};
      activePoolRef.current.forEach((s) => {
        senderSentCountRef.current[s.email.toLowerCase().trim()] = 0;
      });
    }

    const processNextRobinStep = async () => {
      if (!isRunningRef.current) return;

      const currentPool = activePoolRef.current;
      const currentReceivers = receiversRef.current;
      const targetLot = lotSizeRef.current;

      if (currentPool.length === 0 || currentReceivers.length === 0) {
        setLogs((prev) => [
          `[${new Date().toLocaleTimeString()}] 🎉 Target Completed! All accounts finished full lot (${targetLot} emails each). Queue Finished.`,
          ...prev,
        ]);
        setIsRunning(false);
        await syncTimestampsToDatabase(machineId, senderProcessedTimesRef.current);
        return;
      }

      const senderIdx = currentSenderIdxRef.current % currentPool.length;
      const activeSender = currentPool[senderIdx];
      const activeEmail = activeSender.email.toLowerCase().trim();

      // UI इंडेक्स सिंक
      setStats((prev) => ({
        ...prev,
        currentSenderIndex: currentSenderIdxRef.current,
      }));

      const validReceivers = currentReceivers.filter(
        (r) => r.email.toLowerCase().trim() !== activeEmail
      );

      if (validReceivers.length === 0) {
        setLogs((prev) => [`[${new Date().toLocaleTimeString()}] ⚠️ No valid peer receiver for ${activeSender.email}`, ...prev]);
        return;
      }

      const receiverIdx = currentReceiverIdxRef.current % validReceivers.length;
      const activeReceiver = validReceivers[receiverIdx];

      try {
        const storedToken = localStorage.getItem(SESSION_TOKEN_KEY) || "";

        const res = await fetch("/api/silent-warmup", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-session-token": storedToken,
          },
          body: JSON.stringify({
            machineId,
            senderEmail: activeSender.email,
            senderName: activeSender.senderName,
            encryptedPassword: activeSender.appPassword,
            receiverEmail: activeReceiver.email,
          }),
        });

        const data = await res.json();

        if (res.ok && data.success) {
          const nowIso = new Date().toISOString();
          const currentSent = (senderSentCountRef.current[activeEmail] || 0) + 1;
          senderSentCountRef.current[activeEmail] = currentSent;
          senderProcessedTimesRef.current[activeEmail] = nowIso;

          setStats((prev) => ({
            ...prev,
            totalProcessed: prev.totalProcessed + 1,
            currentSenderIndex: currentSenderIdxRef.current,
          }));

          setLogs((prev) => [
            `[${new Date().toLocaleTimeString()}] 🚀 [Lot Progress: ${currentSent}/${targetLot}] "${activeSender.senderName || "Sender"}" <${activeSender.email}> ➔ ${activeReceiver.email}`,
            ...prev.slice(0, 49),
          ]);

          if (currentSent >= targetLot) {
            markSenderLotCompleted(activeEmail);
            activePoolRef.current = activePoolRef.current.filter((s) => s.email.toLowerCase().trim() !== activeEmail);

            setAllVaultAccounts((prev) =>
              prev.map((acc) =>
                acc.email.toLowerCase().trim() === activeEmail
                  ? { ...acc, lastSentAt: nowIso }
                  : acc
              )
            );

            setLogs((prev) => [
              `[${new Date().toLocaleTimeString()}] 🏁 [Lot Completed] ${activeSender.email} reached target (${targetLot}/${targetLot}) & entered 24h cooldown.`,
              ...prev.slice(0, 49),
            ]);
          } else {
            currentSenderIdxRef.current += 1;
          }

          currentReceiverIdxRef.current += 1;
        } else {
          setStats((prev) => ({
            ...prev,
            totalFailed: prev.totalFailed + 1,
            currentSenderIndex: currentSenderIdxRef.current + 1,
          }));
          currentSenderIdxRef.current += 1;
          setLogs((prev) => [
            `[${new Date().toLocaleTimeString()}] ❌ Drop: ${activeSender.email} (${data.error || "Failed"})`,
            ...prev.slice(0, 49),
          ]);
        }
      } catch (err: any) {
        setStats((prev) => ({
          ...prev,
          totalFailed: prev.totalFailed + 1,
          currentSenderIndex: currentSenderIdxRef.current + 1,
        }));
        currentSenderIdxRef.current += 1;
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
  }, [isRunning, machineId]);

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