"use client";

import React, { useState } from "react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  samples: { subject: string; body: string }[];
  onReRoll: () => void;
}

export default function SpintaxPreviewModal({ isOpen, onClose, samples, onReRoll }: Props) {
  const [activeTab, setActiveTab] = useState(0);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md transition-all animate-fadeIn">
      <div className="relative w-full max-w-2xl max-h-[90vh] flex flex-col bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden">
        
        {/* Top Header */}
        <div className="px-5 py-4 border-b border-slate-800/80 bg-slate-950/40 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 text-sm">
              🎲
            </div>
            <div>
              <h3 className="text-sm font-bold text-white tracking-wide">
                Spintax Live Variation Inspector
              </h3>
              <p className="text-[11px] text-slate-400">
                Simulating dynamic body & subject mutations for inbox diversity
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

        {/* Tab Selector & Re-Roll Button */}
        <div className="px-5 py-3 bg-slate-950/30 border-b border-slate-800/60 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            {samples.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setActiveTab(idx)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                  activeTab === idx
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm"
                    : "bg-slate-950/60 text-slate-400 hover:text-slate-200 border border-slate-900"
                }`}
              >
                Variation #{idx + 1}
              </button>
            ))}
          </div>

          <button
            onClick={onReRoll}
            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition shadow-lg flex items-center gap-1.5 cursor-pointer active:scale-95"
          >
            <span>🔄</span> Re-Roll Variations
          </button>
        </div>

        {/* Dynamic Preview Container */}
        <div className="p-5 overflow-y-auto max-h-[55vh] space-y-4 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-slate-800 [&::-webkit-scrollbar-thumb]:rounded-full">
          {samples[activeTab] ? (
            <div className="space-y-3.5 animate-fadeIn">
              {/* Subject Box */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                  Resolved Subject Line
                </label>
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono font-medium shadow-inner flex items-center justify-between">
                  <span className="truncate">{samples[activeTab].subject || "(No Subject)"}</span>
                  <span className="text-[10px] text-slate-500 font-sans shrink-0 ml-2">Clean Text</span>
                </div>
              </div>

              {/* Body Box */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                  Resolved Email Body (As Received by Lead)
                </label>
                <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 whitespace-pre-wrap leading-relaxed shadow-inner min-h-[140px] font-sans">
                  {samples[activeTab].body || "(No Body Content Provided)"}
                </div>
              </div>
            </div>
          ) : (
            <div className="py-12 text-center text-slate-500 text-xs">
              No spintax variations generated. Click Re-Roll above.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-800/80 bg-slate-950/40 flex items-center justify-between">
          <span className="text-[11px] text-emerald-400 font-sans flex items-center gap-1">
            <span>✨</span> 100% Unique Fingerprint per Recipient
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-xl border border-slate-700 transition cursor-pointer"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
}