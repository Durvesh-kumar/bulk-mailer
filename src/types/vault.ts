// src/types/vault.ts
import { AccountAgeMode } from "@/config/AccountAgeMode";

export type ProfileTier = "CURRENT" | "YEAR_1" | "YEAR_2" | "YEAR_4" | "YEAR_6";

export interface SmtpAccount {
  _id: string;
  email: string;
  appPassword: string;
  senderName: string;
  profileTier: ProfileTier;
  lastSentAt?: string | null;
}

export interface FailedEmailItem {
  email: string;
  reason: string;
  senderUsed: string;
  time: string;
}

export const TIER_ORDER: ProfileTier[] = ["CURRENT", "YEAR_1", "YEAR_2", "YEAR_4", "YEAR_6"];

export const TIER_META: Record<
  ProfileTier,
  { label: string; badge: string; modeMap: AccountAgeMode; color: string; borderText: string }
> = {
  CURRENT: {
    label: "Fresh (<6 Mo)",
    badge: "🔴 Fresh",
    modeMap: "FRESH",
    color: "border-rose-500 text-rose-300 bg-rose-950/30",
    borderText: "border-rose-500/40 text-rose-300",
  },
  YEAR_1: {
    label: "1 Year Aged",
    badge: "🟡 1 Year",
    modeMap: "STANDARD",
    color: "border-amber-500 text-amber-300 bg-amber-950/30",
    borderText: "border-amber-500/40 text-amber-300",
  },
  YEAR_2: {
    label: "2 Year Aged",
    badge: "🟢 2 Year",
    modeMap: "AGED",
    color: "border-emerald-500 text-emerald-300 bg-emerald-950/30",
    borderText: "border-emerald-500/40 text-emerald-300",
  },
  YEAR_4: {
    label: "4 Year Prime",
    badge: "💎 4 Year",
    modeMap: "AGED",
    color: "border-blue-500 text-blue-300 bg-blue-950/30",
    borderText: "border-blue-500/40 text-blue-300",
  },
  YEAR_6: {
    label: "6+ Year Ultra",
    badge: "👑 6+ Year",
    modeMap: "AGED",
    color: "border-purple-500 text-purple-300 bg-purple-950/30",
    borderText: "border-purple-500/40 text-purple-300",
  },
};

export const SESSION_TOKEN_KEY = "reachout_daily_session_token";
export const PENDING_QUEUE_STORAGE_KEY = "inboxsend_pending_queue_state";
export const SENDERS_COOLDOWN_STORAGE_KEY = "inboxsend_senders_cooldown_state";
export const WARMUP_TAG = "[WU-VERIFIED-NODE]";