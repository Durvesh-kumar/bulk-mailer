import React from "react";
import { ProfileTier, TIER_META } from "@/types/vault";
import { InputField } from "@/components/ui/InputField";

interface LiveDashboardProps {
  setIsAppendModalOpen: (v: boolean) => void;
  selectedFolderToSwitch: ProfileTier;
  setSelectedFolderToSwitch: (v: ProfileTier) => void;
  handleSwitchSenderFolderDirectly: (tier: ProfileTier) => void;
  remainingCount: number;
  handleResumeOrNextBatch: (e: React.FormEvent) => void;
  loading: boolean;
  senderEmail: string;
  setSenderEmail: (v: string) => void;
  sendersUsedRounds: number;
  handleStopCampaign: () => void;
  handleFullReset: () => void;
  isVaultLoaded: boolean;
  senderName: string;
  setSenderName: (v: string) => void;
  showPassword: boolean;
  setShowPassword: (v: boolean) => void;
  appPassword: string;
  setAppPassword: (v: string) => void;
  subjectList: string[];
  handleSubjectTextChange: (idx: number, val: string) => void;
  handleRemoveSubjectField: (idx: number) => void;
  handleAddSubjectField: () => void;
  customSignoffName: string;
  setCustomSignoffName: (v: string) => void;
  setShowPreviewModal: (v: boolean) => void;
  template: string;
  setTemplate: (v: string) => void;
  currentBatchTarget: number;
}

export default function LiveDashboard({
  setIsAppendModalOpen,
  selectedFolderToSwitch,
  setSelectedFolderToSwitch,
  handleSwitchSenderFolderDirectly,
  remainingCount,
  handleResumeOrNextBatch,
  loading,
  senderEmail,
  setSenderEmail,
  sendersUsedRounds,
  handleStopCampaign,
  handleFullReset,
  isVaultLoaded,
  senderName,
  setSenderName,
  showPassword,
  setShowPassword,
  appPassword,
  setAppPassword,
  subjectList,
  handleSubjectTextChange,
  handleRemoveSubjectField,
  handleAddSubjectField,
  customSignoffName,
  setCustomSignoffName,
  setShowPreviewModal,
  template,
  setTemplate,
  currentBatchTarget,
}: LiveDashboardProps) {
  return (
    <div className="bg-slate-900/90 border border-slate-800 p-5 rounded-2xl space-y-4 shadow-xl">
      {/* ⚡ DYNAMIC ACTION BAR */}
      <div className="bg-slate-950 border border-indigo-500/30 p-3.5 rounded-xl flex flex-wrap items-center justify-between gap-3 shadow-inner">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-indigo-300">⚡ Dynamic Quick Actions:</span>
          <button
            type="button"
            onClick={() => setIsAppendModalOpen(true)}
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition shadow-sm cursor-pointer flex items-center gap-1"
          >
            <span>➕</span> Add More Leads
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-300">Switch Sender Folder:</span>
          <select
            value={selectedFolderToSwitch}
            onChange={(e) => {
              const tier = e.target.value as ProfileTier;
              setSelectedFolderToSwitch(tier);
              handleSwitchSenderFolderDirectly(tier);
            }}
            className="bg-slate-900 text-indigo-300 font-bold text-xs px-3 py-1.5 rounded-lg border border-indigo-500/40 outline-none cursor-pointer"
          >
            {(Object.keys(TIER_META) as ProfileTier[]).map((tier) => (
              <option key={tier} value={tier}>
                {TIER_META[tier]?.label || tier}
              </option>
            ))}
          </select>
        </div>
      </div>

      {remainingCount > 0 ? (
        <form onSubmit={handleResumeOrNextBatch} className="space-y-4 bg-slate-950/80 border border-slate-800/90 p-4 rounded-xl">
          <div className="flex flex-wrap justify-between items-center border-b border-slate-800 pb-3 gap-2">
            <div>
              <h3 className="text-xs font-black text-indigo-400 flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${loading ? "bg-emerald-400 animate-ping" : "bg-amber-400"}`} />
                {loading ? "🚀 Auto-Dispatching Active..." : "⏸️ Campaign Paused - Ready to Resume"}
              </h3>
              <p className="text-[10px] text-slate-400 mt-0.5 font-mono">
                Active Sender: <span className="text-indigo-300 font-bold">{senderEmail}</span> (Turn #{sendersUsedRounds + 1})
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-amber-400 font-mono font-bold bg-amber-500/10 px-2.5 py-1 rounded-full border border-amber-500/20">
                Remaining in Queue: {remainingCount}
              </span>
              {loading ? (
                <button
                  type="button"
                  onClick={handleStopCampaign}
                  className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold transition shadow-md cursor-pointer"
                >
                  🛑 Pause / Stop
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleFullReset}
                  className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-bold transition border border-slate-700 cursor-pointer"
                >
                  🔄 Reset All
                </button>
              )}
            </div>
          </div>

          <div className={`grid grid-cols-1 ${!isVaultLoaded ? "sm:grid-cols-3" : "sm:grid-cols-2"} gap-3`}>
            <InputField
              label="Active Sender Gmail"
              type="email"
              required
              disabled={loading}
              value={senderEmail}
              onChange={(e) => setSenderEmail(e.target.value)}
              className="font-mono bg-slate-900 border-slate-700 text-xs"
            />

            <InputField
              label="Sender Display Name"
              type="text"
              required
              disabled={loading}
              value={senderName}
              onChange={(e) => setSenderName(e.target.value)}
              className="bg-slate-900 border-slate-700 text-xs"
            />

            {!isVaultLoaded && (
              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] font-bold text-slate-300">Live App Password</label>
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="text-[9px] text-indigo-400 hover:text-indigo-300 font-mono cursor-pointer"
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  disabled={loading}
                  value={appPassword}
                  onChange={(e) => setAppPassword(e.target.value)}
                  placeholder="16-digit password"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-2 text-xs font-mono text-indigo-300 focus:border-indigo-500 outline-none"
                />
              </div>
            )}
          </div>

          {/* ⚡ LIVE SUBJECT LINES (1-5) IN DASHBOARD */}
          <div className="space-y-2 pt-1">
            <div className="flex justify-between items-center">
              <label className="text-[10px] text-slate-300 font-bold flex items-center gap-1">
                <span>✏️</span> Live Subject Lines (Rotates with No-Repeat between 1 to 5)
              </label>
              <span className="text-[9px] font-mono text-slate-500">
                {subjectList.length} Active Slots
              </span>
            </div>

            <div className="space-y-1.5">
              {subjectList.map((sub, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-slate-500 w-4">{idx + 1}.</span>
                  <input
                    type="text"
                    value={sub}
                    onChange={(e) => handleSubjectTextChange(idx, e.target.value)}
                    placeholder={`Subject Line ${idx + 1}`}
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-100 outline-none focus:border-indigo-500"
                  />
                  {subjectList.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveSubjectField(idx)}
                      className="p-1.5 text-slate-400 hover:text-rose-400 text-xs font-bold cursor-pointer"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>

            {subjectList.length < 5 && (
              <button
                type="button"
                onClick={handleAddSubjectField}
                className="text-[10px] font-bold text-indigo-400 hover:text-indigo-300 transition flex items-center gap-1 cursor-pointer pt-0.5"
              >
                <span>➕</span> Add Another Subject ({subjectList.length}/5)
              </button>
            )}
          </div>

          <InputField
            label="✏️ Live Sign-off / Signature"
            type="text"
            value={customSignoffName}
            onChange={(e) => setCustomSignoffName(e.target.value)}
            accentColor="emerald"
            className="bg-slate-900 border-slate-700"
          />

          <div className="w-full space-y-1">
            <div className="flex justify-between items-center">
              <label className="text-[10px] text-slate-300 font-bold">
                ✏️ Live Email Template Body (Takes effect immediately on next send/resume)
              </label>
              <button
                type="button"
                onClick={() => setShowPreviewModal(true)}
                className="px-2 py-0.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-lg text-[9px] font-semibold cursor-pointer"
              >
                👁️ Spintax Preview
              </button>
            </div>
            <textarea
              rows={4}
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-xs text-slate-100 outline-none leading-relaxed resize-none focus:border-indigo-500"
            />
          </div>

          {!loading && (
            <button
              type="submit"
              className="w-full py-3.5 bg-gradient-to-r from-emerald-600 via-teal-600 to-indigo-600 hover:from-emerald-500 hover:to-indigo-500 text-white font-black rounded-xl text-xs sm:text-sm transition-all duration-300 shadow-xl flex justify-center items-center gap-2 cursor-pointer active:scale-[0.99]"
            >
              <span>▶️ Resume Campaign (Dispatch {currentBatchTarget} Lead(s) via [{senderEmail}])</span>
            </button>
          )}
        </form>
      ) : (
        <div className="p-5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-center rounded-xl font-bold text-xs shadow-inner flex items-center justify-center gap-2">
          <span>🎉</span> All leads have been processed successfully! You can add more leads above anytime.
        </div>
      )}
    </div>
  );
}