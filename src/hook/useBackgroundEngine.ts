import { useRef, useCallback } from "react";

export function useBackgroundEngine() {
  const wakeLockRef = useRef<any>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // 🛡️ Activate Anti-Sleep & Anti-Throttle
  const activate = useCallback(async () => {
    // 1. Screen Wake Lock (OS/Display Sleep Off)
    try {
      if ("wakeLock" in navigator) {
        wakeLockRef.current = await (navigator as any).wakeLock.request("screen");
        console.log("⚡ Wake Lock Active: OS & Display sleep prevented.");
      }
    } catch (err) {
      console.warn("WakeLock unavailable or blocked:", err);
    }

    // 2. Silent Audio Anchor (Chrome Tab High-Priority)
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx && !audioCtxRef.current) {
        const ctx = new AudioCtx();
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();

        gainNode.gain.value = 0.00001; // Silent volume
        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);
        oscillator.start();

        audioCtxRef.current = ctx;
        console.log("🎵 Silent Anchor Active: Background throttling bypassed.");
      }
    } catch (err) {
      console.warn("Audio anchor initialization failed:", err);
    }
  }, []);

  // 💤 Deactivate and Free System Resources
  const deactivate = useCallback(() => {
    if (wakeLockRef.current) {
      wakeLockRef.current.release();
      wakeLockRef.current = null;
      console.log("💤 Wake Lock released.");
    }

    if (audioCtxRef.current) {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
      console.log("💤 Silent Anchor closed. Normal sleep restored.");
    }
  }, []);

  return { activate, deactivate };
}