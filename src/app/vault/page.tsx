"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { getClientMachineId } from "@/lib/fingerprint";

export type ProfileTier = "CURRENT" | "YEAR_1" | "YEAR_2" | "YEAR_4" | "YEAR_6";

interface SmtpAccount {
  _id: string;
  email: string;
  appPassword: string; // एन्क्रिप्टेड सिफरटेक्स्ट
  senderName: string;
  profileTier: ProfileTier;
}

const TIER_ORDER: ProfileTier[] = ["CURRENT", "YEAR_1", "YEAR_2", "YEAR_4", "YEAR_6"];

const TIER_LABELS: Record<ProfileTier, { label: string; badge: string; color: string }> = {
  CURRENT: { label: "Fresh (<6 Mo)", badge: "🔴 Fresh", color: "border-rose-500/40 text-rose-300" },
  YEAR_1: { label: "1 Year Aged", badge: "🟡 1 Year", color: "border-amber-500/40 text-amber-300" },
  YEAR_2: { label: "2 Year Aged", badge: "🟢 2 Year", color: "border-emerald-500/40 text-emerald-300" },
  YEAR_4: { label: "4 Year Prime", badge: "💎 4 Year", color: "border-blue-500/40 text-blue-300" },
  YEAR_6: { label: "6+ Year Ultra", badge: "👑 6+ Year", color: "border-purple-500/40 text-purple-300" },
};

const SESSION_TOKEN_KEY = "reachout_daily_session_token";

export default function VaultManagerPage() {
  const [machineId, setMachineId] = useState("");
  const [activeTierAccounts, setActiveTierAccounts] = useState<SmtpAccount[]>([]);
  const [activeTab, setActiveTab] = useState<ProfileTier>("YEAR_2");
  const [loading, setLoading] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");

  // Form State (Add / Edit)
  const [email, setEmail] = useState("");
  const [appPassword, setAppPassword] = useState("");
  const [senderName, setSenderName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showFormPassword, setShowFormPassword] = useState(false);

  // Password Reveal (On-Demand Decrypted Store) & Copy State
  const [revealedPasswords, setRevealedPasswords] = useState<Record<string, string>>({});
  const [loadingRevealId, setLoadingRevealId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // 🎯 STRICT SINGLE-TIER FETCH (GET Method - Returns Ciphertexts safely)
  const fetchOnlyActiveTier = async (tier: ProfileTier, mId: string) => {
    if (!mId) return;
    setLoading(true);
    setActiveTierAccounts([]);

    try {
      const savedSession = localStorage.getItem(SESSION_TOKEN_KEY) || "";

      const res = await fetch(
        `/api/smtp-vault?machineId=${encodeURIComponent(mId)}&tier=${tier}`,
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

  useEffect(() => {
    async function init() {
      const mId = await getClientMachineId();
      setMachineId(mId);
      if (mId) {
        fetchOnlyActiveTier("YEAR_2", mId);
      }
    }
    init();
  }, []);

  const handleTabClick = (tier: ProfileTier) => {
    setActiveTab(tier);
    setSearchQuery("");
    if (machineId) {
      fetchOnlyActiveTier(tier, machineId);
    }
  };

  // 👁️ ऑन-डिमांड पासवर्ड डिक्रिप्शन हैंडलर (Zero DB Call)
  const togglePasswordVisibility = async (accId: string, encryptedPass: string) => {
    // अगर पहले से अनमास्क है, तो मास्क कर दें
    if (revealedPasswords[accId]) {
      setRevealedPasswords((prev) => {
        const copy = { ...prev };
        delete copy[accId];
        return copy;
      });
      return;
    }

    // अगर पहले से अनएन्क्रिप्टेड प्लेन टेक्स्ट है (लोकल फॉलबैक)
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

  // 📋 Gmail ID + डिक्रिप्टेड पासवर्ड क्लिपबोर्ड कॉपी
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
        } catch {
          // fallback
        }
      }
    }

    const textToCopy = `Email: ${emailStr}\nApp Password: ${plainPass || encPassStr}`;
    navigator.clipboard.writeText(textToCopy);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // 🛡️ Helper: App Password Strict Validator (16 Letters)
  const validateAppPassword = (pwd: string): boolean => {
    const clean = pwd.replace(/\s+/g, "").toLowerCase();
    return /^[a-z]{16}$/.test(clean);
  };

  // Create (POST) or Partial Edit (PATCH)
  const handleSaveAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !senderName || !machineId) return;

    const cleanEmail = email.trim().toLowerCase();
    const cleanSenderName = senderName.trim();
    const rawPassword = appPassword.trim();
    const sanitizedPassword = rawPassword.replace(/\s+/g, "").toLowerCase();

    if (!editingId) {
      if (!validateAppPassword(rawPassword)) {
        alert("Invalid App Password!\nGoogle App Passwords must be exactly 16 letters (e.g. 'abcd efgh ijkl mnop' or 'abcdefghijklmnop'). Numbers and special characters are not allowed.");
        return;
      }
    } else {
      if (rawPassword.length > 0 && !validateAppPassword(rawPassword)) {
        alert("Invalid App Password!\nGoogle App Passwords must be exactly 16 letters (e.g. 'abcd efgh ijkl mnop').");
        return;
      }
    }

    const savedSession = localStorage.getItem(SESSION_TOKEN_KEY) || "";

    if (editingId) {
      const updatePayload: Record<string, any> = {
        senderName: cleanSenderName,
        profileTier: activeTab,
      };

      if (rawPassword.length > 0) {
        updatePayload.appPassword = sanitizedPassword;
      }

      const res = await fetch("/api/smtp-vault", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          machineId,
          sessionToken: savedSession,
          accountId: editingId,
          updateType: "EDIT",
          updateData: updatePayload,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        fetchOnlyActiveTier(activeTab, machineId);
        handleCancelEdit();
      } else {
        alert(data.error || "Failed to update account");
      }
    } else {
      const res = await fetch("/api/smtp-vault", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          machineId,
          sessionToken: savedSession,
          accountData: {
            email: cleanEmail,
            appPassword: sanitizedPassword,
            senderName: cleanSenderName,
            profileTier: activeTab,
          },
        }),
      });

      const data = await res.json();
      if (res.ok) {
        fetchOnlyActiveTier(activeTab, machineId);
        setEmail("");
        setAppPassword("");
        setSenderName("");
      } else {
        alert(data.error || "Failed to add account");
      }
    }
  };

  const handleStartEdit = (acc: SmtpAccount) => {
    setEditingId(acc._id);
    setEmail(acc.email);
    setAppPassword("");
    setSenderName(acc.senderName);
    setActiveTab(acc.profileTier);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEmail("");
    setAppPassword("");
    setSenderName("");
  };

  // ⚡ Atomic Tier Upgrade (PATCH)
  const handleUpgradeTier = async (accountId: string, currentTier: ProfileTier) => {
    const currentIndex = TIER_ORDER.indexOf(currentTier);
    if (currentIndex >= TIER_ORDER.length - 1) {
      alert("This account is already at maximum Ultra-Aged tier!");
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

    const data = await res.json();
    if (res.ok) {
      fetchOnlyActiveTier(activeTab, machineId);
    } else {
      alert(data.error || "Failed to upgrade tier");
    }
  };

  // 🗑️ Account Deletion (DELETE)
  const handleDelete = async (accountId: string) => {
    if (!confirm("Are you sure you want to delete this account?")) return;
    const savedSession = localStorage.getItem(SESSION_TOKEN_KEY) || "";

    const res = await fetch("/api/smtp-vault", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        machineId, 
        sessionToken: savedSession,
        accountId 
      }),
    });

    const data = await res.json();
    if (res.ok) {
      fetchOnlyActiveTier(activeTab, machineId);
    } else {
      alert(data.error || "Failed to delete account");
    }
  };

  const displayedAccounts = activeTierAccounts.filter((a) => {
    const q = searchQuery.toLowerCase().trim();
    return !q || a.email.toLowerCase().includes(q) || a.senderName.toLowerCase().includes(q);
  });

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-6 font-sans">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Top Header */}
        <div className="flex items-center justify-between bg-slate-900 border border-slate-800 p-5 rounded-3xl shadow-xl">
          <div className="space-y-1">
            <h1 className="text-xl font-black text-white flex items-center gap-2">
              <img src="/icons/engine-hub.svg" alt="Hub" className="w-6 h-6 object-contain" />
              Multi-Profile SMTP Account Vault
            </h1>
            <p className="text-xs text-slate-400 font-mono">
              Hardware Binding: <span className="text-indigo-400">{machineId || "Authenticating..."}</span>
            </p>
          </div>
          <Link
            href="/"
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition"
          >
            ← Back to Campaign Dispatcher
          </Link>
        </div>

        {/* 🎯 On-Demand Clickable Profile Tabs */}
        <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-3">
          {TIER_ORDER.map((tier) => {
            const meta = TIER_LABELS[tier];
            const isActive = activeTab === tier;
            return (
              <button
                key={tier}
                type="button"
                onClick={() => handleTabClick(tier)}
                className={`px-4 py-2 rounded-2xl text-xs font-bold transition cursor-pointer flex items-center gap-2 ${
                  isActive
                    ? `bg-slate-800 border ${meta.color} shadow-lg scale-105`
                    : "bg-slate-900 text-slate-400 hover:text-white border border-slate-800/80"
                }`}
              >
                <span>{meta.badge}</span>
                <span>{meta.label}</span>
              </button>
            );
          })}
        </div>

        {/* 🔍 Search Bar */}
        <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-2xl flex flex-col sm:flex-row items-center gap-3 shadow-lg">
          <div className="relative flex-1 w-full">
            <span className="absolute left-3.5 top-2.5 text-slate-500 text-xs">🔍</span>
            <input
              type="text"
              autoComplete="off"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={`Search within ${TIER_LABELS[activeTab].badge} accounts...`}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-8 py-2 text-xs text-slate-100 placeholder:text-slate-500 outline-none focus:border-indigo-500 transition font-medium"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-2.5 text-xs text-slate-400 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>
          <span className="text-[11px] text-indigo-400 font-mono bg-indigo-500/10 border border-indigo-500/30 px-3 py-1.5 rounded-xl whitespace-nowrap">
            Loaded: {displayedAccounts.length}
          </span>
        </div>

        {/* Add / Edit Senders Form */}
        <form 
          onSubmit={handleSaveAccount} 
          autoComplete="off"
          className="bg-slate-900/90 border border-slate-800 p-5 rounded-3xl space-y-4 shadow-xl"
        >
          <div className="flex justify-between items-center">
            <h2 className="text-xs font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
              <img src="/icons/sparkle-star.svg" alt="Star" className="w-3.5 h-3.5 object-contain" />
              {editingId ? "✏️ Edit Sender Credentials" : `Add Sender to ${TIER_LABELS[activeTab].label}`}
            </h2>
            <span className={`text-[10px] px-2 py-0.5 rounded-md font-bold border ${TIER_LABELS[activeTab].color}`}>
              Target: {TIER_LABELS[activeTab].badge}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Sender Gmail ID */}
            <input
              type="email"
              required
              disabled={!!editingId}
              autoComplete="off"
              data-lpignore="true"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Sender Gmail ID (e.g. outreach1@gmail.com)"
              className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-indigo-500 disabled:opacity-50"
            />
            
            {/* App Password Input */}
            <div className="relative flex items-center">
              <input
                type={showFormPassword ? "text" : "password"}
                required={!editingId}
                autoComplete="new-password"
                data-lpignore="true"
                value={appPassword}
                onChange={(e) => setAppPassword(e.target.value)}
                placeholder={editingId ? "Leave blank to keep same password" : "16-Letter App Password (xxxx xxxx xxxx xxxx)"}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-3 pr-8 py-2 text-xs text-amber-300 font-mono outline-none focus:border-indigo-500"
              />
              <button
                type="button"
                onClick={() => setShowFormPassword((prev) => !prev)}
                className="absolute right-2.5 text-xs text-slate-400 hover:text-white cursor-pointer"
                title={showFormPassword ? "Hide" : "Show"}
              >
                {showFormPassword ? "🙈" : "👁️"}
              </button>
            </div>

            {/* Display Name */}
            <input
              type="text"
              required
              autoComplete="off"
              data-lpignore="true"
              value={senderName}
              onChange={(e) => setSenderName(e.target.value)}
              placeholder="Display Name (e.g. Sales Team)"
              className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-indigo-500"
            />
          </div>

          <div className="flex gap-2">
            {editingId && (
              <button
                type="button"
                onClick={handleCancelEdit}
                className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                Cancel Edit
              </button>
            )}
            <button
              type="submit"
              className="flex-1 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold cursor-pointer transition shadow-md"
            >
              {editingId ? "💾 Update Sender Credentials" : `+ Save Account into ${TIER_LABELS[activeTab].badge}`}
            </button>
          </div>
        </form>

        {/* Active Tier Accounts Cards Grid */}
        <div className="bg-slate-900/90 border border-slate-800 p-5 rounded-3xl space-y-3 shadow-xl">
          <div className="flex justify-between items-center">
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
              {TIER_LABELS[activeTab].label} Active Senders ({displayedAccounts.length})
            </h3>
            <span className="text-[11px] text-slate-500 font-mono">
              Live DB Synced (Single-Tier RAM)
            </span>
          </div>

          {loading ? (
            <div className="py-8 text-center text-xs text-indigo-400 font-mono flex justify-center items-center gap-2">
              <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
              <span>Fetching {TIER_LABELS[activeTab].badge} from DB...</span>
            </div>
          ) : displayedAccounts.length === 0 ? (
            <div className="py-8 text-center text-slate-500 text-xs">
              {searchQuery ? "No accounts found matching your search." : `No accounts registered in ${TIER_LABELS[activeTab].label} yet.`}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {displayedAccounts.map((acc) => {
                const isRevealed = !!revealedPasswords[acc._id];
                const isRevealing = loadingRevealId === acc._id;
                const isCopied = copiedId === acc._id;

                return (
                  <div
                    key={acc._id}
                    className="bg-slate-950 border border-slate-800/90 hover:border-slate-700 p-4 rounded-2xl flex flex-col justify-between gap-3 shadow-sm"
                  >
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-bold text-white truncate max-w-[200px]" title={acc.email}>
                          {acc.email}
                        </span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-md font-bold border ${TIER_LABELS[acc.profileTier].color}`}>
                          {TIER_LABELS[acc.profileTier].badge}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400">
                        Sender Name: <span className="text-slate-200 font-medium">{acc.senderName}</span>
                      </p>

                      <div className="flex items-center gap-2 bg-slate-900/80 px-2.5 py-1.5 rounded-lg border border-slate-800/80 w-fit">
                        <span className="text-[10px] text-slate-400 font-mono">Password:</span>
                        <span className="text-xs font-mono font-bold text-amber-300">
                          {isRevealed ? revealedPasswords[acc._id] : "•••• •••• •••• ••••"}
                        </span>
                        
                        {/* 👁️ Eye Reveal Button (On-Demand Decrypt) */}
                        <button
                          type="button"
                          disabled={isRevealing}
                          onClick={() => togglePasswordVisibility(acc._id, acc.appPassword)}
                          className="text-slate-400 hover:text-white text-xs cursor-pointer ml-1 transition"
                          title={isRevealed ? "Hide Password" : "Show Password"}
                        >
                          {isRevealing ? (
                            <span className="animate-spin inline-block text-[10px]">⏳</span>
                          ) : isRevealed ? (
                            "🙈"
                          ) : (
                            "👁️"
                          )}
                        </button>
                        
                        {/* 📋 Gmail ID + Password Copy Button */}
                        <button
                          type="button"
                          onClick={() => copyCredentials(acc._id, acc.email, acc.appPassword)}
                          className={`text-[11px] px-2 py-0.5 rounded-md cursor-pointer transition ml-1 flex items-center gap-1 font-medium ${
                            isCopied
                              ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                              : "bg-slate-800 text-slate-300 hover:text-indigo-300 hover:bg-slate-700 border border-slate-700/60"
                          }`}
                          title="Copy Gmail ID & App Password"
                        >
                          {isCopied ? "✓ Copied" : "📋 Copy"}
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between border-t border-slate-900 pt-2">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleUpgradeTier(acc._id, acc.profileTier)}
                          className="text-[10px] bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/30 px-2 py-1 rounded-lg font-semibold cursor-pointer transition"
                        >
                          ⬆️ Upgrade Age
                        </button>
                        <button
                          type="button"
                          onClick={() => handleStartEdit(acc)}
                          className="text-[10px] bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 px-2 py-1 rounded-lg font-semibold cursor-pointer transition"
                        >
                          ✏️ Edit
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDelete(acc._id)}
                        className="text-[10px] text-rose-400 hover:text-rose-300 font-semibold cursor-pointer px-2 py-1"
                      >
                        🗑️ Delete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </main>
  );
}