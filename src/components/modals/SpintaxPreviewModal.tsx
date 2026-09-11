// src/components/modals/SpintaxPreviewModal.tsx
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { GREETINGS, OPENERS, SIGN_OFFS } from "@/lib/ctaConfig";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  template: string;
  templates?: string[]; // ⚡ मल्टी-टेम्पलेट सपोर्ट
  subject?: string;
  subjects?: string[]; // ⚡ मल्टी-सब्जेक्ट सपोर्ट
  senderName: string;
  customSignoffName: string;
}

export default function SpintaxPreviewModal({
  isOpen,
  onClose,
  template,
  templates,
  subject,
  subjects,
  senderName,
  customSignoffName,
}: Props) {
  const [activeTab, setActiveTab] = useState(0);

  const pickRandom = (arr: string[]): string => arr[Math.floor(Math.random() * arr.length)];

  // 🎲 Spintax + Multi-Subject + Multi-Template Preview Generator
  const generateSamples = useCallback(() => {
    const cleanHeaderName = (senderName || "Team").trim();
    const finalSignoffName =
      customSignoffName && customSignoffName.trim().length > 0
        ? customSignoffName.trim()
        : cleanHeaderName;

    // स्पिंटैक्स सॉल्वर
    const resolveSpintax = (text: string) => {
      let resolved = text || "";
      const regex = /\{([^{}]+)\}/g;
      while (regex.test(resolved)) {
        resolved = resolved.replace(regex, (_, match) => {
          const choices = match.split("|");
          return choices[Math.floor(Math.random() * choices.length)];
        });
      }
      return resolved;
    };

    // 1. सभी एक्टिव और नॉन-एम्प्टी सब्जेक्ट्स इकट्ठा करें
    let allSubjects: string[] = [];
    if (subjects && Array.isArray(subjects)) {
      allSubjects = subjects.map((s) => s.trim()).filter((s) => s.length > 0);
    }
    if (allSubjects.length === 0 && subject && subject.trim().length > 0) {
      allSubjects = [subject.trim()];
    }
    if (allSubjects.length === 0) {
      allSubjects = ["Quick check-in regarding partnership"];
    }

    // 2. सभी एक्टिव और नॉन-एम्प्टी टेम्पलेट्स इकट्ठा करें (Multi-Template)
    let allTemplates: string[] = [];
    if (templates && Array.isArray(templates)) {
      allTemplates = templates.map((t) => (t || "").trim()).filter((t) => t.length > 0);
    }
    if (allTemplates.length === 0 && template && template.trim().length > 0) {
      allTemplates = [template.trim()];
    }
    if (allTemplates.length === 0) {
      allTemplates = ["Hi there, hope you are doing well."];
    }

    const samplesList = [];
    let previousSubjectIndex = -1;
    let previousTemplateIndex = -1;

    // 4 अलग-अलग вариации (Variations) सिमुलेट करें
    for (let i = 0; i < 4; i++) {
      const randomGreeting = pickRandom(GREETINGS);
      const randomOpener = pickRandom(OPENERS);
      const randomSignOff = pickRandom(SIGN_OFFS);

      // 🎯 No-Repeat Template Rotation Engine
      let templateIdx = 0;
      if (allTemplates.length === 1) {
        templateIdx = 0;
      } else if (allTemplates.length === 2) {
        templateIdx = previousTemplateIndex === 0 ? 1 : 0;
      } else {
        do {
          templateIdx = Math.floor(Math.random() * allTemplates.length);
        } while (templateIdx === previousTemplateIndex && allTemplates.length > 1);
      }
      previousTemplateIndex = templateIdx;
      const rawSelectedTemplate = allTemplates[templateIdx];

      const resolvedBody = resolveSpintax(rawSelectedTemplate);

      // 🎯 No-Repeat Subject Rotation Engine
      let subjectIdx = 0;
      if (allSubjects.length === 1) {
        subjectIdx = 0;
      } else if (allSubjects.length === 2) {
        subjectIdx = previousSubjectIndex === 0 ? 1 : 0;
      } else {
        do {
          subjectIdx = Math.floor(Math.random() * allSubjects.length);
        } while (subjectIdx === previousSubjectIndex && allSubjects.length > 1);
      }
      previousSubjectIndex = subjectIdx;
      const rawSelectedSubject = allSubjects[subjectIdx];

      const resolvedSubject = resolveSpintax(rawSelectedSubject);
      const sampleBody = `${randomGreeting}\n\n${randomOpener}\n\n${resolvedBody || "(Your message body will appear here)"}\n\n${randomSignOff}\n\n${finalSignoffName}`;

      samplesList.push({
        subject: resolvedSubject,
        body: sampleBody,
        subjectIndex: subjectIdx + 1,
        totalSubjects: allSubjects.length,
        templateIndex: templateIdx + 1,
        totalTemplates: allTemplates.length,
      });
    }

    return samplesList;
  }, [template, templates, subject, subjects, senderName, customSignoffName]);

  const [samples, setSamples] = useState(() => generateSamples());

  useEffect(() => {
    if (isOpen) {
      setSamples(generateSamples());
      setActiveTab(0);
    }
  }, [isOpen, generateSamples]);

  const handleReRoll = () => {
    setSamples(generateSamples());
  };

  if (!isOpen) return null;

  const currentSample = samples[activeTab];
  const activeSubjectCount = (subjects && subjects.filter((s) => s.trim().length > 0).length) || (subject ? 1 : 0);
  const activeTemplateCount = (templates && templates.filter((t) => t.trim().length > 0).length) || (template ? 1 : 0);

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
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-bold text-white tracking-wide">
                  Spintax & Multi-Template Rotation Inspector
                </h3>
                {activeSubjectCount > 1 || activeTemplateCount > 1 ? (
                  <span className="text-[10px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 px-2 py-0.5 rounded-md font-mono font-bold">
                    🔄 {activeSubjectCount} Subs / {activeTemplateCount} Temps Active
                  </span>
                ) : (
                  <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-md font-mono">
                    Single Mode
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Simulating exact layout with Greetings, Openers, No-Repeat Subject & Body Rotation
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
        <div className="px-5 py-3 bg-slate-950/30 border-b border-slate-800/60 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            {samples.map((s, idx) => (
              <button
                key={idx}
                onClick={() => setActiveTab(idx)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                  activeTab === idx
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm"
                    : "bg-slate-950/60 text-slate-400 hover:text-slate-200 border border-slate-900"
                }`}
              >
                <span>Variation #{idx + 1}</span>
                <span className="text-[9px] bg-indigo-900/60 text-indigo-300 px-1.5 py-0.2 rounded font-mono">
                  S{s.subjectIndex} • T{s.templateIndex}
                </span>
              </button>
            ))}
          </div>

          <button
            onClick={handleReRoll}
            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition shadow-lg flex items-center gap-1.5 cursor-pointer active:scale-95"
          >
            <span>🔄</span> Re-Roll Variations
          </button>
        </div>

        {/* Dynamic Preview Container */}
        <div className="p-5 overflow-y-auto max-h-[55vh] space-y-4 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-slate-800 [&::-webkit-scrollbar-thumb]:rounded-full">
          {currentSample ? (
            <div className="space-y-3.5 animate-fadeIn">
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Resolved Subject Line
                  </label>
                  <span className="text-[10px] text-indigo-400 font-mono">
                    (Subject Slot #{currentSample.subjectIndex} of {currentSample.totalSubjects})
                  </span>
                </div>
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono font-medium shadow-inner flex items-center justify-between">
                  <span className="truncate">{currentSample.subject || "(No Subject)"}</span>
                  <span className="text-[10px] text-slate-500 font-sans shrink-0 ml-2">Clean Text</span>
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Resolved Email Body (With Template #{currentSample.templateIndex} of {currentSample.totalTemplates})
                  </label>
                  <span className="text-[10px] text-emerald-400 font-mono">
                    Active Template T{currentSample.templateIndex}
                  </span>
                </div>
                <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 whitespace-pre-wrap leading-relaxed shadow-inner min-h-[140px] font-sans">
                  {currentSample.body || "(No Body Content Provided)"}
                </div>
              </div>
            </div>
          ) : (
            <div className="py-12 text-center text-slate-500 text-xs">
              No variations generated. Click Re-Roll above.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-800/80 bg-slate-950/40 flex items-center justify-between">
          <span className="text-[11px] text-emerald-400 font-sans flex items-center gap-1">
            <span>✨</span> 100% Synced with Multi-Subject & Multi-Template Rotation Engine
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