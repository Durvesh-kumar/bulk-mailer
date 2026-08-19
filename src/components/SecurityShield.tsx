"use client";

import { useEffect } from "react";

export default function SecurityShield() {
  useEffect(() => {
    // 1. Right Click Disable
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      return false;
    };

    // 2. Keyboard Shortcuts Block (F12, Ctrl+Shift+I/J/C, Ctrl+U)
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === "F12" ||
        (e.ctrlKey && e.shiftKey && ["I", "J", "C"].includes(e.key.toUpperCase())) ||
        (e.ctrlKey && e.key.toUpperCase() === "U")
      ) {
        e.preventDefault();
        return false;
      }
    };

    // 3. Infinite Debugger Trap (अगर कोई DevTools खोल ले तो पेज हैंग/पॉज़ हो जाए)
    const debuggerInterval = setInterval(() => {
      const startTime = performance.now();
      // eslint-disable-next-line no-debugger
      debugger;
      const endTime = performance.now();
      if (endTime - startTime > 100) {
        // DevTools खुला हुआ है!
        document.body.innerHTML = "<h2 style='color:red;text-align:center;margin-top:20%;font-family:sans-serif;'>Security Violation Detected. Access Denied.</h2>";
      }
    }, 1000);

    // 4. Console Clearing Loop
    const consoleInterval = setInterval(() => {
      console.clear();
    }, 2000);

    window.addEventListener("contextmenu", handleContextMenu);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("contextmenu", handleContextMenu);
      window.removeEventListener("keydown", handleKeyDown);
      clearInterval(debuggerInterval);
      clearInterval(consoleInterval);
    };
  }, []);

  return null;
}