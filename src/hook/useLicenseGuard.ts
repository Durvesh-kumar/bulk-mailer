// src/hooks/useLicenseGuard.ts
"use client";

import { useEffect, useState } from "react";
import { getClientMachineId } from "@/lib/fingerprint";

const SESSION_TOKEN_KEY = "reachout_session_token";
const PENDING_QUEUE_STORAGE_KEY = "reachout_pending_queue";

// 1. TypeScript के लिए सटीक Types डिफाइन करें
export type LicenseUserType = "NEW_USER" | "EXPIRED" | "SUSPENDED" | "ACTIVE";

export function useLicenseGuard() {
  const [loadingLicense, setLoadingLicense] = useState<boolean>(true);
  const [isSuspended, setIsSuspended] = useState<boolean>(false);
  const [userType, setUserType] = useState<LicenseUserType>("NEW_USER");
  const [machineId, setMachineId] = useState<string>("");
  const [appDomain, setAppDomain] = useState<string>("");
  const [expiryDate, setExpiryDate] = useState<string | null>(null);

  // पेंडिंग क्यू स्टेट्स
  const [pendingEmails, setPendingEmails] = useState<string[]>([]);
  const [rawSheetData, setRawSheetData] = useState<string>("");
  const [initialTotalCount, setInitialTotalCount] = useState<number>(0);
  const [isCampaignStarted, setIsCampaignStarted] = useState<boolean>(false);
  const [lastBatchMessage, setLastBatchMessage] = useState<string>("");

  useEffect(() => {
    async function initSecurityAndLicense() {
      try {
        const currentDomain = window.location.hostname;
        setAppDomain(currentDomain);

        const currentMachineId = await getClientMachineId();
        setMachineId(currentMachineId);

        const existingSessionToken = localStorage.getItem(SESSION_TOKEN_KEY);

        const res = await fetch("/api/check-license", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-cache",
          },
          body: JSON.stringify({
            machineId: currentMachineId,
            domain: currentDomain,
            sessionToken: existingSessionToken,
          }),
        });

        const data = await res.json();

        if (!res.ok || !data.allowed) {
          if (data.clearSession) {
            localStorage.removeItem(SESSION_TOKEN_KEY);
          }
          setIsSuspended(true);

          // Type-safe assignment (Type Error Fix)
          const resolvedType: LicenseUserType =
            data.reason === "EXPIRED"
              ? "EXPIRED"
              : data.reason === "SUSPENDED"
              ? "SUSPENDED"
              : "NEW_USER";

          setUserType(resolvedType);

          if (data.expiryDate) {
            setExpiryDate(String(data.expiryDate));
          }
        } else {
          setIsSuspended(false);
          setUserType("ACTIVE");

          if (data.sessionToken) {
            localStorage.setItem(SESSION_TOKEN_KEY, data.sessionToken);
          }

          try {
            const savedQueue = localStorage.getItem(PENDING_QUEUE_STORAGE_KEY);
            if (savedQueue) {
              const parsed = JSON.parse(savedQueue);
              if (Array.isArray(parsed) && parsed.length > 0) {
                setPendingEmails(parsed);
                setRawSheetData(parsed.join("\n"));
                setInitialTotalCount(parsed.length);
                setIsCampaignStarted(true);
                setLastBatchMessage(
                  `⚡ Restored ${parsed.length} pending leads from last active session`
                );
              }
            }
          } catch (e) {
            console.error("Queue restore error:", e);
          }
        }
      } catch (err) {
        console.error("License check failed:", err);
        localStorage.removeItem(SESSION_TOKEN_KEY);
        setIsSuspended(true);
        setUserType("NEW_USER");
      } finally {
        setLoadingLicense(false);
      }
    }

    initSecurityAndLicense();
  }, []);

  return {
    loadingLicense,
    isSuspended,
    userType,
    machineId,
    appDomain,
    expiryDate,
    pendingEmails,
    rawSheetData,
    initialTotalCount,
    isCampaignStarted,
    lastBatchMessage,
    setIsSuspended, // अगर बाहर से भी स्टेट बदलनी हो
  };
}