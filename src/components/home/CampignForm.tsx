// src/components/home/CampignForm.tsx
"use client";

import React from "react";
import { ProfileTier, SmtpAccount } from "@/types/vault";
import { AccountAgeMode, MODE_CONFIGS } from "@/config/AccountAgeMode";
import { RejectedEmailItem } from "@/lib/leadCleaner";

interface CampaignFormProps {
  loading: boolean;
  selectedTier: ProfileTier;
  isVaultLoaded: boolean;
  inMemorySenders: SmtpAccount[];
  handleLoadTierAccounts: (tier: ProfileTier) => void;
  senderEmail: string;
  setSenderEmail: (val: string) => void;
  senderName: string;
  setSenderName: (val: string) => void;
  showPassword: boolean;
  setShowPassword: (val: boolean) => void;
  appPassword: string;
  setAppPassword: (val: string) => void;
  handleQuickClean: () => void;
  handleDnsMxVerify: () => void;
  isDnsChecking: boolean;
  dnsProgressText: string;
  rejectedData: RejectedEmailItem[];
  setShowRejectedModal: (val: boolean) => void;
  rawSheetData: string;
  setRawSheetData: (val: string) => void;
  accountAgeMode: AccountAgeMode;
  setAccountAgeMode: (val: AccountAgeMode) => void;
  batchSize: number;
  setBatchSize: (val: number) => void;
  handleBatchSizeChange: (val: string) => void;
  handleBatchSizeBlur: () => void;
  currentMaxLot: number;
  rotationMode: "CONTINUOUS" | "EVERY_N_SENDERS" | "EVERY_SINGLE_SENDER";
  setRotationMode: (val: "CONTINUOUS" | "EVERY_N_SENDERS" | "EVERY_SINGLE_SENDER") => void;
  pauseAfterNSenders: number;
  setPauseAfterNSenders: (val: number) => void;
  subjectList: string[];
  handleSubjectTextChange: (idx: number, val: string) => void;
  handleRemoveSubjectField: (idx: number) => void;
  handleAddSubjectField: () => void;
  setShowPreviewModal: (val: boolean) => void;
  template: string;
  setTemplate: (val: string) => void;
  templateList?: string[];
  activeTemplateTab?: number;
  setActiveTemplateTab?: (idx: number) => void;
  handleAddTemplateField?: () => void;
  handleRemoveTemplateField?: (idx: number) => void;
  handleTemplateTextChange?: (idx: number, val: string) => void;
  customSignoffName: string;
  setCustomSignoffName: (val: string) => void;
  handleStartCampaign: (e: React.FormEvent) => void;
}

export default function CampaignForm(props: CampaignFormProps) {
  const currentTemplates = props.templateList || [props.template];
  const activeTab = props.activeTemplateTab || 0;
  const currentRotation = props.rotationMode || "CONTINUOUS";

  // वर्तमान मोड के आधार पर मैक्स लिमिट निकालें (FRESH=20, MID=50, AGED=100)
  const currentMaxAllowed = MODE_CONFIGS[props.accountAgeMode]?.maxLot || 100;

  const ageGroupOptions: { label: string; tier: ProfileTier; mode: AccountAgeMode; maxAllowed: number; icon: string }[] = [
    { label: "Fresh", tier: "CURRENT", mode: "FRESH", maxAllowed: 20, icon: "🌱" },
    { label: "1 Year", tier: "YEAR_1", mode: "STANDARD", maxAllowed: 50, icon: "⭐" },
    { label: "2 Year", tier: "YEAR_2", mode: "AGED", maxAllowed: 100, icon: "🛡️" },
    { label: "4 Year", tier: "YEAR_4", mode: "AGED", maxAllowed: 100, icon: "💎" },
    { label: "6+ Year", tier: "YEAR_6", mode: "AGED", maxAllowed: 100, icon: "👑" },
  ];

  const handleAgeGroupClick = (item: typeof ageGroupOptions[0]) => {
    props.handleLoadTierAccounts(item.tier);
    props.setAccountAgeMode(item.mode);
    
    // यदि मौजूदा बैच साइज नए मैक्स से ज्यादा है, तो उसे मैक्स पर सेट करें, अन्यथा 10 (या मिनिमम 1) पर रखें
    const targetSize = Math.min(10, item.maxAllowed);
    props.setBatchSize(Math.max(1, targetSize));
  };

  // सुरक्षित लॉट साइज चेंजर (डिफ़ॉल्ट 10, मिनिमम 1, मैक्सिमम टियर लिमिट)
  const onSecureBatchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val === "") {
      props.setBatchSize(10); // डिफ़ॉल्ट 10
      return;
    }
    const num = parseInt(val, 10);
    if (!isNaN(num)) {
      if (num < 1) {
        props.setBatchSize(1);
      } else if (num > currentMaxAllowed) {
        props.setBatchSize(currentMaxAllowed);
      } else {
        props.setBatchSize(num);
      }
    }
  };

  const onSecureBatchBlur = () => {
    if (!props.batchSize || props.batchSize < 1) {
      props.setBatchSize(10); // खाली होने पर डिफ़ॉल्ट 10 पर लौटेगा
    } else if (props.batchSize > currentMaxAllowed) {
      props.setBatchSize(currentMaxAllowed);
    }
  };

  return (
    <form onSubmit={props.handleStartCampaign} className="w-full">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        
        {/* ================= LEFT COLUMN: SENDER & LEADS (col-span-5) ================= */}
        <div className="lg:col-span-5 flex flex-col justify-between space-y-4">
          
          {/* Sender Credentials Card */}
          <div className="bg-[#0b132b]/90 border border-blue-900/50 hover:border-blue-500/40 transition-all p-4 sm:p-5 rounded-2xl space-y-4 shadow-[0_8px_30px_rgb(0,0,0,0.4)] backdrop-blur-md">
            
            {/* Age Group Header */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-blue-300 font-bold tracking-wide flex items-center gap-1.5">
                <span className="text-blue-400">1.</span> Select Age Group (Syncs Mode &amp; Limits):
              </span>
              <span className="text-[10px] text-slate-400 font-mono tracking-wide bg-blue-950/60 px-2 py-0.5 rounded border border-blue-900/40">Auto-Mode Sync</span>
            </div>

            {/* Age Group Pills */}
            <div className="flex flex-wrap items-center gap-2">
              {ageGroupOptions.map((item, idx) => {
                const isActive = props.selectedTier === item.tier && props.accountAgeMode === item.mode;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleAgeGroupClick(item)}
                    className={`px-3 py-1.5 rounded-full text-[11px] font-mono font-semibold border flex items-center gap-1.5 transition-all duration-200 cursor-pointer ${
                      isActive && props.isVaultLoaded
                        ? "bg-gradient-to-r from-blue-600 to-indigo-600 border-blue-400 text-white shadow-[0_0_15px_rgba(59,130,246,0.4)] font-bold scale-[1.02]"
                        : "bg-[#060a16] border-slate-800 text-slate-300 hover:text-white hover:border-slate-700"
                    }`}
                  >
                    <span className="text-[10px]">{item.icon}</span>
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>

            {/* 2-Row Grid for Inputs */}
            <div className="space-y-3 pt-1">
              
              {/* First Row: 2 Columns */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-mono text-slate-300 block mb-1 font-medium">Sender Gmail</label>
                  <input
                    type="email"
                    value={props.senderEmail}
                    onChange={(e) => props.setSenderEmail(e.target.value)}
                    placeholder="account1@gmail.com"
                    className="w-full bg-[#050814] border border-blue-950/80 rounded-xl px-3 py-2 text-xs text-blue-100 placeholder:text-slate-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 font-mono transition shadow-inner"
                    required
                  />
                </div>

                <div>
                  <label className="text-[11px] font-mono text-slate-300 block mb-1 font-medium">Display Name</label>
                  <input
                    type="text"
                    value={props.senderName}
                    onChange={(e) => props.setSenderName(e.target.value)}
                    placeholder="e.g. Ruby / Alex"
                    className="w-full bg-[#050814] border border-blue-950/80 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 font-sans transition shadow-inner"
                    required
                  />
                </div>
              </div>

              {/* Second Row: Full Width App Password */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-[11px] font-mono text-slate-300 font-medium">16-Digit App Password</label>
                  <button
                    type="button"
                    onClick={() => props.setShowPassword(!props.showPassword)}
                    className="text-[10px] text-blue-400 hover:text-blue-300 transition font-semibold cursor-pointer"
                  >
                    {props.showPassword ? "Hide Password" : "Show Password"}
                  </button>
                </div>
                <input
                  type={props.showPassword ? "text" : "password"}
                  value={props.appPassword}
                  onChange={(e) => props.setAppPassword(e.target.value)}
                  placeholder="abcd efgh ijkl mnop"
                  className="w-full bg-[#050814] border border-blue-950/80 rounded-xl px-3.5 py-2 text-xs text-blue-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 font-mono tracking-wider transition shadow-inner"
                  required={!props.isVaultLoaded}
                />
              </div>

            </div>

          </div>

          {/* Target Leads Box (Full Stretch Height) */}
          <div className="bg-[#0b132b]/90 border border-blue-900/50 hover:border-blue-500/40 transition-all p-4 sm:p-5 rounded-2xl flex-1 flex flex-col shadow-[0_8px_30px_rgb(0,0,0,0.4)] backdrop-blur-md">
            <div className="flex items-center justify-between pb-2.5 border-b border-blue-950/70">
              <span className="text-xs font-mono text-blue-200 font-bold flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse"></span> Target Leads Box
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={props.handleQuickClean}
                  className="px-2.5 py-1 bg-[#050814] border border-blue-900/60 hover:border-blue-500 text-blue-300 hover:text-white rounded-lg text-[11px] font-mono font-medium transition cursor-pointer"
                >
                  🧹 Quick Clean
                </button>
                <button
                  type="button"
                  onClick={props.handleDnsMxVerify}
                  disabled={props.isDnsChecking}
                  className="px-2.5 py-1 bg-blue-600/25 border border-blue-500/50 hover:bg-blue-600/40 text-blue-200 rounded-lg text-[11px] font-mono font-medium transition cursor-pointer"
                >
                  {props.isDnsChecking ? props.dnsProgressText : "⚡ Run DNS MX Check"}
                </button>
              </div>
            </div>

            <div className="flex-1 w-full pt-3 flex flex-col">
              <textarea
                value={props.rawSheetData}
                onChange={(e) => props.setRawSheetData(e.target.value)}
                placeholder="lead1@example.com&#10;lead2@example.com&#10;lead3@example.com&#10;Paste all target leads here..."
                className="w-full flex-1 min-h-[350px] bg-[#050814] border border-blue-950 rounded-xl p-3.5 text-xs text-blue-100 placeholder:text-slate-600 font-mono focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 no-scrollbar leading-relaxed resize-none shadow-inner"
                required
              />
            </div>
          </div>

        </div>

        {/* ================= RIGHT COLUMN: ROTATION, SUBJECTS, TEMPLATES & BUTTON (col-span-7) ================= */}
        <div className="lg:col-span-7 flex flex-col justify-between space-y-4">
          
          {/* Settings & Rotation Card */}
          <div className="bg-[#0b132b]/90 border border-blue-900/50 hover:border-blue-500/40 transition-all p-4 sm:p-5 rounded-2xl space-y-3.5 shadow-[0_8px_30px_rgb(0,0,0,0.4)] backdrop-blur-md">
            
            {/* Lot Size per Account with Dynamic Max Limit Badge */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-[11px] font-mono text-slate-300 font-medium">Lot Size per Account</label>
                  <span className="text-[10px] font-mono text-amber-400 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-500/30">
                    Max allowed: {currentMaxAllowed}
                  </span>
                </div>
                <input
                  type="number"
                  min={1}
                  max={currentMaxAllowed}
                  value={props.batchSize || ""}
                  onChange={onSecureBatchChange}
                  onBlur={onSecureBatchBlur}
                  placeholder="10"
                  className="w-full bg-[#050814] border border-blue-950 rounded-xl px-3 py-2 text-xs text-blue-100 font-mono focus:outline-none focus:border-blue-500 transition shadow-inner"
                />
              </div>

              <div className="bg-[#050814] border border-blue-950/80 rounded-xl p-2.5 flex items-center justify-between">
                <span className="text-[10px] font-mono text-slate-400">Active Sync Profile:</span>
                <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-950/60 px-2.5 py-0.5 rounded border border-emerald-500/30">
                  {props.accountAgeMode} Mode (Max {currentMaxAllowed})
                </span>
              </div>
            </div>

            {/* Rotation Settings */}
            <div>
              <span className="text-[11px] font-mono text-blue-300 block mb-1.5 font-bold tracking-wide">
                Rotation &amp; Dispatching Settings:
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {[
                  { id: "CONTINUOUS", label: "1. Continuous (Non-Stop RR)" },
                  { id: "EVERY_N_SENDERS", label: "2. Pause after N Senders (RR)" },
                  { id: "EVERY_SINGLE_SENDER", label: "3. Pause Every Sender (Full Lot)" },
                ].map((item) => {
                  const isSelected = currentRotation === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => props.setRotationMode(item.id as any)}
                      className={`px-3 py-2 rounded-xl text-[11px] font-mono border transition-all text-left cursor-pointer flex items-center gap-2 ${
                        isSelected
                          ? "bg-blue-600/35 border-blue-400 text-white font-bold shadow-[0_0_12px_rgba(59,130,246,0.3)]"
                          : "bg-[#050814] border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700"
                      }`}
                    >
                      <span className={`w-2.5 h-2.5 rounded-full border flex-shrink-0 transition-colors ${isSelected ? "bg-blue-400 border-blue-200" : "border-slate-600 bg-transparent"}`}></span>
                      <span className="truncate">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

          </div>

          {/* Subject Line Rotation Box */}
          <div className="bg-[#0b132b]/90 border border-blue-900/50 hover:border-blue-500/40 transition-all p-4 sm:p-5 rounded-2xl space-y-2.5 shadow-[0_8px_30px_rgb(0,0,0,0.4)] backdrop-blur-md">
            <div className="flex items-center justify-between pb-2 border-b border-blue-950/70">
              <span className="text-xs font-mono text-blue-200 font-bold flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-rose-400"></span> Subject Line Rotation (No-Repeat Random / Lot Guard)
              </span>
              <span className="text-[11px] font-mono text-slate-400 font-semibold">
                {props.subjectList.length} / 5 Slots
              </span>
            </div>

            <div className="space-y-2 pt-1">
              {props.subjectList.map((subj, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="text-xs font-mono text-slate-500 w-5 font-bold">{idx + 1}.</span>
                  <input
                    type="text"
                    value={subj}
                    onChange={(e) => props.handleSubjectTextChange(idx, e.target.value)}
                    placeholder={idx === 0 ? "e.g. Quick question regarding partnership" : `Optional alternative subject ${idx + 1}`}
                    className="flex-1 bg-[#050814] border border-blue-950 rounded-xl px-3 py-2 text-xs text-blue-100 placeholder:text-slate-600 focus:outline-none focus:border-blue-500 font-sans transition shadow-inner"
                    required={idx === 0}
                  />
                  {props.subjectList.length > 1 && (
                    <button
                      type="button"
                      onClick={() => props.handleRemoveSubjectField(idx)}
                      className="text-slate-500 hover:text-rose-400 text-xs px-2 py-1 transition cursor-pointer font-bold"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>

            {props.subjectList.length < 5 && (
              <button
                type="button"
                onClick={props.handleAddSubjectField}
                className="text-[11px] font-mono text-blue-400 hover:text-blue-300 font-bold pt-1 block cursor-pointer transition"
              >
                + Add Another Subject Line ({props.subjectList.length}/5)
              </button>
            )}
          </div>

          {/* Email Body Template Box (with Multi-Template Tabs) */}
          <div className="bg-[#0b132b]/90 border border-blue-900/50 hover:border-blue-500/40 transition-all p-4 sm:p-5 rounded-2xl space-y-2.5 shadow-[0_8px_30px_rgb(0,0,0,0.4)] backdrop-blur-md">
            <div className="flex items-center justify-between pb-2 border-b border-blue-950/70">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-blue-200 font-bold">
                  Email Body Template (Live Editable)
                </span>
                {/* Tabs */}
                <div className="flex items-center gap-1.5 ml-2">
                  {currentTemplates.map((_, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => props.setActiveTemplateTab && props.setActiveTemplateTab(idx)}
                      className={`px-2.5 py-0.5 rounded-lg text-[10px] font-mono font-bold transition cursor-pointer ${
                        activeTab === idx
                          ? "bg-blue-600 text-white shadow-[0_0_10px_rgba(59,130,246,0.4)]"
                          : "bg-[#050814] text-slate-400 border border-blue-950 hover:border-slate-700"
                      }`}
                    >
                      T{idx + 1}
                    </button>
                  ))}
                  {currentTemplates.length < 3 && props.handleAddTemplateField && (
                    <button
                      type="button"
                      onClick={props.handleAddTemplateField}
                      className="text-[11px] text-blue-400 hover:text-blue-300 px-1 font-bold cursor-pointer transition"
                    >
                      + Add
                    </button>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {currentTemplates.length > 1 && props.handleRemoveTemplateField && (
                  <button
                    type="button"
                    onClick={() => props.handleRemoveTemplateField && props.handleRemoveTemplateField(activeTab)}
                    className="text-[10px] text-rose-400 hover:text-rose-300 font-mono transition cursor-pointer"
                  >
                    Delete T{activeTab + 1}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => props.setShowPreviewModal(true)}
                  className="px-2.5 py-1 bg-[#050814] border border-amber-500/30 text-amber-300 hover:border-amber-400/60 rounded-lg text-[10px] font-mono flex items-center gap-1 transition cursor-pointer font-medium"
                >
                  <span>👁️</span> Spintax Preview
                </button>
              </div>
            </div>

            <textarea
              rows={5}
              value={currentTemplates[activeTab] || ""}
              onChange={(e) =>
                props.handleTemplateTextChange
                  ? props.handleTemplateTextChange(activeTab, e.target.value)
                  : props.setTemplate(e.target.value)
              }
              placeholder="Type your outreach message here... Supports Spintax {Hi|Hello|Hey}"
              className="w-full bg-[#050814] border border-blue-950 rounded-xl p-3 text-xs text-blue-100 placeholder:text-slate-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 font-sans leading-relaxed no-scrollbar resize-none shadow-inner transition"
              required
            />
          </div>

          {/* Custom Signature & Signoff Details */}
          <div className="bg-[#0b132b]/90 border border-blue-900/50 hover:border-blue-500/40 transition-all p-4 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.4)] backdrop-blur-md">
            <label className="text-[11px] font-mono text-slate-300 block mb-1 font-medium">
              Custom Signature &amp; Signoff Details
            </label>
            <input
              type="text"
              value={props.customSignoffName}
              onChange={(e) => props.setCustomSignoffName(e.target.value)}
              placeholder="e.g. John Doe | Founder at Acme Corp (Optional)"
              className="w-full bg-[#050814] border border-blue-950 rounded-xl px-3 py-2 text-xs text-blue-100 placeholder:text-slate-600 focus:outline-none focus:border-blue-500 font-sans transition shadow-inner"
            />
          </div>

          {/* 🚀 Full-Width Cyan/Blue Gradient Launch Button */}
          <button
            type="submit"
            disabled={props.loading}
            className="w-full py-4 bg-gradient-to-r from-cyan-400 via-sky-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-slate-950 font-black text-xs sm:text-sm uppercase tracking-wider rounded-2xl shadow-[0_0_25px_rgba(56,189,248,0.35)] transition-all transform active:scale-[0.99] cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2.5 font-mono"
          >
            <span>🚀</span> {props.loading ? "Dispatching Running..." : "Launch Campaign & Send (Automated Non-Stop)"}
          </button>

        </div>

      </div>
    </form>
  );
}