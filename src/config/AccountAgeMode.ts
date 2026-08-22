// src/config/accountModes.ts

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
    chunkSize: 8,
    minDelay: 1800,
    maxDelay: 2500,
    label: "🟢 Aged Account (2+ Years Old)",
    badge: "Max 100 Leads (Fastest)",
  },
  STANDARD: {
    maxLot: 50,
    chunkSize: 6,
    minDelay: 2200,
    maxDelay: 3200,
    label: "🟡 Standard Account (6 Mo - 2 Years)",
    badge: "Max 50 Leads (Balanced)",
  },
  FRESH: {
    maxLot: 30,
    chunkSize: 4,
    minDelay: 3500,
    maxDelay: 5000,
    label: "🔴 Fresh / Warmup (< 6 Months)",
    badge: "Max 30 Leads (Zero Ban)",
  },
};