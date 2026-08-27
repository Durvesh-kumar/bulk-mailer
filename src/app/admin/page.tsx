// src/app/admin/page.tsx
"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";

interface License {
  _id: string;
  appDomain: string;
  clientName: string;
  lockedDeviceId: string | null;
  status: "ACTIVE" | "SUSPENDED";
  expiresAt: string;
}

function calculateFutureExpiry(months: number, days?: number): { formatted: string; daysCount: number } {
  const target = new Date();

  if (days && days > 0) {
    target.setDate(target.getDate() + days);
  } else {
    const currentDay = target.getDate();
    target.setMonth(target.getMonth() + months);

    if (target.getDate() < currentDay) {
      target.setDate(0);
    }
  }

  const diffTime = target.getTime() - new Date().getTime();
  const daysCount = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  const formatted = target.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  return { formatted, daysCount };
}

export default function AdminDashboard() {
  const [adminKey, setAdminKey] = useState("");
  const [isAuth, setIsAuth] = useState(false);
  const [licenses, setLicenses] = useState<License[]>([]);

  const [newDomain, setNewDomain] = useState("");
  const [newClient, setNewClient] = useState("");
  const [validityMonths, setValidityMonths] = useState<number>(1);
  const [validityDays, setValidityDays] = useState<number | null>(null);

  // 🔍 Search and Filter State
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "SUSPENDED">("ALL");

  const [feedback, setFeedback] = useState("");
  const [loading, setLoading] = useState(false);

  const preview = calculateFutureExpiry(Number(validityMonths) || 1, validityDays || undefined);

  // 🛡️ 1. करंट एक्टिव टैब सेशन चेक करें (ब्राउज़र बंद होते ही 100% गायब)
  useEffect(() => {
    if (typeof window !== "undefined") {
      const activeSessionKey = sessionStorage.getItem("admin_session_key");
      if (activeSessionKey && activeSessionKey.trim().length > 0) {
        setAdminKey(activeSessionKey);
        fetchLicenses(activeSessionKey);
      }
    }
  }, []);

  const fetchLicenses = async (key = adminKey) => {
    if (!key.trim()) {
      setFeedback("Admin Secret Key is required.");
      return;
    }
    setLoading(true);
    setFeedback("");
    try {
      const res = await fetch("/api/admin/licenses", {
        headers: { "x-admin-key": key.trim() },
      });
      const data = await res.json();
      if (res.ok) {
        setLicenses(data.licenses || []);
        setIsAuth(true);
        // 🔒 केवल sessionStorage में सेव करें (टैब/ब्राउज़र बंद होते ही डिलीट)
        if (typeof window !== "undefined") {
          sessionStorage.setItem("admin_session_key", key.trim());
        }
      } else {
        setFeedback(data.error || "Invalid Admin Key. Access Denied.");
        setIsAuth(false);
        if (typeof window !== "undefined") {
          sessionStorage.removeItem("admin_session_key");
        }
      }
    } catch {
      setFeedback("Failed to connect to the server.");
      setIsAuth(false);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateLicense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDomain.trim()) {
      setFeedback("Please enter a valid App Domain.");
      return;
    }

    setFeedback("");
    setLoading(true);

    try {
      const res = await fetch("/api/admin/licenses", {
        method: "POST",
        headers: {
          "x-admin-key": adminKey.trim(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "CREATE_APP_DOMAIN",
          appDomain: newDomain.trim(),
          clientName: newClient.trim() || "Client",
          validityDays: validityDays || undefined,
          validityMonths: validityDays ? undefined : Math.max(1, Number(validityMonths) || 1),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setFeedback(data.message || "Domain whitelisted successfully!");
        setNewDomain("");
        setNewClient("");
        setValidityMonths(1);
        setValidityDays(null);
        fetchLicenses(adminKey);
      } else {
        setFeedback(data.error || "Creation failed");
      }
    } catch (err: any) {
      setFeedback("Error: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRenewPlan = async (appDomain: string, monthsToAdd: number) => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/licenses", {
        method: "POST",
        headers: {
          "x-admin-key": adminKey.trim(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "RENEW_SUBSCRIPTION",
          appDomain,
          validityMonths: monthsToAdd,
        }),
      });
      const data = await res.json();
      setFeedback(data.message || data.error);
      fetchLicenses(adminKey);
    } catch (err: any) {
      setFeedback(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResetDevice = async (appDomain: string) => {
    if (!confirm(`Reset machine lock for ${appDomain}? Next device will auto-bind.`)) return;

    setLoading(true);
    try {
      const res = await fetch("/api/admin/licenses", {
        method: "POST",
        headers: {
          "x-admin-key": adminKey.trim(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "RESET_DEVICE", appDomain }),
      });
      const data = await res.json();
      setFeedback(data.message || data.error);
      fetchLicenses(adminKey);
    } catch (err: any) {
      setFeedback(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleStatus = async (appDomain: string) => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/licenses", {
        method: "POST",
        headers: {
          "x-admin-key": adminKey.trim(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "TOGGLE_STATUS", appDomain }),
      });
      const data = await res.json();
      setFeedback(data.message || data.error);
      fetchLicenses(adminKey);
    } catch (err: any) {
      setFeedback(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteLicense = async (appDomain: string) => {
    if (!confirm(`⚠️ PERMANENT DELETE WARNING:\nAre you sure you want to delete [${appDomain}]?\nThis will remove the license and all associated tenant vault data permanently!`)) return;

    setLoading(true);
    try {
      const res = await fetch("/api/admin/licenses", {
        method: "DELETE",
        headers: {
          "x-admin-key": adminKey.trim(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ appDomain }),
      });
      const data = await res.json();
      setFeedback(data.message || data.error);
      fetchLicenses(adminKey);
    } catch (err: any) {
      setFeedback("Failed to delete license: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setAdminKey("");
    setIsAuth(false);
    setLicenses([]);
    setFeedback("");
    if (typeof window !== "undefined") {
      sessionStorage.removeItem("admin_session_key");
      sessionStorage.clear();
    }
  };

  const filteredLicenses = licenses.filter((lic) => {
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      lic.appDomain?.toLowerCase().includes(q) ||
      lic.clientName?.toLowerCase().includes(q) ||
      lic.lockedDeviceId?.toLowerCase().includes(q);

    const matchesStatus = statusFilter === "ALL" || lic.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  // 🔐 1. लॉगिन गेट
  if (!isAuth) {
    return (
      <main className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="bg-slate-900 p-8 rounded-3xl border border-slate-800 w-full max-w-sm shadow-2xl">
          <div className="mx-auto mb-4 w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-xl">
            ⚡
          </div>
          <h1 className="text-lg font-bold text-white mb-1 text-center">InboxSend Admin Console</h1>
          <p className="text-xs text-slate-400 mb-6 text-center">Hardware Lock & Domain Licensing</p>

          {feedback && (
            <div className="p-3 bg-red-950/60 border border-red-500/40 rounded-xl text-red-300 text-xs mb-4">
              {feedback}
            </div>
          )}

          <form onSubmit={(e) => { e.preventDefault(); fetchLicenses(adminKey); }} className="space-y-3">
            <input
              type="password"
              autoComplete="off"
              placeholder="Enter Admin Secret Key"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-xs text-white outline-none focus:border-indigo-500 font-mono"
              value={adminKey}
              onChange={(e) => setAdminKey(e.target.value)}
              required
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold py-3 rounded-xl transition shadow-lg disabled:opacity-50 cursor-pointer"
            >
              {loading ? "Authenticating..." : "Access Dashboard"}
            </button>
          </form>
        </div>
      </main>
    );
  }

  // 🛡️ 2. ऑथेंटिकेटेड डैशबोर्ड
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8 overflow-x-hidden [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* Top Header */}
        <div className="flex justify-between items-center bg-slate-900/80 border border-slate-800/80 p-5 rounded-2xl shadow-xl backdrop-blur-sm">
          <div>
            <h1 className="text-lg md:text-xl font-bold text-white flex items-center gap-2">
              <span className="text-indigo-400">⚡</span> InboxSend Admin Hub
            </h1>
            <p className="text-[11px] text-slate-400 mt-0.5">Hardware Lock & Licensing Controller</p>
          </div>
          <div className="flex items-center gap-2">
            {/* 🎯 वार्म-अप इंजन बटन (क्लिक पर की सिंक पक्की करेगा) */}
            <Link
              href="/admin/warmup"
              onClick={() => {
                if (adminKey && typeof window !== "undefined") {
                  sessionStorage.setItem("admin_session_key", adminKey.trim());
                }
              }}
              className="text-xs bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 px-3 py-1.5 rounded-xl transition font-semibold flex items-center gap-1.5 shadow-sm cursor-pointer"
            >
              <span>⚡</span> Warm-Up Engine
            </Link>

            <button
              onClick={() => fetchLicenses(adminKey)}
              className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 px-3 py-1.5 rounded-xl transition cursor-pointer"
            >
              🔄 Refresh
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="text-xs text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 px-3 py-1.5 rounded-xl transition cursor-pointer"
            >
              Logout
            </button>
          </div>
        </div>

        {/* Global Feedback Banner */}
        {feedback && (
          <div className="p-3.5 bg-slate-900 border border-indigo-500/40 rounded-xl text-indigo-300 text-xs font-mono">
            ℹ️ {feedback}
          </div>
        )}

        {/* ➕ Whitelist New App Domain */}
        <form onSubmit={handleCreateLicense} className="bg-slate-900/90 p-5 md:p-6 rounded-2xl border border-slate-800/90 shadow-xl space-y-4">
          <div className="flex justify-between items-center border-b border-slate-800/80 pb-3">
            <h2 className="text-xs font-bold text-indigo-400 uppercase tracking-wider">
              ➕ Whitelist New Client / App Domain
            </h2>
            <span className="text-[11px] text-slate-400 font-mono">
              Auto-Calculated Expiry: <strong className="text-emerald-400">{preview.formatted}</strong> (~{preview.daysCount} days)
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">Client Name</label>
              <input
                type="text"
                placeholder="e.g. Acme Corp / Client Name"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 outline-none focus:border-indigo-500"
                value={newClient}
                onChange={(e) => setNewClient(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">App Domain (Clean URL)</label>
              <input
                type="text"
                placeholder="e.g. mailer.clientdomain.com"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 outline-none focus:border-indigo-500 font-mono"
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                Validity {validityDays ? "(Days)" : "(Months)"}
              </label>
              <div className="relative">
                <input
                  type="number"
                  min={1}
                  max={validityDays ? 365 : 60}
                  placeholder="Enter validity"
                  className="w-full bg-slate-950 border border-amber-500/40 rounded-xl px-3.5 py-2.5 text-xs text-amber-400 font-bold outline-none focus:border-amber-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none font-mono"
                  value={validityDays ? validityDays : validityMonths}
                  onChange={(e) => {
                    const val = Math.max(1, parseInt(e.target.value, 10) || 1);
                    if (validityDays) {
                      setValidityDays(val);
                    } else {
                      setValidityMonths(val);
                    }
                  }}
                  required
                />
                <span className="absolute right-3 top-2.5 text-[11px] font-semibold text-slate-500">
                  {validityDays ? "Days" : "Months"}
                </span>
              </div>
            </div>
          </div>

          {/* Quick Select Chips */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className="text-[10px] text-slate-500 font-semibold mr-1">Quick Select:</span>
            
            <button
              type="button"
              onClick={() => {
                setValidityDays(7);
              }}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold transition cursor-pointer ${
                validityDays === 7
                  ? "bg-cyan-500/25 text-cyan-300 border border-cyan-400"
                  : "bg-slate-950 hover:bg-slate-800 text-cyan-400/80 border border-slate-800"
              }`}
            >
              ⚡ 7 Days (Trial)
            </button>

            {[1, 2, 3, 6, 7, 9, 12, 24].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setValidityDays(null);
                  setValidityMonths(m);
                }}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-semibold transition cursor-pointer ${
                  !validityDays && validityMonths === m
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                    : "bg-slate-950 hover:bg-slate-800 text-slate-400 border border-slate-800"
                }`}
              >
                {m === 12 ? "1 Year" : m === 24 ? "2 Years" : `${m}M`}
              </button>
            ))}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full sm:w-auto px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs transition shadow-lg disabled:opacity-50 cursor-pointer"
          >
            {loading ? "Saving..." : `🚀 Whitelist Domain for ${validityDays ? `${validityDays} Day(s)` : `${validityMonths} Month(s)`}`}
          </button>
        </form>

        {/* 🔍 Universal Search & Filter Bar */}
        <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-2xl flex flex-col sm:flex-row items-center gap-3 shadow-lg">
          <div className="relative flex-1 w-full">
            <span className="absolute left-3.5 top-2.5 text-slate-500 text-xs">🔍</span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by Domain, Client Name, or Machine/Device ID..."
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

          <div className="flex items-center gap-1.5 w-full sm:w-auto">
            {(["ALL", "ACTIVE", "SUSPENDED"] as const).map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilter(status)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                  statusFilter === status
                    ? "bg-indigo-600 text-white shadow-md"
                    : "bg-slate-950 border border-slate-800 text-slate-400 hover:text-white"
                }`}
              >
                {status}
              </button>
            ))}
          </div>

          <span className="text-[11px] text-indigo-400 font-mono bg-indigo-500/10 border border-indigo-500/30 px-3 py-1.5 rounded-xl whitespace-nowrap">
            Found: {filteredLicenses.length}
          </span>
        </div>

        {/* 📋 Whitelisted Instances Table */}
        <div className="bg-slate-900/90 rounded-2xl border border-slate-800/90 overflow-x-auto shadow-xl [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          <table className="w-full text-left border-collapse text-xs font-mono min-w-[850px]">
            <thead>
              <tr className="bg-slate-950/70 border-b border-slate-800 text-slate-400 font-sans">
                <th className="p-3.5">Client</th>
                <th className="p-3.5">App Domain</th>
                <th className="p-3.5">Device Binding</th>
                <th className="p-3.5">Status</th>
                <th className="p-3.5">Expiry Date</th>
                <th className="p-3.5 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredLicenses.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-slate-500 font-sans">
                    {searchQuery || statusFilter !== "ALL" ? "No matching licenses found." : "No domains registered yet. Whitelist your first app domain above."}
                  </td>
                </tr>
              ) : (
                filteredLicenses.map((lic) => {
                  const isExpired = lic.expiresAt && new Date() > new Date(lic.expiresAt);

                  return (
                    <tr key={lic._id} className="hover:bg-slate-950/40 transition">
                      <td className="p-3.5 font-sans font-medium text-slate-200">{lic.clientName}</td>
                      <td className="p-3.5 text-indigo-400 font-bold">{lic.appDomain}</td>
                      <td className="p-3.5">
                        {lic.lockedDeviceId ? (
                          <span className="text-emerald-400 bg-emerald-950/50 px-2 py-0.5 rounded border border-emerald-800/60 truncate max-w-[120px] inline-block" title={lic.lockedDeviceId}>
                            🔒 {lic.lockedDeviceId.substring(0, 12)}...
                          </span>
                        ) : (
                          <span className="text-amber-400 bg-amber-950/50 px-2 py-0.5 rounded border border-amber-800/60">
                            🔓 Unbound
                          </span>
                        )}
                      </td>
                      <td className="p-3.5">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold font-sans ${
                            lic.status === "ACTIVE" && !isExpired
                              ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                              : "bg-rose-950 text-rose-400 border border-rose-800"
                          }`}
                        >
                          {isExpired ? "EXPIRED" : lic.status}
                        </span>
                      </td>
                      <td className="p-3.5 text-slate-300">
                        {lic.expiresAt
                          ? new Date(lic.expiresAt).toLocaleDateString("en-GB", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })
                          : "N/A"}
                      </td>
                      <td className="p-3.5 text-center font-sans whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            disabled={loading}
                            onClick={() => handleRenewPlan(lic.appDomain, 1)}
                            className="px-2.5 py-1 bg-emerald-950 hover:bg-emerald-900 text-emerald-300 border border-emerald-500/40 rounded-lg text-[11px] font-semibold transition cursor-pointer"
                            title="Add exactly 1 Month"
                          >
                            +1M
                          </button>

                          <button
                            type="button"
                            disabled={loading}
                            onClick={() => handleRenewPlan(lic.appDomain, 12)}
                            className="px-2.5 py-1 bg-indigo-950 hover:bg-indigo-900 text-indigo-300 border border-indigo-500/40 rounded-lg text-[11px] font-semibold transition cursor-pointer"
                            title="Add full 1 Year (12 Months)"
                          >
                            +1Y
                          </button>

                          <button
                            type="button"
                            disabled={loading}
                            onClick={() => handleResetDevice(lic.appDomain)}
                            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 rounded-lg text-[11px] font-semibold transition cursor-pointer"
                          >
                            Reset
                          </button>

                          <button
                            type="button"
                            disabled={loading}
                            onClick={() => handleToggleStatus(lic.appDomain)}
                            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg text-[11px] font-semibold transition cursor-pointer"
                          >
                            Toggle
                          </button>

                          <button
                            type="button"
                            disabled={loading}
                            onClick={() => handleDeleteLicense(lic.appDomain)}
                            className="px-2.5 py-1 bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-500/40 rounded-lg text-[11px] font-semibold transition cursor-pointer"
                            title="Permanently Delete License & Associated Tenant Vault Data"
                          >
                            🗑️ Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

      </div>
    </main>
  );
}