"use client";

import React from "react";

interface ScheduleActionsProps {
  currentReminder?: string;
  onScheduleSelect: (days: number) => void;
  onCustomClick: () => void;
  disabled?: boolean;
}

export default function ScheduleActions({
  currentReminder,
  onScheduleSelect,
  onCustomClick,
  disabled = false,
}: ScheduleActionsProps) {
  return (
    <div className="flex items-center gap-1.5 bg-slate-900/90 p-1 rounded-lg border border-slate-800 shrink-0">
      <span className="text-[10px] text-slate-400 font-semibold px-1">
        ⏰ Schedule:
      </span>

      {/* 1. कल के लिए */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => onScheduleSelect(1)}
        className="bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 text-[10px] font-medium px-2 py-1 rounded transition cursor-pointer"
        title="Follow up tomorrow (+1 Day)"
      >
        +1 Day
      </button>

      {/* 2. 3 दिन बाद */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => onScheduleSelect(3)}
        className="bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 text-[10px] font-medium px-2 py-1 rounded transition cursor-pointer"
        title="Follow up in 3 days (+3 Days)"
      >
        +3 Days
      </button>

      {/* 3. 1 हफ्ते बाद */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => onScheduleSelect(7)}
        className="bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 text-[10px] font-medium px-2 py-1 rounded transition cursor-pointer"
        title="Follow up in 1 week (+7 Days)"
      >
        +1 Week
      </button>

      {/* 4. 1 महीने बाद */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => onScheduleSelect(30)}
        className="bg-amber-950/40 hover:bg-amber-900/60 text-amber-300 border border-amber-800/40 disabled:opacity-40 text-[10px] font-medium px-2 py-1 rounded transition cursor-pointer"
        title="Follow up next month (+30 Days)"
      >
        +1 Month
      </button>

      {/* 5. कस्टम कैलेंडर मोडल खोलने के लिए */}
      <button
        type="button"
        disabled={disabled}
        onClick={onCustomClick}
        className="bg-indigo-950/40 hover:bg-indigo-900/60 text-indigo-300 border border-indigo-800/40 disabled:opacity-40 text-[10px] font-medium px-2 py-1 rounded transition cursor-pointer"
        title="Pick Custom Date"
      >
        ⚙️ Custom
      </button>

      {currentReminder && (
        <span className="ml-1 text-[9px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded border border-amber-500/30">
          Due: {currentReminder}
        </span>
      )}
    </div>
  );
}