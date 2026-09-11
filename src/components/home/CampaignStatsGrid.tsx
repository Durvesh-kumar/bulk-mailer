import React, { RefObject } from "react";
import { FailedEmailItem } from "@/types/vault";

interface CampaignStatsGridProps {
  totalAccountsCount: number;
  sendersUsedRounds: number;
  currentSenderIndex: number;
  remainingAccountsInQueue: number;
  initialTotalCount: number;
  processedCount: number;
  successCount: number;
  failedLeadsList: FailedEmailItem[];
  domProcessedCountRef: RefObject<HTMLSpanElement | null>;
  domDeliveredCountRef: RefObject<HTMLSpanElement | null>;
  domFailedCountRef: RefObject<HTMLSpanElement | null>;
  onShowFailedModal: () => void;
}

export default function CampaignStatsGrid({
  totalAccountsCount,
  sendersUsedRounds,
  currentSenderIndex,
  remainingAccountsInQueue,
  initialTotalCount,
  processedCount,
  successCount,
  failedLeadsList,
  domProcessedCountRef,
  domDeliveredCountRef,
  domFailedCountRef,
  onShowFailedModal,
}: CampaignStatsGridProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 bg-slate-900/90 border border-slate-800 p-3 rounded-2xl shadow-lg">
      <div className="bg-slate-950/80 p-2.5 rounded-xl border border-slate-800/80 text-center">
        <span className="text-[9px] text-slate-400 uppercase font-black block">Senders Loaded</span>
        <p className="text-base font-black text-white font-mono">{totalAccountsCount}</p>
      </div>
      <div className="bg-slate-950/80 p-2.5 rounded-xl border border-blue-500/20 text-center">
        <span className="text-[9px] text-blue-400 uppercase font-black block">Turns Done</span>
        <p className="text-base font-black text-blue-400 font-mono">{sendersUsedRounds}</p>
      </div>
      <div className="bg-slate-950/80 p-2.5 rounded-xl border border-emerald-500/20 text-center">
        <span className="text-[9px] text-emerald-400 uppercase font-black block">Current Turn</span>
        <p className="text-base font-black text-emerald-400 font-mono">
          #{totalAccountsCount > 0 ? (currentSenderIndex % totalAccountsCount) + 1 : 0}
        </p>
      </div>
      <div className="bg-slate-950/80 p-2.5 rounded-xl border border-indigo-500/20 text-center">
        <span className="text-[9px] text-indigo-400 uppercase font-black block">Senders Queue</span>
        <p className="text-base font-black text-indigo-400 font-mono">{remainingAccountsInQueue}</p>
      </div>

      <div className="bg-slate-950/80 p-2.5 rounded-xl border border-slate-800/80 text-center">
        <span className="text-[9px] text-slate-400 uppercase font-black block">Total Leads</span>
        <p className="text-base font-black text-slate-100 font-mono">{initialTotalCount}</p>
      </div>
      <div className="bg-slate-950/80 p-2.5 rounded-xl border border-indigo-500/20 text-center">
        <span className="text-[9px] text-indigo-400 uppercase font-black block">Processed</span>
        <p className="text-base font-black text-indigo-400 font-mono">
          <span ref={domProcessedCountRef}>{processedCount}</span>
        </p>
      </div>
      <div className="bg-slate-950/80 p-2.5 rounded-xl border border-emerald-500/20 text-center">
        <span className="text-[9px] text-emerald-400 uppercase font-black block">Delivered</span>
        <p className="text-base font-black text-emerald-400 font-mono">
          <span ref={domDeliveredCountRef}>{successCount}</span>
        </p>
      </div>
      <div 
        onClick={() => failedLeadsList.length > 0 && onShowFailedModal()}
        className={`p-2.5 rounded-xl border text-center transition ${
          failedLeadsList.length > 0 
            ? "bg-rose-950/40 border-rose-500/40 cursor-pointer hover:border-rose-400 animate-pulse" 
            : "bg-slate-950/80 border-slate-800 opacity-60"
        }`}
      >
        <span className="text-[9px] text-rose-400 uppercase font-black block">
          Failed {failedLeadsList.length > 0 && "👁️"}
        </span>
        <p className="text-base font-black text-rose-400 font-mono">
          <span ref={domFailedCountRef}>{failedLeadsList.length}</span>
        </p>
      </div>
    </div>
  );
}