"use client";

import React, { useState } from "react";

interface License {
  _id: string;
  appDomain: string;
  clientName: string;
  lockedDeviceId: string | null;
  status: "ACTIVE" | "SUSPENDED";
  expiresAt: string;
}

export default function AdminDashboard() {
  const [adminKey, setAdminKey] = useState("");
  const [isAuth, setIsAuth] = useState(false);
  const [licenses, setLicenses] = useState<License[]>([]);
  const [newDomain, setNewDomain] = useState("");
  const [newClient, setNewClient] = useState("");
  const [feedback, setFeedback] = useState("");
  const [loading, setLoading] = useState(false);

  const fetchLicenses = async (key = adminKey) => {
    if (!key.trim()) return;
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
      } else {
        setFeedback(data.error || "Invalid Admin Key");
      }
    } catch {
      setFeedback("Failed to connect to the server.");
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
          clientName: newClient.trim() || "Babu Dev",
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setFeedback(data.message);
        setNewDomain("");
        setNewClient("");
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

  const handleRenewPlan = async (appDomain: string) => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/licenses", {
        method: "POST",
        headers: {
          "x-admin-key": adminKey.trim(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "RENEW_SUBSCRIPTION", appDomain }),
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
    if (!confirm(`Reset machine lock for ${appDomain}? Next laptop will be auto-assigned on dispatch.`)) return;

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

  if (!isAuth) {
    return (
      <main className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="bg-slate-900 p-8 rounded-2xl border border-slate-800 w-full max-w-sm shadow-2xl">
          <h1 className="text-xl font-bold text-white mb-2 text-center">Admin Security Access</h1>
          <p className="text-xs text-slate-400 mb-6 text-center">Domain & Hardware Lock Control</p>

          {feedback && (
            <div className="p-3 bg-red-950/60 border border-red-500/40 rounded-lg text-red-300 text-xs mb-4">
              {feedback}
            </div>
          )}

          <form onSubmit={(e) => { e.preventDefault(); fetchLicenses(adminKey); }}>
            <input
              type="password"
              placeholder="Enter Admin Secret Key"
              className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm text-white mb-4 outline-none focus:border-indigo-500 font-mono"
              value={adminKey}
              onChange={(e) => setAdminKey(e.target.value)}
              required
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold p-3 rounded-xl transition shadow-lg disabled:opacity-50"
            >
              {loading ? "Authenticating..." : "Access Dashboard"}
            </button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-10">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex justify-between items-center border-b border-slate-800 pb-4">
          <div>
            <h1 className="text-2xl font-bold text-white">ReachOut Admin Hub</h1>
            <p className="text-xs text-slate-400 mt-0.5">Manage App Domains, 1-Year Expiries & Device Locks</p>
          </div>
          <button
            type="button"
            onClick={() => setIsAuth(false)}
            className="text-xs text-slate-400 hover:text-white border border-slate-800 px-3 py-1.5 rounded-lg"
          >
            Lock Session
          </button>
        </div>

        {/* Global Feedback Banner */}
        {feedback && (
          <div className="p-3.5 bg-slate-900 border border-indigo-500/40 rounded-xl text-indigo-300 text-xs font-mono">
            ℹ️ {feedback}
          </div>
        )}

        {/* Add New App Domain Form */}
        <form onSubmit={handleCreateLicense} className="bg-slate-900 p-6 rounded-2xl border border-slate-800 grid grid-cols-1 md:grid-cols-3 gap-4 shadow-xl">
          <input
            type="text"
            placeholder="Client Name (e.g. Rahul Sharma)"
            className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-slate-100 outline-none focus:border-indigo-500"
            value={newClient}
            onChange={(e) => setNewClient(e.target.value)}
            required
          />
          <input
            type="text"
            placeholder="App Domain (e.g. localhost or bulk-mailer-rust.vercel.app)"
            className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-slate-100 outline-none focus:border-indigo-500 font-mono"
            value={newDomain}
            onChange={(e) => setNewDomain(e.target.value)}
            required
          />
          <button
            type="submit"
            disabled={loading}
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl text-sm transition py-3 disabled:opacity-50"
          >
            {loading ? "Saving..." : "+ Whitelist Domain (1-Year)"}
          </button>
        </form>

        {/* License Table */}
        <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-x-auto shadow-xl">
          <table className="w-full text-left border-collapse text-xs font-mono">
            <thead>
              <tr className="bg-slate-950/70 border-b border-slate-800 text-slate-400 font-sans">
                <th className="p-4">Client</th>
                <th className="p-4">App Domain</th>
                <th className="p-4">Locked Machine ID</th>
                <th className="p-4">Status</th>
                <th className="p-4">Expires At</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {licenses.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-slate-500 font-sans">
                    No domains registered yet. Whitelist your first app domain above.
                  </td>
                </tr>
              ) : (
                licenses.map((lic) => {
                  const isExpired = lic.expiresAt && new Date() > new Date(lic.expiresAt);

                  return (
                    <tr key={lic._id} className="hover:bg-slate-950/40 transition">
                      <td className="p-4 font-sans font-medium text-slate-200">{lic.clientName}</td>
                      <td className="p-4 text-indigo-400 font-bold">{lic.appDomain}</td>
                      <td className="p-4">
                        {lic.lockedDeviceId ? (
                          <span className="text-emerald-400 bg-emerald-950/50 px-2.5 py-1 rounded-md border border-emerald-800/60">
                            ● {lic.lockedDeviceId.substring(0, 16)}...
                          </span>
                        ) : (
                          <span className="text-amber-400 bg-amber-950/50 px-2.5 py-1 rounded-md border border-amber-800/60">
                            ◌ Unbound (Awaiting 1st Mail)
                          </span>
                        )}
                      </td>
                      <td className="p-4">
                        <span
                          className={`px-2.5 py-1 rounded-md text-[10px] font-bold font-sans ${
                            lic.status === "ACTIVE" && !isExpired
                              ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                              : "bg-rose-950 text-rose-400 border border-rose-800"
                          }`}
                        >
                          {isExpired ? "EXPIRED" : lic.status}
                        </span>
                      </td>
                      <td className="p-4 text-slate-400">
                        {lic.expiresAt ? new Date(lic.expiresAt).toLocaleDateString() : "N/A"}
                      </td>
                      <td className="p-4 text-right space-x-2 font-sans">
                        <button
                          type="button"
                          disabled={loading}
                          onClick={() => handleRenewPlan(lic.appDomain)}
                          className="px-2.5 py-1.5 bg-emerald-950 hover:bg-emerald-900 text-emerald-300 border border-emerald-500/40 rounded-lg text-[11px] font-medium transition disabled:opacity-50"
                        >
                          +1 Year Renew
                        </button>
                        <button
                          type="button"
                          disabled={loading}
                          onClick={() => handleResetDevice(lic.appDomain)}
                          className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 rounded-lg text-[11px] font-medium transition disabled:opacity-50"
                        >
                          Reset Machine
                        </button>
                        <button
                          type="button"
                          disabled={loading}
                          onClick={() => handleToggleStatus(lic.appDomain)}
                          className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg text-[11px] font-medium transition disabled:opacity-50"
                        >
                          Toggle Status
                        </button>
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