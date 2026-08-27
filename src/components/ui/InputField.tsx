// src/components/ui/InputField.tsx
"use client";

import React, { useState } from "react";

interface InputFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  isPassword?: boolean;
  accentColor?: "indigo" | "amber" | "emerald";
}

export const InputField: React.FC<InputFieldProps> = ({
  label,
  type = "text",
  isPassword = false,
  accentColor = "indigo",
  className = "",
  ...props
}) => {
  const [showPassword, setShowPassword] = useState(false);

  // कलर के हिसाब से स्टाइलिंग
  const colorMap = {
    indigo: "text-white focus:border-indigo-500",
    amber: "text-amber-300 font-mono focus:border-indigo-500",
    emerald: "text-emerald-300 focus:border-emerald-500",
  };

  const inputType = isPassword ? (showPassword ? "text" : "password") : type;

  return (
    <div className="w-full space-y-1">
      {label && (
        <div className="flex justify-between items-center">
          <label className="text-[11px] font-bold text-slate-300 block">{label}</label>
          {isPassword && (
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="text-[9px] text-slate-400 hover:text-white cursor-pointer transition"
            >
              {showPassword ? "🙈 Hide" : "👁️ Show"}
            </button>
          )}
        </div>
      )}

      <div className="relative flex items-center">
        <input
          type={inputType}
          className={`w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs outline-none transition disabled:opacity-50 ${colorMap[accentColor]} ${className}`}
          {...props}
        />
      </div>
    </div>
  );
};