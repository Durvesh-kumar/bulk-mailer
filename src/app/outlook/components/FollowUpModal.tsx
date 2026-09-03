// src/components/FollowUpModal.tsx
"use client";

import React, { useState } from "react";

interface FollowUpModalProps {
  currentReminder?: string;
  onSave: (days: number) => void;
  onClose: () => void;
}

export default function FollowUpModal({ currentReminder, onSave, onClose }: FollowUpModalProps) {
  const [reminderDays, setReminderDays] = useState<number>(2);

  return (
    <div className="bg-amber-950/40 border-b border-amber-800/60 p-3 flex items-center justify-between shrink-0">
      <div className="flex items-center gap-2 text-xs text-amber-200">
        <span>{currentReminder ? "Update Reminder in:" : "Remind me in:"}</span>
        <select
          value={reminderDays}
          onChange={(e) => setReminderDays(Number(e.target.value))}
          className="bg-slate-950 border border-amber-700 rounded px-2 py-1 text-amber-300 font-semibold cursor-pointer"
        >
          <option value={1}>1 Day (Tomorrow)</option>
          <option value={2}>2 Days</option>
          <option value={3}>3 Days</option>
          <option value={7}>1 Week (Next Week)</option>
        </select>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onSave(reminderDays)}
          className="bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold px-3 py-1 rounded cursor-pointer shadow"
        >
          Save Reminder
        </button>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-white text-xs px-2 py-1 cursor-pointer"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}