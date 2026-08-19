// src/lib/fingerprint.ts

export function getClientMachineId(): string {
  if (typeof window === "undefined") return "SERVER_ENV";

  // पहले से सेव आईडी चेक करें
  const cached = localStorage.getItem("reachout_machine_id");
  if (cached) return cached;

  const nav = window.navigator;
  const screen = window.screen;

  // हार्डवेयर और एनवायरनमेंट सिग्नेचर (Deterministic)
  const components = [
    nav.userAgent,
    nav.language,
    screen.width + "x" + screen.height,
    screen.colorDepth,
    nav.hardwareConcurrency || "cores_unknown",
    (nav as any).deviceMemory || "ram_unknown",
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  ];

  // कैनवास फिंगरप्रिंट (GPU रेंडरिंग बिहेवियर)
  try {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.textBaseline = "top";
      ctx.font = "14px 'Arial'";
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = "#f60";
      ctx.fillRect(125, 1, 62, 20);
      ctx.fillStyle = "#069";
      ctx.fillText("ReachOut,2026", 2, 15);
      ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
      ctx.fillText("ReachOut,2026", 4, 17);
      components.push(canvas.toDataURL());
    }
  } catch (e) {
    components.push("canvas_disabled");
  }

  // स्थिर हैश बनाना
  const rawString = components.join("###");
  let hash = 0;
  for (let i = 0; i < rawString.length; i++) {
    const char = rawString.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }

  const deterministicId = `DEV_${Math.abs(hash).toString(36)}_${screen.width}x${screen.height}`;
  localStorage.setItem("reachout_machine_id", deterministicId);

  return deterministicId;
}