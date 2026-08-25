"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { getClientMachineId } from "@/lib/fingerprint";

export type ProfileTier = "CURRENT" | "YEAR_1" | "YEAR_2" | "YEAR_4" | "YEAR_6";

interface SmtpAccount {
  _id: string;
  email: string;
  appPassword: string;
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
  // 🎯 इसमें कभी भी सारा डेटा नहीं रहेगा - सिर्फ और सिर्फ एक्टिव टैब का डेटा रहेगा
  const [activeTierAccounts, setActiveTierAccounts] = useState<SmtpAccount[]>([]);
  const [activeTab, setActiveTab] = useState<ProfileTier>("YEAR_2");
  const [loading, setLoading] = useState(false);

  // Search state (सिर्फ एक्टिव टियर के अंदर)
  const [searchQuery, setSearchQuery] = useState("");

  // Form State (Add / Edit)
  const [email, setEmail] = useState("");
  const [appPassword, setAppPassword] = useState("");
  const [senderName, setSenderName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  // Password Visibility Toggle Map
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({});

  // 🎯 STRICT SINGLE-TIER FETCH: केवल उसी एक टियर का डेटा फेच और स्टोर करना (with decrypt=true)
  const fetchOnlyActiveTier = async (tier: ProfileTier, mId: string) => {
    if (!mId) return;
    setLoading(true);
    // पहले की मेमोरी तुरंत साफ़ ताकि RAM 100% खाली रहे
    setActiveTierAccounts([]);

    try {
      const savedSession = localStorage.getItem(SESSION_TOKEN_KEY) || "";

      // 🔑 decrypt=true जोड़ा गया है ताकि असली ऐप पासवर्ड ही दिखे
      const res = await fetch(
        `/api/smtp-vault?machineId=${encodeURIComponent(mId)}&tier=${tier}&decrypt=true`,
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
        // सिर्फ इस एक टियर के अकाउंट्स स्टेट में गए
        setActiveTierAccounts(data.accounts);
      }
    } catch (e) {
      console.error("Vault live fetch error:", e);
    } finally {
      setLoading(false);
    }
  };

  // पेज लोड होते ही सिर्फ डिफ़ॉल्ट टियर (YEAR_2) का डेटा फेच होगा
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

  // 🎯 जब भी किसी टैब पर क्लिक होगा: पुराना डेटा डंप होगा और सिर्फ उस टैब का डेटा आएगा
  const handleTabClick = (tier: ProfileTier) => {
    setActiveTab(tier);
    setSearchQuery("");
    if (machineId) {
      fetchOnlyActiveTier(tier, machineId);
    }
  };

  const togglePasswordVisibility = (id: string) => {
    setVisiblePasswords((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // Create (POST) या Partial Edit (PATCH)
  const handleSaveAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !appPassword || !senderName || !machineId) return;

    const savedSession = localStorage.getItem(SESSION_TOKEN_KEY) || "";

    if (editingId) {
      const res = await fetch("/api/smtp-vault", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          machineId,
          sessionToken: savedSession,
          accountId: editingId,
          updateType: "EDIT",
          updateData: {
            senderName,
            appPassword,
            profileTier: activeTab,
          },
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
          domain: window.location.hostname,
          accountData: {
            email,
            appPassword,
            senderName,
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
    setAppPassword(acc.appPassword);
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
      // अपग्रेड होने के बाद सिर्फ एक्टिव टियर को री-फेच करना
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

  // सिर्फ एक्टिव टियर के अंदर सर्च
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

        {/* 🔍 Search Bar (Only Active Tier) */}
        <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-2xl flex flex-col sm:flex-row items-center gap-3 shadow-lg">
          <div className="relative flex-1 w-full">
            <span className="absolute left-3.5 top-2.5 text-slate-500 text-xs">🔍</span>
            <input
              type="text"
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
        <form onSubmit={handleSaveAccount} className="bg-slate-900/90 border border-slate-800 p-5 rounded-3xl space-y-4 shadow-xl">
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
            <input
              type="email"
              required
              disabled={!!editingId}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Sender Gmail ID (e.g. outreach1@gmail.com)"
              className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-indigo-500 disabled:opacity-50"
            />
            <input
              type="text"
              required
              value={appPassword}
              onChange={(e) => setAppPassword(e.target.value)}
              placeholder="16-Digit App Password (xxxx xxxx xxxx xxxx)"
              className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-amber-300 font-mono outline-none focus:border-indigo-500"
            />
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
                const isPassVisible = !!visiblePasswords[acc._id];
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

                      <div className="flex items-center gap-2 bg-slate-900/80 px-2.5 py-1 rounded-lg border border-slate-800/80 w-fit">
                        <span className="text-[10px] text-slate-400 font-mono">Password:</span>
                        <span className="text-xs font-mono font-bold text-amber-300">
                          {isPassVisible ? acc.appPassword : "•••• •••• •••• ••••"}
                        </span>
                        <button
                          type="button"
                          onClick={() => togglePasswordVisibility(acc._id)}
                          className="text-slate-400 hover:text-white text-xs cursor-pointer ml-1"
                          title={isPassVisible ? "Hide Password" : "Show Password"}
                        >
                          {isPassVisible ? "🙈" : "👁️"}
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