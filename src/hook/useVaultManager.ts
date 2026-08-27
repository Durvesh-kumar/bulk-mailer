// src/hook/useVaultManager.ts
"use client";

import { useState } from "react";
import { ProfileTier, SmtpAccount, SESSION_TOKEN_KEY, TIER_ORDER } from "@/types/vault";

export function useVaultManager(machineId: string) {
  const [activeTierAccounts, setActiveTierAccounts] = useState<SmtpAccount[]>([]);
  const [activeTab, setActiveTab] = useState<ProfileTier>("YEAR_2");
  const [loading, setLoading] = useState(false);

  const [revealedPasswords, setRevealedPasswords] = useState<Record<string, string>>({});
  const [loadingRevealId, setLoadingRevealId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchOnlyActiveTier = async (tier: ProfileTier) => {
    if (!machineId) return;
    setLoading(true);
    setActiveTierAccounts([]);

    try {
      const savedSession = localStorage.getItem(SESSION_TOKEN_KEY) || "";
      const res = await fetch(
        `/api/smtp-vault?machineId=${encodeURIComponent(machineId)}&tier=${tier}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "x-session-token": savedSession,
          },
        }
      );

      const data = await res.json();
      if (data.accounts) {
        setActiveTierAccounts(data.accounts);
      }
    } catch (e) {
      console.error("Vault live fetch error:", e);
    } finally {
      setLoading(false);
    }
  };

  const togglePasswordVisibility = async (accId: string, encryptedPass: string) => {
    if (revealedPasswords[accId]) {
      setRevealedPasswords((prev) => {
        const copy = { ...prev };
        delete copy[accId];
        return copy;
      });
      return;
    }

    if (!encryptedPass.includes(":")) {
      setRevealedPasswords((prev) => ({ ...prev, [accId]: encryptedPass }));
      return;
    }

    setLoadingRevealId(accId);
    const savedSession = localStorage.getItem(SESSION_TOKEN_KEY) || "";

    try {
      const res = await fetch("/api/smtp-vault", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          machineId,
          sessionToken: savedSession,
          action: "DECRYPT",
          encryptedPassword: encryptedPass,
        }),
      });

      const data = await res.json();
      if (res.ok && data.decryptedPassword) {
        setRevealedPasswords((prev) => ({
          ...prev,
          [accId]: data.decryptedPassword,
        }));
      } else {
        alert(`⚠️ ${data.error || "Failed to decrypt password."}`);
      }
    } catch {
      alert("Network error while decrypting.");
    } finally {
      setLoadingRevealId(null);
    }
  };

  const copyCredentials = async (id: string, emailStr: string, encPassStr: string) => {
    let plainPass = revealedPasswords[id];

    if (!plainPass) {
      if (!encPassStr.includes(":")) {
        plainPass = encPassStr;
      } else {
        try {
          const savedSession = localStorage.getItem(SESSION_TOKEN_KEY) || "";
          const res = await fetch("/api/smtp-vault", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              machineId,
              sessionToken: savedSession,
              action: "DECRYPT",
              encryptedPassword: encPassStr,
            }),
          });
          const data = await res.json();
          if (res.ok && data.decryptedPassword) {
            plainPass = data.decryptedPassword;
            setRevealedPasswords((prev) => ({ ...prev, [id]: data.decryptedPassword }));
          }
        } catch {}
      }
    }

    navigator.clipboard.writeText(`Email: ${emailStr}\nApp Password: ${plainPass || encPassStr}`);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const upgradeTier = async (accountId: string, currentTier: ProfileTier) => {
    const currentIndex = TIER_ORDER.indexOf(currentTier);
    if (currentIndex >= TIER_ORDER.length - 1) {
      alert("Already at maximum Ultra-Aged tier!");
      return;
    }
    const targetTier = TIER_ORDER[currentIndex + 1];
    const savedSession = localStorage.getItem(SESSION_TOKEN_KEY) || "";

    const res = await fetch("/api/smtp-vault", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        machineId,
        sessionToken: savedSession,
        accountId,
        updateType: "UPGRADE_TIER",
        updateData: { targetTier },
      }),
    });

    if (res.ok) {
      fetchOnlyActiveTier(activeTab);
    } else {
      const data = await res.json();
      alert(data.error || "Failed to upgrade tier");
    }
  };

  const deleteAccount = async (accountId: string) => {
    if (!confirm("Are you sure you want to delete this account?")) return;
    const savedSession = localStorage.getItem(SESSION_TOKEN_KEY) || "";

    const res = await fetch("/api/smtp-vault", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ machineId, sessionToken: savedSession, accountId }),
    });

    if (res.ok) {
      fetchOnlyActiveTier(activeTab);
    } else {
      const data = await res.json();
      alert(data.error || "Failed to delete account");
    }
  };

  return {
    activeTierAccounts,
    setActiveTierAccounts,
    activeTab,
    setActiveTab,
    loading,
    fetchOnlyActiveTier,
    revealedPasswords,
    loadingRevealId,
    copiedId,
    togglePasswordVisibility,
    copyCredentials,
    upgradeTier,
    deleteAccount,
  };
}