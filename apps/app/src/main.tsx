import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { AnalyticsProvider } from "@repo/analytics";
import { ConvexReactClient } from "convex/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import "./index.css";
import App from "./App.tsx";
// Validates environment variables at startup (see ./env.ts).
import { env } from "./env";

const convex = new ConvexReactClient(env.VITE_CONVEX_URL);

// The service worker shows push notifications and opens the conversation they
// point at (public/sw.js). Registering it is also what makes the app
// installable to a home screen, which is the only way iOS delivers web push
// (prd/phase-1.md §8.2). A failure here costs notifications, not the app, so
// it is logged rather than surfaced.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .catch((error) => {
        console.error("Service worker registration failed:", error);
      });
  });
}

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element not found");
}

createRoot(rootElement).render(
  <StrictMode>
    <AnalyticsProvider
      apiKey={env.VITE_POSTHOG_KEY}
      apiHost={env.VITE_POSTHOG_HOST}
    >
      <ConvexAuthProvider client={convex}>
        {/* The app is mounted under Vite's `base` (/app/ today). The basename
            drops the trailing slash: "/app/" does not match a visit to the
            bare "/app", which production serves without redirecting, and the
            page would render nothing. "/app" matches both. */}
        <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <App />
        </BrowserRouter>
      </ConvexAuthProvider>
    </AnalyticsProvider>
  </StrictMode>,
);
