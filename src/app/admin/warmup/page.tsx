// src/app/admin/warmup/page.tsx
"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";

const WARMUP_STATS_KEY = "inboxsend_admin_warmup_stats_v2";
const WARMUP_QUEUE_KEY = "inboxsend_admin_warmup_queue_v2";

interface AccountNode {
  email: string;
  appPassword: string;
  senderName: string;
}

interface LocalWarmupMetrics {
  isRunning: boolean;
  totalDispatched: number;
  totalFailed: number;
  totalRescued: number;
  totalInitialPool: number;
}

export default function AdminWarmupDashboard() {
  const [queue, setQueue] = useState<AccountNode[]>([]);
  const [metrics, setMetrics] = useState<LocalWarmupMetrics>({
    isRunning: false,
    totalDispatched: 0,
    totalFailed: 0,
    totalRescued: 0,
    totalInitialPool: 0,
  });

  const [logs, setLogs] = useState<string[]>([]);
  const isRunningRef = useRef(metrics.isRunning);
  const queueRef = useRef(queue);

  useEffect(() => {
    isRunningRef.current = metrics.isRunning;
  }, [metrics.isRunning]);

  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  // 1. लोड होते ही LocalStorage से डेटा उठाएँ या DB से 1 बार लाएँ
  useEffect(() => {
    const initData = async () => {
      if (typeof window === "undefined") return;

      const savedStats = localStorage.getItem(WARMUP_STATS_KEY);
      if (savedStats) {
        try {
          const parsed = JSON.parse(savedStats);
          setMetrics((prev) => ({
            ...prev,
            totalDispatched: Number(parsed.totalDispatched) || 0,
            totalFailed: Number(parsed.totalFailed) || 0,
            totalRescued: Number(parsed.totalRescued) || 0,
            totalInitialPool: Number(parsed.totalInitialPool) || 0,
          }));
        } catch (e) {}
      }

      const savedQueue = localStorage.getItem(WARMUP_QUEUE_KEY);
      if (savedQueue) {
        try {
          const parsedQ = JSON.parse(savedQueue);
          if (Array.isArray(parsedQ) && parsedQ.length > 0) {
            setQueue(parsedQ);
            return;
          }
        } catch (e) {}
      }

      // अगर LocalStorage में कतार नहीं है तो DB से सिर्फ 1 बार लाएँ
      try {
        const res = await fetch("/api/admin/warmup-worker");
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.pool) && data.pool.length > 0) {
            setQueue(data.pool);
            localStorage.setItem(WARMUP_QUEUE_KEY, JSON.stringify(data.pool));
            setMetrics((prev) => ({ ...prev, totalInitialPool: data.totalCount }));
          }
        }
      } catch (err) {
        console.error("Initial load error:", err);
      }
    };

    initData();
  }, []);

  const saveQueueState = (newQ: AccountNode[]) => {
    setQueue(newQ);
    if (typeof window !== "undefined") {
      localStorage.setItem(WARMUP_QUEUE_KEY, JSON.stringify(newQ));
    }
  };

  const updateMetricsState = (updater: (prev: LocalWarmupMetrics) => LocalWarmupMetrics) => {
    setMetrics((prev) => {
      const next = updater(prev);
      if (typeof window !== "undefined") {
        localStorage.setItem(
          WARMUP_STATS_KEY,
          JSON.stringify({
            totalDispatched: next.totalDispatched,
            totalFailed: next.totalFailed,
            totalRescued: next.totalRescued,
            totalInitialPool: next.totalInitialPool,
          })
        );
      }
      return next;
    });
  };

  // 3. 🎯 FIFO Queue Worker Loop (सुरक्षित JSON पार्सिंग + ऑटो-स्टॉप)
  useEffect(() => {
    if (!metrics.isRunning) return;

    const interval = setInterval(async () => {
      if (!isRunningRef.current) return;

      const currentQ = queueRef.current;

      // 🛑 कतार खत्म -> ऑटो-स्टॉप!
      if (currentQ.length === 0) {
        setMetrics((prev) => ({ ...prev, isRunning: false }));
        setLogs((prev) => [
          `[${new Date().toLocaleTimeString()}] 🏁 COMPLETE: All accounts dispatched and evicted from queue. Auto-Stopped.`,
          ...prev.slice(0, 40),
        ]);
        clearInterval(interval);
        return;
      }

      const sender = currentQ[0];
      // रैंडम रिसीवर चुनें (जो सेंडर खुद न हो)
      const otherAccounts = currentQ.filter((a) => a.email !== sender.email);
      const receiver = otherAccounts.length > 0 ? otherAccounts[Math.floor(Math.random() * otherAccounts.length)] : currentQ[0];

      try {
        const res = await fetch("/api/admin/warmup-worker", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sender, receiver }),
        });

        // सेफ़ चेक (ताकि Unexpected end of JSON कभी न आए)
        if (!res.ok) {
          const updatedQ = currentQ.slice(1);
          saveQueueState(updatedQ);
          updateMetricsState((prev) => ({ ...prev, totalFailed: prev.totalFailed + 1 }));
          setLogs((prev) => [
            `[${new Date().toLocaleTimeString()}] ❌ Failed [${sender.email}]: HTTP Status ${res.status}`,
            ...prev.slice(0, 40),
          ]);
          return;
        }

        const data = await res.json();

        // प्रोसेस होते ही कतार से बाहर (Shift)
        const updatedQ = currentQ.slice(1);
        saveQueueState(updatedQ);

        if (data.status === "EXECUTED" || data.success) {
          updateMetricsState((prev) => ({
            ...prev,
            totalDispatched: prev.totalDispatched + 1,
            totalRescued: prev.totalRescued + (Number(data.rescued) || 0),
          }));

          setLogs((prev) => [
            `[${new Date().toLocaleTimeString()}] [Remaining: ${updatedQ.length}] ${data.log || `✅ Sent ${sender.email} ➡️ ${receiver.email}`}`,
            ...prev.slice(0, 40),
          ]);
        } else {
          updateMetricsState((prev) => ({
            ...prev,
            totalFailed: prev.totalFailed + 1,
          }));

          setLogs((prev) => [
            `[${new Date().toLocaleTimeString()}] ❌ Drop [${sender.email}]: ${data.error || "Failed"}`,
            ...prev.slice(0, 40),
          ]);
        }
      } catch (err: any) {
        const updatedQ = currentQ.slice(1);
        saveQueueState(updatedQ);
        updateMetricsState((prev) => ({ ...prev, totalFailed: prev.totalFailed + 1 }));

        setLogs((prev) => [
          `[${new Date().toLocaleTimeString()}] ❌ Network Drop [${sender.email}]: ${err.message}`,
          ...prev.slice(0, 40),
        ]);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [metrics.isRunning]);

  // 4. Start / Stop बटन
  const toggleEngine = () => {
    if (!metrics.isRunning && queue.length === 0) {
      alert("Queue is empty! Click 'Reload DB Pool' to start fresh round.");
      return;
    }
    const nextState = !metrics.isRunning;
    setMetrics((prev) => ({ ...prev, isRunning: nextState }));
    setLogs((prev) => [
      `[${new Date().toLocaleTimeString()}] ⚙️ Engine ${nextState ? "🟢 STARTED (Processing Queue)" : "🔴 STOPPED"}`,
      ...prev.slice(0, 40),
    ]);
  };

  // 🔄 DB से ताज़ा पूल लोड करना
  const reloadFromDB = async () => {
    try {
      const res = await fetch("/api/admin/warmup-worker");
      const data = await res.json();
      if (Array.isArray(data.pool)) {
        saveQueueState(data.pool);
        updateMetricsState((prev) => ({ ...prev, totalInitialPool: data.totalCount }));
        setLogs((prev) => [
          `[${new Date().toLocaleTimeString()}] 🔄 Loaded ${data.totalCount} fresh nodes into Queue.`,
          ...prev.slice(0, 40),
        ]);
      }
    } catch (err: any) {
      alert("Failed to reload: " + err.message);
    }
  };

  // 5. रीसेट बटन
  const resetMetrics = () => {
    if (!confirm("Reset all warmup queue and counters in this browser?")) return;
    if (typeof window !== "undefined") {
      localStorage.removeItem(WARMUP_STATS_KEY);
      localStorage.removeItem(WARMUP_QUEUE_KEY);
    }
    setQueue([]);
    setMetrics({
      isRunning: false,
      totalDispatched: 0,
      totalFailed: 0,
      totalRescued: 0,
      totalInitialPool: 0,
    });
    setLogs([`[${new Date().toLocaleTimeString()}] 🧹 Storage Cleared.`]);
    reloadFromDB();
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8 font-sans">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* Top Header */}
        <div className="flex justify-between items-center bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-xl">
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <span className="text-indigo-400">🔥</span> Global Warm-Up Engine Controller
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">Stateless Queue Dispatches with Instant Eviction & Auto-Stop</p>
          </div>
          <Link
            href="/admin"
            className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 px-3.5 py-2 rounded-xl transition cursor-pointer"
          >
            ⬅ Back to Licenses
          </Link>
        </div>

        {/* Metrics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-slate-900/90 border border-slate-800 p-5 rounded-2xl shadow-md">
            <div className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">Queue Remaining</div>
            <div className="text-3xl font-black mt-2 font-mono text-amber-400">
              {queue.length}
            </div>
            <div className="text-[10px] text-slate-500 mt-2 font-mono">
              Total In Round: {metrics.totalInitialPool || queue.length}
            </div>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 p-5 rounded-2xl shadow-md">
            <div className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">Total Dispatched</div>
            <div className="text-3xl font-black text-indigo-400 mt-2 font-mono">
              {metrics.totalDispatched}
            </div>
            <div className="text-[10px] text-slate-500 mt-2 font-mono">Evicted from Queue</div>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 p-5 rounded-2xl shadow-md">
            <div className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">Spam Rescued</div>
            <div className="text-3xl font-black text-emerald-400 mt-2 font-mono">
              {metrics.totalRescued}
            </div>
            <div className="text-[10px] text-slate-500 mt-2 font-mono">2-Way IMAP Recovered</div>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 p-5 rounded-2xl shadow-md">
            <div className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">Engine Status</div>
            <div className="text-2xl font-black mt-2">
              {metrics.isRunning ? (
                <span className="text-emerald-400 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping"></span> Active
                </span>
              ) : queue.length === 0 && metrics.totalDispatched > 0 ? (
                <span className="text-sky-400">🏁 Completed</span>
              ) : (
                <span className="text-rose-400">🔴 Stopped</span>
              )}
            </div>
            <div className="text-[10px] text-slate-500 mt-2 font-mono">
              Failed: {metrics.totalFailed}
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="bg-slate-900/90 border border-slate-800 p-6 rounded-2xl shadow-xl flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-white">Execution Actions</h3>
            <p className="text-xs text-slate-400">Picks from LocalStorage Queue, dispatches, evicts, and halts at 0.</p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={toggleEngine}
              disabled={queue.length === 0 && !metrics.isRunning}
              className={`px-6 py-2.5 rounded-xl text-xs font-bold transition shadow-lg cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                metrics.isRunning
                  ? "bg-rose-600 hover:bg-rose-500 text-white"
                  : "bg-emerald-600 hover:bg-emerald-500 text-white"
              }`}
            >
              {metrics.isRunning ? "🛑 Stop Engine" : "🚀 Start Engine"}
            </button>

            <button
              onClick={reloadFromDB}
              className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-indigo-300 border border-indigo-500/30 rounded-xl text-xs font-semibold transition cursor-pointer"
            >
              🔄 Reload DB Pool
            </button>

            <button
              onClick={resetMetrics}
              className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-rose-300 border border-rose-500/30 rounded-xl text-xs font-semibold transition cursor-pointer"
            >
              🧹 Reset All
            </button>
          </div>
        </div>

        {/* Live Logs */}
        <div className="bg-slate-900/90 border border-slate-800 p-5 rounded-2xl shadow-xl space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Live Logs</span>
            <button
              onClick={() => setLogs([])}
              className="text-[10px] text-slate-500 hover:text-slate-300 cursor-pointer"
            >
              Clear Logs
            </button>
          </div>

          <div className="bg-slate-950 p-4 rounded-xl font-mono text-xs text-slate-300 space-y-1 max-h-64 overflow-y-auto border border-slate-800/80">
            {logs.length === 0 ? (
              <div className="text-slate-600 text-center py-4">Queue ready ({queue.length} nodes). Click "Start Engine"...</div>
            ) : (
              logs.map((log, i) => (
                <div key={i} className="leading-relaxed border-b border-slate-900/60 pb-1">
                  {log}
                </div>
              ))
            )}
          </div>
        </div>

      </div>
    </main>
  );
}