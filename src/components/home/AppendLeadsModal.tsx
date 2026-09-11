import React from "react";

interface AppendLeadsModalProps {
  isOpen: boolean;
  onClose: () => void;
  appendLeadInput: string;
  setAppendLeadInput: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
}

export default function AppendLeadsModal({
  isOpen,
  onClose,
  appendLeadInput,
  setAppendLeadInput,
  onSubmit,
}: AppendLeadsModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fadeIn">
      <div className="bg-slate-900 border border-indigo-500/40 w-full max-w-lg rounded-3xl p-6 shadow-2xl space-y-4">
        <div className="flex justify-between items-center border-b border-slate-800 pb-3">
          <h3 className="text-sm font-black text-indigo-300 uppercase tracking-wider flex items-center gap-2">
            <span>➕</span> Add More Leads to Running Queue
          </h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white text-sm bg-slate-800 px-2.5 py-1 rounded-lg cursor-pointer"
          >
            ✕ Close
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          <p className="text-xs text-slate-400">
            Paste your new lead emails below. They will be automatically sanitized, checked, and appended directly to your active queue without losing any progress or resetting counts!
          </p>
          <textarea
            required
            rows={6}
            value={appendLeadInput}
            onChange={(e) => setAppendLeadInput(e.target.value)}
            placeholder="newlead1@example.com&#10;newlead2@example.com"
            className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs font-mono text-slate-200 outline-none focus:border-indigo-500 resize-none"
          />
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs font-bold cursor-pointer hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold cursor-pointer shadow-lg"
            >
              Append Leads
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}