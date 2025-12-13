/* =========================================================
   RCM AI Assistant - Service Worker Registration
   ========================================================= */

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {

    navigator.serviceWorker
      .register("/service-worker.js", { scope: "/" })
      .then((registration) => {

        // ✅ Successfully registered
        console.log("RCM AI App is ready");

        // 🔄 Handle updates automatically
        if (registration.waiting) {
          registration.waiting.postMessage({ type: "SKIP_WAITING" });
        }

        registration.onupdatefound = () => {
          const installingWorker = registration.installing;

          installingWorker.onstatechange = () => {
            if (
              installingWorker.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              console.log("RCM AI App updated");
              installingWorker.postMessage({ type: "SKIP_WAITING" });
            }
          };
        };
      })
      .catch((error) => {
        console.error("RCM AI SW registration failed:", error);
      });
  });
}
