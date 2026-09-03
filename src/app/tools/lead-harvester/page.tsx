"use client";

import React, { useState, useRef, useEffect } from "react";
import { Play, Square, ShieldCheck, Cpu, Layers, Briefcase, Globe2, Terminal, Trash2 } from "lucide-react";

interface LogEntry {
  id: string;
  time: string;
  type: "info" | "crawl" | "found" | "test" | "success" | "warn" | "db" | "error";
  text: string;
}

const SERVICES = [
  "Automated Online Booking & Instant Slot Scheduling System",
  "Custom Web Application & Interactive Customer Portal",
  "Mobile Application for Clients & Staff (iOS & Android)",
  "E-Commerce Store, Inventory & One-Click Payment Flow",
  "Custom CRM, Staff Dashboard & Business Management System",
  "Website Speed & Core Web Vitals 2x Conversion Boost",
];

const ALL_CATEGORIES = [
  "Car Clinic, Auto Repair & Collision Centers",
  "Luxury Car Detailing, PPF & Ceramic Coating",
  "Dental Clinics & Cosmetic Dentists",
  "Gyms, Crossfit Boxes & Fitness Franchises",
  "Roofing, Solar & Gutter Contractors",
  "Fine Dining Restaurants, Cafes & Cloud Kitchen Chains",
  "Logistics, Freight Brokers & Warehousing",
];

// 🌍 बैकएंड ओवरपास और डायरेक्टरी के सभी 19 देश
const ALL_COUNTRIES = [
  "United States (USA)",
  "Canada",
  "United Kingdom (UK)",
  "Ireland",
  "Germany",
  "Netherlands",
  "Switzerland",
  "France",
  "Sweden",
  "Norway",
  "United Arab Emirates (Dubai & Abu Dhabi)",
  "Saudi Arabia (Riyadh & Jeddah)",
  "Qatar (Doha)",
  "Kuwait",
  "Australia",
  "New Zealand",
  "Japan (Tokyo & Osaka)",
  "Singapore",
  "India (Metro & IT Tech Hubs)",
];

export default function LeadHarvesterMultiSource() {
  const [selectedService, setSelectedService] = useState(SERVICES[0]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([ALL_CATEGORIES[0]]);
  const [selectedCountries, setSelectedCountries] = useState<string[]>([ALL_COUNTRIES[0]]);
  const [isRunning, setIsRunning] = useState(false);
  const isStopRef = useRef(false);

  const [stats, setStats] = useState({ domainsScanned: 0, rawFound: 0, verified: 0, saved: 0 });
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const terminalEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const addLog = (type: LogEntry["type"], text: string) => {
    setLogs((prev) => [
      ...prev,
      { id: Math.random().toString(36).substring(2, 9), time: new Date().toLocaleTimeString(), type, text }
    ]);
  };

  const toggleSelectAllCountries = () => {
    if (selectedCountries.length === ALL_COUNTRIES.length) {
      setSelectedCountries([]);
    } else {
      setSelectedCountries([...ALL_COUNTRIES]);
    }
  };

  const toggleSelectAllCategories = () => {
    if (selectedCategories.length === ALL_CATEGORIES.length) {
      setSelectedCategories([]);
    } else {
      setSelectedCategories([...ALL_CATEGORIES]);
    }
  };

  const handleStartHarvester = async () => {
    if (selectedCategories.length === 0 || selectedCountries.length === 0) {
      return alert("Select at least 1 niche & 1 country!");
    }

    setIsRunning(true);
    isStopRef.current = false;
    setLogs([]);
    setStats({ domainsScanned: 0, rawFound: 0, verified: 0, saved: 0 });

    const totalCombinations = selectedCategories.length * selectedCountries.length;
    addLog("info", `🚀 Starting Multi-Source Pipeline (${totalCombinations} combinations)...`);

    let curScanned = 0;
    let curRaw = 0;
    let curVerified = 0;
    let curSaved = 0;
    let comboIndex = 0;

    // ⚡ सेशन के दौरान स्कैन किए गए सभी डोमेन की हिस्ट्री (ताकि डुप्लीकेट कभी न आएं)
    let sessionScannedHistory: string[] = [];

    for (const country of selectedCountries) {
      for (const cat of selectedCategories) {
        if (isStopRef.current) break;
        comboIndex++;
        addLog("info", `[TARGET ${comboIndex}/${totalCombinations}] [${cat}] in [${country}]`);

        let pendingDomains: string[] = [];
        let hasMore = true;
        let pageIndex = 0;
        const MAX_PAGES_PER_TARGET = 3; // प्रति निच/कंट्री अधिकतम 3 फ्रेश पेज (जरूरत अनुसार बढ़ा सकते हैं)

        // 🔄 40-सेकंड चंक्स और ऑटो-रिज्यूम लूप
        while (hasMore && !isStopRef.current) {
          try {
            const res = await fetch("/api/leads/auto-harvest", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                serviceType: selectedService,
                nicheCategory: cat,
                country,
                pageIndex,
                scannedHistory: sessionScannedHistory,
                pendingDomains, // अगर 40s कटऑफ पर डोमेन बचे थे तो वही रिज्यूम होंगे
              }),
            });

            const data = await res.json();

            if (data.success) {
              curScanned += data.scannedCount || 0;
              curRaw += data.rawFound || 0;
              curVerified += data.verified || 0;
              curSaved += data.saved || 0;

              setStats({
                domainsScanned: curScanned,
                rawFound: curRaw,
                verified: curVerified,
                saved: curSaved,
              });

              // स्कैन हुए डोमेन को ग्लोबल हिस्ट्री में पुश करें
              if (Array.isArray(data.scannedDomains)) {
                sessionScannedHistory = [...sessionScannedHistory, ...data.scannedDomains];
              }

              // टर्मिनल लॉग्स पार्सिंग
              (data.logs || []).forEach((logText: string) => {
                if (logText.includes("MX VALID")) addLog("success", logText);
                else if (logText.includes("DB SAVED")) addLog("db", logText);
                else if (logText.includes("SKIP") || logText.includes("DEAD")) addLog("warn", logText);
                else if (logText.includes("TIME CUTOFF")) addLog("info", logText);
                else addLog("crawl", logText);
              });

              // ⚡ अगर पिछले चंक से बचे हुए डोमेन अभी भी बाकी हैं:
              if (data.hasMore && data.remainingDomains && data.remainingDomains.length > 0) {
                pendingDomains = data.remainingDomains;
                hasMore = true;
                addLog("info", `🔁 Resuming next chunk with ${pendingDomains.length} remaining domains...`);
              } else {
                // वर्तमान चंक पूरा हुआ -> अगले पेज इंडेक्स पर बढ़ें
                pendingDomains = [];
                pageIndex++;
                hasMore = pageIndex < MAX_PAGES_PER_TARGET;
              }
            } else {
              addLog("error", `Server Error: ${data.error || "Execution failed"}`);
              break;
            }
          } catch (err: any) {
            addLog("error", `Network Error: ${err.message}`);
            break;
          }

          // सर्वर और IP को 600ms का कूलडाउन गैप
          await new Promise((r) => setTimeout(r, 600));
        }
      }
      if (isStopRef.current) break;
    }

    setIsRunning(false);
    addLog("success", `🎉 Pipeline Completed! Total Fresh Leads Saved in DB: ${curSaved}`);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="border-b border-slate-800 pb-5 flex flex-col sm:flex-row justify-between items-center gap-3">
          <div>
            <span className="text-xs text-emerald-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
              <Cpu className="w-4 h-4" /> Multi-Source Aggregation Engine
            </span>
            <h1 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-2 mt-1">
              <ShieldCheck className="w-8 h-8 text-emerald-400" /> High-Scale Autonomous Lead Harvester
            </h1>
          </div>
          <span className={`px-3.5 py-1.5 rounded-full text-xs font-mono font-bold border ${isRunning ? "bg-emerald-950/60 border-emerald-500 text-emerald-400 animate-pulse" : "bg-slate-900 border-slate-800 text-slate-400"}`}>
            {isRunning ? "HARVESTING 5 SOURCES ACTIVE" : "IDLE"}
          </span>
        </div>

        {/* Offer Dropdown */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
          <label className="text-xs text-slate-300 font-bold flex items-center gap-1.5 mb-2">
            <Briefcase className="w-4 h-4 text-indigo-400" /> Core Pitch Offer
          </label>
          <select value={selectedService} onChange={(e) => setSelectedService(e.target.value)} disabled={isRunning} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-slate-200 outline-none">
            {SERVICES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {/* Selectors */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-6 bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-slate-200 flex items-center gap-2">
                <Layers className="w-4 h-4 text-emerald-400" /> Select Niches ({selectedCategories.length}/{ALL_CATEGORIES.length})
              </span>
              <button 
                type="button" 
                onClick={toggleSelectAllCategories}
                disabled={isRunning}
                className="text-[11px] text-emerald-400 hover:underline"
              >
                {selectedCategories.length === ALL_CATEGORIES.length ? "Deselect All" : "Select All"}
              </button>
            </div>
            <div className="max-h-56 overflow-y-auto flex flex-wrap gap-2 pr-1">
              {ALL_CATEGORIES.map((c) => (
                <button 
                  key={c} 
                  type="button" 
                  disabled={isRunning}
                  onClick={() => setSelectedCategories(selectedCategories.includes(c) ? selectedCategories.filter(x => x !== c) : [...selectedCategories, c])} 
                  className={`px-3 py-1.5 rounded-xl text-xs border transition ${selectedCategories.includes(c) ? "bg-emerald-950/80 border-emerald-500 text-emerald-300" : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700"}`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div className="lg:col-span-6 bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-slate-200 flex items-center gap-2">
                <Globe2 className="w-4 h-4 text-blue-400" /> Select Countries ({selectedCountries.length}/{ALL_COUNTRIES.length})
              </span>
              <button 
                type="button" 
                onClick={toggleSelectAllCountries}
                disabled={isRunning}
                className="text-[11px] text-blue-400 hover:underline"
              >
                {selectedCountries.length === ALL_COUNTRIES.length ? "Deselect All" : "Select All (19)"}
              </button>
            </div>
            <div className="max-h-56 overflow-y-auto flex flex-wrap gap-2 pr-1">
              {ALL_COUNTRIES.map((ct) => (
                <button 
                  key={ct} 
                  type="button" 
                  disabled={isRunning}
                  onClick={() => setSelectedCountries(selectedCountries.includes(ct) ? selectedCountries.filter(x => x !== ct) : [...selectedCountries, ct])} 
                  className={`px-3 py-1.5 rounded-xl text-xs border transition ${selectedCountries.includes(ct) ? "bg-blue-950/80 border-blue-500 text-blue-300" : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700"}`}
                >
                  {ct}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Action Button */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex flex-col sm:flex-row justify-between items-center gap-3">
          <span className="text-xs text-slate-400">Total Execution: <strong className="text-emerald-400">{selectedCategories.length * selectedCountries.length} Targets</strong></span>
          {isRunning ? (
            <button onClick={() => { isStopRef.current = true; }} className="w-full sm:w-auto px-8 py-3 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition"><Square className="w-4 h-4 fill-current" /> Stop Process</button>
          ) : (
            <button onClick={handleStartHarvester} className="w-full sm:w-auto px-10 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg transition"><Play className="w-4 h-4 fill-current" /> Launch Multi-Source Harvester</button>
          )}
        </div>

        {/* Live Counters */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-xl text-center"><span className="text-[10px] text-blue-400 uppercase block">Domains Scanned</span><p className="text-xl font-bold font-mono text-blue-400 mt-1">{stats.domainsScanned}</p></div>
          <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-xl text-center"><span className="text-[10px] text-amber-400 uppercase block">Raw Candidates</span><p className="text-xl font-bold font-mono text-amber-400 mt-1">{stats.rawFound}</p></div>
          <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-xl text-center"><span className="text-[10px] text-emerald-400 uppercase block">MX Verified</span><p className="text-xl font-bold font-mono text-emerald-400 mt-1">{stats.verified}</p></div>
          <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-xl text-center"><span className="text-[10px] text-indigo-400 uppercase block">Saved to DB</span><p className="text-xl font-bold font-mono text-indigo-300 mt-1">{stats.saved}</p></div>
        </div>

        {/* Live Terminal */}
        <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="bg-slate-900 px-4 py-2.5 border-b border-slate-800 flex justify-between items-center">
            <span className="text-xs font-mono font-bold text-slate-400 flex items-center gap-1.5"><Terminal className="w-3.5 h-3.5 text-indigo-400" /> Multi-Source Live Stream Console</span>
            <button onClick={() => setLogs([])} className="text-[11px] text-slate-400 hover:text-slate-200 flex items-center gap-1 bg-slate-950 border border-slate-800 px-2.5 py-1 rounded-md"><Trash2 className="w-3 h-3" /> Clear</button>
          </div>
          <div className="p-4 h-[350px] overflow-y-auto font-mono text-xs space-y-1.5">
            {logs.map((log) => (
              <div key={log.id} className="flex items-start gap-2">
                <span className="text-slate-600 text-[10px]">[{log.time}]</span>
                <span className={log.type === "info" ? "text-blue-400 font-bold" : log.type === "success" ? "text-emerald-400 font-bold" : log.type === "db" ? "text-purple-300 font-bold" : log.type === "error" ? "text-rose-500 font-bold" : log.type === "warn" ? "text-rose-400/80" : "text-slate-400"}>{log.text}</span>
              </div>
            ))}
            <div ref={terminalEndRef} />
          </div>
        </div>

      </div>
    </div>
  );
}