export type AccountAgeMode = "AGED" | "STANDARD" | "FRESH";

export interface ModeConfig {
  maxLot: number;
  chunkSize: number;
  minDelay: number;
  maxDelay: number;
  label: string;
  badge: string;
}

export const MODE_CONFIGS: Record<AccountAgeMode, ModeConfig> = {
  AGED: {
    maxLot: 100,
    chunkSize: 6,
    minDelay: 3000, // ⏱️ 3.0 सेकंड
    maxDelay: 4500, // ⏱️ 4.5 सेकंड
    label: "🟢 Aged Account (2+ Years Old)",
    badge: "Max 100 Leads (3-4.5s Jitter)",
  },
  STANDARD: {
    maxLot: 50,
    chunkSize: 4,
    minDelay: 3500, // ⏱️ 3.5 सेकंड
    maxDelay: 5500, // ⏱️ 5.5 सेकंड
    label: "🟡 Standard Account (6 Mo - 2 Years)",
    badge: "Max 50 Leads (Balanced)",
  },
  FRESH: {
    maxLot: 30,
    chunkSize: 3,
    minDelay: 5000, // ⏱️ 5.0 सेकंड
    maxDelay: 8000, // ⏱️ 8.0 सेकंड
    label: "🔴 Fresh / Warmup (< 6 Months)",
    badge: "Max 30 Leads (Safe Mode)",
  },
};