// src/app/warmup/page.tsx
"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useLicenseGuard } from "@/hook/useLicenseGuard";
import { useWarmupQueue, AccountNode } from "@/hook/useWarmupQueue";
import { ProfileTier, TIER_ORDER, TIER_META } from "@/types/vault";
import SuspendedScreen from "@/components/SuspendedScreen";
import { InputField } from "@/components/ui/InputField";

function formatCooldownTime(ms: number): string {
  if (ms <= 0) return "Ready now";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours}h ${minutes}m ${seconds}s`;
}

export default function DiagnosticsDatabaseQueueDashboard() {
  const { loadingLicense, isSuspended, userType, expiryDate, machineId, appDomain } = useLicenseGuard();
  
  const {
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
  } = useWarmupQueue(machineId);

  const [searchSender, setSearchSender] = useState<string>("");
  const [searchReceiver, setSearchReceiver] = useState<string>("");
  const [timeLeftMs, setTimeLeftMs] = useState<number>(nearestCooldownMs);

  useEffect(() => { setTimeLeftMs(nearestCooldownMs); }, [nearestCooldownMs]);

  useEffect(() => {
    if (timeLeftMs <= 0) return;
    const interval = setInterval(() => {
      setTimeLeftMs((prev) => Math.max(0, prev - 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [timeLeftMs]);

  const logContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

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

  const isAllCoolingDown = readySenders.length === 0 && tierAccounts.length > 0;
  const displaySenders = tierAccounts.filter((a: AccountNode) => {
    const q = searchSender.toLowerCase().trim();
    return !q || a.email.toLowerCase().includes(q) || (a.senderName && a.senderName.toLowerCase().includes(q));
  });

  const filteredReceivers = allReceivers.filter((a: AccountNode) => {
    const q = searchReceiver.toLowerCase().trim();
    return !q || a.email.toLowerCase().includes(q) || (a.senderName && a.senderName.toLowerCase().includes(q));
  });

  return (
    <div className="min-h-screen bg-[#090d16] text-gray-100 p-4 md:p-8 font-sans selection:bg-indigo-500 selection:text-white">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-[#111728] border border-gray-800 p-5 rounded-3xl shadow-xl gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className={`w-3 h-3 rounded-full ${isRunning ? "bg-emerald-400 animate-pulse" : isAllCoolingDown ? "bg-amber-400" : "bg-slate-400"}`}></span>
              <h1 className="text-lg md:text-xl font-bold text-white tracking-wide flex items-center gap-2">
                <span>⚡</span> Silent Warm-Up Diagnostics [{currentMeta.label}]
              </h1>
            </div>
            <p className="text-xs text-gray-400 font-mono">
              Hardware Binding: <span className="text-indigo-400">{machineId || "Authenticating..."}</span>
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link href="/" className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-xl text-xs font-bold transition">
              ← Dashboard
            </Link>

            <button
              type="button"
              onClick={() => setIsRunning(!isRunning)}
              disabled={isLoading || isAllCoolingDown || readySenders.length === 0 || allReceivers.length === 0}
              className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all shadow-lg flex items-center gap-2 cursor-pointer ${
                isRunning 
                  ? "bg-rose-600 hover:bg-rose-700 text-white shadow-rose-950/50" 
                  : isAllCoolingDown
                  ? "bg-amber-950/60 border border-amber-800/80 text-amber-300 cursor-not-allowed"
                  : readySenders.length === 0 || allReceivers.length === 0
                  ? "bg-gray-800 text-gray-500 cursor-not-allowed border border-gray-700"
                  : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950/50"
              }`}
            >
              {isRunning ? "⏸️ Pause Warm-Up" : isAllCoolingDown ? "⏳ 24h Cooldown Active" : `🚀 Start Warm-Up (${readySenders.length} Ready)`}
            </button>
          </div>
        </div>

        {/* Cooldown Banner */}
        {isAllCoolingDown && (
          <div className="bg-amber-950/40 border border-amber-700/60 p-4 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg">
            <div className="flex items-center gap-3">
              <span className="text-2xl">⏳</span>
              <div>
                <h3 className="text-xs font-bold text-amber-300 uppercase tracking-wide">
                  24-Hour Cooldown Protection Active [{currentMeta.label}]
                </h3>
                <p className="text-[11px] text-amber-200/70 mt-0.5">Successful accounts are resting to protect sender reputation.</p>
              </div>
            </div>
            <div className="bg-[#111728] border border-amber-600/50 px-3.5 py-1.5 rounded-xl text-center">
              <span className="text-[10px] text-gray-400 block font-bold">NEXT UNLOCK IN</span>
              <span className="text-xs font-mono font-black text-amber-400">{formatCooldownTime(timeLeftMs)}</span>
            </div>
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-[#111827] border border-gray-800 p-4 rounded-2xl shadow">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Ready Senders</span>
            <div className="text-2xl font-black text-emerald-400 mt-1">{readySenders.length} <span className="text-xs text-gray-500 font-normal">/ {tierAccounts.length}</span></div>
            <span className="text-[10px] text-gray-500">{coolingSenders.length} in 24h cooldown</span>
          </div>
          <div className="bg-[#111827] border border-gray-800 p-4 rounded-2xl shadow">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Peer Receivers</span>
            <div className="text-2xl font-black text-indigo-400 mt-1">{allReceivers.length}</div>
            <span className="text-[10px] text-gray-500">Global Network Inboxes</span>
          </div>
          <div className="bg-[#111827] border border-gray-800 p-4 rounded-2xl shadow">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Dispatched Packets</span>
            <div className="text-2xl font-black text-white mt-1">{stats.totalProcessed}</div>
            <span className="text-[10px] text-gray-500">Unique handshakes executed</span>
          </div>
          <div className="bg-[#111827] border border-gray-800 p-4 rounded-2xl shadow">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Spam Rescued</span>
            <div className="text-2xl font-black text-amber-300 mt-1">{stats.rescuedCount}</div>
            <span className="text-[10px] text-gray-500">Auto-restored to Inbox</span>
          </div>
        </div>

        {/* 🎯 Controls Bar with Clean Grid Layout */}
        <div className="bg-[#111728] border border-gray-800 p-5 rounded-3xl space-y-4 shadow-xl">
          
          {/* Header & Label */}
          <div className="flex items-center justify-between border-b border-gray-800/80 pb-3">
            <span className="text-xs font-bold text-amber-400 uppercase tracking-wide flex items-center gap-2">
              <span>🎯</span> Select Warm-Up Profile Tier:
            </span>
            <span className="text-[11px] font-mono text-indigo-300 bg-indigo-950/80 px-3 py-1 rounded-xl border border-indigo-800">
              Active: {currentMeta.label}
            </span>
          </div>

          {/* Profile Tier Selection Buttons (बिल्कुल सीध में एक जैसे साफ़ बटन) */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {TIER_ORDER.map((tierKey) => {
              const meta = TIER_META[tierKey];
              const isSelected = selectedTier === tierKey;

              return (
                <button
                  key={tierKey}
                  type="button"
                  disabled={isRunning}
                  onClick={() => setSelectedTier(tierKey as ProfileTier)}
                  className={`p-3 rounded-2xl text-xs font-bold transition-all flex flex-col items-center justify-center gap-1 cursor-pointer border ${
                    isSelected
                      ? "bg-indigo-600 text-white border-indigo-400 shadow-lg shadow-indigo-950/60 scale-[1.02]"
                      : "bg-[#0c1017] hover:bg-slate-800/80 text-gray-300 border-gray-800/80"
                  }`}
                >
                  <span className="text-base">{meta.badge.split(" ")[0]}</span>
                  <span className="truncate max-w-full text-xs">{meta.label}</span>
                </button>
              );
            })}
          </div>

          {/* Bottom Row: Delay & Lot Size Controls */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-gray-800/80">
            <div className="bg-[#0c1017] p-3.5 rounded-2xl border border-gray-800 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-indigo-400 block">⏱️ Delay Cadence</span>
                <span className="text-[10px] text-gray-400">Seconds between handshakes</span>
              </div>
              <div className="w-24">
                <input
                  type="number"
                  min={5}
                  max={300}
                  disabled={isRunning}
                  value={intervalSeconds}
                  onChange={(e) => setIntervalSeconds(Math.max(5, Number(e.target.value) || 5))}
                  className="w-full bg-[#111728] border border-gray-700 rounded-xl px-2.5 py-1.5 text-xs text-center font-bold text-indigo-300 outline-none"
                />
              </div>
            </div>

            <div className="bg-[#0c1017] p-3.5 rounded-2xl border border-gray-800 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-emerald-400 block">🎯 Quota Lot Size</span>
                <span className="text-[10px] text-gray-400">Max limit: <strong className="text-amber-400">{currentConfig.maxLot}</strong></span>
              </div>
              <div className="w-24">
                <input
                  type="number"
                  min={1}
                  max={currentConfig.maxLot}
                  disabled={isRunning}
                  value={lotSizePerAccount}
                  onChange={(e) => {
                    const val = Number(e.target.value) || 1;
                    const clamped = Math.min(Math.max(1, val), currentConfig.maxLot);
                    setLotSizePerAccount(clamped);
                  }}
                  className="w-full bg-[#111728] border border-gray-700 rounded-xl px-2.5 py-1.5 text-xs text-center font-bold text-emerald-400 outline-none"
                />
              </div>
            </div>
          </div>

        </div>

        {/* Lists & Terminal */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-[#111827] border border-gray-800 rounded-3xl p-5 shadow-xl space-y-3">
            <div className="flex justify-between items-center border-b border-gray-800 pb-3">
              <div>
                <h2 className="text-sm font-bold text-indigo-400">{currentMeta.label} Senders Pool</h2>
                <p className="text-[11px] text-gray-500">{readySenders.length} ready, {coolingSenders.length} in cooldown</p>
              </div>
              <span className="text-xs font-mono bg-indigo-950/80 text-indigo-300 px-2.5 py-1 rounded-xl border border-indigo-800/60">
                {displaySenders.length} Accounts
              </span>
            </div>

            <InputField type="text" value={searchSender} onChange={(e) => setSearchSender(e.target.value)} placeholder="🔍 Filter senders..." />

            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {isLoading ? (
                <div className="text-xs text-gray-500 italic p-4 text-center">Loading accounts...</div>
              ) : displaySenders.length === 0 ? (
                <div className="text-xs text-gray-500 italic p-4 text-center">No accounts found for profile [{currentMeta.label}].</div>
              ) : (
                displaySenders.map((s, idx) => {
                  const isCurrent = isRunning && activeSenderEmail === s.email.toLowerCase().trim();
                  const isCooling = coolingSenders.some(c => c.account.email === s.email);

                  return (
                    <div key={s._id || `sender-${idx}`} className={`p-3 rounded-xl border text-xs flex justify-between items-center transition ${isCurrent ? "bg-indigo-950/70 border-indigo-500 text-white shadow-lg" : isCooling ? "bg-[#0a0d13]/60 border-gray-900 text-gray-500 opacity-60" : "bg-[#0c1017] border-gray-800/90 text-gray-300"}`}>
                      <div>
                        <div className="font-semibold flex items-center gap-1.5">
                          <span className="text-[10px] text-gray-500">#{idx + 1}</span>
                          <span>{s.senderName || "Sender Node"}</span>
                          {isCurrent && <span className="text-[9px] bg-indigo-600 text-white px-1.5 py-0.5 rounded-md">FIRING</span>}
                        </div>
                        <div className="text-[11px] text-gray-400 font-mono mt-0.5">{s.email}</div>
                      </div>
                      <div>
                        {isCooling ? (
                          <span className="text-[10px] bg-amber-950/50 text-amber-400 border border-amber-800/50 px-2 py-0.5 rounded-md">⏳ Cooldown</span>
                        ) : (
                          <span className="text-[10px] bg-emerald-950/50 text-emerald-300 border border-emerald-800/50 px-2 py-0.5 rounded-md">✅ Ready</span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="bg-[#111827] border border-gray-800 rounded-3xl p-5 shadow-xl space-y-3">
            <div className="flex justify-between items-center border-b border-gray-800 pb-3">
              <div>
                <h2 className="text-sm font-bold text-emerald-400">Network Receivers Pool</h2>
                <p className="text-[11px] text-gray-500">Peer inboxes</p>
              </div>
              <span className="text-xs font-mono bg-emerald-950/80 text-emerald-300 px-2.5 py-1 rounded-xl border border-emerald-800/60">
                {filteredReceivers.length} Available
              </span>
            </div>

            <InputField type="text" value={searchReceiver} onChange={(e) => setSearchReceiver(e.target.value)} placeholder="🔍 Filter receivers..." />

            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {isLoading ? (
                <div className="text-xs text-gray-500 italic p-4 text-center">Loading receivers...</div>
              ) : filteredReceivers.length === 0 ? (
                <div className="text-xs text-gray-500 italic p-4 text-center">No peer receivers available.</div>
              ) : (
                filteredReceivers.map((r, idx) => (
                  <div key={r._id || `recv-${idx}`} className="p-3 rounded-xl border text-xs flex justify-between items-center bg-[#0c1017] border-gray-800/90 text-gray-300">
                    <div>
                      <div className="font-semibold flex items-center gap-1.5">
                        <span className="text-[10px] text-gray-500">#{idx + 1}</span>
                        <span>{r.senderName || "Peer Receiver"}</span>
                      </div>
                      <div className="text-[11px] text-gray-400 font-mono mt-0.5">{r.email}</div>
                    </div>
                    <span className="text-[10px] text-emerald-400/80 bg-emerald-950/40 border border-emerald-800/40 px-2 py-0.5 rounded-md">
                      {r.isExternalPeer ? "🌐 Global Peer" : "🏢 Local Peer"}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Terminal Logs */}
        <div className="bg-[#090d16] border border-gray-800 rounded-3xl p-5 shadow-2xl">
          <div className="flex justify-between items-center text-gray-400 border-b border-gray-800/60 pb-3 mb-3 text-xs">
            <span className="font-semibold flex items-center gap-2 text-white">
              <span className={`w-2 h-2 rounded-full ${isRunning ? "bg-indigo-400 animate-ping" : "bg-gray-600"}`}></span>
              Live P2P Handshake Execution Stream [{currentMeta.label}]
            </span>
            <span className="text-[11px] text-gray-500 font-mono">{intervalSeconds}s Interval | Lot: {lotSizePerAccount}/{currentConfig.maxLot}</span>
          </div>

          <div ref={logContainerRef} className="h-44 overflow-y-auto space-y-2 pr-2 font-mono text-xs text-gray-300 scroll-smooth">
            {logs.length === 0 ? (
              <div className="text-gray-600 italic py-8 text-center">Queue standing by. Click a profile tier button above and click 'Start Warm-Up'.</div>
            ) : (
              logs.map((log, index) => (
                <div key={index} className="border-b border-gray-900/60 pb-1 flex items-start gap-2">
                  <span>{log}</span>
                </div>
              ))
            )}
          </div>
        </div>

      </div>
    </div>
  );
}