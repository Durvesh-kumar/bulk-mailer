// src/components/ReferralBanner.tsx
"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";

// 📱 Admin WhatsApp Contact
const ADMIN_WHATSAPP_NUMBER = "+918266821377"; 
// 📧 Admin Support / Referral Receiving Gmail
const ADMIN_EMAIL = "inboxsend.support@gmail.com";

export default function ReferralBanner() {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [appUrl, setAppUrl] = useState("");
  const [appDomain, setAppDomain] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      setAppUrl(window.location.origin);
      setAppDomain(window.location.hostname);
    }
  }, []);

  // 📝 Prospect Lead message to Admin
  const clientLeadToAdminMessage = 
`🚀 *INBOXFLOW SETUP & LIVE TRIAL REQUEST* 🚀

Hello Admin Team,

I want to explore and activate my *InboxFlow Cold Mailer Setup* (99% Guaranteed Direct Inbox Placement).

📌 *Referred by Client App:* ${appUrl || "http://" + appDomain}
🌐 *Source Domain:* ${appDomain || "InboxFlow Client"}

✨ *Requested Engine Highlights:*
• Up to 99% Direct Primary Inbox Placement (Zero Spam)
• Multi-Account Auto-Rotation & Warmup Shield
• Unlimited Cold Outreach with Anti-Detection Delays

Please share onboarding details and activate my setup / trial!`;

  // 📢 High-Converting Share Pitch
  const fullPitchShareMessage = 
`🔥 *SCALE YOUR OUTREACH WITH 99% DIRECT INBOX DELIVERY!* 🔥

Are your cold emails landing in Spam or Promotions tabs? 

Upgrade to *InboxFlow* — the enterprise-grade cold outreach engine engineered to land up to *99% of your emails straight into the primary INBOX!* 📥✨

🚀 *Key Features:*
✅ *Up to 99% Direct Inbox Placement* (Smart Anti-Spam Headers)
✅ *Multi-Account Auto-Rotation* (100% Domain Protection)
✅ *Human-like Random Delays & Custom Warmup* (Bypasses Filters)
✅ *Skyrocket Your Open & Reply Rates for B2B Sales*

💡 *Claim Your Live Trial / Setup:*
Message the team directly via my exclusive reference link below:
👉 https://api.whatsapp.com/send?phone=${ADMIN_WHATSAPP_NUMBER}&text=${encodeURIComponent(clientLeadToAdminMessage)}

🔗 *Client Source Reference:* ${appUrl || "http://" + appDomain}`;

  const copyFullMessage = () => {
    navigator.clipboard.writeText(fullPitchShareMessage);
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };

  // ==================== 🌐 SHARING CHANNELS ====================
  const openWhatsAppWeb = () => {
    window.open(`https://web.whatsapp.com/send?text=${encodeURIComponent(fullPitchShareMessage)}`, "_blank");
  };
  const openWhatsAppApp = () => {
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(fullPitchShareMessage)}`, "_blank");
  };

  const openGmailWeb = () => {
    const subject = encodeURIComponent("🚀 Recommended: 99% High Inbox Cold Mailer Setup (InboxFlow)");
    const body = encodeURIComponent(fullPitchShareMessage);
    window.open(`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(ADMIN_EMAIL)}&su=${subject}&body=${body}`, "_blank");
  };
  const openMailApp = () => {
    const subject = encodeURIComponent("🚀 Recommended: 99% High Inbox Cold Mailer Setup (InboxFlow)");
    const body = encodeURIComponent(fullPitchShareMessage);
    window.open(`mailto:${ADMIN_EMAIL}?subject=${subject}&body=${body}`, "_blank");
  };

  const openTelegramWeb = () => {
    window.open(`https://web.telegram.org/k/#?url=${encodeURIComponent(appUrl)}&text=${encodeURIComponent(fullPitchShareMessage)}`, "_blank");
  };
  const openTelegramApp = () => {
    window.open(`https://t.me/share/url?url=${encodeURIComponent(appUrl)}&text=${encodeURIComponent(fullPitchShareMessage)}`, "_blank");
  };

  const openLinkedInWeb = () => {
    window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(appUrl)}`, "_blank");
  };
  const openLinkedInApp = () => {
    window.open(`https://www.linkedin.com/shareArticle?mini=true&url=${encodeURIComponent(appUrl)}&title=${encodeURIComponent("InboxFlow 99% Inbox Cold Mailer")}&summary=${encodeURIComponent(fullPitchShareMessage)}`, "_blank");
  };

  const openTwitterWeb = () => {
    const tweetText = `Stop landing in Spam! 📥 Scale your cold outreach with up to 99% Direct Inbox Delivery using #InboxFlow. Check it out:`;
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}&url=${encodeURIComponent(appUrl)}`, "_blank");
  };
  const openTwitterApp = () => {
    const tweetText = `Stop landing in Spam! 📥 Scale cold emails with #InboxFlow: ${appUrl}`;
    window.open(`twitter://post?message=${encodeURIComponent(tweetText)}`, "_blank");
  };

  const handleNativeShare = async () => {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: "InboxFlow - 99% Inbox Cold Mailer",
          text: fullPitchShareMessage,
          url: appUrl,
        });
      } catch {}
    } else {
      copyFullMessage();
    }
  };

  return (
    <>
      {/* 🌟 Ultra-Modern Glassmorphism Top Header Bar */}
      <div className="w-full bg-slate-950/85 backdrop-blur-2xl border-b border-indigo-500/20 px-3 sm:px-6 py-2.5 text-xs text-slate-100 flex items-center justify-between gap-3 shadow-[0_4px_25px_-5px_rgba(0,0,0,0.6)] sticky top-0 z-40">
        
        {/* Left: Highlight Pill + Reward Value Proposition */}
        <div className="flex items-center gap-2.5 sm:gap-3.5 flex-wrap">
          
          {/* Animated Gradient Badge with Custom SVG */}
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gradient-to-r from-amber-500/15 via-orange-500/15 to-amber-500/15 border border-amber-500/35 text-amber-300 font-black text-[10px] tracking-wider uppercase shadow-[0_0_15px_-3px_rgba(245,158,11,0.2)]">
            <Image 
              src="/icons/referral-gift-box.svg" 
              alt="Gift" 
              width={15} 
              height={15} 
              className="animate-pulse"
            />
            <span>Referral Vault</span>
          </div>

          {/* Main Incentive Text */}
          <div className="flex items-center gap-2 text-slate-300 text-[11px] sm:text-xs">
            <span>
              Invite your network & earn an instant{" "}
              <strong className="text-emerald-400 font-black underline decoration-emerald-500/50 underline-offset-2">
                Flat ₹100 Renewal Discount
              </strong>{" "}
              for every active client!
            </span>
          </div>

          {/* Micro High-Performance Badge */}
          <div className="hidden xl:inline-flex items-center gap-1.5 text-[10px] font-bold text-indigo-300 bg-indigo-950/50 px-2.5 py-0.5 rounded-full border border-indigo-500/30 shadow-inner">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 shadow-[0_0_8px_rgba(129,140,248,0.9)]" />
            <span>99% Guaranteed Inbox Delivery</span>
          </div>
        </div>

        {/* Right: Sleek Pulsing Action Button */}
        <div className="ml-auto flex items-center shrink-0">
          <div className="relative inline-flex group">
            {/* Outer Rainbow Glow Border */}
            <div className="absolute -inset-[1.5px] rounded-xl bg-gradient-to-r from-pink-500 via-indigo-500 to-emerald-400 opacity-75 blur-[3px] group-hover:opacity-100 transition duration-300 animate-pulse" />
            
            {/* Button Surface */}
            <button
              onClick={() => setIsOpen(true)}
              className="relative px-3.5 sm:px-4 py-1.5 bg-slate-950 hover:bg-slate-900 text-white font-extrabold rounded-[10px] text-xs transition-all duration-300 shadow-2xl flex items-center gap-2 overflow-hidden border border-white/15 cursor-pointer active:scale-95"
            >
              {/* Pulsing Radar Dot */}
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500 shadow-sm" />
              </span>

              {/* Shimmer Text */}
              <span className="bg-gradient-to-r from-white via-indigo-100 to-emerald-300 bg-clip-text text-transparent tracking-wide font-black">
                Invite & Earn ₹100
              </span>

              <Image 
                src="/icons/sparkle-star.svg" 
                alt="Sparkle" 
                width={14} 
                height={14} 
                className="animate-bounce"
              />

              {/* Light Sweep */}
              <span className="absolute top-0 -left-[100%] w-1/2 h-full bg-gradient-to-r from-transparent via-white/15 to-transparent skew-x-12 group-hover:animate-[shimmer_1.5s_infinite]" />
            </button>
          </div>
        </div>

      </div>

      {/* 🎯 Multi-Channel Share Modal (Dark Glassmorphism UI) */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200">
          <div className="w-full max-w-xl bg-slate-950/95 border border-slate-800 rounded-3xl p-5 sm:p-7 shadow-[0_0_60px_-10px_rgba(99,102,241,0.3)] space-y-5 text-left my-auto relative overflow-hidden">
            
            {/* Radial Ambient Glow */}
            <div className="absolute -top-24 -right-24 w-60 h-60 bg-indigo-500/15 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-24 -left-24 w-60 h-60 bg-emerald-500/15 rounded-full blur-3xl pointer-events-none" />

            {/* Modal Header */}
            <div className="flex justify-between items-start border-b border-slate-800/80 pb-4 relative z-10">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 rounded-2xl">
                  <Image src="/icons/referral-gift-box.svg" alt="Gift" width={24} height={24} />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-white tracking-tight">
                    Share InboxFlow VIP Access
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Get <strong className="text-emerald-400 font-bold">₹100 renewal credit</strong> per verified client activation.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 flex items-center justify-center text-sm transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Referring Domain Card */}
            <div className="p-3.5 bg-slate-900/70 rounded-2xl border border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs relative z-10">
              <div className="space-y-0.5">
                <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">
                  Your Referral Source URL
                </span>
                <p className="font-mono text-indigo-300 font-bold truncate max-w-[280px]" title={appUrl}>
                  {appUrl || "http://localhost:3000"}
                </p>
              </div>
              <div className="px-2.5 py-1 bg-indigo-950/60 border border-indigo-500/30 text-indigo-200 rounded-lg font-mono text-[11px] self-start sm:self-auto flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                Host: <span className="text-emerald-400 font-bold">{appDomain || "localhost"}</span>
              </div>
            </div>

            {/* Deliverability Card */}
            <div className="p-3.5 bg-gradient-to-r from-indigo-950/30 to-purple-950/20 border border-indigo-500/20 rounded-2xl space-y-1 relative z-10">
              <div className="flex items-center gap-2 text-[11px] font-extrabold text-indigo-300">
                <span className="w-2 h-2 rounded-full bg-indigo-400 animate-ping" />
                <span>What your peer receives:</span>
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed pl-4">
                Up to 99% Direct Inbox Placement, Smart Anti-Spam Headers, Multi-Account Auto-Rotation, and Dedicated Warmup Shield.
              </p>
            </div>

            {/* Dual Channel Sharing Grid */}
            <div className="space-y-2.5 relative z-10">
              <div className="flex justify-between items-center text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                <span>Direct Share Options</span>
                <span className="text-slate-400 lowercase font-normal">choose web or desktop/app</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                
                {/* 1. WhatsApp */}
                <div className="bg-slate-900/80 hover:bg-slate-900 border border-emerald-500/20 hover:border-emerald-500/40 rounded-2xl p-2.5 flex items-center justify-between transition-all duration-200 shadow-sm">
                  <div className="flex items-center gap-2">
                    <Image src="/icons/whatsapp.svg" alt="WhatsApp" width={20} height={20} />
                    <span className="font-bold text-emerald-400">WhatsApp</span>
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      onClick={openWhatsAppWeb}
                      className="px-2.5 py-1 bg-emerald-950 hover:bg-emerald-900 text-emerald-300 border border-emerald-500/30 rounded-lg text-[10px] font-bold transition cursor-pointer"
                    >
                      Web
                    </button>
                    <button
                      onClick={openWhatsAppApp}
                      className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[10px] font-bold transition cursor-pointer shadow-sm"
                    >
                      App
                    </button>
                  </div>
                </div>

                {/* 2. Gmail / Email */}
                <div className="bg-slate-900/80 hover:bg-slate-900 border border-rose-500/20 hover:border-rose-500/40 rounded-2xl p-2.5 flex items-center justify-between transition-all duration-200 shadow-sm">
                  <div className="flex items-center gap-2">
                    <Image src="/icons/gmail.svg" alt="Gmail" width={20} height={20} />
                    <span className="font-bold text-rose-400">Email</span>
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      onClick={openGmailWeb}
                      className="px-2.5 py-1 bg-rose-950 hover:bg-rose-900 text-rose-300 border border-rose-500/30 rounded-lg text-[10px] font-bold transition cursor-pointer"
                    >
                      Gmail
                    </button>
                    <button
                      onClick={openMailApp}
                      className="px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-[10px] font-bold transition cursor-pointer shadow-sm"
                    >
                      Mail App
                    </button>
                  </div>
                </div>

                {/* 3. Telegram */}
                <div className="bg-slate-900/80 hover:bg-slate-900 border border-sky-500/20 hover:border-sky-500/40 rounded-2xl p-2.5 flex items-center justify-between transition-all duration-200 shadow-sm">
                  <div className="flex items-center gap-2">
                    <Image src="/icons/telegram.svg" alt="Telegram" width={20} height={20} />
                    <span className="font-bold text-sky-400">Telegram</span>
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      onClick={openTelegramWeb}
                      className="px-2.5 py-1 bg-sky-950 hover:bg-sky-900 text-sky-300 border border-sky-500/30 rounded-lg text-[10px] font-bold transition cursor-pointer"
                    >
                      Web
                    </button>
                    <button
                      onClick={openTelegramApp}
                      className="px-2.5 py-1 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-[10px] font-bold transition cursor-pointer shadow-sm"
                    >
                      App
                    </button>
                  </div>
                </div>

                {/* 4. LinkedIn */}
                <div className="bg-slate-900/80 hover:bg-slate-900 border border-blue-500/20 hover:border-blue-500/40 rounded-2xl p-2.5 flex items-center justify-between transition-all duration-200 shadow-sm">
                  <div className="flex items-center gap-2">
                    <Image src="/icons/linkedin.svg" alt="LinkedIn" width={20} height={20} />
                    <span className="font-bold text-blue-400">LinkedIn</span>
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      onClick={openLinkedInWeb}
                      className="px-2.5 py-1 bg-blue-950 hover:bg-blue-900 text-blue-300 border border-blue-500/30 rounded-lg text-[10px] font-bold transition cursor-pointer"
                    >
                      Web
                    </button>
                    <button
                      onClick={openLinkedInApp}
                      className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-[10px] font-bold transition cursor-pointer shadow-sm"
                    >
                      App
                    </button>
                  </div>
                </div>

                {/* 5. X / Twitter */}
                <div className="bg-slate-900/80 hover:bg-slate-900 border border-slate-700/50 hover:border-slate-500/50 rounded-2xl p-2.5 flex items-center justify-between transition-all duration-200 shadow-sm">
                  <div className="flex items-center gap-2">
                    <Image src="/icons/twitter.svg" alt="X Twitter" width={20} height={20} />
                    <span className="font-bold text-slate-200">X (Twitter)</span>
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      onClick={openTwitterWeb}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 rounded-lg text-[10px] font-bold transition cursor-pointer"
                    >
                      Web
                    </button>
                    <button
                      onClick={openTwitterApp}
                      className="px-2.5 py-1 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-[10px] font-bold transition cursor-pointer shadow-sm"
                    >
                      App
                    </button>
                  </div>
                </div>

                {/* 6. Native Share Sheet */}
                <div className="bg-slate-900/80 hover:bg-slate-900 border border-purple-500/20 hover:border-purple-500/40 rounded-2xl p-2.5 flex items-center justify-between transition-all duration-200 shadow-sm">
                  <div className="flex items-center gap-2">
                    <Image src="/icons/system-share.svg" alt="Share" width={20} height={20} />
                    <span className="font-bold text-purple-400">Other Apps</span>
                  </div>
                  <button
                    onClick={handleNativeShare}
                    className="px-3 py-1 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-lg text-[10px] font-bold transition cursor-pointer shadow-sm"
                  >
                    System Share
                  </button>
                </div>

              </div>
            </div>

            {/* 1-Click Copy Full Message Action */}
            <button
              onClick={copyFullMessage}
              className="w-full py-3 bg-slate-900 hover:bg-slate-800/90 border border-slate-700/60 hover:border-indigo-500/40 text-slate-200 font-mono text-xs rounded-2xl transition-all duration-200 cursor-pointer flex items-center justify-center gap-2 shadow-inner active:scale-[0.99] relative z-10"
            >
              <Image 
                src="/icons/copy-clipboard.svg" 
                alt="Copy" 
                width={16} 
                height={16} 
              />
              <span className="font-sans font-bold">
                {copied ? "Full Pitch Copied to Clipboard! ✅" : "Copy Full Pitch & Referral Link"}
              </span>
            </button>

          </div>
        </div>
      )}
    </>
  );
}