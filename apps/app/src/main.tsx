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

// Register service worker
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .then((registration) => {
        console.log("SW registered:", registration.scope);
      })
      .catch((error) => {
        console.error("SW registration failed:", error);
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
