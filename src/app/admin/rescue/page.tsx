// src/app/admin/rescue/page.tsx
"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";

const RESCUE_STATS_KEY = "inboxsend_rescue_sentinel_stats_v4";
const RESCUE_QUEUE_KEY = "inboxsend_rescue_sentinel_queue_v4";

interface AccountNode {
  email: string;
  appPassword: string;
  senderName: string;
}

interface LocalRescueMetrics {
  isRunning: boolean;
  totalScanned: number;
  totalRescued: number;
  totalReplied: number;
  totalFailed: number;
  totalInitialPool: number;
}

export default function AdminRescueSentinelDashboard() {
  const [adminKey, setAdminKey] = useState("");
  const [isAuth, setIsAuth] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");

  const [queue, setQueue] = useState<AccountNode[]>([]);
  const [metrics, setMetrics] = useState<LocalRescueMetrics>({
    isRunning: false,
    totalScanned: 0,
    totalRescued: 0,
    totalReplied: 0,
    totalFailed: 0,
    totalInitialPool: 0,
  });

  const [logs, setLogs] = useState<string[]>([]);
  const isRunningRef = useRef(metrics.isRunning);
  const queueRef = useRef(queue);
  const adminKeyRef = useRef(adminKey);

  useEffect(() => {
    isRunningRef.current = metrics.isRunning;
  }, [metrics.isRunning]);

  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  useEffect(() => {
    adminKeyRef.current = adminKey;
  }, [adminKey]);

  // 🛡️ 1. चेक करें कि एक्टिव एडमिन सेशन व स्टैट्स मौजूद हैं या नहीं
  useEffect(() => {
    if (typeof window !== "undefined") {
      const activeSessionKey = sessionStorage.getItem("admin_session_key");
      const savedStats = localStorage.getItem(RESCUE_STATS_KEY);

      if (savedStats) {
        try {
          const parsedStats = JSON.parse(savedStats);
          setMetrics((prev) => ({
            ...prev,
            totalScanned: Number(parsedStats.totalScanned) || 0,
            totalRescued: Number(parsedStats.totalRescued) || 0,
            totalReplied: Number(parsedStats.totalReplied) || 0,
            totalFailed: Number(parsedStats.totalFailed) || 0,
            totalInitialPool: Number(parsedStats.totalInitialPool) || 0,
          }));
        } catch (_) {}
      }

      if (activeSessionKey && activeSessionKey.trim().length > 0) {
        setAdminKey(activeSessionKey);
        verifyAndFetchPool(activeSessionKey);
      }
    }
  }, []);

  const saveQueueState = (newQ: AccountNode[]) => {
    setQueue(newQ);
    if (typeof window !== "undefined") {
      localStorage.setItem(RESCUE_QUEUE_KEY, JSON.stringify(newQ));
    }
  };

  const updateMetricsState = (updater: (prev: LocalRescueMetrics) => LocalRescueMetrics) => {
    setMetrics((prev) => {
      const next = updater(prev);
      if (typeof window !== "undefined") {
        localStorage.setItem(
          RESCUE_STATS_KEY,
          JSON.stringify({
            totalScanned: next.totalScanned,
            totalRescued: next.totalRescued,
            totalReplied: next.totalReplied,
            totalFailed: next.totalFailed,
            totalInitialPool: next.totalInitialPool,
          })
        );
      }
      return next;
    });
  };

  const verifyAndFetchPool = async (key: string, forceFresh = false) => {
    if (!key.trim()) return;
    setAuthLoading(true);
    setAuthError("");

    try {
      const res = await fetch("/api/admin/rescue-worker", {
        headers: { "x-admin-key": key.trim() },
      });
      const data = await res.json();

      if (res.ok) {
        setIsAuth(true);
        if (typeof window !== "undefined") {
          sessionStorage.setItem("admin_session_key", key.trim());
        }

        // LocalStorage से अगर पुरानी कतार बची हो तो उठाएं (जब तक forceFresh न हो)
        if (!forceFresh) {
          const savedQueue = localStorage.getItem(RESCUE_QUEUE_KEY);
          if (savedQueue) {
            try {
              const parsedQ = JSON.parse(savedQueue);
              if (Array.isArray(parsedQ) && parsedQ.length > 0) {
                setQueue(parsedQ);
                return;
              }
            } catch (_) {}
          }
        }

        if (Array.isArray(data.pool)) {
          saveQueueState(data.pool);
          updateMetricsState((prev) => ({ ...prev, totalInitialPool: data.totalCount || data.pool.length }));
        }
      } else {
        setIsAuth(false);
        setAuthError(data.error || "Invalid Admin Key. Access Denied.");
      }
    } catch {
      setIsAuth(false);
      setAuthError("Failed to connect to the server.");
    } finally {
      setAuthLoading(false);
    }
  };

  // 🎯 सुरक्षित 3.5s-6.5s रैंडम डिले लूप
  useEffect(() => {
    if (!metrics.isRunning) return;

    let timeoutId: NodeJS.Timeout | null = null;

    const processNextAccount = async () => {
      if (!isRunningRef.current) return;

      const currentQ = queueRef.current;
      if (currentQ.length === 0) {
        setMetrics((prev) => ({ ...prev, isRunning: false }));
        setLogs((prev) => [
          `[${new Date().toLocaleTimeString()}] 🏁 COMPLETE: All accounts scanned. Auto-Stopped.`,
          ...prev.slice(0, 49),
        ]);
        return;
      }

      const receiver = currentQ[0];

      try {
        const res = await fetch("/api/admin/rescue-worker", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-admin-key": adminKeyRef.current.trim(),
          },
          body: JSON.stringify({ receiver }),
        });

        const data = await res.json();
        const updatedQ = currentQ.slice(1);
        saveQueueState(updatedQ);

        if (data.success) {
          updateMetricsState((prev) => ({
            ...prev,
            totalScanned: prev.totalScanned + 1,
            totalRescued: prev.totalRescued + (Number(data.rescued) || 0),
            totalReplied: prev.totalReplied + (Number(data.replied) || 0),
          }));

          setLogs((prev) => [
            `[${new Date().toLocaleTimeString()}] [Remaining: ${updatedQ.length}] ${data.log || "Processed OK"}`,
            ...prev.slice(0, 49),
          ]);
        } else {
          updateMetricsState((prev) => ({
            ...prev,
            totalScanned: prev.totalScanned + 1,
            totalFailed: prev.totalFailed + 1,
          }));

          setLogs((prev) => [
            `[${new Date().toLocaleTimeString()}] [Remaining: ${updatedQ.length}] ❌ ${receiver.email}: ${data.error || "Auth Error"}`,
            ...prev.slice(0, 49),
          ]);
        }
      } catch (err: any) {
        const updatedQ = currentQ.slice(1);
        saveQueueState(updatedQ);
        updateMetricsState((prev) => ({
          ...prev,
          totalScanned: prev.totalScanned + 1,
          totalFailed: prev.totalFailed + 1,
        }));

        setLogs((prev) => [
          `[${new Date().toLocaleTimeString()}] ❌ Network Error [${receiver.email}]: ${err.message}`,
          ...prev.slice(0, 49),
        ]);
      }

      const randomDelayMs = Math.floor(Math.random() * (6500 - 3500 + 1)) + 3500;

      if (isRunningRef.current) {
        timeoutId = setTimeout(processNextAccount, randomDelayMs);
      }
    };

    processNextAccount();

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [metrics.isRunning]);

  const toggleEngine = () => {
    if (!metrics.isRunning && queue.length === 0) {
      alert("Queue is empty! Click 'Reload DB Pool' to start fresh scan.");
      return;
    }
    const nextState = !metrics.isRunning;
    setMetrics((prev) => ({ ...prev, isRunning: nextState }));
    setLogs((prev) => [
      `[${new Date().toLocaleTimeString()}] 🛡️ Rescue Sentinel ${nextState ? "🟢 STARTED (3.5s-6.5s Jitter)" : "🔴 STOPPED"}`,
      ...prev.slice(0, 49),
    ]);
  };

  const reloadFromDB = async () => {
    await verifyAndFetchPool(adminKey, true);
    setLogs((prev) => [
      `[${new Date().toLocaleTimeString()}] 🔄 DB Pool Reloaded Fresh.`,
      ...prev.slice(0, 49),
    ]);
  };

  const resetMetrics = () => {
    if (!confirm("Reset all rescue sentinel counters?")) return;
    if (typeof window !== "undefined") {
      localStorage.removeItem(RESCUE_STATS_KEY);
      localStorage.removeItem(RESCUE_QUEUE_KEY);
    }
    setQueue([]);
    setMetrics({
      isRunning: false,
      totalScanned: 0,
      totalRescued: 0,
      totalReplied: 0,
      totalFailed: 0,
      totalInitialPool: 0,
    });
    setLogs([`[${new Date().toLocaleTimeString()}] 🧹 LocalStorage Reset.`]);
    verifyAndFetchPool(adminKey, true);
  };

  // 🔐 अन-ऑथेंटिकेटेड गेट
  if (!isAuth) {
    return (
      <main className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="bg-slate-900 p-8 rounded-3xl border border-slate-800 w-full max-w-sm shadow-2xl">
          <div className="mx-auto mb-4 w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-xl">
            🛡️
          </div>
          <h1 className="text-lg font-bold text-white mb-1 text-center">Spam Sentinel</h1>
          <p className="text-xs text-slate-400 mb-6 text-center">Admin Authentication Required</p>

          {authError && (
            <div className="p-3 bg-red-950/60 border border-red-500/40 rounded-xl text-red-300 text-xs mb-4">
              {authError}
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              verifyAndFetchPool(adminKey);
            }}
            className="space-y-3"
          >
            <input
              type="password"
              placeholder="Enter Admin Secret Key"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-xs text-white outline-none focus:border-emerald-500 font-mono"
              value={adminKey}
              onChange={(e) => setAdminKey(e.target.value)}
              required
            />
            <button
              type="submit"
              disabled={authLoading}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold py-3 rounded-xl transition shadow-lg disabled:opacity-50 cursor-pointer"
            >
              {authLoading ? "Authenticating..." : "Unlock Sentinel"}
            </button>
          </form>
        </div>
      </main>
    );
  }

  // 🛡️ ऑथेंटिकेटेड डैशबोर्ड
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8 font-sans">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex justify-between items-center bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-xl">
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <span className="text-emerald-400">🛡️</span> Spam Sentinel & Rescue Engine
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Strict 12h Window ➔ [WU-VERIFIED-NODE] Tag Only ➔ 2-Way Reply ➔ Safe Delay
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/admin/warmup"
              className="text-xs bg-indigo-950 hover:bg-indigo-900 text-indigo-300 border border-indigo-700 px-3.5 py-2 rounded-xl transition cursor-pointer"
            >
              🔥 P2P Mesh Engine
            </Link>
            <Link
              href="/admin"
              className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 px-3.5 py-2 rounded-xl transition cursor-pointer"
            >
              ⬅ Licenses
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-slate-900/90 border border-slate-800 p-5 rounded-2xl shadow-md">
            <div className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">Queue Remaining</div>
            <div className="text-3xl font-black mt-2 font-mono text-amber-400">{queue.length}</div>
            <div className="text-[10px] text-slate-500 mt-2 font-mono">
              Total In Pool: {metrics.totalInitialPool || queue.length}
            </div>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 p-5 rounded-2xl shadow-md">
            <div className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">Total Scanned</div>
            <div className="text-3xl font-black text-indigo-400 mt-2 font-mono">{metrics.totalScanned}</div>
            <div className="text-[10px] text-slate-500 mt-2 font-mono">0 Outbound If Tag Missing</div>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 p-5 rounded-2xl shadow-md">
            <div className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">Spam Rescued</div>
            <div className="text-3xl font-black text-emerald-400 mt-2 font-mono">{metrics.totalRescued}</div>
            <div className="text-[10px] text-slate-500 mt-2 font-mono">Moved Spam ➔ Inbox</div>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 p-5 rounded-2xl shadow-md">
            <div className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">2-Way Replied</div>
            <div className="text-3xl font-black text-sky-400 mt-2 font-mono">{metrics.totalReplied}</div>
            <div className="text-[10px] text-slate-500 mt-2 font-mono">Failed: {metrics.totalFailed}</div>
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 p-6 rounded-2xl shadow-xl flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-white">Sentinel Scanner Control</h3>
            <p className="text-xs text-slate-400">
              Only replies back when incoming warmup trap is matched.
            </p>
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
              {metrics.isRunning ? "🛑 Stop Sentinel" : "🛡️ Start Spam Sentinel"}
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

        <div className="bg-slate-900/90 border border-slate-800 p-5 rounded-2xl shadow-xl space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Sentinel Live Logs</span>
            <button
              onClick={() => setLogs([])}
              className="text-[10px] text-slate-500 hover:text-slate-300 cursor-pointer"
            >
              Clear Logs
            </button>
          </div>

          <div className="bg-slate-950 p-4 rounded-xl font-mono text-xs text-slate-300 space-y-1 max-h-64 overflow-y-auto border border-slate-800/80">
            {logs.length === 0 ? (
              <div className="text-slate-600 text-center py-4">
                Sentinel queue ready ({queue.length} inboxes). Click "Start Spam Sentinel"...
              </div>
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