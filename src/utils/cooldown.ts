export const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
const COOLDOWN_STORAGE_PREFIX = "sender_cooldown_";

// 🔒 24 घंटे का कूलडाउन चेक (DB Time + Local Backup)
export function isSenderInCooldown(email: string, lastSentAt?: string | null): boolean {
  if (!email) return false;
  const cleanEmail = email.toLowerCase().trim();

  // 1. डेटाबेस का lastSentAt चेक
  if (lastSentAt) {
    const sentTime = new Date(lastSentAt).getTime();
    if (!isNaN(sentTime) && Date.now() - sentTime < TWENTY_FOUR_HOURS_MS) {
      return true;
    }
  }

  // 2. लोकल स्टोरेज फॉलबैक
  if (typeof window !== "undefined") {
    const localTimestamp = localStorage.getItem(`${COOLDOWN_STORAGE_PREFIX}${cleanEmail}`);
    if (localTimestamp) {
      const savedTime = parseInt(localTimestamp, 10);
      if (!isNaN(savedTime) && Date.now() - savedTime < TWENTY_FOUR_HOURS_MS) {
        return true;
      }
    }
  }

  return false;
}

// ⏱️ सेंडर को लोकल स्टोरेज में 24 घंटे के लिए मार्क करना
export function markSenderLotCompleted(email: string): void {
  if (typeof window !== "undefined" && email) {
    const cleanEmail = email.toLowerCase().trim();
    localStorage.setItem(`${COOLDOWN_STORAGE_PREFIX}${cleanEmail}`, Date.now().toString());
  }
}

// ⏳ UI पर बचा हुआ समय दिखाने का हेल्पर (e.g. "18h 42m left")
export function getRemainingCooldownTime(lastSentAt?: string | null, email?: string): string {
  let targetTime = 0;

  if (lastSentAt) {
    targetTime = new Date(lastSentAt).getTime();
  } else if (email && typeof window !== "undefined") {
    const local = localStorage.getItem(`${COOLDOWN_STORAGE_PREFIX}${email.toLowerCase().trim()}`);
    if (local) targetTime = parseInt(local, 10);
  }

  if (!targetTime || isNaN(targetTime)) return "";

  const diff = TWENTY_FOUR_HOURS_MS - (Date.now() - targetTime);
  if (diff <= 0) return "";

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}h ${mins}m left`;
}

// 🔄 ऑटो-सिंक हेल्पर: बैच/क्यू खत्म होने पर DB में टाइमस्टैम्प्स भेजना
export async function syncTimestampsToDatabase(
  machineId: string,
  recordedEntries: Record<string, string>
): Promise<void> {
  const entries = Object.entries(recordedEntries);
  if (entries.length === 0 || typeof window === "undefined") return;

  try {
    const sessionToken = localStorage.getItem("session_token") || "";
    const recordsPayload = entries.map(([email, sentAt]) => ({ email, sentAt }));

    await fetch("/api/smtp-vault", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-session-token": sessionToken,
      },
      body: JSON.stringify({
        machineId,
        sessionToken,
        updateType: "BULK_UPDATE_TIMESTAMP",
        updateData: { records: recordsPayload },
      }),
    });
  } catch (err) {
    console.error("[Cooldown Sync] Failed to sync timestamps to DB:", err);
  }
}