import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import "./index.css";
import App from "./App.tsx";
// Validates environment variables at startup (see ./env.ts).
import { env } from "./env";

const convex = new ConvexReactClient(env.VITE_CONVEX_URL);

/**
 * apps/app shares this origin — and so this localStorage — in production.
 * Convex Auth keys its tokens by the deployment URL unless told otherwise, so
 * without a namespace of its own the admin session and the app session would
 * be one session: signing in to the app as someone else with an issued code
 * would sign the admin app in as them too.
 */
const AUTH_STORAGE_NAMESPACE = `${env.VITE_CONVEX_URL}#admin`;

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element not found");
}

createRoot(rootElement).render(
  <StrictMode>
    <ConvexAuthProvider
      client={convex}
      storageNamespace={AUTH_STORAGE_NAMESPACE}
    >
      {/* Mounted under Vite's `base` (/admin/). The basename drops the
          trailing slash so the bare "/admin" matches too (see apps/app). */}
      <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, "")}>
        <App />
      </BrowserRouter>
    </ConvexAuthProvider>
  </StrictMode>,
);
