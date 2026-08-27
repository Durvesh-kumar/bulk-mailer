// src/app/admin/warmup/page.tsx
"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const STORAGE_KEY = "admin_warmup_monitor";

export default function AdminWarmupControl() {
  const router = useRouter();
  const [isAdminAuthorized, setIsAdminAuthorized] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  const [isRunning, setIsRunning] = useState(false);
  const [batchSpeed, setBatchSpeed] = useState(3);
  const [stats, setStats] = useState({
    totalProcessed: 0,
    totalFailed: 0,
    totalSpamRescued: 0,
  });
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [isProcessingBatch, setIsProcessingBatch] = useState(false);

  // 🛡️ 1. एडमिन सेशन सिक्योरिटी गार्ड (ब्राउज़र/टैब बंद होने या डायरेक्ट URL पर ब्लॉक)
  useEffect(() => {
    const sessionKey = typeof window !== "undefined" ? sessionStorage.getItem("admin_session_key") : null;

    if (!sessionKey || !sessionKey.trim()) {
      router.replace("/admin");
    } else {
      setIsAdminAuthorized(true);
      setCheckingAuth(false);
    }
  }, [router]);

  // 📦 2. लोकल स्टोरेज लोड
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        setStats(JSON.parse(saved));
      } catch (e) {
        console.error("Storage parse error", e);
      }
    }
    setLoading(false);
  }, []);

  // 💾 3. स्टैट्स सेव
  useEffect(() => {
    if (!loading) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
    }
  }, [stats, loading]);

  // 🔄 4. कंट्रोलर स्टेटस सिंक
  useEffect(() => {
    if (!isAdminAuthorized) return;

    const syncStatus = async () => {
      try {
        const res = await fetch("/api/admin/warmup-control");
        const data = await res.json();
        setIsRunning(data.isRunning);
        setBatchSpeed(data.batchPerMinute || 3);
      } catch (err) {
        console.error("Sync error:", err);
      }
    };
    syncStatus();
    const interval = setInterval(syncStatus, 5000);
    return () => clearInterval(interval);
  }, [isAdminAuthorized]);

  const toggleEngine = async (nextState: boolean) => {
    setUpdating(true);
    try {
      const res = await fetch("/api/admin/warmup-control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isRunning: nextState, batchPerMinute: batchSpeed }),
      });
      const data = await res.json();
      setIsRunning(data.isRunning);
    } finally {
      setUpdating(false);
    }
  };

  const handleSpeedChange = async (speed: number) => {
    setBatchSpeed(speed);
    await fetch("/api/admin/warmup-control", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isRunning, batchPerMinute: speed }),
    });
  };

  const handleTriggerCycleNow = async () => {
    setIsProcessingBatch(true);
    try {
      const res = await fetch("/api/admin/warmup-worker");
      const data = await res.json();
      if (data.status === "EXECUTED") {
        setStats((prev) => ({
          ...prev,
          totalProcessed: prev.totalProcessed + (data.dispatched || 0),
          totalFailed: prev.totalFailed + (data.failed || 0),
          totalSpamRescued: prev.totalSpamRescued + (data.rescuedFromSpam || 0),
        }));
        alert(`✅ Cycle Complete: ${data.dispatched} processed, ${data.rescuedFromSpam || 0} rescued from spam!`);
      } else {
        alert(`Engine Status: ${data.status || data.message || "Execution done"}`);
      }
    } catch (err: any) {
      alert("❌ Cycle Error: " + err.message);
    } finally {
      setIsProcessingBatch(false);
    }
  };

  const resetLocalCounters = () => {
    if (confirm("Reset local monitoring counts?")) {
      const empty = { totalProcessed: 0, totalFailed: 0, totalSpamRescued: 0 };
      setStats(empty);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(empty));
    }
  };

  const handleLogout = () => {
    if (typeof window !== "undefined") {
      sessionStorage.removeItem("admin_session_key");
      sessionStorage.clear();
    }
    router.replace("/admin");
  };

  if (checkingAuth || !isAdminAuthorized || loading) {
    return (
      <div className="min-h-screen bg-[#090d16] flex flex-col items-center justify-center text-slate-400 font-mono text-xs gap-3">
        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
        <span>Verifying Security Gateway...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 p-4 md:p-8 font-sans selection:bg-indigo-500">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* 🔗 Top Navigation Bar */}
        <div className="flex justify-between items-center bg-[#111728] border border-slate-800/80 px-5 py-3.5 rounded-2xl shadow-xl">
          <div className="flex items-center gap-2">
            <span className="text-indigo-400 font-bold text-sm">⚡</span>
            <span className="text-xs font-bold text-white font-mono uppercase tracking-wider">Admin Security Zone</span>
          </div>

          <div className="flex items-center gap-2.5">
            {/* 🎯 एडमिन हब पर वापस जाने का बटन */}
            <Link
              href="/admin"
              className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-3.5 py-1.5 rounded-xl transition font-semibold flex items-center gap-1.5 shadow-sm cursor-pointer"
            >
              <span>←</span> Back to Admin Hub
            </Link>

            <button
              type="button"
              onClick={handleLogout}
              className="text-xs text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 px-3 py-1.5 rounded-xl transition cursor-pointer"
            >
              Logout
            </button>
          </div>
        </div>
        
        {/* Header Bar */}
        <div className="bg-[#111728] border border-slate-800 p-6 rounded-3xl shadow-xl flex flex-col md:flex-row justify-between items-center gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className={`w-3 h-3 rounded-full ${isRunning ? "bg-emerald-400 animate-pulse" : "bg-rose-500"}`} />
              <h1 className="text-xl font-bold text-white">Admin Cron Master: P2P Warmup</h1>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Manual & Cron controlled. Pure button-driven execution with 26-hr Spam Rescue.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 bg-[#0c1017] p-2.5 rounded-2xl border border-slate-800">
            <div className="flex items-center gap-1.5 px-2">
              <span className="text-[11px] text-slate-400 font-bold">Batch Size:</span>
              <input
                type="number"
                min={1}
                max={20}
                value={batchSpeed}
                onChange={(e) => handleSpeedChange(Number(e.target.value))}
                className="w-14 bg-[#111728] border border-slate-700 rounded-lg px-2 py-1 text-xs font-bold text-indigo-400 text-center outline-none"
              />
            </div>

            {/* ⚡ 1-टाइम मैन्युअल ट्रिगर बटन */}
            <button
              onClick={handleTriggerCycleNow}
              disabled={isProcessingBatch}
              className="px-4 py-2.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition-all cursor-pointer disabled:opacity-50 shadow-md"
            >
              {isProcessingBatch ? "Processing..." : "▶️ Run Cycle Now"}
            </button>

            {/* 🚀 ऑटो-पायलट लूप इंजन बटन */}
            <button
              onClick={() => toggleEngine(!isRunning)}
              disabled={updating}
              className={`px-5 py-2.5 rounded-xl text-xs font-black transition-all shadow-lg cursor-pointer ${
                isRunning
                  ? "bg-rose-600 hover:bg-rose-500 text-white shadow-rose-900/50"
                  : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/50"
              }`}
            >
              {updating ? "Syncing..." : isRunning ? "🛑 STOP ENGINE" : "🚀 START ENGINE"}
            </button>
          </div>
        </div>

        {/* Local Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-[#111827] border border-indigo-500/20 p-5 rounded-2xl shadow">
            <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider block">Total Dispatched</span>
            <div className="text-3xl font-black text-white mt-1">{stats.totalProcessed}</div>
            <span className="text-[10px] text-slate-500 mt-1 block">Live inbox hits</span>
          </div>

          <div className="bg-[#111827] border border-rose-500/20 p-5 rounded-2xl shadow">
            <span className="text-[10px] font-bold text-rose-400 uppercase tracking-wider block">Failed Packets</span>
            <div className="text-3xl font-black text-rose-400 mt-1">{stats.totalFailed}</div>
            <span className="text-[10px] text-slate-500 mt-1 block">SMTP / Auth drops</span>
          </div>

          <div className="bg-[#111827] border border-emerald-500/20 p-5 rounded-2xl shadow">
            <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block">Spam Rescued</span>
            <div className="text-3xl font-black text-emerald-400 mt-1">{stats.totalSpamRescued}</div>
            <span className="text-[10px] text-slate-500 mt-1 block">Moved to Inbox & Starred</span>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-[#0c1017] border border-slate-800 rounded-2xl text-xs font-mono text-slate-400 flex justify-between items-center shadow-md">
          <span>Engine State: <strong className={isRunning ? "text-emerald-400" : "text-rose-400"}>{isRunning ? "ACTIVE" : "PAUSED"}</strong></span>
          <button
            onClick={resetLocalCounters}
            className="text-rose-400 hover:text-rose-300 underline cursor-pointer"
          >
            Reset Metrics 🗑️
          </button>
        </div>

      </div>
    </div>
  );
}