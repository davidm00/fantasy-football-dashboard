import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import "./index.css";
import { routes } from "./routes.ts";

const preloadRecoveryKey = "preload-recovery-at";
const preloadRecoveryWindowMs = 10_000;

window.addEventListener("vite:preloadError", (event) => {
  let lastRecoveryAt = Number(window.history.state?.preloadRecoveryAt ?? 0);
  try {
    const storedRecoveryAt = Number(window.sessionStorage.getItem(preloadRecoveryKey));
    if (Number.isFinite(storedRecoveryAt)) {
      lastRecoveryAt = Math.max(lastRecoveryAt, storedRecoveryAt);
    }
  } catch (error) {
    if (!(error instanceof DOMException) ||
        (error.name !== "SecurityError" && error.name !== "QuotaExceededError")) {
      throw error;
    }
    console.warn("Storage is unavailable; using browser history for preload recovery.", error);
  }

  if (
    Number.isFinite(lastRecoveryAt) &&
    lastRecoveryAt > 0 &&
    Date.now() >= lastRecoveryAt &&
    Date.now() - lastRecoveryAt < preloadRecoveryWindowMs
  ) {
    return;
  }

  const recoveryAt = Date.now();
  window.history.replaceState(
    { ...window.history.state, preloadRecoveryAt: recoveryAt },
    "",
  );
  try {
    window.sessionStorage.setItem(preloadRecoveryKey, String(recoveryAt));
  } catch (error) {
    if (!(error instanceof DOMException) ||
        (error.name !== "SecurityError" && error.name !== "QuotaExceededError")) {
      throw error;
    }
    console.warn("Unable to persist preload recovery in storage; browser history retains the loop guard.", error);
  }
  event.preventDefault();
  window.location.reload();
});

const router = createBrowserRouter(routes);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
