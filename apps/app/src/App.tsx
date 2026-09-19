import { Route, Routes } from "react-router";
import { RequireAuth } from "./auth/require-auth";
import { HomePage } from "./pages/home";
import { NotFoundPage } from "./pages/not-found";
import { SignInPage } from "./pages/sign-in";

/** Routes for prd/phase-1.md §4. Later steps add the workspaces. */
export default function App() {
  return (
    <Routes>
      <Route path="/sign-in" element={<SignInPage />} />
      {/* Everything but sign-in needs an account, including unknown paths:
          a signed-out visitor to a deep link signs in first, then lands on
          it. */}
      <Route element={<RequireAuth />}>
        <Route index element={<HomePage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
