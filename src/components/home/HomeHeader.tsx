import React from "react";
import Link from "next/link";

interface HomeHeaderProps {
  machineId: string | null;
  loading: boolean;
  onReset: () => void;
}

export default function HomeHeader({ machineId, loading, onReset }: HomeHeaderProps) {
  return (
    <div className="bg-slate-900/90 border border-slate-800 px-5 py-3 rounded-2xl flex flex-wrap justify-between items-center gap-3 shadow-xl">
      <div className="flex items-center gap-3">
        <img src="/icons/engine-hub.svg" alt="Hub" className="w-7 h-7 object-contain" />
        <div>
          <h1 className="text-lg font-black bg-gradient-to-r from-blue-400 via-indigo-300 to-purple-400 bg-clip-text text-transparent leading-tight">
            InboxSend Multi-Account Rotator (V3 Engine)
          </h1>
          <p className="text-[10px] text-slate-400 font-mono">
            Hardware Binding: <span className="text-indigo-400">{machineId || "Authenticating..."}</span>
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Link
          href="/outlook/dashboard"
          className="px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
        >
          <span>📊</span> Lead Dashboard
        </Link>
        <Link
          href="/vault"
          className="px-3 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
        >
          <span>🔐</span> Senders Vault
        </Link>
        <button
          type="button"
          disabled={loading}
          onClick={onReset}
          className="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 rounded-xl text-xs font-bold transition cursor-pointer"
        >
          🔄 Reset
        </button>
      </div>
    </div>
  );
}