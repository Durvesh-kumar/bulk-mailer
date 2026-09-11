// src/hook/useWarmupQueue.ts
"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { SESSION_TOKEN_KEY, ProfileTier, TIER_META } from "@/types/vault";
import { markSenderLotCompleted, syncTimestampsToDatabase } from "@/utils/cooldown";
import { AccountAgeMode, MODE_CONFIGS } from "@/config/AccountAgeMode";

export interface AccountNode {
  _id?: string;
  senderName?: string;
  email: string;
  appPassword?: string;
  profileTier: ProfileTier;
  accountAgeMode: AccountAgeMode;
  lastSentAt?: string | null;
  isExternalPeer?: boolean;
}

export interface WarmupStats {
  totalProcessed: number;
  totalFailed: number;
  rescuedCount: number;
  currentSenderIndex: number;
}

const COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 घंटे का कूलडाउन

function deduplicateAccounts(accounts: any[]): AccountNode[] {
  const seen = new Set<string>();
  const uniqueList: AccountNode[] = [];

  for (const item of accounts) {
    if (!item || !item.email) continue;
    const cleanEmail = String(item.email).toLowerCase().trim();
    if (!seen.has(cleanEmail)) {
      seen.add(cleanEmail);

      // 🎯 MongoDB के profileTier को TIER_META के ज़रिए सही मोड में मैप करें
      const rawTier: ProfileTier = item.profileTier && TIER_META[item.profileTier as ProfileTier] 
        ? (item.profileTier as ProfileTier) 
        : "CURRENT";
      
      const meta = TIER_META[rawTier];

      uniqueList.push({
        _id: item._id,
        senderName: item.senderName ? String(item.senderName).trim() : "",
        email: cleanEmail,
        appPassword: item.appPassword || item.password || item.smtpPassword || item.encryptedPassword,
        profileTier: rawTier,
        accountAgeMode: meta ? meta.modeMap : "FRESH",
        lastSentAt: item.lastSentAt || null,
        isExternalPeer: item.isExternalPeer,
      });
    }
  }
  return uniqueList;
}

export function useWarmupQueue(machineId: string, directSessionToken?: string) {
  const [tierAccounts, setTierAccounts] = useState<AccountNode[]>([]);
  const [allReceivers, setAllReceivers] = useState<AccountNode[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRunning, setIsRunningState] = useState<boolean>(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [activeSenderEmail, setActiveSenderEmail] = useState<string>("");

  // 🎯 टियर सिलेक्शन (Default: "CURRENT" यानी Fresh)
  const [selectedTier, setSelectedTier] = useState<ProfileTier>("CURRENT");
  const currentMeta = TIER_META[selectedTier] || TIER_META.CURRENT;
  const currentConfig = MODE_CONFIGS[currentMeta.modeMap] || MODE_CONFIGS.FRESH;

  const [intervalSeconds, setIntervalSeconds] = useState<number>(5);
  // 🎯 डिफ़ॉल्ट लॉट साइज़ अब 10 पर सेट है (लेकिन टियर की मैक्स लिमिट से ज़्यादा नहीं हो सकता)
  const [lotSizePerAccount, setLotSizePerAccount] = useState<number>(
    Math.min(10, currentConfig.maxLot)
  );

  const [stats, setStats] = useState<WarmupStats>({
    totalProcessed: 0,
    totalFailed: 0,
    rescuedCount: 0,
    currentSenderIndex: 0,
  });

  const workerRef = useRef<Worker | null>(null);
  const latestTimesRef = useRef<Record<string, string>>({});

  // टियर बदलते ही डिफ़ॉल्ट लॉट 10 या उस टियर की मैक्स लिमिट पर सेट करें
  useEffect(() => {
    const maxAllowed = currentConfig.maxLot;
    const defaultVal = Math.min(10, maxAllowed);
    setLotSizePerAccount(defaultVal);
  }, [selectedTier]);

  // 1. वेब वर्कर लाइफसाइकल
  useEffect(() => {
    if (typeof window === "undefined") return;

    const worker = new Worker("/workers/warmup.worker.js");
    workerRef.current = worker;

    worker.onmessage = (e: MessageEvent) => {
      const { type, payload } = e.data;

      if (type === "LOG" && payload.text) {
        setLogs((prev) => [payload.text, ...prev.slice(0, 49)]);
      }

      if (type === "ACTIVE_SENDER_INDEX") {
        setStats((prev) => ({ ...prev, currentSenderIndex: payload.currentSenderIndex }));
        if (payload.activeEmail) setActiveSenderEmail(payload.activeEmail);
      }

      if (type === "EVICT_SENDER") {
        setTierAccounts((prev) => prev.filter((a) => a.email.toLowerCase().trim() !== payload.email));
        setLogs((prev) => [
          `[${new Date().toLocaleTimeString()}] ⛔ Evicted [${payload.email}]: ${payload.reason}`,
          ...prev.slice(0, 49),
        ]);
      }

      if (type === "STATS_UPDATE") {
        setStats((prev) => ({
          ...prev,
          totalProcessed: payload.totalProcessed,
          totalFailed: payload.totalFailed,
          rescuedCount: payload.rescuedCount,
        }));
        if (payload.senderProcessedTimes) {
          latestTimesRef.current = payload.senderProcessedTimes;
        }
      }

      if (type === "SENDER_LOT_FINISHED") {
        markSenderLotCompleted(payload.email);
        setTierAccounts((prev) =>
          prev.map((acc) =>
            acc.email.toLowerCase().trim() === payload.email
              ? { ...acc, lastSentAt: payload.lastSentAt }
              : acc
          )
        );
        if (payload.text) {
          setLogs((prev) => [payload.text, ...prev.slice(0, 49)]);
        }
      }

      if (type === "TARGET_COMPLETED" || type === "PAUSED") {
        setIsRunningState(false);
        setActiveSenderEmail("");
        if (payload?.message) {
          setLogs((prev) => [payload.message, ...prev.slice(0, 49)]);
        }
        if (payload?.senderProcessedTimes && Object.keys(payload.senderProcessedTimes).length > 0) {
          syncTimestampsToDatabase(machineId, payload.senderProcessedTimes);
        }
      }
    };

    return () => {
      worker.terminate();
    };
  }, [machineId]);

  // 2. डेटा लोड (सटीक ProfileTier फ़िल्टरिंग के साथ)
  useEffect(() => {
    if (!machineId) return;

    let isMounted = true;
    const loadTierData = async () => {
      try {
        setIsLoading(true);
        const storedToken =
          directSessionToken ||
          (typeof window !== "undefined" ? localStorage.getItem(SESSION_TOKEN_KEY) || "" : "");

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

        if (!isMounted) return;

        const cleanSenders = deduplicateAccounts(vaultData.accounts || []);
        const cleanReceivers = deduplicateAccounts(peerData.receivers || cleanSenders);
        
        // 🎯 केवल चुने हुए ProfileTier का डेटा फ़िल्टर करें
        const filteredByTier = cleanSenders.filter((acc) => acc.profileTier === selectedTier);

        setTierAccounts(filteredByTier);
        setAllReceivers(cleanReceivers);

        setLogs((prev) => [
          `[${new Date().toLocaleTimeString()}] 📦 Loaded [Tier: ${currentMeta.label}]: ${filteredByTier.length} Senders.`,
          ...prev,
        ]);
      } catch (err: any) {
        console.error("Tier fetch error:", err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    loadTierData();
    return () => { isMounted = false; };
  }, [machineId, directSessionToken, selectedTier]);

  // 3. कूलडाउन वर्गीकरण
  const { readySenders, coolingSenders, nearestCooldownMs } = useMemo(() => {
    const ready: AccountNode[] = [];
    const cooling: { account: AccountNode; remainingMs: number }[] = [];
    const now = Date.now();

    tierAccounts.forEach((acc) => {
      if (acc.lastSentAt) {
        const sentTime = new Date(acc.lastSentAt).getTime();
        const remaining = sentTime + COOLDOWN_MS - now;
        if (remaining > 0) {
          cooling.push({ account: acc, remainingMs: remaining });
        } else {
          ready.push(acc);
        }
      } else {
        ready.push(acc);
      }
    });

    cooling.sort((a, b) => a.remainingMs - b.remainingMs);
    return {
      readySenders: ready,
      coolingSenders: cooling,
      nearestCooldownMs: cooling.length > 0 ? cooling[0].remainingMs : 0,
    };
  }, [tierAccounts]);

  useEffect(() => {
    if (workerRef.current) {
      workerRef.current.postMessage({
        action: "UPDATE_CONFIG",
        payload: { intervalSeconds, lotSize: lotSizePerAccount },
      });
    }
  }, [intervalSeconds, lotSizePerAccount]);

  const setIsRunning = useCallback(
    (start: boolean) => {
      if (!workerRef.current) return;

      if (start) {
        const storedToken =
          directSessionToken ||
          (typeof window !== "undefined" ? localStorage.getItem(SESSION_TOKEN_KEY) || "" : "");

        if (readySenders.length === 0) {
          setLogs((prev) => [
            `[${new Date().toLocaleTimeString()}] ⏳ Cannot start: All senders in [${currentMeta.label}] are under 24h cooldown.`,
            ...prev,
          ]);
          return;
        }

        if (allReceivers.length === 0) return;

        setIsRunningState(true);
        workerRef.current.postMessage({
          action: "START",
          payload: {
            readySenders,
            receivers: allReceivers,
            lotSize: lotSizePerAccount,
            intervalSeconds,
            machineId,
            sessionToken: storedToken,
          },
        });
      } else {
        setIsRunningState(false);
        setActiveSenderEmail("");
        workerRef.current.postMessage({ action: "STOP" });
        if (Object.keys(latestTimesRef.current).length > 0) {
          syncTimestampsToDatabase(machineId, latestTimesRef.current);
        }
      }
    },
    [readySenders, allReceivers, lotSizePerAccount, intervalSeconds, machineId, directSessionToken, selectedTier]
  );

  return {
    tierAccounts,
    readySenders,
    coolingSenders,
    nearestCooldownMs,
    allReceivers,
    selectedTier,
    setSelectedTier,
    currentMeta,
    currentConfig,
    isLoading,
    isRunning,
    setIsRunning,
    activeSenderEmail,
    logs,
    stats,
    intervalSeconds,
    setIntervalSeconds,
    lotSizePerAccount,
    setLotSizePerAccount,
  };
}