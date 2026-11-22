import type { ReactNode } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { ActivityLog } from './features/activity/ActivityLog';
import { ErrorToast, LoadingScreen, SignInScreen } from './features/auth/AuthScreens';
import { ChecklistView } from './features/checklists/ChecklistView';
import { ExpenseList } from './features/expenses/ExpenseList';
import { NotesView } from './features/notes/NotesView';
import { JoinPage } from './features/people/JoinPage';
import { PeopleList } from './features/people/PeopleList';
import { PlanView } from './features/plan/PlanView';
import { ProfilePage } from './features/profile/ProfilePage';
import { SettleView } from './features/settle/SettleView';
import { TripLayout } from './features/trips/TripLayout';
import { TripSettings } from './features/trips/TripSettings';
import { TripsList } from './features/trips/TripsList';
import { useStore } from './data/store';

/** Everything except /join needs a signed-in user. */
function RequireUser({ children }: { children: ReactNode }) {
  const authState = useStore((s) => s.auth);
  const ready = useStore((s) => s.ready);
  if (authState === 'loading') return <LoadingScreen />;
  if (authState === 'signedOut') return <SignInScreen />;
  if (!ready) return <LoadingScreen />;
  return <>{children}</>;
}

// Routes from Phase 3: / for trips, /t/{tripId} for the plan and its
// sections, /join/{tripId} for invites.
export function App() {
  return (
    <BrowserRouter>
      <ErrorToast />
      <Routes>
        <Route path="/join/:tripId" element={<JoinPage />} />
        <Route
          path="/t/:tripId"
          element={
            <RequireUser>
              <TripLayout />
            </RequireUser>
          }
        >
          <Route index element={<PlanView />} />
          <Route path="people" element={<PeopleList />} />
          <Route path="expenses" element={<ExpenseList />} />
          <Route path="settle" element={<SettleView />} />
          <Route path="checklists" element={<ChecklistView />} />
          <Route path="notes" element={<NotesView />} />
          <Route path="activity" element={<ActivityLog />} />
          <Route path="settings" element={<TripSettings />} />
        </Route>
        <Route
          path="/profile"
          element={
            <RequireUser>
              <ProfilePage />
            </RequireUser>
          }
        />
        <Route
          path="*"
          element={
            <RequireUser>
              <TripsList />
            </RequireUser>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
