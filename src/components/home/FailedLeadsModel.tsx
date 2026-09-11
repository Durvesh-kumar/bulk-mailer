import React from "react";
import { FailedEmailItem } from "@/types/vault";

interface FailedLeadsModalProps {
  isOpen: boolean;
  onClose: () => void;
  failedLeadsList: FailedEmailItem[];
  copiedType: "DETAILED" | "EMAILS" | null;
  onCopyFailedEmailsOnly: () => void;
  onCopyFailedDetailed: () => void;
}

export default function FailedLeadsModal({
  isOpen,
  onClose,
  failedLeadsList,
  copiedType,
  onCopyFailedEmailsOnly,
  onCopyFailedDetailed,
}: FailedLeadsModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fadeIn">
      <div className="bg-slate-900 border border-rose-500/40 w-full max-w-2xl rounded-3xl p-6 shadow-2xl space-y-4">
        <div className="flex justify-between items-center border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-sm font-black text-rose-400 uppercase tracking-wider flex items-center gap-2">
              <span>🔴</span> Delivery Failed Leads ({failedLeadsList.length})
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              These emails could not be delivered by the SMTP provider.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white text-sm bg-slate-800 px-2.5 py-1 rounded-lg cursor-pointer"
          >
            ✕ Close
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-950 p-2.5 rounded-xl border border-slate-800">
          <span className="text-[11px] text-slate-400 font-mono">Export / Clipboard Actions:</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCopyFailedEmailsOnly}
              className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 shadow-sm"
            >
              <span>📧</span>
              <span>{copiedType === "EMAILS" ? "✓ Emails Copied!" : "Copy Emails Only"}</span>
            </button>
            <button
              type="button"
              onClick={onCopyFailedDetailed}
              className="px-3 py-1 bg-rose-600/30 hover:bg-rose-600/50 text-rose-300 border border-rose-500/50 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 shadow-sm"
            >
              <span>📋</span>
              <span>{copiedType === "DETAILED" ? "✓ Full Log Copied!" : "Copy All (Detailed Log)"}</span>
            </button>
          </div>
        </div>

        <div className="max-h-80 overflow-y-auto space-y-2 pr-1">
          {failedLeadsList.map((item, idx) => (
            <div key={idx} className="bg-slate-950 p-3 rounded-xl border border-rose-950/80 flex flex-col sm:flex-row justify-between sm:items-center gap-1 text-xs">
              <div>
                <span className="font-bold text-white">{item.email}</span>
                <p className="text-[10px] text-rose-400 font-mono mt-0.5">{item.reason}</p>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-slate-400 font-mono">Via: {item.senderUsed}</span>
                <p className="text-[9px] text-slate-500 font-mono">{item.time}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}