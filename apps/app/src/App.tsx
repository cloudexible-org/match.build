import { Route, Routes } from "react-router";
import { RequireAuth } from "./auth/require-auth";
import { AccountSettingsPage } from "./pages/account-settings";
import { CandidateChatPage } from "./pages/candidate-chat";
import { ConversationPage } from "./pages/conversation";
import { CreateMatchmakerPage } from "./pages/create-matchmaker";
import { HomePage } from "./pages/home";
import { InvitePage } from "./pages/invite";
import { MatchmakerSettingsPage } from "./pages/matchmaker-settings";
import { NotFoundPage } from "./pages/not-found";
import { OnboardPage } from "./pages/onboard";
import { SignInPage } from "./pages/sign-in";
import { NoConversation, WorkspacePage } from "./pages/workspace";
import { WorkspaceLayout } from "./workspace/workspace-layout";

/** Routes for prd/phase-1.md §4. */
export default function App() {
  return (
    <Routes>
      <Route path="/sign-in" element={<SignInPage />} />
      {/* Everything but sign-in needs an account, including unknown paths:
          a signed-out visitor to a deep link signs in first, then lands on
          it. */}
      <Route element={<RequireAuth />}>
        <Route index element={<HomePage />} />
        <Route path="/settings" element={<AccountSettingsPage />} />
        <Route path="/invite/:token" element={<InvitePage />} />
        <Route path="/invitations/:candidateId" element={<InvitePage />} />
        <Route path="/c/:matchmakerUsername" element={<CandidateChatPage />} />
        <Route path="/mm/new" element={<CreateMatchmakerPage />} />
        <Route path="/mm/:username" element={<WorkspaceLayout />}>
          <Route element={<WorkspacePage />}>
            <Route index element={<NoConversation />} />
            <Route path="c/:candidateId" element={<ConversationPage />} />
          </Route>
          <Route path="onboard" element={<OnboardPage />} />
          <Route path="settings" element={<MatchmakerSettingsPage />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
