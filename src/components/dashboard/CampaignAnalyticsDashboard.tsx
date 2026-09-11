// src/components/dashboard/CampaignAnalyticsDashboard.tsx
"use client";

import React from "react";

export interface SmtpDiagnosticStat {
  code550: number; // User not found
  code552: number; // Mailbox full
  code553: number; // Syntax error
  code554: number; // Spam policy / rejected
  code421: number; // Deferred / Rate limited
  other: number;
}

export interface SenderHealthMetrics {
  email: string;
  coldSent: number;
  warmupSent: number;
  spamRescued: number;
  bouncesHit: number;
}

interface AnalyticsDashboardProps {
  isOpen: boolean;
  onClose: () => void;
  diagnosticStats: SmtpDiagnosticStat;
  senderMetrics: Record<string, SenderHealthMetrics>;
  totalCold: number;
  totalWarmup: number;
  totalRescued: number;
}

export default function CampaignAnalyticsDashboard({
  isOpen,
  onClose,
  diagnosticStats,
  senderMetrics,
  totalCold,
  totalWarmup,
  totalRescued,
}: AnalyticsDashboardProps) {
  if (!isOpen) return null;

  const totalBounces =
    diagnosticStats.code550 +
    diagnosticStats.code552 +
    diagnosticStats.code553 +
    diagnosticStats.code554 +
    diagnosticStats.other;

  const totalDispatched = totalCold + totalWarmup;
  const successfulCold = Math.max(0, totalCold - totalBounces);

  const deliveryRate = totalCold > 0 ? Math.round((successfulCold / totalCold) * 100) : 100;
  const bounceRate = totalCold > 0 ? ((totalBounces / totalCold) * 100).toFixed(1) : "0.0";

  const deliveredPct = totalDispatched > 0 ? (successfulCold / totalDispatched) * 100 : 0;
  const rescuedPct = totalDispatched > 0 ? (totalRescued / totalDispatched) * 100 : 0;
  const bouncePct = totalDispatched > 0 ? (totalBounces / totalDispatched) * 100 : 0;

  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (deliveryRate / 100) * circumference;

  const gaugeColor =
    deliveryRate >= 90 ? "text-emerald-500" : deliveryRate >= 75 ? "text-amber-500" : "text-rose-500";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-3 sm:p-6 overflow-y-auto animate-fadeIn">
      <div className="bg-slate-950 border border-slate-800 w-full max-w-5xl rounded-3xl p-5 sm:p-8 shadow-2xl space-y-6 text-slate-100 max-h-[92vh] overflow-y-auto">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2 text-white">
              <span>📊</span> Deliverability Analytics & Visual Telemetry Chart
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Live visual tracking of SMTP error distribution, spam rescues, and sender health.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer"
          >
            ✕ Close
          </button>
        </div>

        {/* Top Visual Chart Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          
          {/* Chart 1: Radial Delivery Gauge */}
          <div className="bg-slate-900/60 border border-slate-800 p-5 rounded-3xl flex flex-col items-center justify-center text-center">
            <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider mb-2">
              Deliverability Rate
            </span>
            <div className="relative flex items-center justify-center">
              <svg className="w-28 h-28 transform -rotate-90">
                <circle
                  cx="56"
                  cy="56"
                  r={radius}
                  className="text-slate-800"
                  strokeWidth="8"
                  stroke="currentColor"
                  fill="transparent"
                />
                <circle
                  cx="56"
                  cy="56"
                  r={radius}
                  className={`${gaugeColor} transition-all duration-1000 ease-out`}
                  strokeWidth="8"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                  stroke="currentColor"
                  fill="transparent"
                />
              </svg>
              <div className="absolute flex flex-col items-center">
                <span className="text-2xl font-black text-white">{deliveryRate}%</span>
                <span className="text-[9px] text-slate-400 font-mono">INBOX SCORE</span>
              </div>
            </div>
            <p className="text-[11px] text-slate-400 mt-2">
              {successfulCold} of {totalCold} cold leads reached inbox
            </p>
          </div>

          {/* Chart 2: Stacked Traffic Composition Bar */}
          <div className="md:col-span-2 bg-slate-900/60 border border-slate-800 p-5 rounded-3xl flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">
                  Dispatch Composition Flow
                </span>
                <span className="text-xs font-mono text-slate-300 font-bold">
                  Total Dispatches: {totalDispatched}
                </span>
              </div>

              <div className="w-full h-4 bg-slate-800 rounded-full overflow-hidden flex gap-0.5 p-0.5">
                <div
                  style={{ width: `${deliveredPct}%` }}
                  className="bg-emerald-500 rounded-l-full transition-all duration-700"
                  title={`Delivered: ${deliveredPct.toFixed(1)}%`}
                />
                <div
                  style={{ width: `${rescuedPct}%` }}
                  className="bg-purple-500 transition-all duration-700"
                  title={`Rescued: ${rescuedPct.toFixed(1)}%`}
                />
                <div
                  style={{ width: `${bouncePct}%` }}
                  className="bg-rose-500 rounded-r-full transition-all duration-700"
                  title={`Bounces: ${bouncePct.toFixed(1)}%`}
                />
              </div>

              <div className="flex flex-wrap gap-4 mt-3 text-xs font-mono">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  <span className="text-slate-300">Clean Inbox ({deliveredPct.toFixed(0)}%)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-purple-500" />
                  <span className="text-slate-300">Spam Rescued ({rescuedPct.toFixed(0)}%)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                  <span className="text-slate-300">Hard Bounces ({bounceRate}%)</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 pt-3 border-t border-slate-800/80 mt-3 text-center">
              <div>
                <span className="text-[10px] text-slate-400 block font-mono">Cold Leads</span>
                <span className="text-base font-bold text-emerald-400">{successfulCold}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block font-mono">Warmup Rescues</span>
                <span className="text-base font-bold text-purple-400">{totalRescued}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block font-mono">Failed Bounces</span>
                <span className="text-base font-bold text-rose-400">{totalBounces}</span>
              </div>
            </div>
          </div>

        </div>

        {/* Chart 3: SMTP 5xx Error Distribution Chart */}
        <div className="bg-slate-900/40 border border-slate-800/80 p-5 rounded-3xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <h3 className="text-xs font-bold text-rose-300 uppercase tracking-wider font-mono flex items-center gap-2">
              <span>🛑</span> SMTP Rejection Distribution Chart (5xx Responses)
            </h3>
            <span className="text-[11px] font-mono text-slate-400">Total Bounces: {totalBounces}</span>
          </div>

          <div className="space-y-3 font-mono text-xs">
            {[
              { label: "550 User Not Found / Dead Mailbox", count: diagnosticStats.code550, color: "bg-rose-500" },
              { label: "553 Invalid Syntax / Relay Denied", count: diagnosticStats.code553, color: "bg-amber-500" },
              { label: "552 Mailbox Quota Full", count: diagnosticStats.code552, color: "bg-orange-500" },
              { label: "554 Spam Policy Drop", count: diagnosticStats.code554, color: "bg-red-600" },
              { label: "421 Server Deferred / Rate Limit", count: diagnosticStats.code421, color: "bg-sky-500" },
            ].map((bar) => {
              const pct = totalBounces > 0 ? (bar.count / totalBounces) * 100 : 0;
              return (
                <div key={bar.label} className="space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-300">{bar.label}</span>
                    <span className="text-white font-bold">{bar.count} ({pct.toFixed(0)}%)</span>
                  </div>
                  <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      style={{ width: `${pct}%` }}
                      className={`h-full ${bar.color} rounded-full transition-all duration-700`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Chart 4: Sender-Wise Visual Health Meters */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold text-indigo-300 uppercase tracking-wider font-mono flex items-center gap-2">
            <span>🛡️</span> Sender Health & Spam Placement Meters
          </h3>

          <div className="space-y-2.5">
            {Object.values(senderMetrics).length === 0 ? (
              <div className="text-center py-6 text-slate-500 text-xs font-mono">
                No active sender data dispatched yet.
              </div>
            ) : (
              Object.values(senderMetrics).map((s) => {
                const total = s.coldSent + s.warmupSent;
                const spamRatio = total > 0 ? (s.spamRescued / total) * 100 : 0;
                const bounceRatio = total > 0 ? (s.bouncesHit / total) * 100 : 0;

                const isCritical = spamRatio > 20 || bounceRatio > 15;
                const isWarning = spamRatio > 8 || bounceRatio > 8;
                const meterColor = isCritical ? "bg-rose-500" : isWarning ? "bg-amber-500" : "bg-emerald-500";

                return (
                  <div
                    key={s.email}
                    className="p-4 rounded-2xl border border-slate-800 bg-slate-900/40 flex flex-col md:flex-row md:items-center justify-between gap-4"
                  >
                    <div className="space-y-1.5 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-white">{s.email}</span>
                        <span
                          className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase ${
                            isCritical
                              ? "bg-rose-500/20 text-rose-400"
                              : isWarning
                              ? "bg-amber-500/20 text-amber-400"
                              : "bg-emerald-500/20 text-emerald-400"
                          }`}
                        >
                          {isCritical ? "Critical Action" : isWarning ? "Moderate Risk" : "Healthy"}
                        </span>
                      </div>

                      <div className="w-full max-w-md">
                        <div className="flex justify-between text-[10px] font-mono text-slate-400 mb-0.5">
                          <span>Spam Detection Rate</span>
                          <span className="font-bold text-slate-200">{spamRatio.toFixed(1)}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                          <div
                            style={{ width: `${Math.min(100, spamRatio)}%` }}
                            className={`h-full ${meterColor} rounded-full`}
                          />
                        </div>
                      </div>

                      <p className="text-[11px] text-slate-400">
                        <strong>Advice:</strong>{" "}
                        {isCritical
                          ? "Halt cold leads immediately! Rest account for 24-48 hours."
                          : isWarning
                          ? "Increase silent warmup handshakes before adding more cold volume."
                          : "Health is optimal. You can safely increase reach-out."}
                      </p>
                    </div>

                    <div className="flex items-center gap-3 text-xs font-mono">
                      <div className="bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800">
                        <span className="text-[10px] text-slate-400 block">Sent</span>
                        <span className="font-bold text-white">{total}</span>
                      </div>
                      <div className="bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800">
                        <span className="text-[10px] text-purple-400 block">Rescued</span>
                        <span className="font-bold text-purple-300">{s.spamRescued}</span>
                      </div>
                      <div className="bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800">
                        <span className="text-[10px] text-rose-400 block">Bounces</span>
                        <span className="font-bold text-rose-300">{s.bouncesHit}</span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end pt-2 border-t border-slate-800/80">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition shadow-lg cursor-pointer"
          >
            Done & Return to Campaign
          </button>
        </div>

      </div>
    </div>
  );
}