// src/app/warmup/page.tsx
"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useLicenseGuard } from "@/hook/useLicenseGuard";
import { useWarmupQueue, AccountNode } from "@/hook/useWarmupQueue";
import SuspendedScreen from "@/components/SuspendedScreen";
import { InputField } from "@/components/ui/InputField";

export default function DiagnosticsDatabaseQueueDashboard() {
  const { loadingLicense, isSuspended, userType, expiryDate, machineId, appDomain } = useLicenseGuard();
  
  const {
    allVaultAccounts,
    allReceivers,
    isLoading,
    isRunning,
    setIsRunning,
    logs,
    stats,
    intervalSeconds,
    setIntervalSeconds,
  } = useWarmupQueue(machineId);

  const [searchSender, setSearchSender] = useState<string>("");
  const [searchReceiver, setSearchReceiver] = useState<string>("");

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

  const filteredSenders = allVaultAccounts.filter((a: AccountNode) => {
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
              <span className={`w-3 h-3 rounded-full ${isRunning ? "bg-emerald-400 animate-pulse" : "bg-amber-400"}`}></span>
              <h1 className="text-lg md:text-xl font-bold text-white tracking-wide flex items-center gap-2">
                <span>⚡</span> Silent Warm-Up Diagnostics & P2P Queue
              </h1>
            </div>
            <p className="text-xs text-gray-400 font-mono">
              Hardware Binding: <span className="text-indigo-400">{machineId || "Authenticating..."}</span>
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-xl text-xs font-bold transition"
            >
              ← Dashboard
            </Link>

            <button
              type="button"
              onClick={() => setIsRunning(!isRunning)}
              disabled={isLoading || allVaultAccounts.length === 0 || allReceivers.length === 0}
              className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all shadow-lg flex items-center gap-2 cursor-pointer ${
                isRunning 
                  ? "bg-rose-600 hover:bg-rose-700 text-white shadow-rose-950/50" 
                  : (allVaultAccounts.length === 0 || allReceivers.length === 0)
                  ? "bg-gray-800 text-gray-500 cursor-not-allowed border border-gray-700"
                  : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950/50"
              }`}
            >
              {isRunning ? "⏸️ Pause Warm-Up Queue" : "🚀 Start Silent Warm-Up"}
            </button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-[#111827] border border-gray-800 p-4 rounded-2xl shadow">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Local Senders</span>
            <div className="text-2xl font-black text-indigo-400 mt-1">{allVaultAccounts.length}</div>
            <span className="text-[10px] text-gray-500">My Vault Outbound Nodes</span>
          </div>

          <div className="bg-[#111827] border border-gray-800 p-4 rounded-2xl shadow">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Peer Receivers</span>
            <div className="text-2xl font-black text-emerald-400 mt-1">{allReceivers.length}</div>
            <span className="text-[10px] text-gray-500">Global Network Inboxes</span>
          </div>

          <div className="bg-[#111827] border border-gray-800 p-4 rounded-2xl shadow">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Dispatched Packets</span>
            <div className="text-2xl font-black text-white mt-1">{stats.totalProcessed}</div>
            <span className="text-[10px] text-gray-500">Warm-up handshakes done</span>
          </div>

          <div className="bg-[#111827] border border-gray-800 p-4 rounded-2xl shadow">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Spam Rescued</span>
            <div className="text-2xl font-black text-amber-300 mt-1">{stats.rescuedCount}</div>
            <span className="text-[10px] text-gray-500">Auto-restored to Inbox</span>
          </div>
        </div>

        {/* Cadence Input */}
        <div className="bg-[#111728] border border-gray-800 p-4 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-xs text-gray-300">
            <span className="font-bold text-indigo-400">⏱️ Dispatch Cadence:</span> Set the wait duration between consecutive peer handshakes.
          </div>
          <div className="w-full sm:w-48">
            <InputField
              type="number"
              min={5}
              max={300}
              disabled={isRunning}
              value={intervalSeconds}
              onChange={(e) => setIntervalSeconds(Number(e.target.value) || 15)}
              placeholder="Seconds (e.g. 15)"
              className="text-center font-bold text-indigo-300"
            />
          </div>
        </div>

        {/* Lists Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Senders Pool */}
          <div className="bg-[#111827] border border-gray-800 rounded-3xl p-5 shadow-xl space-y-3">
            <div className="flex justify-between items-center border-b border-gray-800 pb-3">
              <div>
                <h2 className="text-sm font-bold text-indigo-400">My Senders Pool</h2>
                <p className="text-[11px] text-gray-500">Active outbound accounts in this machine</p>
              </div>
              <span className="text-xs font-mono bg-indigo-950/80 text-indigo-300 px-2.5 py-1 rounded-xl border border-indigo-800/60">
                {filteredSenders.length} Loaded
              </span>
            </div>

            <InputField
              type="text"
              value={searchSender}
              onChange={(e) => setSearchSender(e.target.value)}
              placeholder="🔍 Filter senders by email/name..."
            />

            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {isLoading ? (
                <div className="text-xs text-gray-500 italic p-4 text-center">Loading accounts from database...</div>
              ) : filteredSenders.length === 0 ? (
                <div className="text-xs text-gray-500 italic p-4 text-center">No sender accounts registered in Vault.</div>
              ) : (
                filteredSenders.map((s, idx) => {
                  const isCurrent = isRunning && allVaultAccounts.length > 0 && stats.currentSenderIndex % allVaultAccounts.length === idx;
                  return (
                    <div
                      key={s._id || `sender-${idx}`}
                      className={`p-3 rounded-xl border text-xs flex justify-between items-center transition ${
                        isCurrent
                          ? "bg-indigo-950/70 border-indigo-500 text-white shadow-lg"
                          : "bg-[#0c1017] border-gray-800/90 text-gray-300"
                      }`}
                    >
                      <div>
                        <div className="font-semibold flex items-center gap-1.5">
                          <span className="text-[10px] text-gray-500">#{idx + 1}</span>
                          <span>{s.senderName || "Sender Node"}</span>
                          {isCurrent && <span className="text-[9px] bg-indigo-600 text-white px-1.5 py-0.5 rounded-md">FIRING</span>}
                        </div>
                        <div className="text-[11px] text-gray-400 font-mono mt-0.5">{s.email}</div>
                      </div>
                      <span className="text-[10px] bg-gray-900 px-2 py-0.5 rounded-md text-gray-400 border border-gray-800">
                        {s.profileTier || "Tier"}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Receivers Pool */}
          <div className="bg-[#111827] border border-gray-800 rounded-3xl p-5 shadow-xl space-y-3">
            <div className="flex justify-between items-center border-b border-gray-800 pb-3">
              <div>
                <h2 className="text-sm font-bold text-emerald-400">Network Receivers Pool</h2>
                <p className="text-[11px] text-gray-500">Global peer inboxes for handshake & auto-rescue</p>
              </div>
              <span className="text-xs font-mono bg-emerald-950/80 text-emerald-300 px-2.5 py-1 rounded-xl border border-emerald-800/60">
                {filteredReceivers.length} Available
              </span>
            </div>

            <InputField
              type="text"
              value={searchReceiver}
              onChange={(e) => setSearchReceiver(e.target.value)}
              placeholder="🔍 Filter peer receivers..."
            />

            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {isLoading ? (
                <div className="text-xs text-gray-500 italic p-4 text-center">Loading network peer inboxes...</div>
              ) : filteredReceivers.length === 0 ? (
                <div className="text-xs text-gray-500 italic p-4 text-center">No peer receivers available in network.</div>
              ) : (
                filteredReceivers.map((r, idx) => (
                  <div
                    key={r._id || `recv-${idx}`}
                    className="p-3 rounded-xl border text-xs flex justify-between items-center bg-[#0c1017] border-gray-800/90 text-gray-300"
                  >
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
              Live P2P Handshake Execution Stream
            </span>
            <span className="text-[11px] text-gray-500 font-mono">{intervalSeconds}s Interval</span>
          </div>

          <div className="h-44 overflow-y-auto space-y-2 pr-2 font-mono text-xs text-gray-300">
            {logs.length === 0 ? (
              <div className="text-gray-600 italic py-8 text-center">
                Queue standing by. Click 'Start Silent Warm-Up' to execute peer handshakes.
              </div>
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