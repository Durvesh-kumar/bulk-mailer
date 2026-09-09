"use client";

import React, { useState } from "react";
import { RejectedEmailItem } from "@/lib/leadCleaner";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  rejectedData: RejectedEmailItem[];
  stats: {
    total: number;
    dups: number;
    syntax: number;
    temp: number;
    dummy?: number;
    dnsFails?: number;
  };
}

export default function RejectedLeadsModal({ isOpen, onClose, rejectedData, stats }: Props) {
  const [activeFilter, setActiveFilter] = useState<
    "ALL" | "DUPLICATE" | "INVALID_SYNTAX" | "DISPOSABLE_DOMAIN" | "DUMMY_DOMAIN" | "INVALID_DNS"
  >("ALL");
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const filteredList =
    activeFilter === "ALL" ? rejectedData : rejectedData.filter((item) => item.reason === activeFilter);

  const handleCopyAll = () => {
    const textToCopy = filteredList.map((i) => `${i.email} - [${i.reason}]`).join("\n");
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-2xl max-h-[90vh] flex flex-col bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800/80 bg-slate-950/40 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 text-sm">
              🛡️
            </div>
            <div>
              <h3 className="text-sm font-bold text-white tracking-wide">Rejected Leads Audit Report</h3>
              <p className="text-[11px] text-slate-400">
                Filtered out <span className="text-rose-400 font-semibold">{stats.total} problematic contacts</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center text-xs transition cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Filter Pills */}
        <div className="px-5 py-3 bg-slate-950/20 border-b border-slate-800/50 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { key: "ALL", label: "All", count: stats.total },
              { key: "DUPLICATE", label: "Duplicates", count: stats.dups },
              { key: "INVALID_SYNTAX", label: "Syntax Errors", count: stats.syntax },
              { key: "DISPOSABLE_DOMAIN", label: "Temp Mails", count: stats.temp },
              { key: "DUMMY_DOMAIN", label: "Dummy", count: stats.dummy ?? 0 },
              { key: "INVALID_DNS", label: "Dead Mailboxes", count: stats.dnsFails ?? 0 },
            ].map((f) => (
              <button
                key={f.key}
                onClick={() => setActiveFilter(f.key as any)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer ${
                  activeFilter === f.key
                    ? "bg-slate-800 text-white border border-slate-700 shadow-sm"
                    : "bg-slate-950/60 text-slate-400 hover:text-slate-200 border border-slate-900"
                }`}
              >
                {f.label} ({f.count})
              </button>
            ))}
          </div>

          <button
            onClick={handleCopyAll}
            className="text-[11px] font-semibold text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-800 border border-slate-700 px-2.5 py-1 rounded-lg transition cursor-pointer flex items-center gap-1"
          >
            {copied ? "✅ Copied" : "📋 Copy Filtered"}
          </button>
        </div>

        {/* Audit List */}
        <div className="p-4 overflow-y-auto max-h-[50vh] space-y-2 font-mono text-xs">
          {filteredList.length === 0 ? (
            <div className="py-12 text-center text-slate-500 font-sans">No items matching the selected filter.</div>
          ) : (
            filteredList.map((item, idx) => (
              <div
                key={idx}
                className="flex flex-col sm:flex-row sm:items-center justify-between p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80 hover:border-slate-700/80 transition gap-2"
              >
                <div className="flex items-center gap-2 truncate">
                  <span className="text-[10px] text-slate-600 select-none w-5 text-right font-sans">#{idx + 1}</span>
                  <span className="text-slate-200 font-medium truncate" title={item.email}>
                    {item.email}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-md font-sans font-bold uppercase ${
                      item.reason === "DUPLICATE"
                        ? "bg-amber-950/70 text-amber-300 border border-amber-800/80"
                        : item.reason === "INVALID_SYNTAX"
                        ? "bg-rose-950/70 text-rose-300 border border-rose-800/80"
                        : item.reason === "DISPOSABLE_DOMAIN"
                        ? "bg-purple-950/70 text-purple-300 border border-purple-800/80"
                        : item.reason === "DUMMY_DOMAIN"
                        ? "bg-blue-950/70 text-blue-300 border border-blue-800/80"
                        : "bg-slate-800/70 text-slate-300 border border-slate-700/80"
                    }`}
                  >
                    {item.reason.replace("_", " ")}
                  </span>
                  <span className="text-[11px] text-slate-400 font-sans hidden md:inline">{item.description}</span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-800/80 bg-slate-950/40 flex items-center justify-between">
          <span className="text-[11px] text-slate-500 font-sans">
            Cleaned recipient list is automatically applied to your campaign.
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-xl border border-slate-700 transition cursor-pointer shadow-sm"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}