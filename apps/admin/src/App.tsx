import { Navigate, Route, Routes } from "react-router";
import { RequireAdmin } from "./auth/require-admin";
import { AdminLayout } from "./components/admin-layout";
import { AiSettingsPage } from "./pages/ai-settings";
import { AiUsagePage } from "./pages/ai-usage";
import { AuditTrailPage } from "./pages/audit-trail";
import { ErasurePage } from "./pages/erasure";
import { NotFoundPage } from "./pages/not-found";
import { SignInPage } from "./pages/sign-in";
import { SignInCodesPage } from "./pages/sign-in-codes";

/** The platform admin app, at /admin/. Every page but sign-in is admin-only. */
export default function App() {
  return (
    <Routes>
      <Route path="/sign-in" element={<SignInPage />} />
      <Route element={<RequireAdmin />}>
        <Route element={<AdminLayout />}>
          <Route index element={<Navigate to="/audit" replace />} />
          <Route path="/audit" element={<AuditTrailPage />} />
          <Route path="/sign-in-codes" element={<SignInCodesPage />} />
          <Route path="/erasure" element={<ErasurePage />} />
          <Route path="/ai" element={<AiSettingsPage />} />
          <Route path="/usage" element={<AiUsagePage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
