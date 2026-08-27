// src/app/vault/page.tsx
"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useLicenseGuard } from "@/hook/useLicenseGuard";
import SuspendedScreen from "@/components/SuspendedScreen";
import { useVaultManager } from "@/hook/useVaultManager";
import { ProfileTier, SmtpAccount, TIER_ORDER, TIER_META, SESSION_TOKEN_KEY } from "@/types/vault";

export default function VaultManagerPage() {
  const { loadingLicense, isSuspended, userType, expiryDate, machineId, appDomain } = useLicenseGuard();
  const {
    activeTierAccounts,
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
  } = useVaultManager(machineId);

  const [searchQuery, setSearchQuery] = useState("");
  const [email, setEmail] = useState("");
  const [appPassword, setAppPassword] = useState("");
  const [senderName, setSenderName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showFormPassword, setShowFormPassword] = useState(false);

  const handleTabClick = (tier: ProfileTier) => {
    setActiveTab(tier);
    setSearchQuery("");
    fetchOnlyActiveTier(tier);
  };

  const validateAppPassword = (pwd: string) => /^[a-z]{16}$/.test(pwd.replace(/\s+/g, "").toLowerCase());

  const handleSaveAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !senderName || !machineId) return;

    const cleanEmail = email.trim().toLowerCase();
    const cleanSenderName = senderName.trim();
    const rawPassword = appPassword.trim();
    const sanitizedPassword = rawPassword.replace(/\s+/g, "").toLowerCase();

    if ((!editingId || rawPassword.length > 0) && !validateAppPassword(rawPassword)) {
      alert("Invalid App Password! Must be exactly 16 letters (e.g. 'abcd efgh ijkl mnop').");
      return;
    }

    const savedSession = localStorage.getItem(SESSION_TOKEN_KEY) || "";

    if (editingId) {
      const updateData: Record<string, any> = { senderName: cleanSenderName, profileTier: activeTab };
      if (rawPassword.length > 0) updateData.appPassword = sanitizedPassword;

      const res = await fetch("/api/smtp-vault", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ machineId, sessionToken: savedSession, accountId: editingId, updateType: "EDIT", updateData }),
      });

      if (res.ok) {
        fetchOnlyActiveTier(activeTab);
        handleCancelEdit();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to update account");
      }
    } else {
      const res = await fetch("/api/smtp-vault", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          machineId,
          sessionToken: savedSession,
          accountData: { email: cleanEmail, appPassword: sanitizedPassword, senderName: cleanSenderName, profileTier: activeTab },
        }),
      });

      if (res.ok) {
        fetchOnlyActiveTier(activeTab);
        setEmail("");
        setAppPassword("");
        setSenderName("");
      } else {
        const data = await res.json();
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

  const displayedAccounts = activeTierAccounts.filter((a) => {
    const q = searchQuery.toLowerCase().trim();
    return !q || a.email.toLowerCase().includes(q) || a.senderName.toLowerCase().includes(q);
  });

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

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-6 font-sans">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
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
          <Link href="/" className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition">
            ← Back to Campaign Dispatcher
          </Link>
        </div>

        {/* Profile Tabs */}
        <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-3">
          {TIER_ORDER.map((tier) => {
            const meta = TIER_META[tier];
            const isActive = activeTab === tier;
            return (
              <button
                key={tier}
                type="button"
                onClick={() => handleTabClick(tier)}
                className={`px-4 py-2 rounded-2xl text-xs font-bold transition cursor-pointer flex items-center gap-2 ${
                  isActive ? `bg-slate-800 border ${meta.borderText} shadow-lg scale-105` : "bg-slate-900 text-slate-400 hover:text-white border border-slate-800/80"
                }`}
              >
                <span>{meta.badge}</span>
                <span>{meta.label}</span>
              </button>
            );
          })}
        </div>

        {/* Search Bar */}
        <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-2xl flex flex-col sm:flex-row items-center gap-3 shadow-lg">
          <div className="relative flex-1 w-full">
            <span className="absolute left-3.5 top-2.5 text-slate-500 text-xs">🔍</span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={`Search within ${TIER_META[activeTab].badge} accounts...`}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-8 py-2 text-xs text-slate-100 placeholder:text-slate-500 outline-none focus:border-indigo-500 transition font-medium"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="absolute right-3 top-2.5 text-xs text-slate-400 hover:text-white cursor-pointer">
                ✕
              </button>
            )}
          </div>
          <span className="text-[11px] text-indigo-400 font-mono bg-indigo-500/10 border border-indigo-500/30 px-3 py-1.5 rounded-xl">
            Loaded: {displayedAccounts.length}
          </span>
        </div>

        {/* Add / Edit Form */}
        <form onSubmit={handleSaveAccount} className="bg-slate-900/90 border border-slate-800 p-5 rounded-3xl space-y-4 shadow-xl">
          <div className="flex justify-between items-center">
            <h2 className="text-xs font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
              <img src="/icons/sparkle-star.svg" alt="Star" className="w-3.5 h-3.5 object-contain" />
              {editingId ? "✏️ Edit Sender Credentials" : `Add Sender to ${TIER_META[activeTab].label}`}
            </h2>
            <span className={`text-[10px] px-2 py-0.5 rounded-md font-bold border ${TIER_META[activeTab].borderText}`}>
              Target: {TIER_META[activeTab].badge}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              type="email"
              required
              disabled={!!editingId}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Sender Gmail ID"
              className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-indigo-500 disabled:opacity-50"
            />
            <div className="relative flex items-center">
              <input
                type={showFormPassword ? "text" : "password"}
                required={!editingId}
                value={appPassword}
                onChange={(e) => setAppPassword(e.target.value)}
                placeholder={editingId ? "Leave blank to keep same password" : "16-Letter App Password"}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-3 pr-8 py-2 text-xs text-amber-300 font-mono outline-none focus:border-indigo-500"
              />
              <button
                type="button"
                onClick={() => setShowFormPassword(!showFormPassword)}
                className="absolute right-2.5 text-xs text-slate-400 hover:text-white cursor-pointer"
              >
                {showFormPassword ? "🙈" : "👁️"}
              </button>
            </div>
            <input
              type="text"
              required
              value={senderName}
              onChange={(e) => setSenderName(e.target.value)}
              placeholder="Display Name (e.g. Sales Team)"
              className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-indigo-500"
            />
          </div>

          <div className="flex gap-2">
            {editingId && (
              <button type="button" onClick={handleCancelEdit} className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition">
                Cancel Edit
              </button>
            )}
            <button type="submit" className="flex-1 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold transition shadow-md">
              {editingId ? "💾 Update Sender Credentials" : `+ Save Account into ${TIER_META[activeTab].badge}`}
            </button>
          </div>
        </form>

        {/* Account Cards Grid */}
        <div className="bg-slate-900/90 border border-slate-800 p-5 rounded-3xl space-y-3 shadow-xl">
          <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
            {TIER_META[activeTab].label} Active Senders ({displayedAccounts.length})
          </h3>

          {loading ? (
            <div className="py-8 text-center text-xs text-indigo-400 font-mono flex justify-center items-center gap-2">
              <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
              <span>Fetching {TIER_META[activeTab].badge} from DB...</span>
            </div>
          ) : displayedAccounts.length === 0 ? (
            <div className="py-8 text-center text-slate-500 text-xs">
              {searchQuery ? "No accounts found matching search." : `No accounts registered in ${TIER_META[activeTab].label} yet.`}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {displayedAccounts.map((acc) => {
                const isRevealed = !!revealedPasswords[acc._id];
                const isRevealing = loadingRevealId === acc._id;
                const isCopied = copiedId === acc._id;

                return (
                  <div key={acc._id} className="bg-slate-950 border border-slate-800/90 hover:border-slate-700 p-4 rounded-2xl flex flex-col justify-between gap-3">
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-bold text-white truncate max-w-[200px]" title={acc.email}>{acc.email}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-md font-bold border ${TIER_META[acc.profileTier].borderText}`}>
                          {TIER_META[acc.profileTier].badge}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400">Sender Name: <span className="text-slate-200 font-medium">{acc.senderName}</span></p>

                      <div className="flex items-center gap-2 bg-slate-900/80 px-2.5 py-1.5 rounded-lg border border-slate-800/80 w-fit">
                        <span className="text-[10px] text-slate-400 font-mono">Password:</span>
                        <span className="text-xs font-mono font-bold text-amber-300">
                          {isRevealed ? revealedPasswords[acc._id] : "•••• •••• •••• ••••"}
                        </span>
                        <button
                          type="button"
                          disabled={isRevealing}
                          onClick={() => togglePasswordVisibility(acc._id, acc.appPassword)}
                          className="text-slate-400 hover:text-white text-xs cursor-pointer ml-1"
                        >
                          {isRevealing ? "⏳" : isRevealed ? "🙈" : "👁️"}
                        </button>
                        <button
                          type="button"
                          onClick={() => copyCredentials(acc._id, acc.email, acc.appPassword)}
                          className={`text-[11px] px-2 py-0.5 rounded-md cursor-pointer transition ml-1 font-medium ${
                            isCopied ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40" : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                          }`}
                        >
                          {isCopied ? "✓ Copied" : "📋 Copy"}
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between border-t border-slate-900 pt-2">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => upgradeTier(acc._id, acc.profileTier)}
                          className="text-[10px] bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/30 px-2 py-1 rounded-lg font-semibold"
                        >
                          ⬆️ Upgrade Age
                        </button>
                        <button
                          type="button"
                          onClick={() => handleStartEdit(acc)}
                          className="text-[10px] bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 px-2 py-1 rounded-lg font-semibold"
                        >
                          ✏️ Edit
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => deleteAccount(acc._id)}
                        className="text-[10px] text-rose-400 hover:text-rose-300 font-semibold px-2 py-1"
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