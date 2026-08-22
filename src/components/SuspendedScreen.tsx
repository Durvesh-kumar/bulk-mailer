// components/SuspendedScreen.tsx
"use client";

import React, { useState } from "react";

interface SuspendedScreenProps {
  machineId: string;
  appDomain?: string; // e.g. "mailer.clientdomain.com"
  userType?: "NEW_USER" | "SUSPENDED" | "EXPIRED";
  expiryDate?: string; // e.g. "21 Aug 2026"
  adminPhone?: string;
  adminEmail?: string;
}

export default function SuspendedScreen({
  machineId = "MACHINE-ID-NOT-FOUND",
  appDomain = typeof window !== "undefined" ? window.location.hostname : "app.mailer.com",
  userType = "SUSPENDED",
  expiryDate = "Expired",
  adminPhone = "+918266821377",
  adminEmail = "inboxsend.support@gmail.com",
}: SuspendedScreenProps) {
  const [copied, setCopied] = useState(false);
  const [activeModal, setActiveModal] = useState<"whatsapp" | "email" | "call" | null>(null);

  const cleanPhone = adminPhone.replace(/[^0-9]/g, "");

  const handleCopy = () => {
    navigator.clipboard.writeText(`App Domain: ${appDomain} | Machine ID: ${machineId}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isNewUser = userType === "NEW_USER";
  const isExpired = userType === "EXPIRED";

  // 📝 1. WhatsApp डायनामिक मैसेज (New vs Suspended vs Expired)
  const waMessageText = isExpired
    ? `Hello Admin,\n\nMy Package / Subscription has *Expired*.\n\n*App Domain:* ${appDomain}\n*Expiry Date:* ${expiryDate}\n*Machine ID:* ${machineId}\n\n👉 *Renew My Package* (Please update my validity).`
    : isNewUser
    ? `Hello Admin,\n\nI am a *New User / New Device*.\n\n*App Domain:* ${appDomain}\n*Machine ID:* ${machineId}\n\n👉 *Open My New Account* (Please provide testing access).`
    : `Hello Admin,\n\nMy existing access is *Suspended*.\n\n*App Domain:* ${appDomain}\n*Machine ID:* ${machineId}\n\n👉 Please verify and reactivate my account.`;

  const waText = encodeURIComponent(waMessageText);

  // 📧 2. Email डायनामिक सब्जेक्ट और बॉडी
  const emailSubject = encodeURIComponent(
    isExpired
      ? `Package Expired [${appDomain}] - Renew Subscription`
      : isNewUser
      ? `New Account Request [${appDomain}] - ${machineId}`
      : `Reactivation Request [${appDomain}] - ${machineId}`
  );

  const emailBodyText = isExpired
    ? `Hello Admin,\n\nMy bulk mailer subscription package has expired on ${expiryDate}.\n\nApp Domain: ${appDomain}\nMachine ID: ${machineId}\n\nAction: Renew Package / Subscription\n\nThank you.`
    : isNewUser
    ? `Hello Admin,\n\nI want to set up a new account for bulk mailing.\n\nApp Domain: ${appDomain}\nMachine ID: ${machineId}\n\nAction: Open My New Account\n\nThank you.`
    : `Hello Admin,\n\nMy existing instance is suspended.\n\nApp Domain: ${appDomain}\nMachine ID: ${machineId}\n\nAction: Reactivate Existing Account\n\nThank you.`;

  const emailBody = encodeURIComponent(emailBodyText);

  // 🔗 लिंक्स
  const waWebUrl = `https://web.whatsapp.com/send?phone=${cleanPhone}&text=${waText}`;
  const waAppUrl = `https://wa.me/${cleanPhone}?text=${waText}`;

  const gmailWebUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${adminEmail}&su=${emailSubject}&body=${emailBody}`;
  const mailtoAppUrl = `mailto:${adminEmail}?subject=${emailSubject}&body=${emailBody}`;

  const telUrl = `tel:${adminPhone}`;
  const waAudioCallUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(`Hi Admin, calling regarding App: ${appDomain}`)}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950 px-4 py-8 select-none">
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-red-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative w-full max-w-lg rounded-2xl border border-red-500/30 bg-slate-900/95 p-6 md:p-8 shadow-2xl backdrop-blur-xl text-center text-white">
        
        {/* सिंबल */}
        <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-2xl bg-red-500/10 border border-red-500/30 text-3xl shadow-inner animate-pulse">
          {isExpired ? "⏳" : isNewUser ? "🆕" : "🔒"}
        </div>

        {/* बैज */}
        <span className="inline-block rounded-full bg-red-500/20 px-3 py-1 text-xs font-semibold text-red-400 border border-red-500/30 mb-3">
          {isExpired
            ? "PACKAGE EXPIRED"
            : isNewUser
            ? "NEW DEVICE DETECTED"
            : "ACCESS SUSPENDED"}
        </span>

        <h1 className="text-2xl font-bold tracking-tight text-white mb-2">
          {isExpired
            ? "Subscription Expired"
            : isNewUser
            ? "Authorization Required"
            : "Account On Hold"}
        </h1>

        <p className="text-sm text-slate-400 mb-6 leading-relaxed">
          {isExpired
            ? `Your bulk mailer package plan has expired on ${expiryDate}. Please renew your plan to continue sending emails.`
            : isNewUser
            ? "New device detected on this domain. Please contact admin with your Machine ID to get testing access."
            : "Your access is currently on hold. Please contact the administrator with your registered details to reactivate."}
        </p>

        {/* Info Box */}
        <div className="rounded-xl bg-slate-950/70 border border-slate-800 p-3.5 mb-6 text-left text-xs text-slate-400 space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-slate-500">App Domain:</span>
            <span className="font-mono text-slate-200 font-semibold">{appDomain}</span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-slate-500">Machine ID:</span>
            <div className="flex items-center gap-2">
              <span className="font-mono text-slate-200 font-semibold truncate max-w-[170px]" title={machineId}>
                {machineId}
              </span>
              <button
                onClick={handleCopy}
                className="flex items-center gap-1 text-[11px] font-medium text-red-400 hover:text-red-300 transition-colors"
              >
                {copied ? <span className="text-emerald-400">✓ Copied</span> : <span>📋 Copy</span>}
              </button>
            </div>
          </div>

          {isExpired && (
            <div className="flex justify-between items-center text-amber-400">
              <span className="text-slate-500">Expired Date:</span>
              <span className="font-mono font-semibold">{expiryDate}</span>
            </div>
          )}

          <div className="flex justify-between items-center">
            <span className="text-slate-500">Status:</span>
            <span className="text-red-400 font-semibold">
              {isExpired
                ? "Plan Expired • Renewal Needed"
                : isNewUser
                ? "New Device • Pending Approval"
                : "Suspended • Action Required"}
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-3">
          <button
            onClick={() => setActiveModal("whatsapp")}
            className="flex w-full items-center justify-center gap-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-[0.99] px-4 py-3.5 text-sm font-bold text-white shadow-lg shadow-emerald-950/50 transition-all cursor-pointer"
          >
            <img src="/icons/whatsapp.svg" alt="WhatsApp" className="h-5 w-5 brightness-0 invert" />
            <span>
              {isExpired
                ? "Renew Package via WhatsApp"
                : isNewUser
                ? "Open My New Account (WhatsApp)"
                : "Reactivate via WhatsApp"}
            </span>
            <span className="ml-1 rounded bg-emerald-700/80 px-2 py-0.5 text-[10px] font-normal uppercase tracking-wider">
              Web / App
            </span>
          </button>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <button
              onClick={() => setActiveModal("call")}
              className="flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700/80 px-3 py-2.5 text-xs font-semibold text-slate-200 transition cursor-pointer"
            >
              <img src="/icons/phone.svg" alt="Phone" className="h-4 w-4" />
              <span>Call: {adminPhone}</span>
            </button>

            <button
              onClick={() => setActiveModal("email")}
              className="flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700/80 px-3 py-2.5 text-xs font-semibold text-slate-200 transition cursor-pointer"
            >
              <img src="/icons/gmail.svg" alt="Gmail" className="h-4 w-4" />
              <span>{isExpired ? "Email Renewal" : "Email Support"}</span>
            </button>
          </div>
        </div>

        <p className="mt-6 text-[11px] text-slate-500">
          Sandbox Security Gateway • Automated Device & Package Verification
        </p>

        {/* 🟢 WHATSAPP MODAL */}
        {activeModal === "whatsapp" && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
            <div className="relative w-full max-w-xs rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-2xl text-left">
              <button
                onClick={() => setActiveModal(null)}
                className="absolute top-3 right-4 text-slate-400 hover:text-white text-base cursor-pointer"
              >
                ✕
              </button>
              <div className="flex items-center gap-2">
                <img src="/icons/whatsapp.svg" alt="WhatsApp" className="h-5 w-5" />
                <h3 className="text-sm font-bold text-white">Open WhatsApp</h3>
              </div>
              <p className="mt-1 text-xs text-slate-400">Choose where you want to connect:</p>

              <div className="mt-4 space-y-2">
                <a
                  href={waWebUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => setActiveModal(null)}
                  className="flex items-center justify-between rounded-xl border border-slate-700 bg-slate-800/90 p-2.5 text-xs font-medium text-slate-200 hover:border-emerald-500 hover:bg-slate-750 transition"
                >
                  <div className="flex items-center gap-2.5">
                    <span>🌐</span>
                    <span>WhatsApp Web (Browser)</span>
                  </div>
                  <span className="text-slate-500">↗</span>
                </a>

                <a
                  href={waAppUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => setActiveModal(null)}
                  className="flex items-center justify-between rounded-xl border border-slate-700 bg-slate-800/90 p-2.5 text-xs font-medium text-slate-200 hover:border-emerald-500 hover:bg-slate-750 transition"
                >
                  <div className="flex items-center gap-2.5">
                    <span>📱</span>
                    <span>WhatsApp App (Desktop/Mobile)</span>
                  </div>
                  <span className="text-slate-500">↗</span>
                </a>
              </div>
            </div>
          </div>
        )}

        {/* 🔴 GMAIL / EMAIL MODAL */}
        {activeModal === "email" && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
            <div className="relative w-full max-w-xs rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-2xl text-left">
              <button
                onClick={() => setActiveModal(null)}
                className="absolute top-3 right-4 text-slate-400 hover:text-white text-base cursor-pointer"
              >
                ✕
              </button>
              <div className="flex items-center gap-2">
                <img src="/icons/gmail.svg" alt="Gmail" className="h-5 w-5" />
                <h3 className="text-sm font-bold text-white">Send Support Email</h3>
              </div>
              <p className="mt-1 text-xs text-slate-400">Choose how to compose email:</p>

              <div className="mt-4 space-y-2">
                <a
                  href={gmailWebUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => setActiveModal(null)}
                  className="flex items-center justify-between rounded-xl border border-slate-700 bg-slate-800/90 p-2.5 text-xs font-medium text-slate-200 hover:border-sky-500 hover:bg-slate-750 transition"
                >
                  <div className="flex items-center gap-2.5">
                    <span>🌐</span>
                    <span>Gmail Web (Browser Tab)</span>
                  </div>
                  <span className="text-slate-500">↗</span>
                </a>

                <a
                  href={mailtoAppUrl}
                  onClick={() => setActiveModal(null)}
                  className="flex items-center justify-between rounded-xl border border-slate-700 bg-slate-800/90 p-2.5 text-xs font-medium text-slate-200 hover:border-sky-500 hover:bg-slate-750 transition"
                >
                  <div className="flex items-center gap-2.5">
                    <span>📱</span>
                    <span>System Mail App (Outlook/Mail)</span>
                  </div>
                  <span className="text-slate-500">↗</span>
                </a>
              </div>
            </div>
          </div>
        )}

        {/* 📞 CALL MODAL */}
        {activeModal === "call" && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
            <div className="relative w-full max-w-xs rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-2xl text-left">
              <button
                onClick={() => setActiveModal(null)}
                className="absolute top-3 right-4 text-slate-400 hover:text-white text-base cursor-pointer"
              >
                ✕
              </button>
              <div className="flex items-center gap-2">
                <img src="/icons/phone.svg" alt="Phone" className="h-5 w-5" />
                <h3 className="text-sm font-bold text-white">Call Admin</h3>
              </div>
              <p className="mt-1 text-xs text-slate-400">Select your calling preference:</p>

              <div className="mt-4 space-y-2">
                <a
                  href={telUrl}
                  onClick={() => setActiveModal(null)}
                  className="flex items-center justify-between rounded-xl border border-slate-700 bg-slate-800/90 p-2.5 text-xs font-medium text-slate-200 hover:border-emerald-500 hover:bg-slate-750 transition"
                >
                  <div className="flex items-center gap-2.5">
                    <span>📱</span>
                    <span>Regular Phone / Dial App</span>
                  </div>
                  <span className="text-slate-500">↗</span>
                </a>

                <a
                  href={waAudioCallUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => setActiveModal(null)}
                  className="flex items-center justify-between rounded-xl border border-slate-700 bg-slate-800/90 p-2.5 text-xs font-medium text-slate-200 hover:border-emerald-500 hover:bg-slate-750 transition"
                >
                  <div className="flex items-center gap-2.5">
                    <span>🌐</span>
                    <span>WhatsApp Voice / Audio Call</span>
                  </div>
                  <span className="text-slate-500">↗</span>
                </a>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}