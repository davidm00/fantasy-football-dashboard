import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import "./index.css";
import { routes } from "./routes.ts";

const preloadRecoveryKey = "preload-recovery-at";
const preloadRecoveryWindowMs = 10_000;

window.addEventListener("vite:preloadError", (event) => {
  const lastRecoveryAt = Number(
    window.sessionStorage.getItem(preloadRecoveryKey),
  );

  if (
    Number.isFinite(lastRecoveryAt) &&
    Date.now() - lastRecoveryAt < preloadRecoveryWindowMs
  ) {
    return;
  }

  event.preventDefault();
  window.sessionStorage.setItem(preloadRecoveryKey, String(Date.now()));
  window.location.reload();
});

window.setTimeout(() => {
  window.sessionStorage.removeItem(preloadRecoveryKey);
}, preloadRecoveryWindowMs);

const router = createBrowserRouter(routes);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
