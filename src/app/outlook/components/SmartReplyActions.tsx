"use client";

import React, { useState } from "react";
import { SESSION_TOKEN_KEY } from "@/types/vault";

interface SmartReplyActionsProps {
  machineId?: string;
  fromEmail: string;          // क्लाइंट का ईमेल
  accountEmail: string;       // आपका लॉगिन ईमेल
  appPassword?: string;       // आपका वॉल्ट से आया एनक्रिप्टेड पासवर्ड
  fromName?: string;
  subject: string;
  currentUid?: number;
  emailText: string;
  previousOutreach?: string;
  onReplyGenerated: (reply: string) => void;
  disabled?: boolean;
}

export default function SmartReplyActions({
  machineId,
  fromEmail,
  accountEmail,
  appPassword,
  fromName,
  subject,
  currentUid,
  emailText,
  previousOutreach,
  onReplyGenerated,
  disabled = false,
}: SmartReplyActionsProps) {
  const [loadingType, setLoadingType] = useState<"quick" | "thread" | null>(null);

  const getSessionToken = () => {
    return typeof window !== "undefined" ? localStorage.getItem(SESSION_TOKEN_KEY) || "" : "";
  };

  // 1. Quick Reply
  const handleQuickReply = async () => {
    setLoadingType("quick");
    try {
      const res = await fetch("/api/inbox/ai-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          machineId,
          sessionToken: getSessionToken(),
          emailText,
          subject,
          clientName: fromName || fromEmail,
          previousOutreach: previousOutreach || "No previous outreach context provided.",
        }),
      });

      const data = await res.json();
      if (data.success && data.analysis?.suggestedReply) {
        onReplyGenerated(data.analysis.suggestedReply);
      } else {
        alert("AI Error: " + (data.error || "Could not generate reply."));
      }
    } catch (err: any) {
      alert("Network Error: " + err.message);
    } finally {
      setLoadingType(null);
    }
  };

  // 2. Thread Reply
  const handleThreadReply = async () => {
    setLoadingType("thread");
    try {
      let previousContext = previousOutreach || "Previous sent outreach message context";

      try {
        const historyRes = await fetch("/api/inbox/thread-history", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            machineId,
            sessionToken: getSessionToken(),
            email: accountEmail, // आपका अपना वॉल्ट ईमेल
            appPassword,         // आपका वॉल्ट पासवर्ड
            subject,
            currentUid,
          }),
        });

        const historyData = await historyRes.json();
        if (historyRes.ok && historyData.success && historyData.lastMessage?.text) {
          previousContext = historyData.lastMessage.text;
        } else if (!historyRes.ok) {
          console.warn("Thread history non-200:", historyData.error);
        }
      } catch (err) {
        console.warn("Thread history fallback used:", err);
      }

      const res = await fetch("/api/inbox/ai-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          machineId,
          sessionToken: getSessionToken(),
          emailText,
          subject,
          clientName: fromName || fromEmail,
          previousOutreach: previousContext,
        }),
      });

      const data = await res.json();
      if (data.success && data.analysis?.suggestedReply) {
        onReplyGenerated(data.analysis.suggestedReply);
      } else {
        alert("AI Error: " + (data.error || "Could not generate reply."));
      }
    } catch (err: any) {
      alert("Network Error: " + err.message);
    } finally {
      setLoadingType(null);
    }
  };

  const isBusy = disabled || loadingType !== null;

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleQuickReply}
        disabled={isBusy}
        className="bg-slate-800 hover:bg-slate-700 border border-slate-700 disabled:opacity-50 text-slate-200 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg transition shadow flex items-center gap-1 cursor-pointer"
      >
        {loadingType === "quick" ? "Thinking..." : "⚡ Quick Reply"}
      </button>

      <button
        type="button"
        onClick={handleThreadReply}
        disabled={isBusy}
        className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-[11px] font-bold px-2.5 py-1.5 rounded-lg transition shadow flex items-center gap-1 cursor-pointer"
      >
        {loadingType === "thread" ? "Analyzing Thread..." : "✨ AI Thread Reply"}
      </button>
    </div>
  );
}