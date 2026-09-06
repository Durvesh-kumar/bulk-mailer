// src/app/lead-harvester/page.tsx
"use client";

import { GEO_DIRECTORY } from "@/config/groData";
import { cleanAndFilterLeads } from "@/lib/leadCleaner";
import { buildProviderCombos, generateSingleDorkQuery } from "@/lib/leadMatrixEngine";
import React, { useState, useRef } from "react";

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

const PRESET_OPTIONS = [
  "@gmail.com",
  "@yahoo.com",
  "@outlook.com",
  "@hotmail.com",
  "owner@",
  "ceo@",
  "founder@",
  "office@",
  "booking@",
  "sales@",
  "admin@",
  "contact@",
  "info@",
  "com@"
];

export default function LeadHarvesterPage() {
  const [niche, setNiche] = useState("Vacation Rental");
  const [selectedCountryKey, setSelectedCountryKey] = useState<string>("USA");
  const [selectedStates, setSelectedStates] = useState<string[]>([
    "New York",
    "California",
    "Florida",
    "Texas",
  ]);

  const [selectedProviders, setSelectedProviders] = useState<string[]>([
    "@gmail.com",
    "@yahoo.com",
    "@outlook.com",
    "owner@",
    "office@",
  ]);
  const [customTagInput, setCustomTagInput] = useState("");

  const [isRunning, setIsRunning] = useState(false);
  const [copied, setCopied] = useState(false);

  const statsRef = useRef({
    raw: 0,
    cleaned: 0,
    mx: 0,
    statesDone: 0,
  });

  const masterSetRef = useRef<Set<string>>(new Set());
  const stopSignalRef = useRef(false);

  const rawCountEl = useRef<HTMLSpanElement | null>(null);
  const cleanCountEl = useRef<HTMLSpanElement | null>(null);
  const mxCountEl = useRef<HTMLSpanElement | null>(null);
  const stateCountEl = useRef<HTMLSpanElement | null>(null);
  const statusEl = useRef<HTMLDivElement | null>(null);
  const liveDnsEl = useRef<HTMLSpanElement | null>(null);
  const masterTextareaEl = useRef<HTMLTextAreaElement | null>(null);
  const logContainerEl = useRef<HTMLDivElement | null>(null);

  const appendLog = (msg: string, isHighlight = false) => {
    if (!logContainerEl.current) return;
    const row = document.createElement("div");
    row.className = isHighlight ? "text-indigo-400 font-bold" : "text-slate-400";
    row.innerText = msg;
    logContainerEl.current.appendChild(row);
    logContainerEl.current.scrollTop = logContainerEl.current.scrollHeight;
  };

  const wakeLockRef = useRef<any>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const activateBackgroundEngine = async () => {
    try {
      if ("wakeLock" in navigator) {
        wakeLockRef.current = await (navigator as any).wakeLock.request("screen");
      }
    } catch (err) {
      console.warn("WakeLock error:", err);
    }

    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx && !audioCtxRef.current) {
        const ctx = new AudioCtx();
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();
        gainNode.gain.value = 0.00001;
        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);
        oscillator.start();
        audioCtxRef.current = ctx;
      }
    } catch (err) {
      console.warn("Audio anchor error:", err);
    }
  };

  const deactivateBackgroundEngine = () => {
    if (wakeLockRef.current) {
      wakeLockRef.current.release();
      wakeLockRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
  };

  const toggleProvider = (item: string) => {
    if (isRunning) return;
    setSelectedProviders((prev) =>
      prev.includes(item) ? prev.filter((p) => p !== item) : [...prev, item]
    );
  };

  const handleAddCustomTag = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && customTagInput.trim()) {
      e.preventDefault();
      const val = customTagInput.trim().toLowerCase();
      if (!selectedProviders.includes(val)) {
        setSelectedProviders((prev) => [...prev, val]);
      }
      setCustomTagInput("");
    }
  };

  const handleCountryChange = (countryKey: string) => {
    setSelectedCountryKey(countryKey);
    const countryData = GEO_DIRECTORY[countryKey];
    setSelectedStates(countryData ? countryData.regions.slice(0, 4) : []);
  };

  const toggleState = (region: string) => {
    if (isRunning) return;
    setSelectedStates((prev) =>
      prev.includes(region) ? prev.filter((s) => s !== region) : [...prev, region]
    );
  };

  const handleSelectAllStates = () => {
    if (isRunning) return;
    if (GEO_DIRECTORY[selectedCountryKey]) {
      setSelectedStates(GEO_DIRECTORY[selectedCountryKey].regions);
    }
  };

  const handleClearAllStates = () => {
    if (isRunning) return;
    setSelectedStates([]);
  };

  const handleCopyAll = async () => {
    if (!masterTextareaEl.current || !masterTextareaEl.current.value.trim()) return;
    await navigator.clipboard.writeText(masterTextareaEl.current.value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ⚡ 8-by-8 DNS/MX पाइपलाइन
  const runDnsMxVerifyPipeline = async (
    validCleanedEmails: string[],
    currentStateName: string
  ): Promise<string[]> => {
    if (validCleanedEmails.length === 0) return [];

    const CHUNK_SIZE = 8;
    const verifiedValidEmails: string[] = [];

    for (let i = 0; i < validCleanedEmails.length; i += CHUNK_SIZE) {
      if (stopSignalRef.current) break;

      const chunk = validCleanedEmails.slice(i, i + CHUNK_SIZE);
      const processedSoFar = Math.min(i + CHUNK_SIZE, validCleanedEmails.length);

      if (liveDnsEl.current) {
        liveDnsEl.current.innerText = `⚡ DNS Ping: ${processedSoFar}/${validCleanedEmails.length} [${currentStateName}]`;
      }

      try {
        const res = await fetch("/api/verify-dns", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ emails: chunk }),
        });

        if (res.ok) {
          const data = await res.json();
          if (data.valid && data.valid.length > 0) {
            verifiedValidEmails.push(...data.valid);
          }
        }
      } catch (err: any) {
        appendLog(`⚠️ [${currentStateName}] DNS Chunk Failed: ${err.message}`);
      }
    }

    if (liveDnsEl.current) liveDnsEl.current.innerText = "";
    return verifiedValidEmails;
  };

  // 🚀 मेन ऑटो-पायलट लूप (10-पेज चंक + ऑटो-क्लीनर + DNS/MX पाइपलाइन)
  const handleStartAutoPilot = async () => {
    if (!niche.trim()) {
      alert("Please enter a Target Niche / Keyword!");
      return;
    }

    if (selectedStates.length === 0) {
      alert("Please select at least 1 state/region!");
      return;
    }

    if (selectedProviders.length === 0) {
      alert("Please select at least 1 Target Email / Prefix!");
      return;
    }

    setIsRunning(true);
    stopSignalRef.current = false;
    await activateBackgroundEngine();

    statsRef.current = { raw: 0, cleaned: 0, mx: 0, statesDone: 0 };
    masterSetRef.current.clear();

    if (masterTextareaEl.current) masterTextareaEl.current.value = "";
    if (logContainerEl.current) logContainerEl.current.innerHTML = "";

    appendLog(`🚀 Initializing 10-Page Chunk Engine for "${niche.trim()}" across ${selectedStates.length} regions...`, true);
    appendLog(`🎯 Targets: ${selectedProviders.join(", ")}`);
    appendLog(`🛡️ Anti-Sleep Active: Tab priority locked.`);

    const targetCountryName = GEO_DIRECTORY[selectedCountryKey]?.name || selectedCountryKey;
    const combos = buildProviderCombos(selectedProviders, 3);

    for (let sIdx = 0; sIdx < selectedStates.length; sIdx++) {
      if (stopSignalRef.current) break;

      const currentState = selectedStates[sIdx];
      const stateLocationTag = `${currentState} ${targetCountryName}`.trim();
      const stateRawEmails: string[] = [];

      if (statusEl.current) {
        statusEl.current.innerText = `Harvesting: ${currentState} (${sIdx + 1}/${selectedStates.length})`;
      }

      appendLog(`──────────────────────────────────────────────`);
      appendLog(`📍 [REGION ${sIdx + 1}/${selectedStates.length}]: ${currentState}, ${targetCountryName}`, true);

      for (const combo of combos) {
        if (stopSignalRef.current) break;

        const dork = generateSingleDorkQuery(niche, stateLocationTag, combo);
        
        // 🔥 10-पेज का चंक लूप (पेज 2 से 11)
        let startPage = 2;
        let endPage = 11;
        let isChunkDone = false;

        for (let p = startPage; p <= endPage; p++) {
          if (stopSignalRef.current || isChunkDone) break;

          try {
            const res = await fetch("/api/leads/scrape-page", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ query: dork, page: p }),
            });

            const data = await res.json();

            if (data.isRateLimited) {
              appendLog(`⚠️ Rate limit on ${currentState}. Rotating API Key...`);
              break;
            }

            if (data.emails && data.emails.length > 0) {
              stateRawEmails.push(...data.emails);

              statsRef.current.raw += data.emails.length;
              if (rawCountEl.current) {
                rawCountEl.current.innerText = statsRef.current.raw.toLocaleString();
              }

              appendLog(`📥 Page ${p}: +${data.emails.length} raw hits (Key #${data.activeKeyUsed || 1})`);
            }

            if (data.isLastPage) {
              isChunkDone = true;
            }

            await sleep(300);
          } catch (err) {
            break;
          }
        }
        await sleep(1000);
      }

      if (stateRawEmails.length === 0) {
        appendLog(`ℹ️ No raw emails found for ${currentState}. Moving to next region.`);
        continue;
      }

      // 🔥 स्टेप 1: ऑटो-क्लीनर (स्टेट का सारा रॉ डेटा यहाँ सिंटैक्स और डुप्लीकेट फिल्टर से साफ़ होगा)
      if (statusEl.current) {
        statusEl.current.innerText = `Auto-Cleaning: ${currentState}...`;
      }

      appendLog(`🧹 Running Auto-Cleaner on ${stateRawEmails.length} raw hits for ${currentState}...`);
      
      const rawBlobString = stateRawEmails.join("\n");
      const cleanedResult = cleanAndFilterLeads(rawBlobString);
      const syntaxCleanedList = cleanedResult.validEmails;

      const cleanedCountAdded = syntaxCleanedList.length;
      statsRef.current.cleaned += cleanedCountAdded;
      if (cleanCountEl.current) {
        cleanCountEl.current.innerText = statsRef.current.cleaned.toLocaleString();
      }

      appendLog(`✨ Auto-Cleaner filtered down to ${cleanedCountAdded} pristine unique syntax leads.`);

      if (syntaxCleanedList.length === 0) {
        appendLog(`ℹ️ No valid syntax leads after cleaning for ${currentState}. Moving next.`);
        continue;
      }

      // 🔥 स्टेप 2: DNS / MX वेरीफायर पाइपलाइन (अब साफ़ किए गए डेटा पर पिंग मारेगी)
      if (statusEl.current) {
        statusEl.current.innerText = `Verifying DNS/MX: ${currentState}...`;
      }

      appendLog(`⚙️ Running Live DNS/MX verification pipeline for ${currentState}...`);

      const dnsStartTime = Date.now();
      const stateVerified = await runDnsMxVerifyPipeline(syntaxCleanedList, currentState);

      stateVerified.forEach((mail) => masterSetRef.current.add(mail));

      if (masterTextareaEl.current) {
        masterTextareaEl.current.value = Array.from(masterSetRef.current).join("\n");
      }

      statsRef.current.mx = masterSetRef.current.size;
      statsRef.current.statesDone = sIdx + 1;

      if (mxCountEl.current) {
        mxCountEl.current.innerText = statsRef.current.mx.toLocaleString();
      }
      if (stateCountEl.current) {
        stateCountEl.current.innerText = `${statsRef.current.statesDone} / ${selectedStates.length}`;
      }

      appendLog(`✅ ${currentState} Done: +${stateVerified.length} deliverable verified leads added`, true);

      const dnsDurationSec = (Date.now() - dnsStartTime) / 1000;
      if (sIdx + 1 < selectedStates.length && !stopSignalRef.current && dnsDurationSec < 12) {
        await sleep(Math.floor(Math.random() * 2000) + 4000);
      }
    }

    deactivateBackgroundEngine();
    setIsRunning(false);

    if (statusEl.current) statusEl.current.innerText = "Mission Accomplished";
    appendLog(`🎉 ALL DONE: Total ${masterSetRef.current.size} verified deliverable leads ready!`, true);
  };

  const handleStop = () => {
    stopSignalRef.current = true;
    deactivateBackgroundEngine();
    setIsRunning(false);
    if (statusEl.current) statusEl.current.innerText = "Halted by User";
    appendLog("🛑 Process stopped by user.", true);
  };

  return (
    <div className="min-h-screen bg-[#07090e] text-slate-100 pb-20">
      <div className="max-w-6xl mx-auto px-4 pt-8 md:pt-12 space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-6">
          <div>
            <div className="flex items-center gap-3">
              <span className="flex h-3 w-3 relative">
                <span
                  className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                    isRunning ? "bg-emerald-400" : "bg-slate-500"
                  }`}
                />
                <span
                  className={`relative inline-flex rounded-full h-3 w-3 ${
                    isRunning ? "bg-emerald-500" : "bg-slate-600"
                  }`}
                />
              </span>
              <h1 className="text-2xl md:text-3xl font-black tracking-tight bg-gradient-to-r from-white via-slate-200 to-indigo-300 bg-clip-text text-transparent">
                Lead Harvester Matrix (Auto-Clean & DNS Engine)
              </h1>
            </div>
            <p className="text-xs text-slate-400 mt-1.5 font-medium">
              Multi-API Rotation • 10-Page Chunks • Auto-Cleaner • DNS/MX Verified Pipeline
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleStartAutoPilot}
              disabled={isRunning}
              className="px-6 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 text-white shadow-lg shadow-indigo-600/25 disabled:opacity-40 transition active:scale-95 cursor-pointer"
            >
              {isRunning ? "Engine Running..." : "⚡ Launch Harvester"}
            </button>
            {isRunning && (
              <button
                onClick={handleStop}
                className="px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider bg-rose-600/20 text-rose-300 border border-rose-500/30 hover:bg-rose-600 hover:text-white transition active:scale-95 cursor-pointer"
              >
                Abort
              </button>
            )}
          </div>
        </div>

        {/* Live Counters */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-slate-900/60 border border-slate-800/80 p-4 rounded-2xl">
            <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
              Raw Harvested
            </span>
            <span ref={rawCountEl} className="text-2xl font-black font-mono text-slate-200">
              0
            </span>
          </div>

          <div className="bg-slate-900/60 border border-slate-800/80 p-4 rounded-2xl">
            <span className="text-[10px] uppercase font-bold text-amber-400/90 block mb-1">
              Syntax Cleaned
            </span>
            <span ref={cleanCountEl} className="text-2xl font-black font-mono text-amber-300">
              0
            </span>
          </div>

          <div className="bg-slate-900/60 border border-emerald-900/40 p-4 rounded-2xl shadow-lg shadow-emerald-950/20">
            <span className="text-[10px] uppercase font-bold text-emerald-400 block mb-1">
              MX Verified (Live)
            </span>
            <span ref={mxCountEl} className="text-2xl font-black font-mono text-emerald-300">
              0
            </span>
          </div>

          <div className="bg-slate-900/60 border border-slate-800/80 p-4 rounded-2xl">
            <span className="text-[10px] uppercase font-bold text-indigo-400 block mb-1">
              Regions Done
            </span>
            <span ref={stateCountEl} className="text-2xl font-black font-mono text-indigo-300">
              0 / {selectedStates.length}
            </span>
            <div ref={statusEl} className="text-[10px] text-slate-500 mt-2 truncate">
              Idle
            </div>
          </div>
        </div>

        {/* Campaign Settings */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-5 space-y-5">
            <h2 className="text-xs uppercase tracking-widest font-bold text-slate-300 flex items-center gap-2">
              <span className="text-indigo-400">⚙</span> Campaign Setup
            </h2>

            <div>
              <label className="text-[11px] font-semibold text-slate-400 block mb-1.5">
                Target Niche / Industry
              </label>
              <input
                type="text"
                value={niche}
                onChange={(e) => setNiche(e.target.value)}
                disabled={isRunning}
                placeholder="e.g. Vacation Rental, Construction"
                className="w-full bg-[#0a0d14] border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-400 block mb-1.5">
                Target Country
              </label>
              <select
                value={selectedCountryKey}
                disabled={isRunning}
                onChange={(e) => handleCountryChange(e.target.value)}
                className="w-full bg-[#0a0d14] border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white outline-none cursor-pointer"
              >
                {Object.entries(GEO_DIRECTORY).map(([key, data]) => (
                  <option key={key} value={key}>
                    {data.name} ({data.regions.length} Regions)
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="md:col-span-2 bg-slate-900/40 border border-slate-800/80 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xs uppercase tracking-widest font-bold text-slate-300 flex items-center gap-2">
                  <span className="text-indigo-400">🗺</span> Territory Selection
                </h2>
                <span className="text-[10px] text-slate-400 mt-0.5 block">
                  {selectedStates.length} of {GEO_DIRECTORY[selectedCountryKey]?.regions.length || 0} regions selected
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <button
                  type="button"
                  disabled={isRunning}
                  onClick={handleSelectAllStates}
                  className="px-2.5 py-1 bg-slate-800/60 hover:bg-slate-800 text-slate-300 rounded-lg text-[10px] cursor-pointer"
                >
                  Select All
                </button>
                <button
                  type="button"
                  disabled={isRunning}
                  onClick={handleClearAllStates}
                  className="px-2.5 py-1 bg-slate-800/60 hover:bg-slate-800 text-slate-400 hover:text-rose-300 rounded-lg text-[10px] cursor-pointer"
                >
                  Clear
                </button>
              </div>
            </div>

            <div className="max-h-40 overflow-y-auto bg-[#0a0d14]/70 border border-slate-800/90 rounded-xl p-3 flex flex-wrap gap-1.5">
              {GEO_DIRECTORY[selectedCountryKey]?.regions.map((region) => {
                const isChecked = selectedStates.includes(region);
                return (
                  <button
                    key={region}
                    type="button"
                    disabled={isRunning}
                    onClick={() => toggleState(region)}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition border cursor-pointer ${
                      isChecked
                        ? "bg-indigo-600/25 border-indigo-500/80 text-indigo-200"
                        : "bg-slate-950/60 border-slate-800/80 text-slate-400 hover:border-slate-700"
                    }`}
                  >
                    {isChecked ? "✓ " : "+ "}
                    {region}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Target Footprints & Decision Makers */}
        <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-xs uppercase tracking-widest font-bold text-slate-300 flex items-center gap-2">
                <span className="text-emerald-400">🎯</span> Target Footprints ({selectedProviders.length} Active)
              </h2>
              <p className="text-[11px] text-slate-400 mt-0.5">
                चुनें कि आपको कौन से ईमेल प्रीफिक्स या डोमेन स्क्रैप करने हैं:
              </p>
            </div>
            <div className="w-full sm:w-64">
              <input
                type="text"
                value={customTagInput}
                disabled={isRunning}
                onChange={(e) => setCustomTagInput(e.target.value)}
                onKeyDown={handleAddCustomTag}
                placeholder="Type & hit enter (e.g. director@)"
                className="w-full bg-[#0a0d14] border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            {PRESET_OPTIONS.map((item) => {
              const isSelected = selectedProviders.includes(item);
              return (
                <button
                  key={item}
                  type="button"
                  disabled={isRunning}
                  onClick={() => toggleProvider(item)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-mono font-medium transition border cursor-pointer ${
                    isSelected
                      ? "bg-emerald-600/20 border-emerald-500 text-emerald-300 shadow-sm shadow-emerald-500/10"
                      : "bg-[#0a0d14] border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-300"
                  }`}
                >
                  {isSelected ? "✓ " : "+ "}
                  {item}
                </button>
              );
            })}
          </div>
        </div>

        {/* Master Output Bucket & Console Logs */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 bg-slate-900/40 border border-emerald-950/60 rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs uppercase tracking-widest font-bold text-emerald-400 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-400" /> Master Deliverable Leads Bucket
              </h2>
              <button
                type="button"
                onClick={handleCopyAll}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-[10px] font-bold uppercase transition cursor-pointer"
              >
                {copied ? "✓ Copied!" : "📋 Copy Clean List"}
              </button>
            </div>

            <textarea
              ref={masterTextareaEl}
              readOnly
              rows={9}
              placeholder="Verified leads will stream here live..."
              className="w-full bg-[#080b11] border border-emerald-950/80 rounded-xl p-3.5 text-xs font-mono text-emerald-300/90 outline-none resize-none focus:border-emerald-500/50"
            />
          </div>

          <div className="lg:col-span-5 bg-slate-900/40 border border-slate-800/80 rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs uppercase tracking-widest font-bold text-slate-300 flex items-center gap-2">
                <span className="text-indigo-400">_</span> Live Engine Logs
              </h2>
              <span ref={liveDnsEl} className="text-[10px] font-mono text-indigo-400 animate-pulse truncate max-w-[180px]" />
            </div>

            <div
              ref={logContainerEl}
              className="h-[210px] overflow-y-auto bg-[#080b11] border border-slate-800/80 rounded-xl p-3.5 text-[11px] font-mono space-y-1.5 shadow-inner"
            >
              <div className="text-slate-600">System standby. Ready to launch.</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}