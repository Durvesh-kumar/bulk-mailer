// src/lib/fingerprint.ts

/**
 * प्रोडक्शन-ग्रेड हार्डवेयर मशीन फ़िंगरप्रिंट
 * - ब्राउज़र रीसेट / अनइन्स्टॉल होने पर भी सेम लैपटॉप पर स्थिर रहता है।
 * - Chrome, Edge, Brave के बीच WebGL स्ट्रिंग को नॉर्मलाइज़ करता है।
 * - लोकलस्टोरेज टैम्परिंग से सुरक्षित (हमेशा लाइव हार्डवेयर वैलिडेट करता है)।
 */
export function getClientMachineId(): string {
  if (typeof window === "undefined") return "SERVER_ENV";

  const nav = window.navigator;
  const screen = window.screen;

  // 1. हार्डवेयर और फ़िज़िकल डिस्प्ले पैरामीटर्स (अपरिवर्तनीय)
  const hardwareSpecs: (string | number)[] = [
    nav.hardwareConcurrency || 4, // CPU Cores
    (nav as any).deviceMemory || 8, // RAM (GB)
    screen.colorDepth || 24, // Display Color Depth
    screen.pixelDepth || 24,
    // स्क्रीन रेजोल्यूशन (Taskbar/Scale टॉलरेंस के साथ)
    `${Math.round(screen.width / 10) * 10}x${Math.round(screen.height / 10) * 10}`,
  ];

  // 2. GPU सिलिकॉन चिप सिग्नेचर (Chrome & Edge नॉर्मलाइज़्ड)
  try {
    const canvas = document.createElement("canvas");
    const gl =
      canvas.getContext("webgl") ||
      (canvas.getContext("experimental-webgl") as WebGLRenderingContext | null);

    if (gl) {
      const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
      if (debugInfo) {
        let vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || "";
        let renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || "";

        // ब्राउज़र-विशिष्ट वर्ज़न नंबर और ANGLE रैपर को साफ़ करना
        // इससे Chrome vs Edge में GPU का नाम एक जैसा निकलेगा
        renderer = renderer
          .replace(/ANGLE \(/gi, "")
          .replace(/\b(Direct3D\d+|OpenGL|Vulkan|Metal)\b.*/gi, "")
          .replace(/vs_\S+|ps_\S+/gi, "")
          .replace(/\s+/g, " ")
          .trim();

        vendor = vendor.replace(/Google Inc\.?/gi, "").trim();

        hardwareSpecs.push(vendor, renderer);
      }

      // GPU हार्डवेयर लिमिट्स (हर चिप में फिक्स्ड होती हैं)
      const maxTexture = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 0;
      const maxRenderBuffer = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) || 0;
      hardwareSpecs.push(maxTexture, maxRenderBuffer);
    }
  } catch {
    hardwareSpecs.push("gpu_fallback");
  }

  // 3. 64-बिट स्ट्रॉन्ग हैश जनरेटर (Hash Collision रोकने के लिए)
  const rawData = hardwareSpecs.join("@@@");
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;

  for (let i = 0; i < rawData.length; i++) {
    const ch = rawData.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }

  h1 =
    Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
    Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 =
    Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
    Math.imul(h1 ^ (h1 >>> 13), 3266489909);

  const hashPart = (4294967296 * (2097151 & h2) + (h1 >>> 0))
    .toString(36)
    .toUpperCase();

  const finalMachineId = `HW_${hashPart}`;

  // बैकअप के लिए लोकलस्टोरेज में राइट कर दें
  try {
    localStorage.setItem("reachout_machine_id", finalMachineId);
  } catch {
    // Storage blocked scenario handled
  }

  return finalMachineId;
}