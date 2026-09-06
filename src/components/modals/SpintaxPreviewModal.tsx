// src/components/modals/SpintaxPreviewModal.tsx
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { GREETINGS, OPENERS, SIGN_OFFS } from "@/lib/ctaConfig";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  template: string;
  subject?: string;
  subjects?: string[];
  senderName: string;
  customSignoffName: string;
}

export default function SpintaxPreviewModal({
  isOpen,
  onClose,
  template,
  subject,
  subjects,
  senderName,
  customSignoffName,
}: Props) {
  const [activeTab, setActiveTab] = useState(0);

  const pickRandom = (arr: string[]): string => arr[Math.floor(Math.random() * arr.length)];

  // 🎲 Spintax + Subject Rotation Preview Generator
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

    // सभी एक्टिव और नॉन-एम्प्टी सब्जेक्ट्स इकट्ठा करें
    let allSubjects: string[] = [];
    if (subjects && Array.isArray(subjects)) {
      allSubjects = subjects.map((s) => s.trim()).filter((s) => s.length > 0);
    }
    if (allSubjects.length === 0 && subject && subject.trim().length > 0) {
      allSubjects = [subject.trim()];
    }

    const samplesList = [];
    let previousSubjectIndex = -1;

    for (let i = 0; i < 4; i++) {
      const randomGreeting = pickRandom(GREETINGS);
      const randomOpener = pickRandom(OPENERS);
      const randomSignOff = pickRandom(SIGN_OFFS);

      const resolvedBody = resolveSpintax(template);

      // 🎯 नो-रिपीट सब्जेक्ट रोटेशन इंजन
      let rawSelectedSubject = "(No Subject)";
      if (allSubjects.length === 1) {
        rawSelectedSubject = allSubjects[0];
      } else if (allSubjects.length === 2) {
        previousSubjectIndex = previousSubjectIndex === 0 ? 1 : 0;
        rawSelectedSubject = allSubjects[previousSubjectIndex];
      } else if (allSubjects.length > 2) {
        let nextIdx: number;
        do {
          nextIdx = Math.floor(Math.random() * allSubjects.length);
        } while (nextIdx === previousSubjectIndex);
        previousSubjectIndex = nextIdx;
        rawSelectedSubject = allSubjects[nextIdx];
      }

      const resolvedSubject = resolveSpintax(rawSelectedSubject);
      const sampleBody = `${randomGreeting}\n\n${randomOpener}\n\n${resolvedBody || "(Your message body will appear here)"}\n\n${randomSignOff}\n\n${finalSignoffName}`;

      samplesList.push({
        subject: resolvedSubject,
        body: sampleBody,
        subjectIndex: previousSubjectIndex >= 0 ? previousSubjectIndex + 1 : 1,
        totalSubjects: allSubjects.length,
      });
    }

    return samplesList;
  }, [template, subject, subjects, senderName, customSignoffName]);

  // ⚡ सारे React Hooks हमेशा सबसे ऊपर रहेंगे
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

  // ⚡ Hooks के बाद ही Early Return होगा
  if (!isOpen) return null;

  const currentSample = samples[activeTab];
  const activeSubjectCount = (subjects && subjects.filter((s) => s.trim().length > 0).length) || (subject ? 1 : 0);

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
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white tracking-wide">
                  Spintax & Rotation Inspector
                </h3>
                {activeSubjectCount > 1 ? (
                  <span className="text-[10px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 px-2 py-0.5 rounded-md font-mono font-bold">
                    🔄 {activeSubjectCount} Subjects Rotator Active
                  </span>
                ) : (
                  <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-md font-mono">
                    Single Subject Mode
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Simulating exact layout with Greetings, Openers, No-Repeat Subject Rotation & Sign-offs
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
                {s.totalSubjects > 1 && (
                  <span className="text-[9px] bg-indigo-900/60 text-indigo-300 px-1.5 py-0.2 rounded">
                    S{s.subjectIndex}
                  </span>
                )}
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
                  {currentSample.totalSubjects > 1 && (
                    <span className="text-[10px] text-indigo-400 font-mono">
                      (Picked Slot #{currentSample.subjectIndex} of {currentSample.totalSubjects})
                    </span>
                  )}
                </div>
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono font-medium shadow-inner flex items-center justify-between">
                  <span className="truncate">{currentSample.subject || "(No Subject)"}</span>
                  <span className="text-[10px] text-slate-500 font-sans shrink-0 ml-2">Clean Text</span>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                  Resolved Email Body (As Received by Lead with ctaConfig)
                </label>
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
            <span>✨</span> 100% Synced with Backend ctaConfig & Subject Rotation
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