// src/components/Footer.tsx
import React from "react";
import Link from "next/link";

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="w-full bg-slate-950 border-t border-slate-900 py-6 px-4 sm:px-6 mt-6 font-sans">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-center md:text-left">
        
        {/* Left: Logo & Branding */}
        <div className="flex items-center gap-3 justify-center md:justify-start">
          <img 
            src="/favicon.svg" 
            alt="InboxSend Logo" 
            className="w-6 h-6 object-contain" 
          />
          <div>
            <span className="text-xs font-black bg-gradient-to-r from-blue-400 via-indigo-300 to-purple-400 bg-clip-text text-transparent">
              InboxSend Multi-Account Rotator
            </span>
            <p className="text-[10px] text-slate-500 font-mono">
              Enterprise-Grade Secure Outreach Engine
            </p>
          </div>
        </div>

        {/* Center: Quick Links & Support Team Info */}
        <div className="flex flex-wrap items-center justify-center gap-3 text-xs font-medium text-slate-400">
          <Link href="/" className="hover:text-indigo-400 transition cursor-pointer">
            Dashboard
          </Link>
          <span>•</span>
          <Link href="/vault" className="hover:text-indigo-400 transition cursor-pointer">
            Senders Vault
          </Link>
          <span>•</span>
          <span className="text-slate-300 font-semibold">Support: 
            <a href="mailto:inboxsend.support@gmail.com" className="text-indigo-400 hover:underline ml-1">inboxsend.support@gmail.com</a>
          </span>
          <span>•</span>
          <span className="text-slate-300 font-semibold">
            📞 <a href="tel:+918266821377" className="text-emerald-400 hover:underline ml-1">+91 82668 21377</a>
          </span>
        </div>

        {/* Right: Copyright */}
        <div className="text-[11px] text-slate-500 font-mono">
          © {currentYear} InboxSend. All rights reserved.
        </div>

      </div>
    </footer>
  );
}